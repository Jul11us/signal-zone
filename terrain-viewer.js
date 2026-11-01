/* Local height-field viewer. No network service, model loader or runtime dependency. */
'use strict';
(function (root) {
  const limit = (n, a, b) => Math.max(a, Math.min(b, n));
  const TerrainMath = {
    decode(buffer, size) {
      if (!(buffer instanceof ArrayBuffer) || !Number.isInteger(size) || size < 2 || size > 255
          || buffer.byteLength !== size * size * 2) throw new Error('高度数据尺寸不匹配');
      const view = new DataView(buffer), result = new Float32Array(size * size);
      for (let i = 0; i < result.length; i++) result[i] = view.getUint16(i * 2, true) / 65535;
      return result;
    },
    mesh(heights, size) {
      if (heights.length !== size * size || size < 2 || size > 255) throw new Error('无效的地形网格');
      const vertices = new Float32Array(size * size * 8), indices = new Uint16Array((size - 1) ** 2 * 6);
      const height = (x, y) => heights[limit(y, 0, size - 1) * size + limit(x, 0, size - 1)] * .4;
      const step = 2 / (size - 1);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 8;
        const dx = (height(x + 1, y) - height(x - 1, y)) / (step * (x === 0 || x === size - 1 ? 1 : 2));
        const dz = (height(x, y + 1) - height(x, y - 1)) / (step * (y === 0 || y === size - 1 ? 1 : 2));
        const length = Math.hypot(dx, 1, dz);
        vertices.set([x * step - 1, height(x, y), y * step - 1, x / (size - 1), y / (size - 1), -dx / length, 1 / length, -dz / length], i);
      }
      let at = 0;
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
        const i = y * size + x;
        indices.set([i, i + size, i + 1, i + 1, i + size, i + size + 1], at); at += 6;
      }
      return { vertices, indices };
    },
    multiply(a, b) {
      const out = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
      return out;
    },
    camera(yaw, pitch, distance, aspect) {
      const eye = [Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance + .12, Math.cos(yaw) * Math.cos(pitch) * distance];
      const z = [eye[0], eye[1] - .12, eye[2]], len = Math.hypot(...z);
      for (let i = 0; i < 3; i++) z[i] /= len;
      const x = [z[2], 0, -z[0]], xl = Math.hypot(...x);
      for (let i = 0; i < 3; i++) x[i] /= xl;
      const y = [z[1] * x[2], z[2] * x[0] - z[0] * x[2], -z[1] * x[0]];
      const dot = v => -(v[0] * eye[0] + v[1] * eye[1] + v[2] * eye[2]);
      const view = new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, dot(x), dot(y), dot(z), 1]);
      const f = 1 / Math.tan(Math.PI / 8), near = .05, far = 30;
      const projection = new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
      return this.multiply(projection, view);
    }
  };
  root.TerrainMath = TerrainMath;
  if (typeof module !== 'undefined') module.exports = TerrainMath;
  if (typeof document === 'undefined') return;

  const q = s => document.querySelector(s);
  const assets = 'assets/terrain-data/';
  const maps = {
    erangel: { name: '海岛', en: 'ERANGEL', surfaces: {
      satellite: { name: '8K 卫星', full: 'erangel-satellite-8k.webp', texture: 'erangel-satellite-2k.webp' },
      illustrated: { name: '无字地貌', full: 'erangel-illustrated.webp', texture: 'erangel-illustrated-2k.webp' },
      relief: { name: '高程设色', full: 'erangel-relief.webp', texture: 'erangel-relief.webp' }
    } },
    miramar: { name: '沙漠', en: 'MIRAMAR', surfaces: {
      relief: { name: '高程设色', full: 'miramar-relief.webp', texture: 'miramar-relief.webp' }
    } }
  };
  const viewer = {
    map: 'erangel', surface: 'satellite', mode: '3d', revision: 0, cache: new Map(), images: new Map(),
    yaw: -.18, pitch: .86, distance: 3.45, exaggeration: 1, zoom: 1, pan: [0, 0],
    init() {
      this.dialog = q('#terrainDialog'); this.canvas = q('#terrainCanvas'); this.stage = q('#terrainStage');
      this.image = q('#terrainImage'); this.status = q('#terrainStatus');
      q('#openTerrain').onclick = () => this.open();
      q('#closeTerrain').onclick = () => this.dialog.close();
      this.dialog.addEventListener('close', () => { this.revision++; q('#openTerrain').focus(); });
      this.dialog.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.target.matches('select, input, button')) return;
        if (e.key === '0') this.reset();
        if (e.key.startsWith('Arrow')) {
          e.preventDefault(); this.yaw += e.key === 'ArrowLeft' ? -.12 : e.key === 'ArrowRight' ? .12 : 0;
          this.pitch = limit(this.pitch + (e.key === 'ArrowUp' ? .08 : e.key === 'ArrowDown' ? -.08 : 0), .18, 1.5); this.render();
        }
      });
      q('#terrainMap').onchange = e => { this.map = e.target.value; this.surface = this.map === 'erangel' ? 'satellite' : 'relief'; this.reset(false); this.load(); };
      q('#terrainSurface').onchange = e => { this.surface = e.target.value; this.load(); };
      document.querySelectorAll('[data-terrain-mode]').forEach(b => b.onclick = () => { this.mode = b.dataset.terrainMode; this.load(); });
      q('#terrainHeight').oninput = e => { this.exaggeration = Number(e.target.value); q('#terrainHeightValue').textContent = this.exaggeration.toFixed(1) + '×'; this.render(); };
      q('#terrainReset').onclick = () => this.reset();
      q('#terrainZoomIn').onclick = () => this.scale(.84);
      q('#terrainZoomOut').onclick = () => this.scale(1.19);
      q('#terrainRetry').onclick = () => this.load();
      this.stage.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('button')) return;
        this.drag = [e.clientX, e.clientY]; this.stage.setPointerCapture(e.pointerId); this.stage.classList.add('is-dragging');
      });
      this.stage.addEventListener('pointermove', e => {
        if (!this.drag) return;
        const dx = e.clientX - this.drag[0], dy = e.clientY - this.drag[1]; this.drag = [e.clientX, e.clientY];
        if (this.mode === '3d') { this.yaw -= dx * .007; this.pitch = limit(this.pitch + dy * .006, .18, 1.5); }
        else { this.pan[0] += dx; this.pan[1] += dy; this.clampPan(); }
        this.render();
      });
      const end = () => { this.drag = null; this.stage.classList.remove('is-dragging'); };
      this.stage.addEventListener('pointerup', end); this.stage.addEventListener('pointercancel', end);
      this.stage.addEventListener('wheel', e => { e.preventDefault(); this.scale(e.deltaY > 0 ? 1.1 : .9); }, { passive: false });
      this.canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault(); this.gl = null; this.mode = '2d'; this.load();
      });
      this.canvas.addEventListener('webglcontextrestored', () => { this.gl = null; });
      this.resizeObserver = new ResizeObserver(() => { if (this.dialog.open) { this.clampPan(); this.render(); } });
      this.resizeObserver.observe(this.stage);
    },
    open() {
      this.map = root.App && root.App.mapId === 'desert' ? 'miramar' : 'erangel';
      this.surface = this.map === 'erangel' ? 'satellite' : 'relief';
      q('#terrainMap').value = this.map;
      this.dialog.showModal(); this.reset(false); this.load();
    },
    reset(draw = true) {
      this.yaw = -.18; this.pitch = .86; this.distance = 3.45; this.zoom = 1; this.pan = [0, 0];
      if (draw) this.render();
    },
    scale(factor) {
      if (this.mode === '3d') this.distance = limit(this.distance * factor, 1.25, 7);
      else { this.zoom = limit(this.zoom / factor, 1, 8); this.clampPan(); }
      this.render();
    },
    clampPan() {
      const side = Math.min(this.stage.clientWidth, this.stage.clientHeight) * this.zoom;
      this.pan = this.pan.map((v, i) => limit(v, -Math.max(0, (side - (i ? this.stage.clientHeight : this.stage.clientWidth)) / 2), Math.max(0, (side - (i ? this.stage.clientHeight : this.stage.clientWidth)) / 2)));
    },
    imageFor(path) {
      if (!this.images.has(path)) {
        const pending = new Promise((resolve, reject) => {
          const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('贴图加载失败')); img.src = assets + path;
        });
        this.images.set(path, pending); pending.catch(() => this.images.delete(path));
      }
      return this.images.get(path);
    },
    async dataFor(id) {
      if (!this.cache.has(id)) {
        const pending = (async () => {
          const response = await fetch(assets + 'manifest.json'); if (!response.ok) throw new Error('地形目录加载失败');
          const manifest = await response.json(); const meta = manifest.maps[id];
          if (!meta || manifest.version !== 1) throw new Error('地形目录格式不匹配');
          const responseHeight = await fetch(assets + meta.height); if (!responseHeight.ok) throw new Error('高度数据加载失败');
          return TerrainMath.mesh(TerrainMath.decode(await responseHeight.arrayBuffer(), manifest.gridSize), manifest.gridSize);
        })();
        this.cache.set(id, pending); pending.catch(() => this.cache.delete(id));
      }
      return this.cache.get(id);
    },
    async load() {
      const revision = ++this.revision, id = this.map, surface = maps[id].surfaces[this.surface];
      q('#terrainMapName').textContent = maps[id].en;
      q('#terrainSurface').innerHTML = Object.entries(maps[id].surfaces).map(([key, s]) => `<option value="${key}">${s.name}</option>`).join('');
      q('#terrainSurface').value = this.surface;
      q('#terrainHeightControl').hidden = this.mode !== '3d';
      q('#terrainLegend').hidden = this.surface !== 'relief';
      q('#terrainSourceNote').textContent = id === 'erangel'
        ? '高度：PUBG PC · 2019　/　卫星：2021　/　地貌：2019。用于观察相对地形，与手游现版可能不同。'
        : '高度：PUBG PC · 2019。沙漠仅提供高程设色；高度为相对值，与手游现版可能不同。';
      document.querySelectorAll('[data-terrain-mode]').forEach(b => { const active = b.dataset.terrainMode === this.mode; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
      this.stage.dataset.mode = this.mode;
      this.stage.dataset.loading = 'true'; this.status.hidden = false; q('#terrainRetry').hidden = true;
      q('#terrainStatusText').textContent = '正在加载本地地形…';
      q('#terrainHint').textContent = this.mode === '3d' ? '拖动旋转 · 滚轮缩放 · 方向键调整视角' : '拖动平移 · 滚轮缩放 · 原始方形贴图';
      try {
        if (this.mode === '2d') {
          const img = await this.imageFor(surface.full);
          if (revision !== this.revision) return;
          this.image.src = img.src;
        } else {
          if (!this.setupGL()) {
            this.mode = '2d'; await this.load();
            q('#terrainHint').textContent = '当前浏览器不支持 3D，已切换二维地图 · 拖动平移 · 滚轮缩放'; return;
          }
          const [mesh, texture] = await Promise.all([this.dataFor(id), this.imageFor(surface.texture)]);
          if (revision !== this.revision) return;
          this.upload(mesh, texture);
        }
        if (revision !== this.revision) return;
        this.stage.dataset.loading = 'false'; this.status.hidden = true; this.render();
      } catch (error) {
        if (revision !== this.revision) return;
        q('#terrainStatusText').textContent = error.message + '，请检查本地资源后重试。'; q('#terrainRetry').hidden = false;
      }
    },
    setupGL() {
      if (this.gl) return true;
      const gl = this.canvas.getContext('webgl', { antialias: true, alpha: false });
      if (!gl || gl.isContextLost()) return false;
      const compile = (type, source) => {
        const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('地形着色器初始化失败');
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, `attribute vec3 a_position; attribute vec2 a_uv; attribute vec3 a_normal;
        uniform mat4 u_camera; uniform float u_height; varying vec2 v_uv; varying float v_light;
        void main(){ vec3 p=a_position; p.y*=u_height; gl_Position=u_camera*vec4(p,1.0); v_uv=a_uv;
          vec3 n=normalize(vec3(a_normal.x,a_normal.y/u_height,a_normal.z));
          v_light=0.72+0.28*max(dot(n,normalize(vec3(-0.4,1.0,-0.3))),0.0); }`);
      const fragment = compile(gl.FRAGMENT_SHADER, `precision mediump float; uniform sampler2D u_map;
        varying vec2 v_uv; varying float v_light; void main(){ gl_FragColor=vec4(texture2D(u_map,v_uv).rgb*v_light,1.0); }`);
      this.program = gl.createProgram(); gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('地形渲染初始化失败');
      gl.useProgram(this.program);
      this.vertexBuffer = gl.createBuffer(); this.indexBuffer = gl.createBuffer(); this.texture = gl.createTexture();
      this.uniformCamera = gl.getUniformLocation(this.program, 'u_camera'); this.uniformHeight = gl.getUniformLocation(this.program, 'u_height');
      this.attributes = [['a_position', 3, 0], ['a_uv', 2, 12], ['a_normal', 3, 20]].map(([name, size, offset]) => [gl.getAttribLocation(this.program, name), size, offset]);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_map'), 0);
      gl.enable(gl.DEPTH_TEST); gl.clearColor(.035, .065, .087, 1);
      this.gl = gl; return true;
    },
    upload(mesh, image) {
      const gl = this.gl; gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer); gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
      this.attributes.forEach(([location, size, offset]) => { gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset); });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW); this.indexCount = mesh.indices.length;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
    render() {
      if (!this.dialog.open) return;
      q('#terrainOrientation').style.transform = `rotate(${-this.yaw}rad)`;
      q('#terrainZoomLabel').textContent = this.mode === '2d' ? Math.round(this.zoom * 100) + '%' : Math.round(3.45 / this.distance * 100) + '%';
      if (this.mode === '2d') {
        const side = Math.min(this.stage.clientWidth, this.stage.clientHeight) * this.zoom;
        this.image.style.width = side + 'px'; this.image.style.height = side + 'px';
        this.image.style.transform = `translate(calc(-50% + ${this.pan[0]}px),calc(-50% + ${this.pan[1]}px))`; return;
      }
      const gl = this.gl; if (!gl || !this.indexCount || gl.isContextLost()) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.round(this.stage.clientWidth * ratio), height = Math.round(this.stage.clientHeight * ratio);
      if (!width || !height) return;
      if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
      gl.viewport(0, 0, width, height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program);
      const fitDistance = this.distance * Math.max(1, .95 * height / width);
      gl.uniformMatrix4fv(this.uniformCamera, false, TerrainMath.camera(this.yaw, this.pitch, fitDistance, width / height));
      gl.uniform1f(this.uniformHeight, this.exaggeration); gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    }
  };
  root.TerrainViewer = viewer;
  document.addEventListener('DOMContentLoaded', () => viewer.init());
})(typeof window !== 'undefined' ? window : globalThis);
