'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function harness() {
  const nodes = new Map();
  const calls = { circleDrags: [], pins: [], positions: [], ready: 0 };
  function element() {
    const listeners = {};
    return {
      style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} },
      clientWidth: 1000, clientHeight: 1000, naturalWidth: 1000, naturalHeight: 1000,
      dataset: {}, textContent: '', innerHTML: '',
      addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
      emit(type, event) { for (const listener of listeners[type] || []) listener(event); },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
      setPointerCapture() {}, releasePointerCapture() {}, querySelectorAll: () => []
    };
  }
  const document = {
    addEventListener() {}, createElement: element,
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    querySelectorAll: () => [],
    getElementById(id) { return this.querySelector('#' + id); }
  };
  const Game = {
    beginCircleDrag(mode) { calls.circleDrags.push(mode); },
    chooseCustomPin(point) { calls.pins.push(plain(point)); },
    setPhasePos(point) { calls.positions.push(plain(point)); },
    onFlightReady() { calls.ready++; }
  };
  const window = { Game, addEventListener() {} };
  const context = vm.createContext({
    document, window, Game,
    MAP_DATA: { island: { name: '海岛' }, desert: { name: '沙漠' } },
    setTimeout: () => 0, clearTimeout() {}
  });
  vm.runInContext(source, context, { filename: 'app-core.js' });
  vm.runInContext(`
    MapView.init();
    MapView.baseW = MapView.baseH = 1000;
    MapView.renderOverlay = () => {};
    App.mode = 'game';
    App.circleEdit = { phase: 1, cx: 50, cy: 50, r: 20 };
    globalThis.subject = { App, MapView, Tools };
  `, context);
  const subject = context.subject;
  function click(x = 500, y = 500) {
    const event = { clientX: x, clientY: y, button: 0, pointerId: 1,
      target: { closest: () => null }, preventDefault() {} };
    const stage = document.querySelector('#mapStage');
    stage.emit('pointerdown', event);
    stage.emit('pointerup', event);
    stage.emit('click', event);
  }
  function waters(pixels, isOpenWater = () => false) {
    context.CirclePredictor = window.CirclePredictor = { pixels, isOpenWater };
  }
  return { ...subject, context, calls, click, waters };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('explicit pin, position and flight tools still receive clicks inside an edited circle', async () => {
  for (const tool of ['pin', 'markpos', 'flight']) {
    const h = harness();
    h.Tools.set(tool);
    h.click();
    assert.deepEqual(h.calls.circleDrags, []);
    if (tool === 'pin') assert.deepEqual(h.calls.pins, [[50, 50]]);
    if (tool === 'markpos') assert.deepEqual(h.calls.positions, [[50, 50]]);
    if (tool === 'flight') assert.deepEqual(plain(h.App.flight.start), [50, 50]);
  }
});

test('pan mode retains circle movement and resize hit handling', () => {
  const h = harness();
  h.Tools.set('pan');
  h.click();
  h.click(700, 500);
  assert.deepEqual(h.calls.circleDrags, ['move', 'resize']);
  assert.equal(h.App.flight, null);
  assert.equal(h.App.pin, null);
});

test('a normal validated flight completes and rejects open-water endpoints', async () => {
  const h = harness();
  h.waters(() => Promise.resolve(), (x, y) => x === 90 && y === 90);
  h.Tools.set('flight');
  await h.Tools.placeFlight([30, 40]);
  await h.Tools.placeFlight([90, 90]);
  assert.deepEqual(plain(h.App.flight), { start: [30, 40], end: null });
  assert.equal(h.App.tool, 'flight');
  await h.Tools.placeFlight([70, 60]);
  assert.deepEqual(plain(h.App.flight), { start: [30, 40], end: [70, 60], draft: null });
  assert.equal(h.App.tool, 'pan');
  assert.equal(h.calls.ready, 1);
});

test('pending pixel validation cannot modify a changed map, mode, tool or flight', async () => {
  const changes = [
    h => { h.App.mapId = 'desert'; },
    h => { h.App.mode = 'info'; },
    h => { h.Tools.set('pin'); },
    h => { h.Tools.set('pan'); h.Tools.set('flight'); },
    h => { h.App.flight = { start: [10, 20], end: null }; }
  ];
  for (const change of changes) {
    const h = harness(), gate = deferred();
    h.waters(() => gate.promise);
    h.Tools.set('flight');
    const pending = h.Tools.placeFlight([30, 40]);
    change(h);
    const state = JSON.stringify(h.App.flight), tool = h.App.tool;
    gate.resolve();
    await pending;
    assert.equal(JSON.stringify(h.App.flight), state);
    assert.equal(h.App.tool, tool);
    assert.equal(h.calls.ready, 0);
  }
});

test('clearing or replacing an unfinished flight invalidates a pending endpoint', async () => {
  for (const replace of [
    h => { h.App.flight = null; },
    h => { h.App.flight.start = [5, 15]; },
    h => { h.App.flight.end = [60, 70]; }
  ]) {
    const h = harness(), gate = deferred();
    h.waters(() => gate.promise);
    h.Tools.set('flight');
    h.App.flight = { start: [20, 30], end: null };
    const pending = h.Tools.placeFlight([40, 50]);
    replace(h);
    const state = JSON.stringify(h.App.flight);
    gate.resolve();
    await pending;
    assert.equal(JSON.stringify(h.App.flight), state);
    assert.equal(h.calls.ready, 0);
  }
});
