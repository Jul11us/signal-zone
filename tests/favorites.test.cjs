'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function harness(saved = []) {
  const created = [];
  const storage = new Map([['zd_pins_v1', JSON.stringify(saved)]]);
  function element() {
    const node = {
      innerHTML: '', dataset: {}, children: [], style: {},
      appendChild(child) { this.children.push(child); },
      setAttribute() {}, querySelectorAll: () => []
    };
    created.push(node);
    return node;
  }
  const document = {
    addEventListener() {}, createElement: element, createDocumentFragment: element,
    querySelector: element, querySelectorAll: () => []
  };
  const map = () => ({ pois: [], terrains: [], vehicles: { fixed: [], periodic: [], special: [] } });
  const context = vm.createContext({
    document, window: {}, MAP_DATA: { island: map(), desert: map(), rongdu: map() },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    setTimeout: () => 0, clearTimeout() {}
  });
  vm.runInContext(source, context, { filename: 'app-core.js' });
  vm.runInContext(`
    MapView.layer = document.createElement('markers');
    MapView.stage = { clientWidth: 1000, clientHeight: 1000 };
    MapView.baseW = MapView.baseH = 1000;
    globalThis.subject = { App, Pins, MapView };
  `, context);
  const renderFavorites = () => {
    const start = created.length;
    context.subject.MapView.renderMarkers();
    return created.slice(start).filter(node => node.className === 'mk mk-fav');
  };
  return { ...context.subject, storage, renderFavorites };
}

test('new favorites belong to their creation map and render only on that map', () => {
  const h = harness();
  const favorite = h.Pins.add(32, 45);
  assert.equal(favorite.mapId, 'island');
  assert.equal(h.Pins.current().length, 1);
  assert.equal(h.renderFavorites().length, 1);
  h.App.mapId = 'desert';
  assert.equal(h.Pins.current().length, 0);
  assert.equal(h.renderFavorites().length, 0);
  assert.equal(h.Pins.current('island').length, 1);
  assert.equal(JSON.parse(h.storage.get(h.Pins.key))[0].mapId, 'island');
});

test('legacy favorites remain intact and unassigned until the user chooses a map', () => {
  const legacy = { id: 'old', name: '旧集合点', coords: [40, 30], note: '保留我的备注' };
  const h = harness([legacy]);
  assert.deepEqual(plain(h.Pins.load()), [legacy]);
  assert.deepEqual(plain(h.Pins.unassigned()), [legacy]);
  for (const mapId of ['island', 'desert', 'rongdu']) {
    h.App.mapId = mapId;
    assert.equal(h.Pins.current().length, 0);
    assert.equal(h.renderFavorites().length, 0);
  }
  h.Pins.assign('old', 'desert');
  assert.equal(h.Pins.unassigned().length, 0);
  assert.deepEqual(plain(h.Pins.current('desert')), [{ ...legacy, mapId: 'desert' }]);
  assert.deepEqual(JSON.parse(h.storage.get(h.Pins.key)), [{ ...legacy, mapId: 'desert' }]);
});

test('assigning a legacy favorite rejects unknown map names without losing the record', () => {
  const legacy = { id: 'old', name: '待归类点', coords: [20, 30], note: '' };
  const h = harness([legacy]);
  h.Pins.assign('old', 'constructor');
  assert.deepEqual(plain(h.Pins.load()), [legacy]);
  assert.equal(h.Pins.unassigned().length, 1);
});
