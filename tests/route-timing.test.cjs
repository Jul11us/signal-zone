'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function harness(map = {}) {
  const nodes = new Map();
  const cards = [0, 1, 2].map(i => ({
    dataset: { i: String(i) }, classList: { add() {}, remove() {} }
  }));
  const element = () => ({
    innerHTML: '', textContent: '', className: '',
    classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}
  });
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const data = Object.assign({ name: '测试地图', pois: [], terrains: [], vehicles: { fixed: [], periodic: [] } }, map);
  const context = vm.createContext({
    window: {}, App: { mapId: 'island', mode: 'game', routes: [], game: { plan: null, hudHidden: false } },
    document: { getElementById: id => node('#' + id) },
    $: node, $$: selector => selector === '#planResult .route-card' ? cards : [],
    MAP: () => data, clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
    MapView: { renderOverlay() {} },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    Date: class extends Date { static now() { return 1000000; } },
    toast() {}
  });
  for (const name of ['data-v4.js', 'app-game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context, { filename: name });
  }
  return { context, Game: context.window.Game, HUD: context.window.GameHUD, App: context.App, cards, node };
}

test('walking routes use walking speed and totals include every listed step', () => {
  const h = harness();
  const routes = h.Game.genRoutes([20, 20], {}, { coords: [60, 60], name: '目标' }, false);
  for (const route of routes) {
    assert.equal(route.time, route.segments.reduce((sum, segment) => sum + segment.time, 0), route.name);
    for (const segment of route.segments.filter(s => s.mode === '步行')) {
      // Displayed distance is rounded to metres; timing may also include search/observation stops.
      assert.ok(segment.time >= Math.round(Number.parseInt(segment.dist, 10) / 5.8) - 1,
        `${route.name}: ${segment.dist} walking cannot take ${segment.time}s`);
    }
  }
  assert.equal(routes[2].segments.filter(s => s.mode === '步行').length, 1,
    'a resource route without loot stops must not list the same direct walk twice');
});

test('vehicle and resource stops contribute to the route total', () => {
  const h = harness({
    vehicles: { fixed: [{ coords: [22, 22], location: '车库', type: '吉普' }], periodic: [] },
    pois: [{ coords: [38, 38], name: '野房', loot: 90, density: 30 }]
  });
  const routes = h.Game.genRoutes([20, 20], {}, { coords: [60, 60], name: '目标' }, false);
  for (const route of routes) {
    assert.equal(route.time, route.segments.reduce((sum, segment) => sum + segment.time, 0), route.name);
  }
  assert.ok(routes[0].segments.some(s => s.mode === '载具'));
  assert.ok(routes[2].segments.some(s => s.text.includes('野房')));
});

test('selecting a slower route updates departure advice and survives rerendering', () => {
  const h = harness();
  h.App.game.plan = {
    phase: 1, inCircle: true, modeName: '经典', dps: 1, remain: 600, deadline: 1600000,
    from: [20, 20], startLabel: '起点', radiusM: 2000, estFrom: '测试',
    rule: { wait: 600, shrink: 60, dps: 1 }, target: { coords: [60, 60], radius: 10 },
    routes: [100, 500, 700].map((time, i) => ({
      name: ['快速路线', '安全路线', '资源路线'][i], time, color: '#fff', safety: 50, loot: 50,
      path: [[20, 20], [60, 60]], notes: [],
      segments: [{ text: '推进', dir: '东南', dist: 100, mode: '步行', time }]
    }))
  };
  h.App.routes = h.App.game.plan.routes;
  h.Game.showPlan();
  h.cards[1].onclick({ target: { tagName: 'DIV' } });
  assert.equal(h.App.game.plan.selectedRouteIndex, 1);
  h.Game.showPlan();
  assert.match(h.node('#planResult').innerHTML, /route-card active[^>]*data-i="1"/);
  assert.match(h.node('#planResult').innerHTML, /01:28/,
    '600s remaining minus selected 500s route minus 12s buffer');
  h.HUD.paint();
  assert.match(h.node('#hudAdvice').textContent, /01:28/);
  assert.match(h.node('#hudSub').textContent, /安全路线.*08:20/);
  assert.deepEqual(Array.from(h.App.routes, r => r.visible), [false, true, false]);
});
