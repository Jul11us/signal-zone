/* =========================================================================
 * app-core.js —— 地图核心 / 情报模式 / 检查器 / 360° 查看器
 * ========================================================================= */
'use strict';

const App = {
  mapId: 'island',
  mode: 'info',            // info | game
  zoom: 1,
  pan: { x: 0, y: 0 },
  dragging: false,
  dragStart: { x: 0, y: 0 },
  selected: null,          // {kind, id}
  layers: {
    pois: true, compounds: true, density: true, labels: true,
    vehFixed: true, vehPeriodic: true, vehSpecial: true,
    fav: true,
    terrain: {},           // cat -> bool
    routes: true, circle: true, flight: true
  },
  flight: null,
  circle: null,
  circles: {},          // 已确定的圈形：{ phase: {cx,cy,r} }
  circleEdit: null,     // 当前正在编辑的圈：{ phase, cx, cy, r, locked }
  tool: 'pan',
  routes: [],
  pin: null,
  game: {
    style: null, followers: 0, recommend: [], chosen: null, planPhase: 1,
    phasePos: {},      // 每圈打完/转移后，我方实际所在地：{ phase: [x,y] }
    hudHidden: false,  // 缩圈提示是否关闭
    circleMode: 'ranked', phase: 2, remain: null, teams: 16, players: 64,
    compSize: 4, compRoles: [], plan: null, matches: []
  },
  pano: { scene: null, yaw: 0, pitch: 4, fov: 75, auto: false, raf: null, target: null }
};

/* ------------------------------ 工具 ------------------------------ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAP = () => MAP_DATA[App.mapId];
const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g,
  ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function toast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 2600);
}
function starStr(v) {
  const full = Math.floor(v), half = v - full >= 0.5;
  return '★'.repeat(full) + (half ? '⯪' : '') + '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
}
function densityColor(d) {
  if (d >= 80) return '#f2555a';
  if (d >= 65) return '#fb8c4c';
  if (d >= 50) return '#f5c04e';
  if (d >= 40) return '#aedd57';
  return '#5bd68c';
}
function lootColor(l) {
  if (l >= 88) return '#c08cf5';
  if (l >= 80) return '#ece8e1';
  if (l >= 72) return '#45d6e5';
  return '#94a3b8';
}
function riskClass(r) { return r && r.includes('高') ? 'risk-high' : r && r.includes('中') ? 'risk-mid' : 'risk-low'; }

/* ============================ 地图视图 ============================ */
/* ====================== 自定义收藏点（本机持久化）======================
 * 右键地图任意位置即可收藏：打野路线、车队集合点、自己发现的密室入口。
 * 存 localStorage（zd_pins_v1），与复盘库同思路：只在本机，不上传。
 * =================================================================== */
const Pins = {
  key: 'zd_pins_v1',
  load() {
    if (!App.custom) {
      try { App.custom = JSON.parse(localStorage.getItem(this.key)) || []; }
      catch (e) { App.custom = []; }
    }
    return App.custom;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(App.custom || [])); } catch (e) { } },
  add(x, y) {
    const p = { id: 'pin_' + Date.now(), name: '我的点位 ' + (this.load().length + 1), coords: [+x.toFixed(1), +y.toFixed(1)], note: '' };
    App.custom.push(p); this.save();
    return p;
  },
  update(id, patch) {
    const p = App.custom.find(q => q.id === id);
    if (!p) return;
    Object.assign(p, patch); this.save();
  },
  remove(id) {
    App.custom = App.custom.filter(q => q.id !== id);
    this.save();
  }
};

/* ====================== 方案分享链接 ======================
 * 把当前局面（地图/航线/圈形/大头针）编码进 URL hash，队友打开
 * 链接即恢复同一张图。预测结果可由圈形一键重算，不进链接。
 * ========================================================= */
const ShareLink = {
  encode() {
    const st = {
      v: 1, map: App.mapId,
      flight: App.flight && App.flight.start && App.flight.end ? [App.flight.start, App.flight.end] : null,
      circles: Object.keys(App.circles || {}).length ? App.circles : null,
      pin: App.pin ? App.pin.coords : null
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(st))));
    return location.origin + location.pathname + '#z=' + b64;
  },
  copy() {
    const url = this.encode();
    const done = () => toast('📤 分享链接已复制，发给队友即可打开同一局面');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => this.fallback(url, done));
    } else this.fallback(url, done);
  },
  fallback(url, done) {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { prompt('复制下面的链接：', url); }
    ta.remove();
  },
  restore() {
    const m = location.hash.match(/#z=([A-Za-z0-9+/=]+)/);
    if (!m) return false;
    let st = null;
    try { st = JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch (e) { return false; }
    if (!st || st.v !== 1) return false;
    const ok = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
    const point = p => Array.isArray(p) && p.length === 2 && p.every(ok);
    setMap(Object.prototype.hasOwnProperty.call(MAP_DATA, st.map) ? st.map : 'island', true);
    App.flight = Array.isArray(st.flight) && st.flight.length === 2 && st.flight.every(point)
      ? { start: st.flight[0], end: st.flight[1] } : null;
    App.circles = {};
    if (st.circles) Object.keys(st.circles).forEach(k => {
      const c = st.circles[k];
      const phase = Number(k);
      if (Number.isInteger(phase) && phase >= 1 && phase <= 8 && c && ok(c.cx) && ok(c.cy)
          && typeof c.r === 'number' && Number.isFinite(c.r) && c.r > 0) {
        App.circles[phase] = { cx: c.cx, cy: c.cy, r: Math.min(60, c.r) };
      }
    });
    App.pin = point(st.pin) ? { coords: st.pin } : null;
    MapView.renderAll();
    if (App.flight && window.Game && App.mode === 'game') Game.onFlightReady();
    const parts = [App.flight ? '航线' : null, Object.keys(App.circles).length ? Object.keys(App.circles).length + ' 个圈形' : null, App.pin ? '选点' : null].filter(Boolean);
    toast('📥 已载入分享方案：' + MAP().name + (parts.length ? '（' + parts.join(' + ') + '）' : ''));
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }
};

const MapView = {
  init() {
    this.stage = $('#mapStage');
    this.viewport = $('#mapViewport');
    this.img = $('#mapImage');
    this.svg = $('#overlaySvg');
    this.layer = $('#markerLayer');

    // 尺寸自适应：按图片比例 fit 进舞台
    this.img.addEventListener('load', () => this.fit());
    window.addEventListener('resize', () => { this.fit(); this.updateTransform(); });

    // 滚轮缩放
    this.stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.stage.getBoundingClientRect();
      const mx = (e.clientX - r.left - r.width / 2) / App.zoom;
      const my = (e.clientY - r.top - r.height / 2) / App.zoom;
      const next = clamp(App.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 1, 6);
      const k = next / App.zoom;
      App.pan.x -= mx * (k - 1);
      App.pan.y -= my * (k - 1);
      App.zoom = next;
      this.clampPan();
      this.updateTransform();
      this.scheduleMarkers();
    }, { passive: false });

    // 悬浮 UI 上的指针操作不当作地图拖动/点击
    const isUI = (e) => !!(e.target.closest('.mk, .map-legend, .game-hud, .map-hud-title, .hud-restore, #mapToolbar, #mapScale, .map-tools, .map-hud, button, input, select, label'));

    // 拖拽平移
    this.stage.addEventListener('pointerdown', (e) => {
      if (isUI(e)) return;
      if (App.mode === 'game' && App.tool && App.tool !== 'pan') return;
      App.dragging = true;
      App.dragStart = { x: e.clientX - App.pan.x, y: e.clientY - App.pan.y };
      App.dragPt = { x: e.clientX, y: e.clientY };
      App.dragged = false;
      this.stage.classList.add('grabbing');
      this.stage.setPointerCapture(e.pointerId);
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (App.dragging && !App.dragged && App.dragPt) {
        // 位移超过 4px 才算拖动，轻微手抖不吞掉后续点击
        if (Math.hypot(e.clientX - App.dragPt.x, e.clientY - App.dragPt.y) > 4) App.dragged = true;
      }
      if (!App.dragging || !App.dragged) return;
      App.pan.x = e.clientX - App.dragStart.x;
      App.pan.y = e.clientY - App.dragStart.y;
      this.clampPan();
      this.updateTransform();
      this.scheduleMarkers();
    });
    const endDrag = (e) => {
      App.dragging = false;
      this.stage.classList.remove('grabbing');
      try { this.stage.releasePointerCapture(e.pointerId); } catch (_) { }
    };
    this.stage.addEventListener('pointerup', endDrag);
    this.stage.addEventListener('pointercancel', endDrag);

    // 右键收藏自定义点位
    this.stage.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (e.target.closest('.mk, .map-legend, .game-hud, .map-hud-title, .hud-restore, #mapToolbar, #mapScale, .map-hud, button, input, select, label')) return;
      if (App.mode === 'game' && App.tool && App.tool !== 'pan') return;
      const p = this.toPercent(e.clientX, e.clientY);
      const pin = Pins.add(p[0], p[1]);
      this.renderMarkers();
      toast('★ 已收藏点位，右键继续添加，点击星标可编辑');
      Inspector.favorite(pin);
    });

    // 地图点击（供绘制工具使用）
    this.stage.addEventListener('click', (e) => {
      if (isUI(e)) return;
      if (App.dragged) { App.dragged = false; return; }
      const p = this.toPercent(e.clientX, e.clientY);
      Tools.handleClick(p);
    });

    this.fit();

    // 标注点击 → 打开详情
    this.layer.addEventListener('click', (e) => {
      const mk = e.target.closest('.mk');
      if (!mk) return;
      e.stopPropagation();
      const kind = mk.dataset.kind;
      const m = MAP();
      if (kind === 'poi') {
        Inspector.poi(m.pois.find(p => p.name === mk.dataset.name));
      } else if (kind === 'ter') {
        App.selected = { kind: 'ter', id: mk.dataset.id };
        this.renderMarkers();
        Inspector.terrain(m.terrains.find(t => t.id === mk.dataset.id));
      } else if (kind === 'fav') {
        Inspector.favorite(Pins.load().find(q => q.id === mk.dataset.id));
      } else if (kind === 'veh') {
        const list = mk.dataset.list;
        const arr = list === 'fixed' ? m.vehicles.fixed : list === 'periodic' ? m.vehicles.periodic : m.vehicles.special;
        const v = arr.find(x => x.location === mk.dataset.name);
        if (v) Inspector.vehicle(v, list === 'fixed' ? '固定' : list === 'periodic' ? '定期' : '特殊');
      }
    });
  },

  fit() {
    if (!this.stage || !this.img.naturalWidth) return;
    const pad = 10;
    const aw = this.stage.clientWidth - pad * 2;
    const ah = this.stage.clientHeight - pad * 2;
    const ar = this.img.naturalWidth / this.img.naturalHeight;
    let w = aw, h = aw / ar;
    if (h > ah) { h = ah; w = ah * ar; }
    this.baseW = w; this.baseH = h;
    this.viewport.style.width = Math.round(w * App.zoom) + 'px';
    this.viewport.style.height = Math.round(h * App.zoom) + 'px';
    this.updateScale();   // baseW 变了，比例尺必须跟着重算（切图 / 窗口缩放后）
  },

  /* 视野感知的平移夹取：保证地图永远至少铺满舞台、又恰好能拖到每个边缘。
   * 放大后允许大幅平移（可达地图边缘），zoom=1 时地图贴合舞台不可拖丢。 */
  clampPan() {
    if (!this.stage || !this.baseW) return;
    const M = 64;   // 边缘缓冲：允许稍微拖出一点再弹回的视觉余量
    const maxX = Math.max(0, (this.baseW * App.zoom - this.stage.clientWidth) / 2 + M);
    const maxY = Math.max(0, (this.baseH * App.zoom - this.stage.clientHeight) / 2 + M);
    App.pan.x = clamp(App.pan.x, -maxX, maxX);
    App.pan.y = clamp(App.pan.y, -maxY, maxY);
  },

  updateTransform() {
    // 关键：不再用 CSS scale 放大（那会让浏览器先按小尺寸栅格化再拉伸 → 糊）。
    // 改为把容器直接布局成"放大后的真实尺寸"，transform 只负责平移，图片始终 1:1 渲染。
    if (this.baseW) {
      this.viewport.style.width = Math.round(this.baseW * App.zoom) + 'px';
      this.viewport.style.height = Math.round(this.baseH * App.zoom) + 'px';
    }
    this.viewport.style.transform =
      `translate(calc(-50% + ${App.pan.x}px), calc(-50% + ${App.pan.y}px))`;
    this.viewport.style.setProperty('--iz', '1');
    const tz = (1 / App.zoom).toFixed(3);
    if (this.svg) this.svg.style.setProperty('--tz', tz);
    const es = document.getElementById('editSvg');
    if (es) es.style.setProperty('--tz', tz);
    const z = $('#zoomLabel'); if (z) z.textContent = Math.round(App.zoom * 100) + '%';
    this.updateScale();
  },

  reset() { App.zoom = 1; App.pan = { x: 0, y: 0 }; this.clampPan(); this.updateTransform(); },

  /* 把地图上某个百分比坐标居中显示（找不到推荐点位时的"定位"） */
  focus(coords, zoom) {
    if (!coords) return;
    App.zoom = clamp(zoom || 2.2, 1, 6);
    const [x, y] = coords;
    App.pan.x = -(x - 50) / 100 * this.baseW * App.zoom;
    App.pan.y = -(y - 50) / 100 * this.baseH * App.zoom;
    this.clampPan();
    this.updateTransform();
  },

  /* 比例尺：地图 8km×8km，1% ≈ 80m */
  updateScale() {
    const bar = $('#scaleBar'), txt = $('#scaleText');
    if (!bar || !txt || !this.baseW) return;
    const pxPerPct = this.baseW * App.zoom / 100;   // 屏幕上 1% 地图宽度对应的像素
    const mPerPx = 8000 / (this.baseW * App.zoom);
    const nice = [50, 100, 200, 500, 1000, 2000, 3000];
    let target = 90 * mPerPx;
    let pick = nice[0];
    for (const n of nice) { if (n <= target) pick = n; }
    bar.style.width = (pick / mPerPx).toFixed(0) + 'px';
    txt.textContent = pick >= 1000 ? (pick / 1000) + ' km' : pick + ' m';
  },

  zoomBy(k) { App.zoom = clamp(App.zoom * k, 1, 6); this.updateTransform(); },

  toPercent(cx, cy) {
    const r = this.viewport.getBoundingClientRect();
    return [clamp((cx - r.left) / r.width * 100, 0, 100), clamp((cy - r.top) / r.height * 100, 0, 100)];
  },

  /* 视口裁剪：只渲染可见区域（+边缘预载），放大拖动时大幅减少 DOM 标记数 */
  visibleRect() {
    if (!this.stage || !this.baseW) return null;
    const vw = this.baseW * App.zoom, vh = this.baseH * App.zoom;
    const sw = this.stage.clientWidth, sh = this.stage.clientHeight;
    const cx = 50 - App.pan.x / vw * 100, cy = 50 - App.pan.y / vh * 100;
    const hw = sw / vw * 100 / 2 + 6, hh = sh / vh * 100 / 2 + 6;   // +6% 预载
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
  },
  inView(c, r) { return r && c && c[0] >= r.x0 && c[0] <= r.x1 && c[1] >= r.y0 && c[1] <= r.y1; },
  /* 拖动/缩放时节流重渲标记 */
  scheduleMarkers() {
    if (this._mkPending) return;
    this._mkPending = requestAnimationFrame(() => { this._mkPending = 0; this.renderMarkers(); });
  },

  /* ---------- 渲染所有标注 ---------- */
  renderMarkers() {
    const m = MAP();
    const frag = document.createDocumentFragment();
    const VR = this.visibleRect();

    // 主要点位
    if (App.layers.pois) {
      (m.pois || []).filter(p => p.kind !== 'compound' && this.inView(p.coords, VR)).forEach(p => {
        const b = el('button', 'mk mk-poi');
        b.style.left = p.coords[0] + '%';
        b.style.top = p.coords[1] + '%';
        b.dataset.kind = 'poi'; b.dataset.name = p.name;
        b.innerHTML = `<span class="mk-dot" style="--c:${densityColor(p.density)}"></span>
          <span class="mk-label">${p.name}</span>`;
        b.setAttribute('data-tip', `${p.name} · 密度${p.density} · 资源${p.loot}`);
        frag.appendChild(b);
      });
    }

    // 野区房群（从地图上识别出来的小房区）
    if (App.layers.compounds) {
      (m.pois || []).filter(p => p.kind === 'compound' && this.inView(p.coords, VR)).forEach(p => {
        const b = el('div', 'mk mk-cmp');
        b.style.left = p.coords[0] + '%';
        b.style.top = p.coords[1] + '%';
        b.dataset.kind = 'poi'; b.dataset.name = p.name;
        b.innerHTML = `<span class="mk-cmp-dot"></span><span class="mk-label">${p.name}</span>`;
        b.setAttribute('data-tip', `${p.name} · 资源${p.loot} · 密度${p.density}（野点发育候选）`);
        frag.appendChild(b);
      });
    }

    // 载具
    (m.vehicles ? [
      ['fixed', App.layers.vehFixed, 'fixed'],
      ['periodic', App.layers.vehPeriodic, 'periodic'],
      ['special', App.layers.vehSpecial, 'special']
    ] : []).forEach(([key, on]) => {
      if (!on) return;
      (m.vehicles[key] || []).forEach(v => {
        if (!this.inView(v.coords, VR)) return;
        if (!v.coords || !v.coords.length) return;
        const c = VEHICLE_CATS[v.cat] || VEHICLE_CATS.car;
        const b = el('div', `mk mk-veh ${key} cat-${v.cat}`);
        b.style.left = v.coords[0] + '%';
        b.style.top = v.coords[1] + '%';
        b.dataset.kind = 'veh'; b.dataset.name = v.location; b.dataset.list = key;
        b.innerHTML = `<span>${c.icon}</span>`;
        b.setAttribute('data-tip',
          `${v.type} ×${v.count || 1} · ${v.location}${key === 'periodic' ? ` · 定期刷新 ${v.probability}%` : key === 'special' ? ` · 特殊刷新 ${v.probability}%` : ' · 固定刷新'}`);
        frag.appendChild(b);
      });
    });

    // 地形标注
    (m.terrains || []).forEach(t => {
      if (!this.inView(t.coords, VR)) return;
      if (!App.layers.terrain[t.cat]) return;
      const c = TERRAIN_CATS[t.cat];
      const b = el('div', 'mk mk-ter' + (App.selected && App.selected.kind === 'ter' && App.selected.id === t.id ? ' selected' : ''));
      b.style.left = t.coords[0] + '%';
      b.style.top = t.coords[1] + '%';
      b.style.setProperty('--c', c.color);
      b.dataset.kind = 'ter'; b.dataset.id = t.id; b.dataset.cat = t.cat;
      b.innerHTML = `<span class="mk-ter-icon">${c.icon}</span><span class="mk-label">${t.name}</span>`;
      b.setAttribute('data-tip', `${c.name} · ${t.name} · 风险${t.risk}`);
      frag.appendChild(b);
    });

    this.layer.innerHTML = '';
    this.layer.appendChild(frag);

    if (App.layers.density) {
      (m.pois || []).filter(p => p.kind !== 'compound' && this.inView(p.coords, VR)).forEach(p => {
        const ring = el('div', 'density-ring');
        ring.style.left = p.coords[0] + '%';
        ring.style.top = p.coords[1] + '%';
        const s = 40 + p.density * 0.9;
        ring.style.width = ring.style.height = s * 0.55 + 'px';
        ring.style.background =
          `radial-gradient(circle, ${densityColor(p.density)}55 0%, ${densityColor(p.density)}00 70%)`;
        this.layer.appendChild(ring);
      });
    }

    // 我的收藏点（本机持久化，右键地图添加）
    if (App.layers.fav) {
      (Pins.load() || []).forEach(p => {
        if (!this.inView(p.coords, VR)) return;
        const b = el('button', 'mk mk-fav');
        b.style.left = p.coords[0] + '%';
        b.style.top = p.coords[1] + '%';
        b.dataset.kind = 'fav'; b.dataset.id = p.id;
        b.innerHTML = `<span class="mk-fav-star">★</span><span class="mk-label">${escapeHTML(p.name)}</span>`;
        b.setAttribute('data-tip', `${p.name} · (${p.coords[0]}, ${p.coords[1]})${p.note ? ' · ' + p.note : ''}`);
        frag.appendChild(b);
      });
      this.layer.appendChild(frag);
    }

    /* ---------- 密集区去重叠 ----------
     * DOM 顺序即优先级：主要点位 → 野区房群 → 载具 → 地形 → 收藏。
     * 与已保留标记的屏幕矩形相交的低优先级标记直接隐藏（点不到 = 不会点错），
     * 放大后标记自然散开，重渲时自动恢复。选中态永不隐藏。 */
    const kept = [];
    this.layer.querySelectorAll('.mk').forEach(mk => {
      const r = mk.getBoundingClientRect();
      if (mk.classList.contains('selected')) { kept.push(r); return; }
      const pad = 2;
      const hit = kept.some(k =>
        r.left - pad < k.right && r.right + pad > k.left &&
        r.top - pad < k.bottom && r.bottom + pad > k.top);
      if (hit) { mk.style.display = 'none'; mk.dataset.shelved = '1'; }
      else kept.push(r);
    });
  },

  /* ---------- 叠加图层：航线 / 圈 / 路线 / 标记 ---------- */
  renderOverlay() {
    const svg = this.svg;
    let s = '';
    s += `<defs>
      <marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <polygon points="0 0, 7 3, 0 6" fill="#ece8e1"/></marker>
      <marker id="ah2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <polygon points="0 0, 7 3, 0 6" fill="#f5a524"/></marker>
    </defs>`;

    // 航线
    if (App.flight && App.flight.start && App.flight.end) {
      const [x1, y1] = App.flight.start, [x2, y2] = App.flight.end;
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ov-flight" marker-end="url(#ah)"/>`;
      s += `<circle cx="${x1}" cy="${y1}" r="1.1" class="ov-flight-start"/>`;
      s += `<text x="${x1}" y="${y1 - 2.4}" class="ov-text">起</text>`;
      s += `<text x="${x2}" y="${y2 - 2.4}" class="ov-text">终</text>`;
      if (App.flight.draft) s += `<circle cx="${App.flight.draft[0]}" cy="${App.flight.draft[1]}" r="1" class="ov-draft"/>`;
    }

    // 圈形：所有已确定的圈（可以一次设置 1-8 圈）
    Object.keys(App.circles || {}).map(Number).sort((a, b) => a - b).forEach(n => {
      const c = App.circles[n];
      if (!c) return;
      const editing = App.circleEdit && App.circleEdit.phase === n;
      s += `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" class="ov-circle-set${editing ? ' editing' : ''}"/>`;
      s += editing
        ? `<text x="${c.cx}" y="${c.cy - c.r - 1.6}" class="ov-text circle">第 ${n} 圈 · ${Math.round(c.r * 80)}m</text>`
        : `<text x="${c.cx}" y="${c.cy - c.r - 1.2}" class="ov-text circle dim">${n}圈 ${Math.round(c.r * 80)}m</text>`;
    });
    if (App.circleEdit && !App.circles[App.circleEdit.phase]) {
      const c = App.circleEdit;
      s += `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" class="ov-circle-set editing"/>`;
    }
    // 下一圈预测：可行域（确定性）+ 热度点 + Top 候选区（启发式概率）
    if (App.prediction && !App.prediction.error) {
      const P = App.prediction, cur = App.circles[P.curPhase];
      if (cur && P.maxD > 0.05) {
        s += `<circle cx="${cur.cx}" cy="${cur.cy}" r="${P.maxD}" class="ov-feasible"/>`;
        s += `<text x="${cur.cx}" y="${cur.cy - P.maxD - 1.2}" class="ov-text pred-cap">第 ${P.nextPhase} 圈圆心必在此内</text>`;
      }
      (P.heat || []).forEach(h => {
        const rel = h.p * (P.samples || 600);   // 相对平均的似然倍数
        s += `<circle cx="${h.x.toFixed(2)}" cy="${h.y.toFixed(2)}" r="0.55" class="ov-pred-dot" style="opacity:${Math.min(.72, .08 + rel * .12).toFixed(2)}"/>`;
      });
      (P.top || []).forEach(b => {
        s += `<circle cx="${b.cx.toFixed(2)}" cy="${b.cy.toFixed(2)}" r="${P.rNext.toFixed(2)}" class="ov-pred-zone z${b.rank}"/>`;
        s += `<text x="${b.cx.toFixed(2)}" y="${(b.cy - P.rNext - 1.2).toFixed(2)}" class="ov-text pred-zone-t z${b.rank}" text-anchor="middle">区${b.rank} · ${Math.round(b.prob * 100)}%</text>`;
      });
    }
    // 航线拥堵模拟：光环大小 = 预期队数，颜色分档（红=爆满 橙=热门 绿=适中）
    if (App.congestion && App.congestion.top) {
      const B = (window.CONGESTION_CFG || {}).buckets || { packed: 3, hot: 1.5, ok: 0.5 };
      App.congestion.top.forEach((it, i) => {
        const cls = it.expected >= B.packed ? 'red' : it.expected >= B.hot ? 'amber' : it.expected >= B.ok ? 'green' : 'mut';
        const r = (0.9 + Math.min(2.6, it.expected * 0.55)).toFixed(2);
        s += `<circle cx="${it.coords[0]}" cy="${it.coords[1]}" r="${r}" class="ov-cg-halo ${cls}"/>`;
        if (i < 5) s += `<text x="${it.coords[0]}" y="${(it.coords[1] - r - 0.7).toFixed(2)}" class="ov-text cg-lb ${cls}" text-anchor="middle">${it.name} ≈${it.expected}队</text>`;
      });
    }
    // 推荐跳点（第 1 步产物）：列表之外给出地图对应位置，选中的由大头针标记
    if (App.mode === 'game' && App.game.recommend && App.game.recommend.length) {
      App.game.recommend.forEach((r, i) => {
        if (App.game.chosen && App.game.chosen.name === r.name) return;
        if (!r.coords || r.coords.length !== 2) return;
        const [x, y] = r.coords;
        s += `<circle cx="${x}" cy="${y}" r="1.7" class="ov-rec r${i + 1}"/>`;
        s += `<text x="${x}" y="${(y + 0.55).toFixed(2)}" class="ov-text rec-num" text-anchor="middle">${i + 1}</text>`;
        s += `<text x="${x}" y="${(y - 2.3).toFixed(2)}" class="ov-text rec-label" text-anchor="middle">推荐${i + 1} · ${r.name}</text>`;
      });
    }
    // 进圈方案里的"下个圈预估"
    if (App.game && App.game.plan && App.game.plan.target) {
      const t = App.game.plan.target;
      s += `<circle cx="${t.coords[0]}" cy="${t.coords[1]}" r="${t.radius}" class="ov-circle next"/>`;
      s += `<text x="${t.coords[0]}" y="${t.coords[1] - t.radius - 1.4}" class="ov-text circle-next">下个圈预估（${Math.round(t.radius * 80)}m）</text>`;
    }

    // 路线（带方向箭头、分段序号、起终点）
    if (App.layers.routes) {
      App.routes.forEach((rt) => {
        if (!rt.visible) return;
        const d = rt.path.map((p, idx) => (idx ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
        s += `<path d="${d}" class="ov-route-halo" style="stroke:${rt.color}"/>`;
        s += `<path d="${d}" class="ov-route" style="stroke:${rt.color}"/>`;
        // 方向箭头（每段中点）
        for (let i = 1; i < rt.path.length; i++) {
          const a = rt.path[i - 1], b = rt.path[i];
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          const ang = Math.atan2((b[1] - a[1]), (b[0] - a[0])) * 180 / Math.PI;
          s += `<polygon points="-0.95,-0.5 0.95,0 -0.95,0.5" fill="${rt.color}"
                 transform="translate(${mx} ${my}) rotate(${ang})" class="ov-arrow"/>`;
        }
        // 途经点序号
        rt.path.forEach((pt, idx) => {
          if (idx === 0 || idx === rt.path.length - 1) return;
          s += `<circle cx="${pt[0]}" cy="${pt[1]}" r="1.15" class="ov-wp" style="fill:${rt.color}"/>`;
          s += `<text x="${pt[0]}" y="${pt[1] + 0.55}" class="ov-wp-num">${idx}</text>`;
        });
        // 起点 / 终点
        const st = rt.path[0], en = rt.path[rt.path.length - 1];
        s += `<circle cx="${st[0]}" cy="${st[1]}" r="1.7" class="ov-route-start" style="stroke:${rt.color}"/>`;
        s += `<polygon points="${en[0]},${en[1] - 2.4} ${en[0] - 1.6},${en[1] - 0.2} ${en[0] + 1.6},${en[1] - 0.2}"
               class="ov-route-flag" style="fill:${rt.color}"/>`;
        const mid = rt.path[Math.floor(rt.path.length / 2)];
        s += `<text x="${mid[0] + 1.8}" y="${mid[1] - 1.2}" class="ov-text route" style="fill:${rt.color}">${rt.short}</text>`;
      });
    }

    // 我方实际位置（逐圈接力用）
    const tp = App.game.teamPos;
    if (tp) {
      s += `<g class="ov-team"><circle cx="${tp[0]}" cy="${tp[1]}" r="2.8" class="ov-team-ring"/>
        <circle cx="${tp[0]}" cy="${tp[1]}" r="1.1" fill="#3ecf8e"/></g>`;
      s += `<text x="${tp[0]}" y="${tp[1] - 3.6}" class="ov-text team">我方位置</text>`;
    }

    // 大头针 / 选点
    const pin = App.game.chosen && App.game.chosen.coords;
    if (pin) {
      s += `<g class="ov-pin"><circle cx="${pin[0]}" cy="${pin[1]}" r="2.6" class="ov-pin-ring"/>
        <circle cx="${pin[0]}" cy="${pin[1]}" r="1.2" fill="#f4586a"/></g>`;
      s += `<text x="${pin[0]}" y="${pin[1] - 3.4}" class="ov-text pin">${App.game.chosen.name}</text>`;
    }
    if (App.pin && App.pin.temp) {
      s += `<circle cx="${App.pin.coords[0]}" cy="${App.pin.coords[1]}" r="2" class="ov-draft"/>`;
    }

    this.svg.innerHTML = s;
  },

  renderAll() { this.renderMarkers(); this.renderOverlay(); }
};

/* ============================ 绘制工具 ============================ */
const Tools = {
  GAME_ONLY: ['flight', 'circle', 'pin', 'markpos'],
  set(tool) {
    if (App.mode !== 'game' && this.GAME_ONLY.includes(tool)) {
      toast('ℹ️ 航线 / 圈形 / 大头针只在「游戏模式」下可用，点右上角切换到游戏模式');
      return;
    }
    App.tool = tool;
    const stage = $('#mapStage');
    stage.className = 'map-stage' + (tool && tool !== 'pan' ? ' tool-' + tool : '');
    $$('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    const tips = {
      flight: '在地图上点击两次：先点起点，再点终点',
      circle: '点击设置圈中心，再点击一次确定半径',
      pin: '点击地图放置大头针选点',
      markpos: '点击地图，标记这一圈结束后你们队的实际位置',
      pan: '按住拖动平移地图'
    };
    if (tips[tool]) toast(tips[tool]);
  },
  handleClick(p) {
    const t = App.tool;
    if (App.mode !== 'game' && this.GAME_ONLY.includes(t)) return;
    if (t === 'flight') {
      if (!App.flight || !App.flight.start) {
        App.flight = { start: p, end: null };
        toast('已设置航线起点，再点终点');
      } else {
        App.flight.end = p;
        App.flight.draft = null;
        this.set('pan');
        MapView.renderOverlay();
        toast('✈️ 航线绘制完成');
        if (window.Game) Game.onFlightReady();
      }
    } else if (t === 'circle') {
      if (!App.circle || App.circle._done) {
        App.circle = { cx: p[0], cy: p[1], r: 0, _done: false };
        toast('已设置圈中心，再点一次确定半径');
      } else {
        App.circle.r = clamp(Math.hypot(p[0] - App.circle.cx, p[1] - App.circle.cy), 3, 60);
        App.circle._done = true;
        this.set('pan');
        if (window.Game) Game.onCircleReady();
      }
    } else if (t === 'pin') {
      App.pin = { coords: p };
      Game.chooseCustomPin(p);
      this.set('pan');
    } else if (t === 'markpos') {
      Game.setPhasePos(p);
      this.set('pan');
    }
    MapView.renderOverlay();
  }
};

/* ============================ 360° 查看器 ============================ */
const Pano = {
  open(terrain) {
    this.terrain = terrain;
    App.pano.scene = PanoEngine.buildScene(App.mapId, terrain);
    App.pano.yaw = 0; App.pano.pitch = 4; App.pano.fov = 75;
    this.bind();
    this.loop();
  },
  close() {
    App.pano.auto = false;
    if (App.pano.raf) cancelAnimationFrame(App.pano.raf);
    App.pano.raf = null;
    App.pano.scene = null;
  },
  bind() {
    const c = $('#panoCanvas');
    if (!c) return;
    c.onpointerdown = (e) => {
      c.setPointerCapture(e.pointerId);
      this._d = { x: e.clientX, y: e.clientY, yaw: App.pano.yaw, pitch: App.pano.pitch };
      c.classList.add('dragging');
    };
    c.onpointermove = (e) => {
      if (!this._d) return;
      App.pano.yaw = ((this._d.yaw + (e.clientX - this._d.x) * 0.22) % 360 + 360) % 360;
      App.pano.pitch = clamp(this._d.pitch - (e.clientY - this._d.y) * 0.18, -22, 58);
      this.draw();
    };
    c.onpointerup = (e) => { this._d = null; c.classList.remove('dragging'); };
    c.onwheel = (e) => {
      e.preventDefault();
      App.pano.fov = clamp(App.pano.fov * (e.deltaY > 0 ? 1.08 : 0.92), 30, 130);
      this.draw();
    };
  },
  goto(yaw, pitch, fov) {
    App.pano.target = { yaw, pitch, fov };
    if (!App.pano.anim) {
      App.pano.anim = true;
      const step = () => {
        const t = App.pano.target;
        if (!t) { App.pano.anim = false; return; }
        let dy = ((t.yaw - App.pano.yaw + 540) % 360) - 180;
        App.pano.yaw = ((App.pano.yaw + dy * 0.18) % 360 + 360) % 360;
        App.pano.pitch += (t.pitch - App.pano.pitch) * 0.18;
        App.pano.fov += (t.fov - App.pano.fov) * 0.18;
        this.draw();
        if (Math.abs(dy) < 0.8 && Math.abs(t.pitch - App.pano.pitch) < 0.5 && Math.abs(t.fov - App.pano.fov) < 0.6) {
          App.pano.yaw = t.yaw; App.pano.pitch = t.pitch; App.pano.fov = t.fov;
          App.pano.target = null; App.pano.anim = false; this.draw(); return;
        }
        requestAnimationFrame(step);
      };
      step();
    }
  },
  draw() {
    const c = $('#panoCanvas');
    if (!c || !App.pano.scene) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 360, h = c.clientHeight || 220;
    if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
    PanoEngine.render(c, App.pano.scene, {
      yaw: App.pano.yaw, pitch: App.pano.pitch, fov: App.pano.fov, dpr
    });
  },
  loop() {
    const tick = () => {
      if (!App.pano.scene) return;
      if (App.pano.auto) { App.pano.yaw = (App.pano.yaw + 0.35) % 360; this.draw(); }
      App.pano.raf = requestAnimationFrame(tick);
    };
    tick();
  }
};

/* ============================ 实拍图扩展 ============================
 * 约定目录：assets/terrain/<地形id>/1.jpg、2.jpg …（最多 6 张）
 * 存在实拍图则用实拍图展示；没有则回退到程序化 360° 渲染。
 * ================================================================= */
const Photos = {
  cache: {},
  dir: (t) => `assets/terrain/${t.id}/`,
  probe(t, cb) {
    if (this.cache[t.id]) return cb(this.cache[t.id]);
    const base = this.dir(t);
    const found = [];
    let pending = 6;
    const finish = () => {
      this.cache[t.id] = found;
      if (--pending === 0) cb(found);
    };
    for (let i = 1; i <= 6; i++) {
      const img = new Image();
      const url = base + i + '.jpg';
      img.onload = () => { found.push(url); finish(); };
      img.onerror = () => finish();
      img.src = url;
    }
  },
  render(t, list) {
    const wrap = $('.pano-wrap');
    if (!wrap) return;
    let idx = 0;
    wrap.innerHTML = `
      <img class="pano-photo" id="panoPhoto" src="${list[0]}" alt="${t.name} 实拍">
      <div class="pano-hud">
        <span class="pano-badge real">📷 实拍</span>
        <span class="pano-tip">点缩略图切换视角</span>
      </div>
      <div class="pano-tools">
        <button class="pano-auto" id="photoPrev">◀ 上一张</button>
        <button class="pano-auto" id="photoNext">下一张 ▶</button>
      </div>`;
    const show = (i) => {
      idx = (i + list.length) % list.length;
      $('#panoPhoto').src = list[idx];
      $$('#panoGallery .gal-item').forEach((g, gi) => g.classList.toggle('active', gi === idx));
    };
    const nr = $('#presetRow'); if (nr) nr.style.display = 'none';
    const gal = $('#panoGallery');
    if (gal) {
      gal.innerHTML = '';
      list.forEach((src, i) => {
        const b = el('button', 'gal-item' + (i === 0 ? ' active' : ''));
        const im = document.createElement('img');
        im.src = src; im.style.width = '100%'; im.style.display = 'block';
        b.appendChild(im);
        b.appendChild(el('span', 'gal-cap', `视角 ${i + 1}`));
        b.onclick = () => show(i);
        gal.appendChild(b);
      });
    }
    $('#photoPrev').onclick = () => show(idx - 1);
    $('#photoNext').onclick = () => show(idx + 1);
    Pano.close();
  }
};

/* ============================ 检查器（右侧面板） ============================ */
const Inspector = {
  /* 收藏点编辑：改名 / 备注 / 删除，即时持久化 */
  favorite(p) {
    if (!p) return;
    $('#inspector').innerHTML = `
      <div class="insp-head">
        <div class="insp-title">★ ${escapeHTML(p.name)}</div>
        <div class="insp-sub">我的收藏 · (${p.coords[0]}, ${p.coords[1]})</div>
      </div>
      <div class="insp-body">
        <label class="field"><span>名称</span>
          <input id="favName" value="${escapeHTML(p.name)}" aria-label="收藏名称">
        </label>
        <label class="field"><span>备注（打野路线/集合点/密室入口…）</span>
          <textarea id="favNote" rows="3" aria-label="收藏备注" placeholder="打野路线 / 集合点 / 密室入口…">${escapeHTML(p.note)}</textarea>
        </label>
        <div class="row-2">
          <button class="ghost-btn" onclick="Inspector.home()">← 返回总览</button>
          <button class="ghost-btn" id="favDel">🗑 删除此收藏</button>
        </div>
        <p class="hint">收藏保存在本机浏览器，共 ${Pins.load().length} 个；地图上右键任意位置可继续添加。</p>
      </div>`;
    const nm = $('#favName'), nt = $('#favNote');
    nm.oninput = () => { Pins.update(p.id, { name: nm.value.slice(0, 24) || '未命名' }); MapView.renderMarkers(); };
    nt.oninput = () => Pins.update(p.id, { note: nt.value.slice(0, 120) });
    $('#favDel').onclick = () => { Pins.remove(p.id); MapView.renderMarkers(); toast('已删除收藏'); this.home(); };
  },
  home() {
    const m = MAP();
    const terCount = (m.terrains || []).length;
    const vehCount = (m.vehicles.fixed || []).length + (m.vehicles.periodic || []).length + (m.vehicles.special || []).length;
    const avgD = Math.round(m.pois.reduce((s, p) => s + p.density, 0) / m.pois.length);
    const avgL = Math.round(m.pois.reduce((s, p) => s + p.loot, 0) / m.pois.length);
    Pano.close();
    $('#inspector').innerHTML = `
      <div class="insp-head">
        <div class="insp-title">${m.icon} ${m.name} · 地图总览</div>
        <div class="insp-sub">${m.en} · ${m.size}</div>
      </div>
      <div class="insp-body">
        <div class="stat-grid">
          <div class="stat"><b>${m.pois.filter(p => p.kind !== 'compound').length}</b><span>主要点位</span></div>
          <div class="stat"><b>${m.pois.filter(p => p.kind === 'compound').length}</b><span>野区房群</span></div>
          <div class="stat"><b>${terCount}</b><span>地形标注</span></div>
          <div class="stat"><b>${vehCount}</b><span>载具刷新点</span></div>
          <div class="stat"><b>${avgD}</b><span>平均密度</span></div>
          <div class="stat"><b>${avgL}</b><span>平均资源</span></div>
          <div class="stat"><b>${m.size.split(' ')[0]}</b><span>地图边长</span></div>
        </div>
        <div class="note-box">
          <div class="note-title">🗺️ 打法特点</div>
          <p>${m.summary}</p>
          <p class="dim">${m.playStyle}</p>
          <p class="dim">数据口径：点位密度/资源为社区经验值 + 赛季公开跳点统计折算，非官方统计。</p>
        </div>
        <div class="section-title">⭕ 信号区圈形参考</div>
        <div class="note-box">
          <ul class="tip-list small">${CIRCLE_META.official.map(x => `<li>${x}</li>`).join('')}</ul>
          <div class="circle-table">
            ${CIRCLE_RADIUS_M[m.id].map((r, i) => `<div class="ct-cell"><b>${i + 1} 圈</b><span>直径 ${r * 2} m</span></div>`).join('')}
          </div>
          <p class="dim">${CIRCLE_META.source}</p>
        </div>
        <div class="section-title">🧠 圈形规律（进圈推算依据）</div>
        <div class="note-box">
          <ul class="tip-list small">${CIRCLE_INSIGHTS.rules.map(x => `<li>${x}</li>`).join('')}</ul>
        </div>
        <div class="section-title">热门点位（按人口密度）</div>
        <div class="rank-list">
          ${m.pois.filter(p => p.kind !== 'compound').slice().sort((a, b) => b.density - a.density).slice(0, 6).map((p, i) => `
            <div class="rank-row" data-poi="${p.name}">
              <span class="rank-i">${i + 1}</span>
              <span class="rank-n">${p.name}</span>
              <span class="rank-bar"><i style="width:${p.density}%;background:${densityColor(p.density)}"></i></span>
              <span class="rank-v">${p.density}</span>
            </div>`).join('')}
        </div>
        <div class="section-title">资源最富点位</div>
        <div class="rank-list">
          ${m.pois.filter(p => p.kind !== 'compound').slice().sort((a, b) => b.loot - a.loot).slice(0, 6).map((p, i) => `
            <div class="rank-row" data-poi="${p.name}">
              <span class="rank-i">${i + 1}</span>
              <span class="rank-n">${p.name}</span>
              <span class="rank-bar"><i style="width:${p.loot}%;background:${lootColor(p.loot)}"></i></span>
              <span class="rank-v">${p.loot}</span>
            </div>`).join('')}
        </div>
        <p class="hint">💡 点击地图上的任意标记查看该点位的 360° 地形视角、战术定位与操作要点。</p>
      </div>`;
    $$('#inspector .rank-row').forEach(r =>
      r.onclick = () => {
        const p = MAP().pois.find(x => x.name === r.dataset.poi);
        if (!p) return;
        Inspector.poi(p);
        MapView.focus(p.coords, 2);
        MapView.scheduleMarkers();
      });
  },

  poi(p) {
    if (!p) return;
    Pano.close();
    const m = MAP();
    const nearTer = (m.terrains || []).map(t => ({ t, d: GeoUtil.dist(t.coords, p.coords) }))
      .filter(x => x.d < 12).sort((a, b) => a.d - b.d).slice(0, 6);
    const nearVeh = [
      ...(m.vehicles.fixed || []).map(v => ({ v, k: '固定', d: v.coords.length ? GeoUtil.dist(v.coords, p.coords) : 99 })),
      ...(m.vehicles.periodic || []).map(v => ({ v, k: '定期', d: v.coords.length ? GeoUtil.dist(v.coords, p.coords) : 99 })),
      ...(m.vehicles.special || []).map(v => ({ v, k: '特殊', d: v.coords.length ? GeoUtil.dist(v.coords, p.coords) : 99 }))
    ].filter(x => x.d < 20).sort((a, b) => a.d - b.d).slice(0, 7);

    $('#inspector').innerHTML = `
      <div class="insp-head">
        <button class="back-btn" onclick="Inspector.home()">← 返回总览</button>
        <div class="insp-title">📍 ${p.name}</div>
        <div class="insp-sub">${p.type} · 等级 ${p.tier} · ${m.name}</div>
      </div>
      <div class="insp-body">
        <div class="note-box">${p.note}</div>
        <div class="section-title">🧩 打法适配</div>
        <div class="tac-chips">
          ${[
        p.kind === 'compound' ? `<span class="tac-chip" style="--c:#3ecf8e">🏡 野点发育首选</span>` : '',
        p.loot >= 88 && p.density >= 75 ? `<span class="tac-chip" style="--c:#f2555a">⚔️ 城区刚枪</span>` : '',
        (p.kind === 'compound' || p.density <= 55) ? `<span class="tac-chip" style="--c:#8fa9b8">🚗 找车/轮转</span>` : '',
        p.density <= 50 ? `<span class="tac-chip" style="--c:#a78bfa">🌿 稳健发育</span>` : ''
      ].filter(Boolean).join('')}
        </div>
        <p class="hint">密度与资源为社区经验值 + 赛季公开跳点统计折算，非官方统计口径，仅供打法选择参考。</p>
        <div class="meter-row">
          <div class="meter">
            <div class="meter-h"><span>人口密度</span><b style="color:${densityColor(p.density)}">${p.density}</b></div>
            <div class="meter-bar"><i style="width:${p.density}%;background:${densityColor(p.density)}"></i></div>
          </div>
          <div class="meter">
            <div class="meter-h"><span>资源富裕度</span><b style="color:${lootColor(p.loot)}">${p.loot}</b></div>
            <div class="meter-bar"><i style="width:${p.loot}%;background:${lootColor(p.loot)}"></i></div>
          </div>
        </div>
        <div class="section-title">🚗 附近载具刷新点</div>
        ${nearVeh.length ? `<div class="veh-list">${nearVeh.map(({ v, k, d }) => `
          <div class="veh-row">
            <span class="veh-ico">${(VEHICLE_CATS[v.cat] || {}).icon || '🚗'}</span>
            <span class="veh-n">${v.type} ×${v.count || 1}</span>
            <span class="veh-l">${v.location}</span>
            <span class="tag tag-${k === '固定' ? 'fixed' : k === '定期' ? 'periodic' : 'special'}">${k}${v.probability ? ' ' + v.probability + '%' : ''}</span>
            <span class="veh-d">${GeoUtil.toMeters(d)}m</span>
          </div>`).join('')}</div>` : '<p class="hint">附近 1.6km 内没有记录到载具刷新点。</p>'}
        <div class="section-title">🏔 附近地形与掩体</div>
        ${nearTer.length ? nearTer.map(({ t, d }) => `
          <div class="mini-card" data-ter="${t.id}">
            <span class="mini-ico" style="--c:${TERRAIN_CATS[t.cat].color}">${TERRAIN_CATS[t.cat].icon}</span>
            <div>
              <b>${TERRAIN_CATS[t.cat].name} · ${t.name}</b>
              <p>${GeoUtil.toMeters(d)}m · 风险${t.risk} · ${t.tactics.join('/')}</p>
            </div>
          </div>`).join('') : '<p class="hint">附近 960m 内暂无标注地形。</p>'}
      </div>`;
    $$('#inspector .mini-card').forEach(c =>
      c.onclick = () => {
        const t = m.terrains.find(x => x.id === c.dataset.ter);
        if (!t) return;
        Inspector.terrain(t);
        MapView.focus(t.coords, 2.4);
        MapView.scheduleMarkers();
      });
  },

  vehicle(v, kind) {
    Pano.close();
    const c = VEHICLE_CATS[v.cat] || VEHICLE_CATS.car;
    $('#inspector').innerHTML = `
      <div class="insp-head">
        <button class="back-btn" onclick="Inspector.home()">← 返回总览</button>
        <div class="insp-title">${c.icon} ${v.type} ×${v.count || 1}</div>
        <div class="insp-sub">${kind}刷新 · ${v.location}</div>
      </div>
      <div class="insp-body">
        <div class="note-box">
          <div class="note-title">刷新机制</div>
          <p>${kind === '固定' ? '该点位为固定刷新，每局必刷，落点抢车首选。' :
        kind === '定期' ? `该点位为定期（概率）刷新，刷新概率约 ${v.probability}%，建议作为备选。` :
          `特殊载具，出现概率约 ${v.probability}%${v.note ? '。' + v.note : ''}`}</p>
        </div>
        <div class="section-title">载具特性</div>
        <div class="kv-list">
          ${vehicleSpec(v)}
        </div>
        <div class="section-title">战术建议</div>
        <p class="hint">${vehicleAdvice(v)}</p>
      </div>`;
  },

  terrain(t) {
    if (!t) return;
    const cat = TERRAIN_CATS[t.cat];
    const m = MAP();
    const wrap = $('#inspector');
    wrap.innerHTML = `
      <div class="insp-head">
        <button class="back-btn" onclick="Inspector.home()">← 返回总览</button>
        <div class="insp-title"><span class="cat-chip" style="--c:${cat.color}">${cat.icon} ${cat.name}</span> ${t.name}</div>
        <div class="insp-sub">${t.location} · 风险 ${t.risk} · ${m.name}</div>
      </div>
      <div class="insp-body">
        <div class="pano-wrap">
          <canvas id="panoCanvas" class="pano-canvas"></canvas>
          <div class="pano-hud">
            <span class="pano-badge">360° 模拟视角</span>
            <span class="pano-tip">按住拖动环视 · 滚轮缩放</span>
          </div>
          <div class="pano-tools">
            <button class="pano-auto" id="panoAuto">⟳ 自动环视</button>
          </div>
        </div>
        <div class="preset-row" id="presetRow">
          ${PanoEngine.PRESETS.map((p, i) => `<button class="preset-btn${i === 0 ? ' active' : ''}" data-i="${i}">${p.name}</button>`).join('')}
        </div>
        <div class="section-title">📸 多视角模拟（点击切换）</div>
        <div class="pano-gallery" id="panoGallery"></div>
        <p class="hint">${cat.desc}</p>
        <div class="section-title">📖 地形说明</div>
        <div class="note-box"><p>${t.desc}</p></div>
        <div class="section-title">🎯 战术定位</div>
        <div class="tac-chips">${t.tactics.map(x => `<span class="tac-chip" style="--c:${(TACTIC_ROLES[x] || {}).color || '#8fa9b8'}">${(TACTIC_ROLES[x] || {}).icon || ''} ${x}</span>`).join('')}</div>
        ${t.noRescue ? `<div class="warn-box">⚠️ 电竞模式（比赛服）会屏蔽「紧急呼救器」，该点位在电竞模式下无法使用，排位赛 / 巅峰赛可用。</div>` : ''}
        <div class="section-title">✅ 操作要点</div>
        <ul class="tip-list">${(t.tips || []).map(x => `<li>${x}</li>`).join('')}</ul>
      </div>`;

    Pano.open(t);
    Photos.probe(t, (list) => {
      // 若该点位已放置实拍图，则改用实拍图展示
      if (list && list.length) Photos.render(t, list);
    });

    $$('#presetRow .preset-btn').forEach(b => b.onclick = () => {
      $$('#presetRow .preset-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const p = PanoEngine.PRESETS[+b.dataset.i];
      Pano.goto(p.yaw, p.pitch, p.fov);
    });
    $('#panoAuto').onclick = (e) => {
      App.pano.auto = !App.pano.auto;
      e.target.classList.toggle('active', App.pano.auto);
    };
    // 多视角缩略图
    const gal = $('#panoGallery');
    PanoEngine.PRESETS.slice(0, 8).forEach((p, i) => {
      const c = PanoEngine.thumb(t, App.mapId, p, 150, 88);
      const b = el('button', 'gal-item' + (i === 0 ? ' active' : ''));
      b.appendChild(c);
      b.appendChild(el('span', 'gal-cap', p.name));
      b.onclick = () => {
        $$('#panoGallery .gal-item').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        $$('#presetRow .preset-btn').forEach(x => x.classList.remove('active'));
        $$('#presetRow .preset-btn')[i] && $$('#presetRow .preset-btn')[i].classList.add('active');
        Pano.goto(p.yaw, p.pitch, p.fov);
      };
      gal.appendChild(b);
    });
    Pano.draw();
    requestAnimationFrame(() => Pano.draw());
    wrap.scrollTop = 0;
  },

  search(q) {
    q = q.trim();
    if (!q) { this.home(); return; }
    const m = MAP();
    const pois = m.pois.filter(p => p.name.includes(q) || p.type.includes(q));
    const ters = (m.terrains || []).filter(t =>
      t.name.includes(q) || t.location.includes(q) || TERRAIN_CATS[t.cat].name.includes(q) || t.tactics.some(x => x.includes(q)));
    const vehs = [...(m.vehicles.fixed || []).map(v => [v, '固定']), ...(m.vehicles.periodic || []).map(v => [v, '定期']), ...(m.vehicles.special || []).map(v => [v, '特殊'])]
      .filter(([v]) => v.type.includes(q) || v.location.includes(q));
    $('#inspector').innerHTML = `
      <div class="insp-head">
        <button class="back-btn" onclick="Inspector.home()">← 返回总览</button>
        <div class="insp-title">🔍 搜索「${q}」</div>
        <div class="insp-sub">${pois.length + ters.length + vehs.length} 条结果</div>
      </div>
      <div class="insp-body">
        ${pois.length ? `<div class="section-title">点位（${pois.length}）</div>` + pois.map(p => `
          <div class="mini-card" data-poi="${p.name}"><span class="mini-ico" style="--c:${densityColor(p.density)}">📍</span>
          <div><b>${p.name}</b><p>${p.type} · 密度${p.density} · 资源${p.loot}</p></div></div>`).join('') : ''}
        ${ters.length ? `<div class="section-title">地形（${ters.length}）</div>` + ters.map(t => `
          <div class="mini-card" data-ter="${t.id}"><span class="mini-ico" style="--c:${TERRAIN_CATS[t.cat].color}">${TERRAIN_CATS[t.cat].icon}</span>
          <div><b>${TERRAIN_CATS[t.cat].name} · ${t.name}</b><p>${t.location} · ${t.tactics.join('/')}</p></div></div>`).join('') : ''}
        ${vehs.length ? `<div class="section-title">载具（${vehs.length}）</div>` + vehs.map(([v, k]) => `
          <div class="mini-card" data-veh="${v.id || v.location}" data-vehkind="${k}"><span class="mini-ico" style="--c:#8fa9b8">${(VEHICLE_CATS[v.cat] || {}).icon}</span>
          <div><b>${v.type} ×${v.count || 1}</b><p>${k}刷新 · ${v.location}</p></div></div>`).join('') : ''}
        ${!pois.length && !ters.length && !vehs.length ? '<p class="hint">没有找到匹配内容，换个关键词试试（如“反坡”“桥”“体育场”）。</p>' : ''}
      </div>`;
    $$('#inspector .mini-card').forEach(c => c.onclick = () => {
      const go = (coords, name) => {
        if (!coords || coords.length !== 2) return;
        MapView.focus(coords, 2);
        MapView.scheduleMarkers();
        toast(`📍 已在地图上定位「${name}」`);
      };
      if (c.dataset.poi) {
        const p = m.pois.find(x => x.name === c.dataset.poi);
        Inspector.poi(p); if (p) go(p.coords, p.name);
      }
      else if (c.dataset.ter) {
        const t = m.terrains.find(x => x.id === c.dataset.ter);
        Inspector.terrain(t); if (t) go(t.coords, t.name);
      }
      else {
        const k = c.dataset.vehkind;
        const arr = k === '固定' ? m.vehicles.fixed : k === '定期' ? m.vehicles.periodic : m.vehicles.special;
        const v = arr.find(x => (x.id || x.location) === c.dataset.veh);
        if (v) { Inspector.vehicle(v, k); go(v.coords, v.type); }
      }
    });
  }
};

function vehicleSpec(v) {
  const specs = {
    '吉普车': ['耐久 高', '速度 中', '可载 4 人', '越野强，可当掩体'],
    '轿车': ['耐久 中', '速度 高', '可载 4 人', '公路最快，耗油低'],
    '皮卡': ['耐久 高', '速度 中', '可载 4 人', '后斗可架枪'],
    '蹦蹦': ['耐久 低', '速度 中', '可载 2 人', '越野灵活，目标小'],
    '双人摩托': ['耐久 极低', '速度 极高', '可载 2 人', '最省油，最脆弱'],
    '拉力赛车': ['耐久 中', '速度 极高', '可载 2 人', '荣都专属，公路之王'],
    '快艇': ['耐久 中', '速度 高', '可载 4 人', '唯一稳定水路载具'],
    '直升机': ['耐久 中', '速度 高', '可载 4 人', '可直达山顶/楼顶'],
    '马': ['静音', '速度 中', '可载 1 人', '不发出引擎声，适合绕后'],
    '鹿': ['静音', '速度 中', '可载 1 人', '活动限定坐骑，林区刷新']
  };
  const rows = specs[v.type] || ['通用载具'];
  return rows.map(r => {
    const [k, val] = r.split(' ');
    return `<div class="kv"><span>${k}</span><b>${val || '—'}</b></div>`;
  }).join('');
}
function vehicleAdvice(v) {
  if (v.cat === 'boat') return '水路是圈切沿海时最安全的选择：船上目标低、可绕开桥头卡点。注意下船点要选有掩体的岸边，别直接冲开阔沙滩。';
  if (v.cat === 'plane') return '直升机可以直达绝对制高点或高楼顶，但噪声极大，落地就会暴露位置。建议在需要抢点的关键圈使用。';
  if (v.cat === 'horse' || v.cat === 'deer') return '骑乘状态没有引擎声，是绕后与侦查的最佳选择。但没有任何防护，遇到枪线必须立刻下马找掩体。';
  if (v.type === '快艇') return '水路转移首选。';
  if (v.type === '双人摩托' || v.type === '蹦蹦') return '小目标载具适合单人/双人灵活转移，但耐久低，被扫到就爆，避开公路主干。';
  return '四人队标配：一台车刚好一队，转移时前后车保持 50 米距离，避免被一锅端。停车永远停在背坡或建筑背面。';
}

/* ============================ 侧边栏（情报模式） ============================ */
const Sidebar = {
  render() {
    const m = MAP();
    if (App.mode === 'game') { GameSidebar.render(); return; }
    const cats = Object.entries(TERRAIN_CATS);
    const groups = {};
    cats.forEach(([k, v]) => { (groups[v.group] = groups[v.group] || []).push([k, v]); });

    $('#sidebar').innerHTML = `
      <div class="side-sec">
        <div class="side-title">🔍 搜索</div>
        <input class="side-search" id="sideSearch" placeholder="点位 / 地形 / 载具…" aria-label="搜索点位、地形或载具">
      </div>
      <div class="side-sec">
        <div class="side-title">🗂 图层</div>
        ${[['pois', '主要点位'], ['compounds', '野区房群（小房区）'], ['density', '人口密度热区'], ['vehFixed', '固定载具刷新点'], ['vehPeriodic', '定期载具刷新点'], ['vehSpecial', '特殊载具（飞机/马/鹿/龙）'], ['fav', '★ 我的收藏（右键地图添加）']]
        .map(([k, n]) => `<label class="layer-row"><input type="checkbox" data-layer="${k}" ${App.layers[k] ? 'checked' : ''}><span>${n}</span></label>`).join('')}
      </div>
      <div class="side-sec">
        <div class="side-title">🏔 地形标注 <button class="mini-btn" id="terAll">全选</button><button class="mini-btn" id="terNone">清空</button></div>
        ${Object.entries(groups).map(([g, list]) => `
          <div class="ter-group">${g}</div>
          ${list.map(([k, v]) => {
      const n = (m.terrains || []).filter(t => t.cat === k).length;
      return `<label class="layer-row ter-layer" title="${v.desc}">
              <input type="checkbox" data-ter="${k}" ${App.layers.terrain[k] ? 'checked' : ''}>
              <span class="ter-dot" style="--c:${v.color}">${v.icon}</span>
              <span>${v.name}</span><em>${n}</em></label>`;
    }).join('')}`).join('')}
      </div>
      <div class="side-sec">
        <div class="side-title">📊 快速跳转</div>
        <button class="side-link" data-jump="hot">🔥 最热门点位</button>
        <button class="side-link" data-jump="loot">💎 最富资源点位</button>
        <button class="side-link" data-jump="high">🏔 所有制高点</button>
        <button class="side-link" data-jump="camp">🌿 苟分点位</button>
        <button class="side-link" data-jump="veh">🚗 载具地图</button>
        <button class="side-link" data-jump="wild">🏡 野区房群（发育点）</button>
        <button class="side-link" id="sideShare">📤 复制分享链接</button>
      </div>`;

    $$('#sidebar [data-layer]').forEach(i => i.onchange = () => { App.layers[i.dataset.layer] = i.checked; MapView.renderAll(); });
    $$('#sidebar [data-ter]').forEach(i => i.onchange = () => { App.layers.terrain[i.dataset.ter] = i.checked; MapView.renderAll(); });
    $('#terAll').onclick = () => { Object.keys(TERRAIN_CATS).forEach(k => App.layers.terrain[k] = true); this.render(); MapView.renderAll(); };
    $('#terNone').onclick = () => { Object.keys(TERRAIN_CATS).forEach(k => App.layers.terrain[k] = false); this.render(); MapView.renderAll(); };
    const shBtn = $('#sideShare');
    if (shBtn) shBtn.onclick = () => ShareLink.copy();
    const si = $('#sideSearch');
    let tm;
    si.oninput = () => { clearTimeout(tm); tm = setTimeout(() => Inspector.search(si.value), 260); };
    $$('#sidebar [data-jump]').forEach(b => b.onclick = () => this.jump(b.dataset.jump));
  },

  jump(kind) {
    const m = MAP();
    if (kind !== 'veh') { App.layers.pois = true; }
    if (kind === 'veh') {
      ['vehFixed', 'vehPeriodic', 'vehSpecial'].forEach(k => App.layers[k] = true);
      App.layers.pois = false;
      this.render(); MapView.renderAll();
      toast('已只显示载具刷新点');
      return;
    }
    const map = {
      hot: () => m.pois.slice().sort((a, b) => b.density - a.density).slice(0, 5),
      loot: () => m.pois.slice().sort((a, b) => b.loot - a.loot).slice(0, 5),
      high: () => (m.terrains || []).filter(t => t.cat === 'relativeHigh' || t.cat === 'absoluteHigh'),
      camp: () => (m.terrains || []).filter(t => ['waterEdge', 'hiddenSpot', 'pit', 'bunker', 'secretRoom'].includes(t.cat)),
      wild: () => m.pois.filter(p => p.kind === 'compound').sort((a, b) => b.loot - a.loot)
    };
    const list = (map[kind] || (() => []))();
    this.listPanel(list, kind);
  },

  listPanel(list, kind) {
    const isPoi = list.length && list[0].density != null;
    const titles = { hot: '🔥 最热门点位', loot: '💎 最富资源点位', high: '🏔 所有制高点', camp: '🌿 苟分点位', wild: '🏡 野区房群（小房区发育点）' };
    $('#inspector').innerHTML = `
      <div class="insp-head">
        <button class="back-btn" onclick="Inspector.home()">← 返回总览</button>
        <div class="insp-title">${titles[kind]}</div>
        <div class="insp-sub">共 ${list.length} 个</div>
      </div>
      <div class="insp-body">
        ${list.map((x, i) => isPoi ? `
          <div class="mini-card" data-poi="${x.name}">
            <span class="mini-ico" style="--c:${densityColor(x.density)}">${String(i + 1).padStart(2, '0')}</span>
            <div><b>${x.name}</b><p>密度 ${x.density} · 资源 ${x.loot} · ${x.type}</p></div>
          </div>` : `
          <div class="mini-card" data-ter="${x.id}">
            <span class="mini-ico" style="--c:${TERRAIN_CATS[x.cat].color}">${TERRAIN_CATS[x.cat].icon}</span>
            <div><b>${TERRAIN_CATS[x.cat].name} · ${x.name}</b><p>${x.location} · 风险${x.risk} · ${x.tactics.join('/')}</p></div>
          </div>`).join('')}
      </div>`;
    $$('#inspector .mini-card').forEach(c => c.onclick = () => {
      if (c.dataset.poi) Inspector.poi(MAP().pois.find(p => p.name === c.dataset.poi));
      else Inspector.terrain(MAP().terrains.find(t => t.id === c.dataset.ter));
    });
  }
};

/* ============================ 启动 ============================ */
function setMap(id, silent) {
  App.mapId = id;
  App.selected = null; App.flight = null; App.circle = null; App.routes = []; App.pin = null;
  if (window.Game) Game.reset();
  const m = MAP();
  // 默认图层：全部地形开启
  Object.keys(TERRAIN_CATS).forEach(k => { if (App.layers.terrain[k] === undefined) App.layers.terrain[k] = true; });
  const img = $('#mapImage');
  img.classList.remove('is-loaded');
  img.src = m.image;
  img.alt = m.name + '地图';
  $$('#mapTabs .map-tab').forEach(t => t.classList.toggle('active', t.dataset.map === id));
  $('#hudMapName').textContent = `${m.name} · ${m.en}`;
  /* 图例中只保留当前地图相关的机制条目（荣都基站 / 海岛轮渡等） */
  $$('#mapLegend .lg-row[data-maps]').forEach(r => {
    r.style.display = r.dataset.maps.split(',').includes(id) ? '' : 'none';
  });
  MapView.fit();
  App.zoom = 1; App.pan = { x: 0, y: 0 };
  MapView.updateTransform();
  MapView.renderAll();
  Sidebar.render();
  if (App.mode === 'game') {
    Game.enter();          // 游戏模式下切图后保持在游戏模式，不回到情报面板
  } else {
    Inspector.home();
  }
  GameHUD.render();
  if (!silent) toast(`已切换至 ${m.name} 地图`);
}

function setMode(mode) {
  App.mode = mode;
  $$('#modeSwitch button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $$('.tool-btn[data-game-only]').forEach(b => { b.style.display = mode === 'game' ? '' : 'none'; });
  if (mode === 'info') {
    Tools.set('pan');
  }
  MapView.renderOverlay();   // 重渲叠加层：情报模式下不再显示"推荐跳点"等游戏专属标记
  Sidebar.render();
  if (mode === 'info') {
    Inspector.home();
    /* 从游戏模式带过来的对局标记会继续留在图上，提醒一句避免用户困惑 */
    const hasMarks = App.flight || Object.keys(App.circles || {}).length || (App.routes || []).length || App.pin;
    if (hasMarks) toast('对局规划标记仍显示在地图上，不需要时点右上「清除标记」', 'warn');
  }
  else { Game.enter(); }
  GameHUD.render();
}

document.addEventListener('DOMContentLoaded', () => {
  MapView.init();
  $$('#mapTabs .map-tab').forEach(t => t.onclick = () => setMap(t.dataset.map));
  $$('#modeSwitch button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $$('.tool-btn[data-tool]').forEach(b => b.onclick = () => Tools.set(b.dataset.tool === App.tool ? 'pan' : b.dataset.tool));
  $('#zoomIn').onclick = () => MapView.zoomBy(1.25);
  $('#zoomOut').onclick = () => MapView.zoomBy(0.8);
  $('#zoomReset').onclick = () => { MapView.reset(); toast('视图已重置'); };
  /* 清除全部规划：破坏性操作，两击确认（3.5s 内再点一次才执行） */
  let clearArmed = null;
  $('#clearAll').onclick = () => {
    const hasWork = App.flight || Object.keys(App.circles || {}).length || (App.routes || []).length || App.pin || App.circleEdit;
    if (!hasWork) { toast('图上还没有可清除的规划'); return; }
    if (!clearArmed) {
      clearArmed = setTimeout(() => clearArmed = null, 3500);
      toast('⚠️ 将清除 航线 / 圈形 / 路线 / 选点，再点一次「清除标记」确认', 'warn');
      return;
    }
    clearTimeout(clearArmed); clearArmed = null;
    App.flight = null; App.circle = null; App.circles = {}; App.circleEdit = null; App.prediction = null;
    App.routes = []; App.pin = null;
    if (window.Game) { App.game.planPhase = 1; Game.clearSelection(); }
    const es = $('#editSvg'); if (es) es.innerHTML = '';
    MapView.renderOverlay();
    MapView.renderMarkers();
    toast('已清除航线 / 圈形 / 路线 / 选点');
  };
  Object.keys(TERRAIN_CATS).forEach(k => App.layers.terrain[k] = true);
  Pins.load();
  setMap('island', true);
  setMode('info');
  ShareLink.restore();
  window.addEventListener('keydown', e => {
    if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
    if (e.key === 'Escape') { Tools.set('pan'); }
    if (e.key === '0') { MapView.reset(); }
    if (e.key === '+' || e.key === '=') { MapView.zoomBy(1.25); }
    if (e.key === '-' || e.key === '_') { MapView.zoomBy(0.8); }
  });
});
window.App = App;
window.Inspector = Inspector;
window.Sidebar = Sidebar;
window.MapView = MapView;
window.Tools = Tools;
window.Pano = Pano;
window.toast = toast;
