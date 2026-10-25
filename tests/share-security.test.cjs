'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(__dirname, '..', 'data-v4.js'), 'utf8');
const gameSource = fs.readFileSync(path.join(__dirname, '..', 'app-game.js'), 'utf8');

function harness() {
  const created = [];
  const nodes = new Map();
  function element(tag) {
    const node = {
      tag, innerHTML: '', textContent: '', dataset: {}, children: [],
      style: { setProperty() {} },
      classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
      setAttribute(name, value) { this[name] = String(value); },
      appendChild(child) { this.children.push(child); return child; },
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10 })
    };
    created.push(node);
    return node;
  }
  const document = {
    addEventListener() {},
    createElement: element,
    createDocumentFragment: () => element('fragment'),
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element(selector));
      return nodes.get(selector);
    },
    querySelectorAll: () => []
  };
  const storage = new Map();
  const calls = { modes: [], steps: [] };
  const context = vm.createContext({
    document, window: {}, calls,
    location: { origin: 'https://example.com', pathname: '/signal-zone/', search: '', hash: '' },
    history: { replaceState() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    escape, unescape,
    setTimeout: () => 0, clearTimeout() {}
  });
  vm.runInContext(dataSource, context, { filename: 'data-v4.js' });
  vm.runInContext(source, context, { filename: 'app-core.js' });
  vm.runInContext(gameSource, context, { filename: 'app-game.js' });
  // Keep the real share parser and renderers; replace only the unrelated map UI lifecycle.
  vm.runInContext(`
    setMap = id => { App.mapId = id; App.flight = null; App.circles = {}; App.pin = null; Game.reset(); };
    setMode = mode => { App.mode = mode; calls.modes.push(mode); };
    Game.goStep = step => { calls.steps.push(step); };
    Game.onFlightReady = () => {};
    GameHUD.render = () => {};
    GameSidebar.render = () => {};
    MapView.layer = document.createElement('markers');
    MapView.svg = document.createElement('svg');
    MapView.stage = { clientWidth: 1000, clientHeight: 1000 };
    MapView.baseW = MapView.baseH = 1000;
    globalThis.subject = { App, ShareLink, MapView, Inspector, Pins, Game, MAP_DATA, LANDING_STYLES };
  `, context);
  const restore = payload => {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    context.location.hash = '#z=' + Buffer.from(json, 'utf8').toString('base64');
    return context.subject.ShareLink.restore();
  };
  return { ...context.subject, context, document, created, restore, calls };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('existing valid share links round-trip through the real overlay renderer', () => {
  const h = harness();
  const expected = {
    flight: { start: [0, 18.5], end: [100, 81] },
    circles: { 1: { cx: 50, cy: 50, r: 24.9 }, 8: { cx: 52, cy: 48, r: 0.2875 } },
    pin: { coords: [32.4, 63.1] }
  };
  Object.assign(h.App, expected, { mapId: 'rongdu' });
  const url = h.ShareLink.encode();
  h.context.location.hash = new URL(url).hash;
  assert.equal(h.ShareLink.restore(), true);
  assert.equal(h.App.mapId, 'rongdu');
  assert.deepEqual(plain(h.App.flight), expected.flight);
  assert.deepEqual(plain(h.App.circles), expected.circles);
  assert.deepEqual(plain(h.App.pin), expected.pin);
  assert.match(h.MapView.svg.innerHTML, /x1="0" y1="18.5" x2="100" y2="81"/);
});

test('malicious and malformed flight coordinates never reach the SVG sink', () => {
  const attack = '0"/><image href="invalid" onerror="ATTACK"/><!--';
  for (const flight of [
    [[attack, 10], [80, 90]], [[10, 20], [80, attack]],
    [[-1, 20], [80, 90]], [[10, 20], [101, 90]],
    [null, [80, 90]], ['10', [80, 90]], [[10, 20], null],
    { 0: [10, 20], 1: [80, 90], length: 2 }, [[10, 20, 30], [80, 90]]
  ]) {
    const h = harness();
    assert.equal(h.restore({ v: 1, map: 'island', flight }), true);
    assert.equal(h.App.flight, null);
    assert.doesNotMatch(h.MapView.svg.innerHTML, /ATTACK|<image|class="ov-flight"/);
  }
});

test('both pin axes require finite numeric coordinates', () => {
  for (const pin of [[10, '<svg onload="ATTACK">'], [10, '20'], [10, 101], [-1, 20], [10], '10']) {
    const h = harness();
    assert.equal(h.restore({ v: 1, pin }), true);
    assert.equal(h.App.pin, null);
  }
  const h = harness();
  assert.equal(h.restore('{"v":1,"flight":[[1e999,20],[80,90]],"pin":[10,1e999]}'), true);
  assert.equal(h.App.flight, null);
  assert.equal(h.App.pin, null);
});

test('circle phases and radii reject invalid values while retaining valid legacy entries', () => {
  const h = harness();
  assert.equal(h.restore(`{"v":1,"map":"toString","circles":{
    "1":{"cx":10,"cy":20,"r":99},
    "2":{"cx":10,"cy":20,"r":"12"},
    "3":{"cx":10,"cy":20,"r":1e999},
    "4":{"cx":10,"cy":20,"r":0},
    "5":{"cx":10,"cy":20,"r":-2},
    "6":{"cx":"10","cy":20,"r":2},
    "7":{"cx":10,"cy":101,"r":2},
    "8":{"cx":10,"cy":20,"r":0.1},
    "0":{"cx":10,"cy":20,"r":2},
    "9":{"cx":10,"cy":20,"r":2},
    "1.5":{"cx":10,"cy":20,"r":2},
    "NaN":{"cx":10,"cy":20,"r":2}
  }}`), true);
  assert.equal(h.App.mapId, 'island');
  assert.deepEqual(plain(h.App.circles), {
    1: { cx: 10, cy: 20, r: 60 }, 8: { cx: 10, cy: 20, r: 0.1 }
  });
});

test('favorite names and notes are text in marker and editor HTML sinks', () => {
  const h = harness();
  const favorite = {
    id: 'pin_test', mapId: 'island', coords: [50, 50],
    name: '<img src=x onerror="ATTACK"> & \' "',
    note: '</textarea><svg onload="ATTACK">'
  };
  h.App.custom = [favorite];
  h.MapView.renderMarkers();
  const marker = h.created.find(node => node.className === 'mk mk-fav');
  assert.ok(marker);
  assert.doesNotMatch(marker.innerHTML, /<img|<svg/);
  assert.match(marker.innerHTML, /&lt;img src=x onerror=&quot;ATTACK&quot;&gt; &amp; &#39; &quot;/);
  h.Inspector.favorite(favorite);
  const editor = h.document.querySelector('#inspector').innerHTML;
  assert.doesNotMatch(editor, /<img|<svg/);
  assert.match(editor, /&lt;\/textarea&gt;&lt;svg onload=&quot;ATTACK&quot;&gt;/);
  assert.equal((editor.match(/<\/textarea>/g) || []).length, 1);
  assert.deepEqual(plain(h.App.custom[0]), favorite);
});

test('a legacy shared pin restores a usable landing selection and opens circle planning', () => {
  const h = harness();
  assert.equal(h.restore({ v: 1, map: 'rongdu', pin: [32, 45], circles: { 1: { cx: 50, cy: 50, r: 25 } } }), true);
  assert.deepEqual(plain(h.App.game.chosen.coords), [32, 45]);
  assert.equal(h.App.mode, 'game');
  assert.deepEqual(h.calls.steps, [3]);
  h.Game.showPlan = () => {};
  h.Game.genPlan();
  assert.ok(h.App.game.plan, 'the recovered selection can generate an actual route plan without selecting it again');
  assert.deepEqual(plain(h.App.game.plan.from), [32, 45]);
});

test('version two links round-trip editable planning inputs and canonical POI identity', () => {
  const h = harness();
  const poi = h.MAP_DATA.rongdu.pois[0];
  h.App.mapId = 'rongdu';
  h.App.pin = { coords: plain(poi.coords) };
  h.App.flight = { start: [5, 15], end: [85, 95] };
  h.App.circles = { 2: { cx: 50, cy: 50, r: 15 } };
  const expected = {
    style: h.LANDING_STYLES[0].id, followers: 2, planPhase: 2, phase: 2,
    phasePos: { 1: [40, 45] }, circleMode: 'peak', remain: 75,
    players: 43, teams: 12, compSize: 3
  };
  Object.assign(h.App.game, expected, { chosen: { name: poi.name, coords: plain(poi.coords), type: poi.type } });
  const url = h.ShareLink.encode();
  const payload = JSON.parse(Buffer.from(new URL(url).hash.slice(3), 'base64').toString('utf8'));
  assert.equal(payload.v, 2);
  assert.deepEqual(payload.game.chosen, plain(poi.coords));
  h.context.location.hash = new URL(url).hash;
  assert.equal(h.ShareLink.restore(), true);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(plain(h.App.game[key]), value, key);
  assert.equal(h.App.game.chosen.name, poi.name);
  assert.deepEqual(plain(h.App.game.chosen.coords), plain(poi.coords));
  assert.equal(h.App.mode, 'game');
  assert.deepEqual(h.calls.steps, [3]);
});

test('shared landing names are derived from local data and never from untrusted link labels', () => {
  const h = harness();
  assert.equal(h.restore({ v: 2, map: 'island', game: { chosen: [32.1, 45.1], name: '<svg onload="ATTACK">' } }), true);
  assert.equal(h.App.game.chosen.name, '分享落点');
  assert.doesNotMatch(JSON.stringify(h.App.game.chosen), /ATTACK|<svg/);
  assert.deepEqual(h.calls.steps, [2]);
});

test('invalid version two planning fields do not become game state', () => {
  const h = harness();
  assert.equal(h.restore({ v: 2, map: 'island', game: {
    chosen: [20, '30'], style: '<img onerror="ATTACK">', followers: 4,
    planPhase: 9, phase: 0, phasePos: { 0: [30, 40], 1: [30, 40], 2: [30, '40'], 9: [30, 40] },
    circleMode: 'constructor', remain: -20, players: 1000, teams: '16', compSize: 5
  } }), true);
  const g = h.App.game;
  assert.equal(g.chosen, null);
  assert.equal(g.style, null);
  assert.ok(Number.isInteger(g.followers) && g.followers >= 0 && g.followers <= 3);
  assert.ok(Number.isInteger(g.planPhase) && g.planPhase >= 1 && g.planPhase <= 8);
  assert.ok(Number.isInteger(g.phase) && g.phase >= 1 && g.phase <= 8);
  assert.deepEqual(plain(g.phasePos), { 1: [30, 40] });
  assert.equal(g.circleMode, 'ranked');
  assert.ok(g.remain === null || (Number.isFinite(g.remain) && g.remain >= 0 && g.remain <= 7200));
  assert.ok(Number.isInteger(g.players) && g.players >= 1 && g.players <= 100);
  assert.ok(Number.isInteger(g.teams) && g.teams >= 1 && g.teams <= 100);
  assert.ok(Number.isInteger(g.compSize) && g.compSize >= 1 && g.compSize <= 4);
  assert.doesNotMatch(JSON.stringify(g), /ATTACK/);
});
