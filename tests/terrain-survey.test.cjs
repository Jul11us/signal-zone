'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const terrain = require('../terrain-viewer.js');
const survey = require('../map-survey.js');

test('height decoder preserves unsigned little-endian samples and rejects truncated fields', () => {
  const data = new Uint8Array([0, 0, 0, 128, 255, 255, 0, 64]);
  const decoded = terrain.decode(data.buffer, 2);
  assert.equal(decoded[0], 0); assert.equal(decoded[2], 1);
  assert.ok(Math.abs(decoded[1] - 32768 / 65535) < 1e-6);
  assert.ok(Math.abs(decoded[3] - 16384 / 65535) < 1e-6);
  assert.throws(() => terrain.decode(data.buffer.slice(0, 6), 2));
  assert.throws(() => terrain.decode(data.buffer, 257));
});

test('terrain geometry aligns north-west texture origin and keeps WebGL 1 indices in range', () => {
  const flat = terrain.mesh(new Float32Array(9), 3);
  assert.deepEqual(Array.from(flat.vertices.slice(0, 8)), [-1, 0, -1, 0, 0, -0, 1, -0]);
  assert.deepEqual(Array.from(flat.vertices.slice(-8, -3)), [1, 0, 1, 1, 1]);
  assert.equal(flat.indices.length, 24);
  const field = new Float32Array(193 * 193); field[96 * 193 + 96] = 1;
  const mesh = terrain.mesh(field, 193);
  assert.ok(Math.abs(mesh.vertices[(96 * 193 + 96) * 8 + 1] - .4) < 1e-6);
  for (const i of mesh.indices) assert.ok(i < 193 * 193);
  assert.ok(mesh.vertices.every(Number.isFinite));
});

test('camera matrices remain finite at supported orbit and viewport limits', () => {
  for (const aspect of [.3, 1, 3]) for (const pitch of [.18, .86, 1.5]) {
    const matrix = terrain.camera(.2, pitch, 1.25, aspect);
    assert.equal(matrix.length, 16); assert.ok(matrix.every(Number.isFinite));
  }
  assert.notDeepEqual(terrain.camera(0, .86, 3.45, 1), terrain.camera(1, .86, 3.45, 1));
});

test('bundled terrain fields match manifest dimensions and use local, existing textures', () => {
  const base = path.join(__dirname, '..', 'assets', 'terrain-data');
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json')));
  assert.equal(manifest.version, 1);
  for (const meta of Object.values(manifest.maps)) {
    assert.equal(meta.heightUnits, 'relative'); assert.equal(meta.sourceYear, 2019);
    assert.deepEqual(meta.sourceSize, [8192, 8192]);
    const bytes = fs.readFileSync(path.join(base, meta.height));
    const field = terrain.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), manifest.gridSize);
    assert.ok(field.some(n => n > .5)); assert.ok(field.every(n => n >= 0 && n <= 1));
    assert.ok(fs.statSync(path.join(base, meta.relief)).size > 0);
  }
  for (const name of ['erangel-satellite-8k.webp', 'erangel-satellite-2k.webp', 'erangel-illustrated.webp', 'erangel-illustrated-2k.webp'])
    assert.ok(fs.statSync(path.join(base, name)).size > 0);
});

test('survey accumulates every straight-line segment using the existing 8 km map scale', () => {
  assert.equal(survey.distance([]), 0);
  assert.equal(survey.distance([[0, 0], [3, 4]]), 400);
  assert.equal(survey.distance([[0, 0], [3, 4], [6, 8]]), 800);
  assert.equal(survey.distance([[0, 0], [100, 0]]), 8000);
  assert.equal(survey.format(800), '800 m'); assert.equal(survey.format(1250), '1.25 km');
});

test('survey rejects malformed, out-of-map and nonnumeric points before SVG rendering', () => {
  for (const point of [[1, '2'], [-1, 5], [1, 101], [NaN, 1], [Infinity, 1], [1], [1, 2, 3], null, '<svg>']) {
    assert.equal(survey.valid(point), false); assert.throws(() => survey.distance([[0, 0], point]));
  }
});

function viewerHarness() {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { style: {}, dataset: {}, textContent: '', hidden: false, src: '' });
    return nodes.get(selector);
  };
  const context = vm.createContext({
    window: {}, document: { querySelector: node, querySelectorAll: () => [], addEventListener() {} },
    Map, ArrayBuffer, DataView, Float32Array, Uint16Array
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'terrain-viewer.js'), 'utf8'), context);
  const viewer = context.window.TerrainViewer;
  Object.assign(viewer, { dialog: { open: true }, stage: node('#terrainStage'), image: node('#terrainImage'), status: node('#terrainStatus'), canvas: { getContext: () => null } });
  viewer.render = () => {};
  return { viewer, node };
}

test('unavailable WebGL falls back to a usable 2D image with a visible explanation', async () => {
  const { viewer, node } = viewerHarness();
  viewer.imageFor = async path => ({ src: path });
  await viewer.load();
  assert.equal(viewer.mode, '2d');
  assert.equal(viewer.image.src, 'erangel-satellite-8k.webp');
  assert.equal(viewer.status.hidden, true);
  assert.match(node('#terrainHint').textContent, /不支持 3D/);
});

test('an older image response cannot replace the latest map selection', async () => {
  const { viewer } = viewerHarness();
  let finish;
  viewer.mode = '2d';
  viewer.imageFor = name => name.startsWith('erangel') ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ src: name });
  const stale = viewer.load();
  viewer.map = 'miramar'; viewer.surface = 'relief';
  await viewer.load();
  finish({ src: 'stale-erangel-image' }); await stale;
  assert.equal(viewer.image.src, 'miramar-relief.webp');
  assert.equal(viewer.stage.dataset.loading, 'false');
});

test('a failed image request exposes a retry control instead of showing stale imagery', async () => {
  const { viewer, node } = viewerHarness();
  viewer.mode = '2d'; viewer.imageFor = async () => { throw new Error('贴图加载失败'); };
  await viewer.load();
  assert.equal(viewer.stage.dataset.loading, 'true');
  assert.equal(viewer.status.hidden, false);
  assert.equal(node('#terrainRetry').hidden, false);
  assert.match(node('#terrainStatusText').textContent, /贴图加载失败/);
});
