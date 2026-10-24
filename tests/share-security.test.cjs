'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

function harness() {
  const created = [];
  const nodes = new Map();
  function element(tag) {
    const node = {
      tag, innerHTML: '', textContent: '', dataset: {}, children: [],
      style: { setProperty() {} },
      classList: { contains: () => false },
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
  const map = name => ({ name, pois: [], terrains: [] });
  const context = vm.createContext({
    document, window: {},
    MAP_DATA: { island: map('海岛'), desert: map('沙漠'), rongdu: map('荣都') },
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
  vm.runInContext(source, context, { filename: 'app-core.js' });
  // Keep the real share parser and renderers; replace only the unrelated map UI lifecycle.
  vm.runInContext(`
    setMap = id => { App.mapId = id; App.flight = null; App.circles = {}; App.pin = null; };
    MapView.layer = document.createElement('markers');
    MapView.svg = document.createElement('svg');
    MapView.stage = { clientWidth: 1000, clientHeight: 1000 };
    MapView.baseW = MapView.baseH = 1000;
    globalThis.subject = { App, ShareLink, MapView, Inspector };
  `, context);
  const restore = payload => {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    context.location.hash = '#z=' + Buffer.from(json, 'utf8').toString('base64');
    return context.subject.ShareLink.restore();
  };
  return { ...context.subject, context, document, created, restore };
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
    id: 'pin_test', coords: [50, 50],
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
