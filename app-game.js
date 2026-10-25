/* =========================================================================
 * app-game.js —— 游戏模式 v4.1
 * 1 落地打法与跳点 / 2 选点与载具 / 3 圈形规划与进圈 / 4 战斗攻略
 * ========================================================================= */
'use strict';

const COMP_PRESETS = {
  4: [['指挥', '看屁股'], ['突击手', '突击'], ['狙击手', '架枪'], ['自由人', '自由手']],
  3: [['指挥', '看屁股'], ['突击手', '突击'], ['自由人', '自由手']],
  2: [['突击手', '突击'], ['狙击手', '架枪']],
  1: [['独狼', '自由手']]
};

/* ------------------------------ 通用工具 ------------------------------ */
const Fmt = {
  mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  },
  parse(txt, fallback) {
    if (typeof txt === 'number') return txt;
    txt = String(txt || '').trim();
    if (/^\d+$/.test(txt)) return +txt;
    const m = txt.match(/^(\d+):([0-5]?\d)$/);
    if (m) return +m[1] * 60 + +m[2];
    return fallback;
  },
  bearing(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    deg = (deg + 360) % 360;
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const name = dirs[Math.round(deg / 45) % 8];
    return { deg: Math.round(deg), name };
  },
  m(pct) { return Math.round(pct * 80); },
  zhDur(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m && s) return m + ' 分 ' + s + ' 秒';
    if (m) return m + ' 分';
    return s + ' 秒';
  }
};

/* 圈半径（1% = 80m） */
function circleRadiusPct(mapId, phase) {
  const arr = (window.CIRCLE_RADIUS_M || {})[mapId] || [2000, 1200, 660, 360, 180, 90, 45, 23];
  return (arr[Math.min(arr.length, Math.max(1, phase)) - 1] || 1000) / 80;
}
function circleRadiusM(mapId, phase) {
  const arr = (window.CIRCLE_RADIUS_M || {})[mapId] || [2000, 1200, 660, 360, 180, 90, 45, 23];
  return arr[Math.min(arr.length, Math.max(1, phase)) - 1] || 1000;
}

/* ====================== 下一圈预测器（CirclePredictor）======================
 * 输入：用户画好的圈序列（App.circles），取最大的圈号 cur。
 * A. 确定性约束（100% 成立）：下一圈半径 R_next 已知（CIRCLE_RADIUS_M 表），
 *    且下一圈必须完整包含在当前圈内 → 圆心只能落在以当前圆心为圆心、
 *    半径 = R_cur − R_next 的圆盘内（可行域）。单这一步就把搜索面积大幅剪掉。
 * B. 启发式估计（不保证）：游戏在可行域内基本随机选点，但统计上偏向
 *    "有物资、有掩体、少水"的地形。蒙特卡洛均匀采样候选圆心，
 *    按 5 个因子加权打分 → softmax 成概率 → 网格分桶聚出 Top3 候选区。
 * 因子：水面占比(罚，底图像素实算) / 圈内物资总量(奖) / 地形掩体数(奖)
 *       / 后期小位移偏好(4 圈后圈几乎不动) / 近期位移方向延续性(弱先验)。
 * ========================================================================== */
const CirclePredictor = {
  _px: null, _mapId: null, _W: 0, _H: 0,

  /* 校准后的权重（localStorage 覆盖，ReplayLab 写入） */
  tunedWeights() {
    try { return JSON.parse(localStorage.getItem((window.REPLAY_STORE || {}).wkey || 'zd_weights_v1')) || null; }
    catch (e) { return null; }
  },

  /* 底图降采样像素（判水域用），每张地图只取一次；失败则水域因子退化为 0 */
  pixels(mapId) {
    const mid = mapId || App.mapId;
    if (this._px && this._mapId === mid) return Promise.resolve();
    return new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const W = 640, H = Math.max(2, Math.round(W * im.naturalHeight / im.naturalWidth));
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0, W, H);
        try { this._px = ctx.getImageData(0, 0, W, H); } catch (e) { this._px = null; }
        this._mapId = mid; this._W = W; this._H = H;
        res();
      };
      im.onerror = () => res();
      im.src = (window.MAP_DATA && MAP_DATA[mid] || MAP()).image;
    });
  },

  /* 候选圆盘内水面占比：蓝色主导的像素视为水（圆盘内均匀采样 120 点） */
  waterFrac(cx, cy, r) {
    if (!this._px) return 0;
    const d = this._px.data, W = this._W, H = this._H;
    const px = cx / 100 * W, py = cy / 100 * H, pr = Math.max(2, r / 100 * W);
    let water = 0, n = 0;
    for (let i = 0; i < 120; i++) {
      const t = Math.random() * 2 * Math.PI, rr = pr * Math.sqrt(Math.random());
      const x = Math.round(px + rr * Math.cos(t)), y = Math.round(py + rr * Math.sin(t));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      n++;
      const k = (y * W + x) * 4, R = d[k], G = d[k + 1], B = d[k + 2];
      if (B > R + 14 && B > G + 4 && B > 55 && R < 125) water++;
    }
    return n ? water / n : 0;
  },

  /* 航线起终点：周围一小片大多是水，才算点进海里。单像素的河岸和阴影不算。 */
  isOpenWater(cx, cy) {
    if (!this._px) return false;
    const d = this._px.data, W = this._W, H = this._H;
    const px = cx / 100 * (W - 1), py = cy / 100 * (H - 1);
    const pr = Math.max(3, 2.5 / 100 * W);
    const steps = 9;
    let water = 0, n = 0;
    const wet = (R, G, B) => {
      const bright = B > R + 14 && B > G + 4 && B > 55 && R < 125;
      const cool = B >= R + 8 && G >= R + 6 && R < 80 && B < 100 && (B + G) > R * 2.1;
      const abyss = R < 28 && G < 40 && B < 48 && B >= R + 4 && G >= R && (B + G) >= R + 16;
      return bright || cool || abyss;
    };
    for (let iy = 0; iy < steps; iy++) {
      for (let ix = 0; ix < steps; ix++) {
        const dx = (ix / (steps - 1) - 0.5) * 2 * pr;
        const dy = (iy / (steps - 1) - 0.5) * 2 * pr;
        if (dx * dx + dy * dy > pr * pr) continue;
        const x = Math.round(px + dx), y = Math.round(py + dy);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        n++;
        const k = (y * W + x) * 4;
        if (wet(d[k], d[k + 1], d[k + 2])) water++;
      }
    }
    return n > 0 && water / n >= 0.55;
  },

  /* 预测候选区用最近的地名，不用内部坐标 */
  placeNear(x, y) {
    const m = (window.MAP_DATA && MAP_DATA[App.mapId]) || MAP();
    let best = null, bd = Infinity;
    (m.pois || []).forEach(p => {
      if (!p.coords) return;
      const dist = GeoUtil.dist(p.coords, [x, y]);
      if (dist < bd) { bd = dist; best = p; }
    });
    if (!best) return '地图中部';
    const meters = Math.round(bd * 80);
    if (meters < 150) return best.name + '附近';
    return '距' + best.name + '约 ' + meters + ' 米';
  },

  /* predict(circlesOverride, mapId)：默认读当前对局；复盘回溯时传入
   * 指定的圈状态与地图（如 {1:circle1, 2:circle2}, 'island'）。 */
  async predict(circlesOverride, mapId) {
    const mid = mapId || App.mapId;
    const CS = circlesOverride || App.circles;
    const cfg = Object.assign({ samples: 600, bucket: 2.5 }, window.CIRCLE_PREDICTOR || {});
    const W = Object.assign({ water: -0.45, loot: 0.30, cover: 0.15, move: -0.12, momentum: 0.10 }, cfg.weights, CirclePredictor.tunedWeights() || {});
    const phases = Object.keys(CS || {}).map(Number).filter(p => CS[p]).sort((a, b) => a - b);
    const curPhase = phases[phases.length - 1];
    if (!curPhase) return { error: '先至少确定一个圈：拖动圈放到实际位置后点「✅ 确定这一圈」' };
    const nextPhase = curPhase + 1;
    if (nextPhase > 8) return { error: '第 8 圈已是最后一个信号圈，没有"下一圈"可预测' };
    const cur = CS[curPhase];
    const rNext = circleRadiusPct(mid, nextPhase);
    const maxD = Math.max(0.0001, cur.r - rNext);        // 可行域半径（圆心偏移上限）

    await this.pixels(mid);

    /* 1) 可行域内均匀蒙特卡洛采样 + 因子计算 */
    const N = cfg.samples, m = MAP_DATA[mid], cl = [0, 0];
    const prev = CS[curPhase - 1];
    let mvx = 0, mvy = 0, mvLen = 0;
    if (prev) { mvx = cur.cx - prev.cx; mvy = cur.cy - prev.cy; mvLen = Math.hypot(mvx, mvy); }
    const cands = [];
    for (let i = 0; i < N; i++) {
      const t = Math.random() * 2 * Math.PI, rr = maxD * Math.sqrt(Math.random());
      cl[0] = cur.cx + Math.cos(t) * rr; cl[1] = cur.cy + Math.sin(t) * rr;
      let loot = 0, cover = 0;
      for (const p of m.pois) if (GeoUtil.dist(p.coords, cl) <= rNext) loot += p.loot;
      for (const tr of (m.terrains || [])) if (GeoUtil.dist(tr.coords, cl) <= rNext) cover++;
      const dx = cl[0] - cur.cx, dy = cl[1] - cur.cy, dl = Math.hypot(dx, dy);
      let mom = 1;                                        // 停在原地视为方向延续
      if (mvLen > 0.3 && dl > 0.3) mom = (dx * mvx + dy * mvy) / (dl * mvLen);
      cands.push({ x: cl[0], y: cl[1], loot, cover, water: this.waterFrac(cl[0], cl[1], rNext), dist: dl / maxD, mom });
    }

    /* 2) 因子归一化 → 加权 → softmax 概率 */
    const mm = (get) => {
      const vs = cands.map(get); let lo = Infinity, hi = -Infinity;
      for (const v of vs) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const span = (hi - lo) || 1;
      return vs.map(v => (v - lo) / span);
    };
    const nLoot = mm(c => c.loot), nCover = mm(c => c.cover), nMom = cands.map(c => (c.mom + 1) / 2);
    const nWater = cands.map(c => Math.min(1, c.water / 0.5));   // 水面 >50% 即满罚
    const lateK = 1 + Math.max(0, nextPhase - 4) * 0.7;          // 4 圈后位移越来越小
    cands.forEach((c, i) => {
      c.s = W.loot * nLoot[i] + W.cover * nCover[i] + W.water * nWater[i]
          + W.move * lateK * c.dist + W.momentum * nMom[i];
    });
    let mx = -Infinity; for (const c of cands) if (c.s > mx) mx = c.s;
    let zSum = 0; const z = cands.map(c => { const e = Math.exp((c.s - mx) * 2); zSum += e; return e; });
    cands.forEach((c, i) => c.p = z[i] / zSum);

    /* 3) 网格分桶聚类 → Top3 候选区（概率 = 桶内概率质量占比）
     * 可行域很小时（后期圈）自动用更细的桶，否则一张桶就装下了 */
    const B = Math.max(0.7, Math.min(cfg.bucket, maxD / 2.2)), buckets = new Map();
    cands.forEach(c => {
      const k = Math.round(c.x / B) + '_' + Math.round(c.y / B);
      let b = buckets.get(k);
      if (!b) { b = { k, mass: 0, sx: 0, sy: 0, n: 0, water: 0 }; buckets.set(k, b); }
      b.mass += c.p; b.sx += c.x * c.p; b.sy += c.y * c.p; b.n++; b.water += c.water;
    });
    /* 阈值不能写死：可行域大时桶多，均匀分布下每桶质量可能只有 1~3%，
     * 固定 4% 会把所有桶过滤光 → Top3 永远为空。
     * 改为相对阈值：显著高于"每桶均匀质量"（×1.45）才算是热点，下限 1.2%。 */
    const sorted = [...buckets.values()].sort((a, b) => b.mass - a.mass);
    const uniform = 1 / Math.max(1, buckets.size);
    const minMass = Math.max(0.012, uniform * 1.45);
    const top = sorted.slice(0, 3)
      .filter(b => b.mass > minMass)
      .map((b, i) => ({ rank: i + 1, prob: b.mass, cx: b.sx / b.mass, cy: b.sy / b.mass, water: b.water / Math.max(1, b.n) }));
    /* 分布太平（没有显著热点）时如实告诉用户，而不是静默留白 */
    const flat = !top.length;

    /* 4) 建议占位点：Top1 候选圈内物资最高的 POI */
    let hold = null;
    if (top[0]) {
      hold = m.pois.filter(p => GeoUtil.dist(p.coords, [top[0].cx, top[0].cy]) <= rNext)
        .sort((a, b) => b.loot - a.loot)[0] || null;
    }

    /* 5) 热度点（叠加层渲染用：只留高于均值的样本，控制 DOM 数量） */
    const heat = cands.filter(c => c.p * N > 1.2).sort((a, b) => b.p - a.p).slice(0, 260);

    return {
      curPhase, nextPhase, rNext, maxD, samples: N,
      shrink: Math.pow(maxD / cur.r, 2),   // 可行域面积 / 当前圈面积
      top, flat, hold, heat,
      note: cfg.note || '虚线圆来自参考半径与输入圈形；候选权重为模型参考分，未经真实命中率校准'
    };
  },

  /* 结果面板 HTML */
  panelHTML(r) {
    if (r.error) return `<p class="hint">${r.error}</p>`;
    return `
      <div class="pred-result">
        <div class="pred-line"><b>预测对象：第 ${r.nextPhase} 圈</b><span>半径已知 ${Math.round(r.rNext * 80)}m</span></div>
        <div class="pred-fact">数学结论：下一圈圆心<b>必在</b>青色虚线圆内（面积只有当前圈的 ${Math.round(r.shrink * 100)}%）</div>
        ${r.flat
        ? `<div class="pred-flat">这一圈可行域内地形 / 物资条件接近，没有形成显著热点——按可行域整体规划即可，虚线圆内任意落点都合理。</div>`
        : `<p class="hint">下面几块比周围更值得先看。百分比是模型内候选权重，不代表真实刷圈概率。</p>` + r.top.map(b => `
          <div class="pred-zone z${b.rank}">
            <i>${b.rank}</i>
            <div><b>${this.placeNear(b.cx, b.cy)}</b><span>权重 ${Math.round(b.prob * 100)}% · 水 ${Math.round(b.water * 100)}%</span></div>
          </div>`).join('')}
        ${r.hold ? `<div class="pred-hold">建议优先占位：<b>${r.hold.name}</b>（圈内物资最高，资源 ${r.hold.loot}）</div>` : ''}
        <p class="hint">${r.note}</p>
      </div>`;
  }
};

/* ====================== 对局复盘实验室（ReplayLab）======================
 * 保存实际圈形 → 回溯式评估预测命中率 → 用实际落点微调预测权重。
 * 命中率口径：
 *   可行域命中——实际圆心是否落在数学可行域内（不满足说明圈画歪或半径表有误）
 *   Top1/Top3 命中——实际圆心是否落在第 1/前 3 候选区圆内（半径放宽 15%）
 *   平均偏差——实际圆心到 Top1 区中心的距离（米）
 * ==================================================================== */
const ReplayLab = {
  cfg() { return Object.assign({ key: 'zd_replays_v1', wkey: 'zd_weights_v1', minCalib: 8, eta: 0.05, clamp: {} }, window.REPLAY_STORE || {}); },

  list() {
    try { return JSON.parse(localStorage.getItem(this.cfg().key)) || []; } catch (e) { return []; }
  },
  persist(arr) { localStorage.setItem(this.cfg().key, JSON.stringify(arr.slice(-60))); },

  saveEntry() {
    const circles = {};
    Object.keys(App.circles || {}).forEach(p => { if (App.circles[p]) circles[p] = Object.assign({}, App.circles[p]); });
    const n = Object.keys(circles).length;
    if (n < 2) return { error: '至少确定 2 个圈再保存复盘（当前 ' + n + ' 个）' };
    const arr = this.list();
    arr.push({ id: Date.now(), mapId: App.mapId, date: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), circles });
    this.persist(arr);
    return { ok: true, n: arr.length };
  },
  removeEntry(id) { this.persist(this.list().filter(e => e.id !== id)); },
  clearAll() { localStorage.removeItem(this.cfg().key); localStorage.removeItem(this.cfg().wkey); },

  /* 单条复盘的逐圈评估（回溯：用 p-1 及更早的圈重跑预测，对比实际 p 圈） */
  async evalEntry(entry, useTuned) {
    if (entry.stats) return entry.stats;
    const rows = [];
    const phases = Object.keys(entry.circles).map(Number).sort((a, b) => a - b);
    const tuned = CirclePredictor.tunedWeights();
    if (!useTuned && tuned) { try { localStorage.removeItem(this.cfg().wkey); } catch (e) {} }
    try {
      for (const p of phases) {
        if (p < 2) continue;
        const parent = entry.circles[p - 1], actual = entry.circles[p];
        if (!parent || !actual) continue;
        const rNext = circleRadiusPct(entry.mapId, p);
        const maxD = parent.r - rNext;
        if (maxD <= 0) continue;
        const CS = {};
        for (let q = 1; q < p; q++) if (entry.circles[q]) CS[q] = entry.circles[q];
        const P = await CirclePredictor.predict(CS, entry.mapId);
        if (P.error) continue;
        const dAct = GeoUtil.dist([actual.cx, actual.cy], [parent.cx, parent.cy]);
        const feasible = dAct <= maxD * 1.05 + 0.3;
        let hit = 0, offset = Math.round(GeoUtil.dist([actual.cx, actual.cy], [(P.top[0] || parent).cx, (P.top[0] || parent).cy]) * 80);
        for (const z of P.top || []) {
          if (GeoUtil.dist([actual.cx, actual.cy], [z.cx, z.cy]) <= rNext * 1.15) { hit = z.rank; break; }
        }
        rows.push({ phase: p, feasible, hit, offset });
      }
    } finally { if (!useTuned && tuned) { try { localStorage.setItem(this.cfg().wkey, JSON.stringify(tuned)); } catch (e) {} } }
    entry.stats = { rows, feasible: rows.filter(r => r.feasible).length, top1: rows.filter(r => r.hit === 1).length, top3: rows.filter(r => r.hit >= 1).length, n: rows.length,
      avgOffset: rows.length ? Math.round(rows.reduce((s, r) => s + r.offset, 0) / rows.length) : 0 };
    return entry.stats;
  },

  /* 汇总全部复盘（懒计算 + 写回缓存） */
  async aggregate() {
    const arr = this.list();
    let feasible = 0, top1 = 0, top3 = 0, n = 0, offsetSum = 0;
    for (const e of arr) {
      const st = await this.evalEntry(e, true);
      feasible += st.feasible; top1 += st.top1; top3 += st.top3; n += st.n; offsetSum += st.avgOffset * st.n;
    }
    return { entries: arr.length, samples: n,
      feasibleRate: n ? Math.round(feasible / n * 100) : 0,
      top1Rate: n ? Math.round(top1 / n * 100) : 0,
      top3Rate: n ? Math.round(top3 / n * 100) : 0,
      avgOffset: n ? Math.round(offsetSum / n) : 0 };
  },

  /* 自校准：Δw = η × mean(实际落点因子 − Top1区因子)，方向对所有因子统一 */
  async calibrate() {
    const cfg = this.cfg();
    const arr = this.list();
    const samples = [];
    for (const e of arr) {
      for (const p of Object.keys(e.circles).map(Number).sort((a, b) => a - b)) {
        if (p < 2 || !e.circles[p - 1] || !e.circles[p]) continue;
        if (e.circles[p - 1].r - circleRadiusPct(e.mapId, p) <= 0) continue;
        samples.push({ e, p });
      }
    }
    if (samples.length < cfg.minCalib) return { error: `样本不足：需要 ≥${cfg.minCalib} 个圈样本（当前 ${samples.length}），多保存几局带 ≥2 个圈的复盘` };

    const before = Object.assign({ water: -0.45, loot: 0.30, cover: 0.15, move: -0.12, momentum: 0.10 }, (window.CIRCLE_PREDICTOR || {}).weights, CirclePredictor.tunedWeights() || {});
    const acc = { water: 0, loot: 0, cover: 0, move: 0, momentum: 0 };
    let used = 0;
    for (const s of samples) {
      const CS = {};
      for (let q = 1; q < s.p; q++) if (s.e.circles[q]) CS[q] = s.e.circles[q];
      const P = await CirclePredictor.predict(CS, s.e.mapId);
      if (P.error || !P.top || !P.top[0]) continue;
      const z = P.top[0], a = s.e.circles[s.p], parent = s.e.circles[s.p - 1], m = MAP_DATA[s.e.mapId];
      const f = (x, y) => {
        let loot = 0, cover = 0;
        for (const p2 of m.pois) if (GeoUtil.dist(p2.coords, [x, y]) <= P.rNext) loot += p2.loot;
        for (const t2 of (m.terrains || [])) if (GeoUtil.dist(t2.coords, [x, y]) <= P.rNext) cover++;
        const dist = Math.hypot(x - parent.cx, y - parent.cy) / (P.maxD || 1);
        return { loot, cover, water: Math.min(1, CirclePredictor.waterFrac(x, y, P.rNext) / 0.5), move: dist, momentum: 0.5 };
      };
      const fa = f(a.cx, a.cy), fz = f(z.cx, z.cy);
      acc.water += fa.water - fz.water; acc.loot += fa.loot - fz.loot;
      acc.cover += fa.cover - fz.cover; acc.move += fa.move - fz.move;   // momentum 两点同为常数，差恒为 0
      used++;
    }
    if (!used) return { error: '没有可用的评估样本' };
    const after = {}, report = [];
    const lootSpan = 400, coverSpan = 25;   // 把原始量纲压回 0~1 量级的经验尺度
    Object.keys(acc).forEach(k => {
      const raw = acc[k] / used;
      const scaled = k === 'loot' ? raw / lootSpan : k === 'cover' ? raw / coverSpan : raw;
      const cl = (cfg.clamp || {})[k];
      let v = before[k] + cfg.eta * scaled;
      if (cl) v = Math.max(cl[0], Math.min(cl[1], v));
      v = +v.toFixed(3);
      after[k] = v;
      report.push(`${k} ${before[k]} → ${v}`);
    });
    try { localStorage.setItem(cfg.wkey, JSON.stringify(after)); } catch (e) {}
    return { ok: true, used, report };
  }
};

/* ====================== 航线拥堵模拟（CongestionSim）======================
 * 预期队伍数 ∝ 物资^1.15 × (1+密度) × 打法亲和 × PEL强势点加成 ×
 * 航线可达性（超打法跳伞距离=0）；25 队 × 82% 落主点位归一化。
 * ====================================================================== */
const CongestionSim = {
  run() {
    if (!App.flight || !App.flight.start || !App.flight.end) return { error: '先在地图上画好航线（第 1 步）' };
    const cfg = Object.assign({ teams: 25, droppingRatio: 0.82, range: {}, strongBoost: 1.4 }, window.CONGESTION_CFG || {});
    const g = App.game, m = MAP();
    const rangeM = (cfg.range[g.style] || cfg.range.flexible || 1400);
    const strong = ((window.SEASON_INSIGHTS || {}).strongPoints || {})[App.mapId] || [];
    const [A, B] = [App.flight.start, App.flight.end];
    const items = m.pois.map(p => {
      const d = GeoUtil.distToSegment(p.coords, A, B) * 80;      // 到航线垂距（米）
      const reach = d <= rangeM;
      const w = reach ? Math.max(0.12, 1 - Math.pow(d / rangeM, 2)) : 0;
      let aff = 1;
      if (g.style === 'urban') aff = 0.5 + (p.density || 50) / 50;
      else if (g.style === 'wild') aff = p.kind === 'compound' ? 1.6 : (p.kind === 'major' ? 0.3 : 0.9);
      const boost = strong.includes(p.name) ? cfg.strongBoost : 1;
      const attract = reach ? Math.pow(p.loot || 50, 1.15) * (1 + (p.density || 40) / 140) * aff * boost * w : 0;
      return { name: p.name, coords: p.coords, loot: p.loot, kind: p.kind, distM: Math.round(d), expected: attract };
    });
    const total = items.reduce((s, i) => s + i.expected, 0) || 1;
    const pool = cfg.teams * cfg.droppingRatio;
    items.forEach(i => { i.expected = +(i.expected / total * pool).toFixed(1); });
    const ranked = items.filter(i => i.expected > 0).sort((a, b) => b.expected - a.expected);
    return {
      style: (LANDING_STYLES.find(s => s.id === g.style) || {}).name || '—',
      rangeM, top: ranked.slice(0, 12),
      gems: ranked.filter(i => i.loot >= 62 && i.expected < 1.2).slice(0, 6)
    };
  },

  panelHTML(r) {
    if (r.error) return `<p class="hint">${r.error}</p>`;
    const b = (window.CONGESTION_CFG || {}).buckets || { packed: 3, hot: 1.5, ok: 0.5 };
    const cls = e => e >= b.packed ? 'cg-red' : e >= b.hot ? 'cg-amber' : e >= b.ok ? 'cg-green' : 'cg-mut';
    return `
      <div class="cg-result">
        <p class="cg-sum">按「${r.style}」打法、跳伞可达 ${r.rangeM}m 估算全图 ${((window.CONGESTION_CFG || {}).teams || 25)} 队分布：</p>
        ${r.top.map(i => `
          <div class="cg-row">
            <i class="cg-dot ${cls(i.expected)}"></i>
            <b>${i.name}</b><span>≈${i.expected} 队 · 距航线 ${i.distM}m · loot ${i.loot}</span>
          </div>`).join('')}
        ${r.gems.length ? `<div class="pred-hold">💎 捡漏区（物资不错但预期 &lt;1.2 队）：${r.gems.map(g => g.name).join('、')}</div>` : ''}
        <p class="hint">启发式估算（物资×密度×打法×PEL强势点×航线可达），实际受跟风与车队习惯影响。</p>
      </div>`;
  }
};

const Game = {
  /* ------------------------------ 生命周期 ------------------------------ */
  reset() {
    App.game.recommend = []; App.game.recommendWarn = false; App.game.chosen = null; App.game.plan = null;
    App.game.planPhase = 1;
    App.game.phasePos = {}; App.game.teamPos = null; App.game.hudHidden = false;
    App.circles = {}; App.circle = null; App.circleEdit = null; App.prediction = null; App.congestion = null;
    App.routes = [];
  },
  enter() {
    Sidebar.render();
    if (App.game.plan) this.renderStep3();
    else if (App.game.chosen) this.renderStep2();
    else this.renderWelcome();
    GameHUD.render();
  },
  clearSelection() {
    App.game.chosen = null; App.game.plan = null; App.routes = [];
    if (App.mode === 'game') this.renderWelcome();
  },
  onFlightReady() { if (App.mode === 'game') { App.congestion = null; this.renderStep1(); toast('航线已就绪，可以计算推荐跳点了'); } },
  onCircleReady() { if (App.mode === 'game') this.renderStep3(); },

  renderWelcome() {
    const m = MAP();
    $('#inspector').innerHTML = `
      <div class="insp-head">
        <div class="insp-title">🎮 游戏模式 · ${m.icon} ${m.name}</div>
        <div class="insp-sub">按步骤输入你的对局信息，获得落地与进圈指导</div>
      </div>
      <div class="insp-body">
        <div class="flow-steps">
          ${[['1', '落地打法', '选择打法 + 画航线 → 3 个推荐跳点（5 星评分）'],
        ['2', '选点与载具', '选推荐点或自标大头针 → 周边固定/定期载具刷新点'],
        ['3', '圈形与进圈', '按圈号自动生成圈形 → 拖动确认 → 何时进圈 + 2~3 条行进路线'],
        ['4', '战斗攻略', '架枪/突击/探点/看屁股/自由手分工 + 载具配置 + 进圈与转移要点']]
        .map(([n, t, d]) => `<div class="flow-card"><b>${n}</b><div><span>${t}</span><p>${d}</p></div></div>`).join('')}
        </div>
          <p class="hint">💡 游戏模式下地图情报依然可用：左侧图层可随时开关点位、载具与 19 类地形标注，点击标记即可查看 360° 地形视角。</p>
        <div class="welcome-btns">
          <button class="primary-btn" onclick="Game.goStep(1)">开始 → 第 1 步：落地打法</button>
          <button class="ghost-btn" onclick="Game.renderPro()">📖 职业运营手册</button>
        </div>
      </div>`;
  },

  /* ====================== 职业运营手册（PEL 思路） ====================== */
  renderPro() {
    const pb = PRO_PLAYBOOK;
    $('#inspector').innerHTML = `
      <div class="insp-head">
        <div class="insp-title">📖 职业运营手册</div>
        <div class="insp-sub">提炼自 PEL 官方赛制与职业比赛复盘：跳点 → 发育 → 转移 → 卡边 → 决赛圈</div>
      </div>
      <div class="insp-body">
        <button class="ghost-btn" onclick="Game.renderWelcome()">← 返回总览</button>

        <div class="section-title">${pb.scoring.title}</div>
        <div class="pb-score">
          ${pb.scoring.points.map(p => `<p>${p}</p>`).join('')}
          <em>${pb.scoring.note}</em>
        </div>

        <div class="section-title">五阶段运营时间线</div>
        <div class="pb-stages">
          ${pb.stages.map((s, i) => `
            <div class="pb-stage">
              <div class="pb-stage-head">
                <span class="pb-n">${i + 1}</span>
                <div><b>${s.phase}</b><em>${s.time} · 目标：${s.goal}</em></div>
              </div>
              <ul>${s.rules.map(r => `<li>${r}</li>`).join('')}</ul>
              <p class="pb-pro">◈ ${s.pro}</p>
            </div>`).join('')}
        </div>

        <div class="section-title">四个关键决策</div>
        <div class="pb-qa">
          ${pb.decisions.map(d => `
            <div class="pb-q"><b>Q · ${d.q}</b><p>${d.a}</p></div>`).join('')}
        </div>
        <p class="hint">来源：2026 PEL 春季赛官方规则、公开比赛复盘与职业队打法共识，为思路参考而非教条。</p>
      </div>`;
  },

  /* ====================== 对局复盘实验室 ====================== */
  renderReplays(agg, msg) {
    const lab = ReplayLab, list = lab.list();
    const tuned = CirclePredictor.tunedWeights();
    const nCircles = Object.keys(App.circles || {}).length;
    const a = agg || { entries: list.length, samples: 0, feasibleRate: 0, top1Rate: 0, top3Rate: 0, avgOffset: 0 };
    $('#inspector').innerHTML = `
      <div class="insp-head">
        <div class="insp-title">📋 对局复盘实验室</div>
        <div class="insp-sub">保存实际圈形 → 统计预测命中率 → 用真实数据微调预测权重</div>
      </div>
      <div class="insp-body">
        <button class="ghost-btn" onclick="Game.renderWelcome()">← 返回总览</button>
        ${msg ? `<p class="hint">${msg}</p>` : ''}

        <div class="section-title">① 保存本局</div>
        <div class="replay-save">
          <p>在第 3 步把<b>本局实际刷的圈</b>画出来并逐个确定（当前 ${nCircles} 个），然后保存为复盘样本。</p>
          <button class="primary-btn" id="replaySave">💾 保存本局为复盘（${nCircles}/需 ≥2 圈）</button>
        </div>

        <div class="section-title">② 预测命中率</div>
        <div class="rp-stats">
          <div class="rp-stat"><b>${a.entries}</b><span>复盘局数</span></div>
          <div class="rp-stat"><b>${a.samples}</b><span>圈样本</span></div>
          <div class="rp-stat"><b>${a.feasibleRate}%</b><span>可行域命中</span></div>
          <div class="rp-stat"><b>${a.top1Rate}%</b><span>Top1 命中</span></div>
          <div class="rp-stat"><b>${a.top3Rate}%</b><span>Top3 命中</span></div>
          <div class="rp-stat"><b>${a.avgOffset}m</b><span>平均偏差</span></div>
        </div>
        <button class="ghost-btn" id="replayStats">📊 重新统计（回溯重跑全部预测）</button>
        <p class="hint">可行域命中应为 100%；低于 100% 说明圈画歪或半径表与实际有出入。Top3 命中是候选区的实际参考价值。</p>

        <div class="section-title">③ 预测自校准</div>
        <div class="replay-calib">
          <p>用实际落点微调五个因子权重（Δw = η×(实际因子 − 预测区因子)），需要 ≥${lab.cfg().minCalib} 个圈样本。</p>
          <p class="hint">当前权重：${tuned ? '✅ 已按你的复盘数据校准（' + Object.entries(tuned).map(([k, v]) => k + '=' + v).join(' ') + '）' : '默认值（未校准）'}</p>
          <div class="row-2">
            <button class="primary-btn" id="replayCalib">⚖️ 开始自校准</button>
            ${tuned ? '<button class="ghost-btn" id="replayReset">↺ 恢复默认</button>' : ''}
          </div>
          <div id="calibOut"></div>
        </div>

        <div class="section-title">④ 复盘库</div>
        <div class="rp-list">
          ${list.length ? list.slice().reverse().map(e => `
            <div class="rp-item">
              <div><b>${(MAP_DATA[e.mapId] || {}).name || e.mapId}</b><span>${e.date} · ${Object.keys(e.circles).length} 圈${e.stats ? ' · Top1 ' + Math.round(e.stats.top1 / Math.max(1, e.stats.n) * 100) + '%' : ''}</span></div>
              <button class="ghost-btn" data-del="${e.id}">删除</button>
            </div>`).join('') : '<p class="hint">还没有复盘记录</p>'}
        </div>
        ${list.length ? '<button class="ghost-btn" id="replayClearAll">🗑 清空全部复盘与校准</button>' : ''}
        <p class="hint">复盘数据只存在本机浏览器（localStorage），不上传。</p>
      </div>`;
    $('#replaySave').onclick = () => {
      const r = lab.saveEntry();
      if (r.error) { toast(r.error, 'warn'); return; }
      toast(`💾 已保存复盘（共 ${r.n} 局），可继续统计或校准`);
      this.renderReplays();
    };
    $('#replayStats').onclick = async () => {
      const btn = $('#replayStats');
      btn.disabled = true; btn.textContent = '⏳ 统计中…';
      try { const agg2 = await lab.aggregate(); this.renderReplays(agg2); }
      catch (e) { console.error(e); toast('统计失败：' + e.message, 'warn'); btn.disabled = false; btn.textContent = '📊 重新统计（回溯重跑全部预测）'; }
    };
    $('#replayCalib').onclick = async () => {
      const btn = $('#replayCalib');
      btn.disabled = true; btn.textContent = '⏳ 校准中…';
      try {
        const r = await lab.calibrate();
        const out = $('#calibOut');
        if (r.error) { out.innerHTML = '<p class="hint">' + r.error + '</p>'; }
        else { out.innerHTML = '<div class="pred-fact">已用 ' + r.used + ' 个圈样本校准：' + r.report.join('；') + '</div>'; toast('⚖️ 预测权重已按复盘数据校准'); }
      } catch (e) { console.error(e); toast('校准失败：' + e.message, 'warn'); }
      btn.disabled = false; btn.textContent = '⚖️ 再次自校准';
    };
    const rs = $('#replayReset');
    if (rs) rs.onclick = () => { localStorage.removeItem(lab.cfg().wkey); toast('↺ 已恢复默认权重'); this.renderReplays(); };
    $$('#inspector [data-del]').forEach(b => b.onclick = () => { lab.removeEntry(+b.dataset.del); toast('已删除该条复盘'); this.renderReplays(); });
    const ca = $('#replayClearAll');
    if (ca) ca.onclick = () => { lab.clearAll(); toast('已清空复盘库与校准'); this.renderReplays(); };
  },

  goStep(n) {
    if (n === 1) this.renderStep1();
    else if (n === 2) this.renderStep2();
    else if (n === 3) this.renderStep3();
    else if (n === 4) this.renderStep4();
    if (window.GameSidebar) GameSidebar.render();
  },

  /* ============================== 第 1 步 ============================== */
  renderStep1() {
    const g = App.game;
    const summaries = {
      urban: '近航线城区，快速接战', vehicle: '先拿载具，再转移发育',
      wild: '低密度房群，分散搜集', flexible: '比较三种打法再选点'
    };
    $('#inspector').innerHTML = `
      <div class="insp-head">
        <div class="insp-title">① 落地打法与航线</div>
        <div class="insp-sub">选择打法 → 画航线 → 计算推荐跳点</div>
      </div>
      <div class="insp-body step-one-body">
        <div class="section-title">这把的打法</div>
        <div class="style-grid">
          ${LANDING_STYLES.map(s => `
            <button class="style-card${g.style === s.id ? ' active' : ''}" data-style="${s.id}">
              <span class="style-ico">${s.icon}</span>
              <b>${s.name}</b>
              <p>${summaries[s.id] || s.name}</p>
            </button>`).join('')}
        </div>
        <details class="style-help">
          <summary>查看打法说明与操作要求</summary>
          ${LANDING_STYLES.map(s => `<div class="style-help-item"><b>${s.icon} ${s.name}</b><p>${s.desc}</p><p class="hint">要求：${s.demand}</p></div>`).join('')}
        </details>
        <div class="section-title">跟跳人数</div>
        <div class="seg-row" id="followRow">
          ${[0, 1, 2, 3].map(n => `<button class="seg-btn${g.followers === n ? ' active' : ''}" data-n="${n}">${n} 名队友</button>`).join('')}
        </div>
        <div class="section-title">航线</div>
        <div class="row-2">
          <button class="tool-btn wide" data-tool="flight" onclick="Tools.set('flight')">✈️ ${App.flight && App.flight.end ? '重新绘制航线' : '绘制航线'}</button>
          <button class="ghost-btn" onclick="Tools.set('pan');App.flight=null;App.routes=[];App.congestion=null;MapView.renderOverlay();Game.renderStep1()">清除</button>
        </div>
        <p class="hint">${App.flight && App.flight.end ? '✅ 航线已绘制，可以计算了' : '在地图上点击两次：起点 → 终点'}</p>
        <div class="step-primary-action"><button class="primary-btn" id="calcDrop" ${g.style && App.flight && App.flight.end ? '' : 'disabled'}>🎯 计算推荐跳点</button></div>
        <div id="dropResult"></div>
        <div class="predict-sec">
          <div class="section-title">🚦 航线拥堵模拟</div>
          <p class="hint">这条航线上哪些点会爆满、哪些点能捡漏（按所选打法的跳伞距离估算）</p>
          <button class="ghost-btn" id="congBtn" ${App.flight && App.flight.end ? '' : 'disabled'}>🚦 模拟全图落队分布</button>
          <div id="congOut">${App.congestion ? CongestionSim.panelHTML(App.congestion) : ''}</div>
        </div>
      </div>`;
    this.bindStep1();
    if (g.recommend.length) this.showRecommend();
  },

  bindStep1() {
    $$('#inspector .style-card').forEach(b => b.onclick = () => {
      App.game.style = b.dataset.style;
      $$('#inspector .style-card').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      this.syncCalcButton();
    });
    $$('#followRow .seg-btn').forEach(b => b.onclick = () => {
      App.game.followers = +b.dataset.n;
      App.game.compTouched = false;
      App.game.compSize = App.game.followers + 1;
      $$('#followRow .seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
    const c = $('#calcDrop');
    if (c) c.onclick = () => this.calcDrop();
    this.syncCalcButton();
    const cb = $('#congBtn');
    if (cb) cb.onclick = () => {
      const r = CongestionSim.run();
      App.congestion = r.error ? null : r;
      const out = $('#congOut');
      if (out) out.innerHTML = CongestionSim.panelHTML(r);
      MapView.renderOverlay();
      if (!r.error) toast('🚦 已生成落队分布（地图上光环大小 = 预期队数）');
    };
  },

  /* ======================= 跳点评分（四种打法各自一套逻辑） ======================= */

  /* 点位周边的载具情况 */
  vehNear(coords, radius) {
    const m = MAP();
    const all = [
      ...(m.vehicles.fixed || []).map(v => ({ v, k: '固定' })),
      ...(m.vehicles.periodic || []).map(v => ({ v, k: '定期' })),
      ...(m.vehicles.special || []).map(v => ({ v, k: '特殊' }))
    ].filter(x => x.v.coords.length)
      .map(x => ({ ...x, d: GeoUtil.dist(x.v.coords, coords) }))
      .sort((a, b) => a.d - b.d);
    const fixed = all.filter(x => x.k === '固定' && x.d <= radius);
    const periodic = all.filter(x => x.k === '定期' && x.d <= radius);
    return {
      all, fixed, periodic,
      best: all[0] || null,
      bestFixed: fixed[0] || null,
      any: all.length > 0 && all[0].d <= radius
    };
  },

  /* 点位周边可轮转的小房区/野点 */
  clustersNear(coords, radius) {
    const m = MAP();
    return m.pois.filter(p => p !== null && (p.kind === 'compound' || (p.density <= 55 && p.tier !== 'S')))
      .map(p => ({ p, d: GeoUtil.dist(p.coords, coords) }))
      .filter(x => x.d > 0.8 && x.d <= radius)
      .sort((a, b) => a.d - b.d);
  },

  /* 找车转移：从落点开车能到的目标资源点 */
  reachTarget(from, exclude) {
    const m = MAP();
    return m.pois.filter(p => p.kind !== 'compound' && p.name !== exclude)
      .map(p => {
        const d = GeoUtil.dist(p.coords, from);
        if (d < 8 || d > 42) return null;
        const veh = this.vehNear(p.coords, 8);
        const score = p.loot * 0.5 + (100 - p.density) * 0.2 + (veh.any ? 18 : 0) - Math.abs(d - 20) * 1.4;
        return { p, d, score, veh };
      })
      .filter(Boolean).sort((a, b) => b.score - a.score);
  },

  scorePoint(p, style, flight, followers) {
    const m = MAP();
    let dist = 50;
    if (flight && flight.start && flight.end) dist = GeoUtil.distToSegment(p.coords, flight.start, flight.end);
    const adjDensity = clamp(p.density + followers * 6, 0, 100);
    const veh = this.vehNear(p.coords, 12);
    const season = (SEASON_INSIGHTS.strongPoints[App.mapId] || []);
    const strongBonus = season.includes(p.name) ? 4 : 0;

    const mk = (strategy, label, total, parts, extra) => ({
      name: p.name, coords: p.coords, tier: p.tier, type: p.type, note: p.note,
      kind: p.kind, loot: p.loot, density: p.density,
      strategy, styleLabel: label, total: clamp(total + strongBonus, 0, 100),
      stars: clamp((total + strongBonus) / 100 * 5, 0, 5),
      breakdown: parts, extra: extra || [], flightDist: dist,
      reason: parts.map(x => `${x[0]} ${x[1]}`).join(' · ')
    });

    const base = {
      flightM: Fmt.m(dist), densityAdj: Math.round(adjDensity)
    };

    /* ---------- 城区刚枪：短距离 + 高资源大城区 ---------- */
    if (style.strategy === 'urban') {
      if (p.kind === 'compound') return null;            // 不考虑小房区
      if (p.loot < 76) return null;                      // 必须是富裕点
      if (dist > 20) return null;                        // 必须离航线近
      const dropScore = clamp(100 - dist * 6.5, 0, 100); // 0% → 100 分，15% → 2 分
      const lootScore = p.loot;
      const denScore = adjDensity;
      const vehScore = veh.bestFixed ? clamp(100 - veh.bestFixed.d * 10, 0, 100) : 30;
      const parts = [['落地速度', Math.round(dropScore)], ['资源', Math.round(lootScore)],
      ['人口密度', Math.round(denScore)], ['载具', Math.round(vehScore)]];
      const total = dropScore * 0.42 + lootScore * 0.33 + denScore * 0.18 + vehScore * 0.07;
      const extra = [
        `跳伞距离约 ${Fmt.m(dist)}m，落地后 10 秒内就能接敌`,
        denScore >= 80 ? '落地必刚枪，注意枪声位置' : '竞争强度中等，可以先摸枪再打'
      ];
      return mk('urban', '城区刚枪', total, parts, extra);
    }

    /* ---------- 找车转移：固定载具点 + 开车去有距离的资源点 ---------- */
    if (style.strategy === 'vehicle') {
      const fv = veh.bestFixed;
      if (!fv || fv.d > 7) return null;                  // 附近必须有固定刷车/刷马点
      if (dist > 19) return null;
      const carScore = clamp(100 - fv.d * 18, 0, 100);    // 车越近越好
      const dropScore = clamp(100 - dist * 6.8, 0, 100);
      const target = this.reachTarget(p.coords, p.name)[0];
      const destScore = target ? clamp(target.score, 0, 100) : 45;
      const safety = clamp(100 - adjDensity * 1.25, 0, 100);
      const parts = [['载具可得', Math.round(carScore)], ['落地速度', Math.round(dropScore)],
      ['转移目标', Math.round(destScore)], ['落点安全', Math.round(safety)]];
      const total = carScore * 0.36 + dropScore * 0.30 + destScore * 0.22 + safety * 0.12;
      const extra = [
        `固定刷新：${fv.v.type}，距落点约 ${Fmt.m(fv.d)} 米（${fv.v.location}）`,
        target ? `拿车后建议开往 ${target.p.name}（${Fmt.m(target.d)} 米，资源 ${target.p.loot}、密度 ${target.p.density}）`
          : '周边没有特别合适的转移目标，可以沿公路向圈心方向找房区'
      ];
      return mk('vehicle', '找车转移', total, parts, extra);
    }

    /* ---------- 野点发育：小房区 + 多房群轮转 + 附近有车 ---------- */
    if (style.strategy === 'wild') {
      if (p.kind !== 'compound' && p.density > 56) return null;   // 不落大城区
      if (p.tier === 'S') return null;
      if (dist > 24) return null;
      const clusters = this.clustersNear(p.coords, 14);
      const rotScore = clamp(clusters.length * 24, 0, 100);
      const safeScore = clamp(100 - adjDensity * 1.7, 0, 100);
      const vehScore = veh.best ? clamp(100 - veh.best.d * 13, 0, 100) : 18;
      const dropScore = clamp(100 - dist * 4.2, 0, 100);
      const lootScore = p.loot;
      const parts = [['可轮转房群', Math.round(rotScore)], ['安全性', Math.round(safeScore)],
      ['载具便利', Math.round(vehScore)], ['落地距离', Math.round(dropScore)]];
      const total = rotScore * 0.32 + safeScore * 0.26 + vehScore * 0.22 + dropScore * 0.12 + lootScore * 0.08;
      const shown = clusters.slice(0, 3);
      const extra = [
        clusters.length
          ? (clusters.length > shown.length
            ? `附近 ${clusters.length} 个房群，先去这 ${shown.length} 个：${shown.map(c => c.p.name).join('、')}`
            : `周边 ${clusters.length} 个房群可轮转：${shown.map(c => c.p.name).join('、')}`)
          : '周边房群较少，需要靠单点搜完再走',
        veh.best ? `最近载具：${veh.best.v.type}（${Fmt.m(veh.best.d)} 米，${veh.best.k}刷新），搜完直接换点`
          : '附近没有载具点，轮转只能靠步行，效率会低一些'
      ];
      return mk('wild', '野点发育', total, parts, extra);
    }

    /* ---------- 随机应变：三种思路各算一遍取最优 ---------- */
    const styles = LANDING_STYLES.filter(x => x.strategy !== 'flexible');
    const all = [];
    styles.forEach(st => {
      const r = this.scorePoint(p, st, flight, followers);
      if (r) all.push(r);
    });
    if (!all.length) return null;
    all.sort((a, b) => b.total - a.total);
    const best = all[0];
    best.strategy = 'flexible';
    best.styleLabel = `随机应变（更接近${best.styleLabel}）`;
    best.extra = [`本局该点最接近「${all[0].styleLabel.split('（')[0]}」思路`, ...best.extra];
    return best;
  },

  calcDrop() {
    const g = App.game;
    if (!g.style) { toast('请先选择这把的落地打法'); return; }
    if (!App.flight || !App.flight.end) { toast('请先在地图上绘制航线（点两次）'); return; }
    const style = LANDING_STYLES.find(s => s.id === g.style);
    const m = MAP();

    // 「随机应变」= 综合三种思路：刚枪、找车、野点各给一个最优解，再按总分排序
    if (style.strategy === 'flexible') {
      const pools = {};
      ['urban', 'vehicle', 'wild'].forEach(sid => {
        const st = LANDING_STYLES.find(x => x.id === sid);
        pools[sid] = m.pois.map(p => this.scorePoint(p, st, App.flight, g.followers))
          .filter(Boolean).sort((a, b) => b.total - a.total);
      });
      const picked = [];
      ['urban', 'vehicle', 'wild'].forEach(sid => {
        const r = pools[sid].find(x => !picked.some(y => GeoUtil.dist(y.coords, x.coords) < 6));
        if (r) { r.styleLabel = `随机应变 · 更接近「${r.styleLabel}」`; picked.push(r); }
      });
      const rest = Object.values(pools).flat().sort((a, b) => b.total - a.total);
      for (const r of rest) {
        if (picked.length >= 3) break;
        if (picked.some(y => GeoUtil.dist(y.coords, r.coords) < 6)) continue;
        picked.push(r);
      }
      picked.sort((a, b) => b.total - a.total);
      g.recommend = picked;
      this.decorateRecommend(picked);
      this.showRecommend();
      MapView.renderOverlay();
      GameSidebar.render();
      toast(`✅ 随机应变：已给出 ${picked.length} 个综合推荐（刚枪/找车/野点各一）`);
      return;
    }

    const scored = m.pois.map(p => this.scorePoint(p, style, App.flight, g.followers))
      .filter(Boolean).sort((a, b) => b.total - a.total);

    // 相邻推荐做去重（名称/位置太近的只留一个），保证 3 个点有区分度
    const picked = [];
    for (const r of scored) {
      if (picked.length >= 3) break;
      if (picked.some(x => GeoUtil.dist(x.coords, r.coords) < 6)) continue;
      picked.push(r);
    }
    if (style.strategy === 'vehicle') this.orderBySafety(picked);
    g.recommend = picked;
    this.decorateRecommend(picked);
    if (style.strategy === 'vehicle' && g.recommendWarn) {
      const edge = this.edgeAlongFlight(picked);
      if (edge) picked.push(edge);
    }
    if (!picked.length) toast('⚠️ 这条航线附近没有符合该打法的点位，换个打法或重画航线试试');
    this.showRecommend();
    MapView.renderOverlay();
    GameSidebar.render();
    if (picked.length) toast(`✅ 已生成 ${picked.length} 个「${style.name}」推荐跳点`);
  },

  syncCalcButton() {
    const c = $('#calcDrop');
    if (c) c.disabled = !(App.game.style && App.flight && App.flight.end);
  },

  safetyScore(r) {
    const s = (r.breakdown || []).find(([n]) => n === '落点安全' || n === '安全性');
    return s ? s[1] : null;
  },

  /* 找车转移：安全分达到 40 的排在前面；都不到 40 时按安全分排，不让落地速度占第一。 */
  orderBySafety(list) {
    list.forEach(r => { r.safety = this.safetyScore(r); });
    const safe = [], risky = [];
    list.forEach(r => ((r.safety == null || r.safety >= 40) ? safe : risky).push(r));
    safe.sort((a, b) => b.total - a.total);
    risky.sort((a, b) => b.safety - a.safety || b.total - a.total);
    list.splice(0, list.length, ...safe, ...risky);
  },

  /* 城区都不安全时，沿航线补一个更安全的房群，放在列表下面。 */
  edgeAlongFlight(list) {
    if (!App.flight || !App.flight.end) return null;
    const names = new Set(list.map(r => r.name));
    const safest = Math.max(...list.map(r => r.safety == null ? 0 : r.safety));
    const hit = MAP().pois.map(p => {
      if (!p || !p.coords || names.has(p.name)) return null;
      if (p.tier === 'S' || p.kind === 'major') return null;
      if (!(p.kind === 'compound' || p.density <= 48)) return null;
      const dist = GeoUtil.distToSegment(p.coords, App.flight.start, App.flight.end);
      if (dist > 26) return null;
      const safety = clamp(100 - (p.density || 40) * 1.25, 0, 100);
      return { p, dist, safety, score: safety * 0.7 + clamp(100 - dist * 4, 0, 100) * 0.3 };
    }).filter(Boolean).sort((a, b) => b.score - a.score)[0];
    if (!hit || hit.safety <= safest) return null;
    const p = hit.p;
    const veh = this.vehNear(p.coords, 14);
    return {
      name: p.name, coords: p.coords, tier: p.tier, type: p.type, note: p.note,
      kind: p.kind, loot: p.loot, density: p.density,
      strategy: 'vehicle', styleLabel: '沿航线的边缘房',
      total: hit.score, stars: clamp(hit.safety / 100 * 5, 0, 5),
      breakdown: [
        ['落点安全', Math.round(hit.safety)],
        ['离航线', Math.round(clamp(100 - hit.dist * 4, 0, 100))]
      ],
      extra: [
        hit.safety >= 40
          ? '城区落点都不安全，可以先落在这里发育，再沿公路找车转移'
          : '比上面的城区安全一些，可以先落在这里，再沿公路找车',
        veh.best
          ? `最近载具：${veh.best.v.type}（${Fmt.m(veh.best.d)} 米，${veh.best.k}刷新）`
          : '附近没有固定刷车点，落地后先搜完再沿公路找车'
      ],
      flightDist: hit.dist,
      safety: Math.round(hit.safety),
      risk: false,
      why: '',
      edge: true
    };
  },

  /* 推荐生成后再改文案：转移目标避开另外几个推荐点，并写出排第一的原因。
   * 三条安全分都低于 40 时只在列表顶上提示；某一条比最安全的那条低 15 分以上，才单独标高风险。 */
  decorateRecommend(list) {
    const names = new Set(list.map(r => r.name));
    list.forEach(r => {
      const idx = (r.extra || []).findIndex(s => s.indexOf('建议开往') >= 0);
      if (idx >= 0) {
        const alt = this.reachTarget(r.coords, r.name).find(t => !names.has(t.p.name));
        r.extra[idx] = alt
          ? `拿车后建议开往 ${alt.p.name}（${Fmt.m(alt.d)} 米，资源 ${alt.p.loot}、密度 ${alt.p.density}）`
          : '周边没有特别合适的转移目标，可以沿公路向圈心方向找房区';
      }
      r.safety = this.safetyScore(r);
      r.risk = false;
      r.why = '';
    });
    const known = list.filter(r => r.safety != null);
    const safest = known.length ? Math.max(...known.map(r => r.safety)) : 100;
    App.game.recommendWarn = known.length > 0 && known.every(r => r.safety < 40);
    known.forEach(r => {
      if (r.safety < 40 && safest - r.safety >= 15) r.risk = true;
    });
    if (list[0] && !list[0].edge) {
      if (App.game.recommendWarn && list[0].safety != null && list[0].safety < 40) {
        list[0].why = '这几条城区里它相对最安全，所以排第一';
      } else {
        const top = (list[0].breakdown || []).slice().sort((a, b) => b[1] - a[1])[0];
        list[0].why = top ? `${top[0]}最高，所以排第一` : '';
      }
      if (list[0].risk) list[0].why += (list[0].why ? '。' : '') + '落地风险高';
    }
  },

  showRecommend() {
    const box = $('#dropResult');
    if (!box) return;
    const g = App.game;
    const st = LANDING_STYLES.find(x => x.id === g.style);
    box.innerHTML = `
      <div class="section-title">🎯 「${st ? st.name : ''}」推荐跳点（5 星制）</div>
      <p class="hint">${st ? st.rule : ''}</p>
      ${g.recommendWarn ? '<p class="rec-warn">这条航线附近的城区都不安全</p>' : ''}
      ${g.recommend.map((r, i) => `
        <div class="rec-card${g.chosen && g.chosen.name === r.name ? ' active' : ''}${r.risk ? ' risk' : ''}${r.edge ? ' edge' : ''}" data-i="${i}">
          <div class="rec-top">
            <span class="rec-rank">${r.edge ? '边' : i + 1}</span>
            <div class="rec-main">
              <b>${r.name}</b>
              <span class="rec-kind">${r.edge ? '沿航线的边缘房' : (r.kind === 'compound' ? '野区房群' : (r.type || '点位'))}${r.risk ? ' · 高风险' : ''}</span>
              ${r.why ? `<p class="rec-why">${r.why}</p>` : ''}
              <div class="stars">${starStr(r.stars)}<em>${r.stars.toFixed(1)}</em></div>
              <p>${r.edge ? r.styleLabel : r.styleLabel + '思路'}</p>
            </div>
          </div>
          <div class="rec-bars">
            ${r.breakdown.map(([n, v]) => `<div class="mini-meter"><span>${n}</span>
              <i><b style="width:${v}%;background:${v >= 70 ? '#3ecf8e' : v >= 45 ? '#f5c04e' : '#fb8c4c'}"></b></i><em>${v}</em></div>`).join('')}
          </div>
          <ul class="tip-list small">${r.extra.map(x => `<li>${x}</li>`).join('')}</ul>
          <div class="rec-actions">
            <button class="pick-btn" data-pick="${i}">选择此点 →</button>
            <span class="rec-tag">资源 ${r.loot} · 密度 ${r.density} · 离航线 ${Fmt.m(r.flightDist)}m</span>
          </div>
        </div>`).join('')}`;
    $$('#dropResult .pick-btn').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      this.choosePoint(App.game.recommend[+b.dataset.pick]);
    });
    $$('#dropResult .rec-card').forEach(c => c.onclick = () => this.choosePoint(App.game.recommend[+c.dataset.i]));
  },

  choosePoint(rec) {
    App.game.chosen = { name: rec.name, coords: rec.coords, tier: rec.tier, type: rec.type, stars: rec.stars, pel: rec.pel };
    App.pin = { coords: rec.coords };
    MapView.focus(rec.coords, 2.2);
    MapView.renderOverlay();
    GameSidebar.render();
    toast(`已选择落点：${rec.name}（地图已定位）`);
    this.renderStep2();
  },

  chooseCustomPin(p) {
    App.game.chosen = { name: '自选点位', coords: p, tier: '-', type: '大头针' };
    App.pin = { coords: p };
    MapView.renderOverlay();
    GameSidebar.render();
    toast('📍 已放置大头针，正在读取该点情报');
    this.renderStep2();
  },

  /* ============================== 第 2 步 ============================== */
  NEAR_VEH: 10,     // 载具：800m 内
  NEAR_TER: 8,      // 地形：640m 内

  renderStep2() {
    const g = App.game, m = MAP();
    if (!g.chosen) {
      $('#inspector').innerHTML = `
        <div class="insp-head"><div class="insp-title">② 落点与载具</div>
        <div class="insp-sub">先在第 1 步选一个推荐跳点</div></div>
        <div class="insp-body">
          <p class="hint">还没有选择落点。</p>
          <button class="primary-btn" onclick="Game.goStep(1)">去选跳点</button>
          <div class="section-title">或者自己标点</div>
          <button class="tool-btn wide" data-tool="pin" onclick="Tools.set('pin')">📌 在地图上打大头针</button>
        </div>`;
      return;
    }
    const p = g.chosen.coords;
    const allVeh = [...(m.vehicles.fixed || []).map(v => ({ v, k: '固定' })),
    ...(m.vehicles.periodic || []).map(v => ({ v, k: '定期' })),
    ...(m.vehicles.special || []).map(v => ({ v, k: '特殊' }))]
      .filter(x => x.v.coords.length).map(x => ({ ...x, d: GeoUtil.dist(x.v.coords, p) }))
      .sort((a, b) => a.d - b.d);
    let nearVeh = allVeh.filter(x => x.d <= this.NEAR_VEH);
    const vehFallback = !nearVeh.length && allVeh.length;   // 附近真的没有时，退而给出最近的 3 个
    if (vehFallback) nearVeh = allVeh.slice(0, 3);
    const nearTer = (m.terrains || []).map(t => ({ t, d: GeoUtil.dist(t.coords, p) }))
      .filter(x => x.d <= this.NEAR_TER).sort((a, b) => a.d - b.d).slice(0, 6);

    $('#inspector').innerHTML = `
      <div class="insp-head">
        <button class="back-btn" onclick="Game.goStep(1)">← 返回跳点</button>
        <div class="insp-title">② ${g.chosen.name} · 周边情报</div>
        <div class="insp-sub">${g.chosen.type || ''} · 载具 ${Fmt.m(this.NEAR_VEH)}m 内 / 地形 ${Fmt.m(this.NEAR_TER)}m 内</div>
      </div>
      <div class="insp-body">
        <div class="row-2">
          <button class="tool-btn" onclick="MapView.focus(App.game.chosen.coords,2.4);toast('已定位到落点')">📍 定位到落点</button>
          <button class="tool-btn" data-tool="pin" onclick="Tools.set('pin')">📌 重新标点</button>
        </div>
        <button class="primary-btn" style="margin-top:10px" onclick="Game.startCircleFromStep2()">⭕ 绘制圈形（进入第 3 步）</button>
        <p class="hint">点上面的按钮会直接进入圈形设置：系统按你选的圈号自动生成对应大小的圈，拖动到实际位置后点「确定」即可。</p>
        ${vehFallback ? `<p class="hint">⚠️ ${Fmt.m(this.NEAR_VEH)}m 内没有载具刷新点，下面给出最近的 3 个（都在 1km 外，走过去风险较高）：</p>` : ''}
        ${this.vehicleBlock(nearVeh)}
        ${nearVeh.length ? '' : `<p class="hint">⚠️ 该地图上没有记录到载具刷新点。</p>`}
        <div class="section-title">🧭 找车路线建议</div>
        <div class="note-box"><p>${this.vehiclePlanText(nearVeh)}</p></div>
        <div class="section-title">🏔 落点附近地形（${Fmt.m(this.NEAR_TER)}m 内）</div>
        ${nearTer.length ? nearTer.map(({ t, d }) => `
          <div class="mini-card" data-ter="${t.id}">
            <span class="mini-ico" style="--c:${TERRAIN_CATS[t.cat].color}">${TERRAIN_CATS[t.cat].icon}</span>
            <div><b>${TERRAIN_CATS[t.cat].name} · ${t.name}</b>
            <p>${Fmt.m(d)}m · ${t.tactics.join('/')} · 风险${t.risk}</p></div>
          </div>`).join('') : `<p class="hint">落点 ${Fmt.m(this.NEAR_TER)}m 内没有标注地形，说明这一带比较开阔，进圈路上要格外注意高点。</p>`}
        <button class="primary-btn" onclick="Game.goStep(3)">下一步：圈形与进圈规划 →</button>
      </div>`;
    $$('#inspector .mini-card').forEach(c => c.onclick = () => Inspector.terrain(m.terrains.find(t => t.id === c.dataset.ter)));
    App.routes = [];
    MapView.renderOverlay();
  },

  startCircleFromStep2() {
    App.game.planPhase = App.game.planPhase || 1;
    GameSidebar.render();
    this.renderStep3();
    setTimeout(() => {
      const box = $('#circlePanel');
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('⭕ 已生成圈形，拖动圈到实际位置后点「确定」');
    }, 60);
  },

  vehicleBlock(list) {
    if (!list.length) return '';
    const groups = { '固定': [], '定期': [], '特殊': [] };
    list.forEach(x => groups[x.k].push(x));
    return Object.entries(groups).map(([k, arr]) => arr.length ? `
      <div class="section-title">${k === '固定' ? '🚗 固定刷新' : k === '定期' ? '🕐 定期刷新（概率）' : '⭐ 特殊载具（飞机 / 马 / 鹿 / 龙）'}</div>
      <div class="veh-list">${arr.map(({ v, d }) => `
        <div class="veh-row">
          <span class="veh-ico">${(VEHICLE_CATS[v.cat] || {}).icon || '🚗'}</span>
          <span class="veh-n">${v.type} ×${v.count || 1}</span>
          <span class="veh-l">${v.location}</span>
          ${v.probability ? `<span class="tag tag-${k === '固定' ? 'fixed' : k === '定期' ? 'periodic' : 'special'}">${v.probability}%</span>` : '<span class="tag tag-fixed">必刷</span>'}
          <span class="veh-d">${Fmt.m(d)}m</span>
        </div>`).join('')}</div>` : '').join('');
  },

  vehiclePlanText(list) {
    const fixed = list.filter(x => x.k === '固定');
    const peri = list.filter(x => x.k === '定期');
    if (!fixed.length && !peri.length) return '周围没有稳定的载具刷新点：要么提前飘伞进圈，要么步行贴反坡走，避免在开阔地停留。';
    const f = fixed[0] || peri[0];
    let t = `首选：向 ${Fmt.bearing(App.game.chosen.coords, f.v.coords).name} 方向移动约 ${Fmt.m(f.d)}m 拿 ${f.v.type}（${f.k}刷新）。`;
    if (peri.length && f !== peri[0]) t += ` 备选：${peri[0].v.location} 的 ${peri[0].v.type}，刷新概率 ${peri[0].v.probability}%，距离 ${Fmt.m(peri[0].d)}m。`;
    t += ' 拿到车后不要立刻原地起步，先沿背坡或建筑后侧拉开 100m 再定方向，避免在热点被扫车。';
    return t;
  },

  /* ============================== 第 3 步：圈形规划 ============================== */
  renderStep3() {
    const g = App.game;
    const rules = CIRCLE_RULES[g.circleMode];
    const phase = App.game.planPhase || g.phase || 1;
    App.game.planPhase = phase;
    const ph = rules.phases[clamp(phase, 1, 8) - 1];
    if (g.remain == null) g.remain = ph.wait;
    if (!g.compTouched) g.compSize = clamp((+g.followers || 0) + 1, 1, 4);
    const radiusPct = App.circles[phase]
      ? App.circles[phase].r
      : (App.circleEdit && App.circleEdit.phase === phase ? App.circleEdit.r : circleRadiusPct(App.mapId, phase));
    const radiusM = Math.round(radiusPct * 80);

    $('#inspector').innerHTML = `
      <div class="insp-head">
        <div class="insp-title">③ 圈形规划与进圈</div>
        <div class="insp-sub">选圈号 → 自动生成圈 → 拖动确认 → 进圈方案</div>
      </div>
      <div class="insp-body">
        <div id="circlePanel">
          <div class="section-title">① 选择要设置的圈（可 1-8 圈依次设置）</div>
          <div class="phase-row" id="phaseRow">
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `
              <button class="phase-btn${n === phase ? ' active' : ''}${App.circles[n] ? ' done' : ''}" data-phase="${n}">
                <b>${n} 圈</b><em>${App.circles[n] ? '✓ 已确定' : 'R' + circleRadiusM(App.mapId, n) + 'm'}</em>
              </button>`).join('')}
          </div>
          <div class="note-box small">
            <p>当前 <b>第 ${phase} 圈</b>，半径 <b id="radiusNote">${radiusM} 米</b>。
              <b>按住圈内拖动</b>放到实际位置，拖右侧方块可改半径。地图上只标圈号。放好后点「✅ 确定这一圈」，会自动进入下一圈继续设置。</p>
          </div>
          <div class="circle-tools">
            <button class="tool-btn" id="confirmCircle">✅ 确定第 ${phase} 圈</button>
            <button class="ghost-btn" id="resetCircle">↺ 重置本圈</button>
            <button class="ghost-btn" id="clearCircle">🗑 清除本圈</button>
          </div>
          <label class="field" style="margin-top:10px">
            <span>半径：<b id="rLabel">${radiusM} 米</b></span>
            <input type="range" id="rRange" min="10" max="2400" step="10" value="${radiusM}">
          </label>
          <div class="circle-summary">
            ${[1, 2, 3, 4, 5, 6, 7, 8].filter(n => App.circles[n]).map(n =>
      `<span class="circle-pill">${n} 圈 · ${Math.round(App.circles[n].r * 80)}m · (${App.circles[n].cx.toFixed(0)},${App.circles[n].cy.toFixed(0)})</span>`).join('') || '<span class="hint">还没有确定任何圈形</span>'}
          </div>
          <div class="row-2" style="margin-top:8px">
            <button class="ghost-btn" id="chainHint">🔗 下一圈自动落在本圈内</button>
            <button class="ghost-btn" id="clearAllCircles">全部清除</button>
          </div>
          <div class="predict-sec">
            <div class="section-title">🔮 下一圈预测</div>
            <p class="hint">基于已确定的圈（数学约束 + 地形偏好），预测下一圈最可能落在哪</p>
            <button class="primary-btn" id="predictBtn">🔮 预测第 ${Math.min(8, Math.max(...Object.keys(App.circles || {}).map(Number), 0) + 1)} 圈</button>
            <div id="predictOut">${App.prediction ? CirclePredictor.panelHTML(App.prediction) : ''}</div>
          </div>
        </div>

        <div class="section-title">② 对局信息</div>
        <div class="seg-row" id="ruleRow">
          ${Object.values(CIRCLE_RULES).map(r => `<button class="seg-btn${g.circleMode === r.id ? ' active' : ''}" data-id="${r.id}">${r.icon} ${r.name}</button>`).join('')}
        </div>
        <p class="hint">${rules.note}</p>
        <div class="grid-2">
          <label class="field"><span>当前圈号</span>
            <select id="phaseSel">${CIRCLE_RULES[g.circleMode].phases.map(p => `<option value="${p.phase}" ${p.phase === phase ? 'selected' : ''}>第 ${p.phase} 圈</option>`).join('')}</select>
          </label>
          <label class="field span2"><span>距开始缩圈（分 / 秒分别用箭头加减）</span>
            <div class="time-step2">
              <div class="ts-unit">
                <input type="number" id="minIn" min="0" max="15" value="${Math.floor(g.remain / 60)}">
                <div class="step-col">
                  <button data-unit="min" data-adj="60">▲</button>
                  <button data-unit="min" data-adj="-60">▼</button>
                </div>
                <em>分</em>
              </div>
              <div class="ts-unit">
                <input type="number" id="secIn" min="0" max="59" value="${g.remain % 60}">
                <div class="step-col">
                  <button data-unit="sec" data-adj="5">▲</button>
                  <button data-unit="sec" data-adj="-5">▼</button>
                </div>
                <em>秒</em>
              </div>
            </div>
          </label>
          <label class="field"><span>存活人数</span>
            <input type="number" id="playersIn" min="1" max="100" value="${g.players}">
          </label>
          <label class="field"><span>地图定位</span>
            <button class="tool-btn" onclick="MapView.focus(App.game.chosen.coords,2.4)">📍 定位到落点</button>
          </label>
        </div>

        <div class="section-title">③ 队伍编制</div>
        <div class="seg-row" id="compRow">
          ${[4, 3, 2, 1].map(n => `<button class="seg-btn${g.compSize === n ? ' active' : ''}" data-n="${n}">${n} 人队</button>`).join('')}
        </div>
        <div class="comp-list">
          ${(COMP_PRESETS[g.compSize] || []).map(([r, t]) => `
            <div class="comp-row"><b>${r}</b><span class="tac-chip" style="--c:${(TACTIC_ROLES[t] || {}).color || '#8fa9b8'}">${(TACTIC_ROLES[t] || {}).icon || ''} ${t}</span></div>`).join('')}
        </div>

        <button class="primary-btn" id="genPlan">🧭 生成第 ${phase} 圈进圈方案</button>
        <div id="planResult"></div>
      </div>`;
    this.bindStep3();
    if (!App.circleEdit || App.circleEdit.phase !== phase) this.ensureCircle(phase, false);
    else this.paintCircleEditor();
    MapView.renderOverlay();
    if (g.plan && g.plan.phase === phase) this.showPlan();
  },

  bindStep3() {
    const g = App.game;
    $$('#ruleRow .seg-btn').forEach(b => b.onclick = () => {
      g.circleMode = b.dataset.id;
      g.remain = CIRCLE_RULES[g.circleMode].phases[clamp(App.game.planPhase, 1, 8) - 1].wait;
      this.renderStep3();
    });
    $$('#compRow .seg-btn').forEach(b => b.onclick = () => {
      g.compSize = +b.dataset.n;
      g.compTouched = true;
      this.renderStep3();
    });
    $$('#phaseRow .phase-btn').forEach(b => b.onclick = () => {
      App.game.planPhase = +b.dataset.phase;
      App.game.phase = App.game.planPhase;
      g.remain = CIRCLE_RULES[g.circleMode].phases[clamp(App.game.planPhase, 1, 8) - 1].wait;
      this.renderStep3();
    });
    const sel = $('#phaseSel');
    if (sel) sel.onchange = (e) => {
      App.game.planPhase = +e.target.value; App.game.phase = App.game.planPhase;
      g.remain = CIRCLE_RULES[g.circleMode].phases[clamp(App.game.planPhase, 1, 8) - 1].wait;
      this.renderStep3();
    };
    this.bindTimeSteppers();
    const r = $('#rRange');
    if (r) r.oninput = () => {
      const mm = +r.value;
      this.syncRadius(mm);
      if (App.circleEdit) {
        App.circleEdit.r = mm / 80;
        if (App.circleEdit.phase > 1 && App.circles[App.circleEdit.phase - 1]) {
          this.clampInside(App.circleEdit, App.circles[App.circleEdit.phase - 1]);
        }
        this.paintCircleEditor(); MapView.renderOverlay();
      }
    };
    $('#confirmCircle').onclick = () => this.confirmCircle();
    $('#resetCircle').onclick = () => this.ensureCircle(App.game.planPhase, true);
    $('#clearCircle').onclick = () => {
      const p = App.game.planPhase;
      delete App.circles[p];
      App.circle = App.circles[p] || null;
      if (App.circleEdit && App.circleEdit.phase === p) App.circleEdit = null;
      App.prediction = null;
      this.renderStep3(); MapView.renderOverlay();
      toast(`已清除第 ${p} 圈`);
    };
    $('#chainHint').onclick = () => toast('圈形规则：下一个信号区一定完整包含在当前圈内，拖动时会被自动约束');
    $('#clearAllCircles').onclick = () => {
      App.game.phasePos = {}; App.game.teamPos = null; App.game.hudHidden = false;
    App.circles = {}; App.circle = null; App.circleEdit = null; App.prediction = null; App.congestion = null;
      this.renderStep3(); MapView.renderOverlay(); toast('已清除全部圈形');
    };
    const pb = $('#predictBtn');
    if (pb) pb.onclick = async () => {
      pb.disabled = true; pb.textContent = '⏳ 采样计算中…';
      try {
        App.prediction = await CirclePredictor.predict();
        const out = $('#predictOut');
        if (out) out.innerHTML = CirclePredictor.panelHTML(App.prediction);
        MapView.renderOverlay();
        if (App.prediction.error) toast(App.prediction.error, 'warn');
        else toast(`🔮 已生成第 ${App.prediction.nextPhase} 圈预测`);
      } catch (e) {
        console.error(e); toast('预测失败：' + e.message, 'warn');
      }
      pb.disabled = false;
      const ps = Object.keys(App.circles || {}).map(Number);
      pb.textContent = `🔮 预测第 ${Math.min(8, Math.max(...ps, 0) + 1)} 圈`;
    };
    $('#genPlan').onclick = () => this.genPlan();
  },

  syncRadius(mm) {
    const label = $('#rLabel');
    if (label) label.textContent = mm + ' 米';
    const note = $('#radiusNote');
    if (note) note.textContent = mm + ' 米';
  },

  /* 分 / 秒 双步进器：两边都能用箭头加减，改动立即同步倒计时 */
  readTime(fallback) {
    const mi = $('#minIn'), se = $('#secIn');
    if (!mi || !se) return fallback;
    return clamp((+mi.value || 0) * 60 + (+se.value || 0), 0, 900);
  },
  writeTime(sec) {
    const mi = $('#minIn'), se = $('#secIn');
    if (!mi || !se) return;
    sec = clamp(Math.round(sec), 0, 900);
    mi.value = Math.floor(sec / 60);
    se.value = sec % 60;
  },
  bindTimeSteppers() {
    const g = App.game;
    const sync = (regenerate) => {
      g.remain = this.readTime(g.remain);
      this.writeTime(g.remain);
      if (g.plan) {                       // 关掉状态就保持关掉，只同步数值
        g.plan.remain = g.remain;
        g.plan.deadline = Date.now() + g.remain * 1000;
        GameHUD.paint();
      }
      if (regenerate) { /* 输入变化不自动重算路线，避免打断操作 */ }
    };
    ['#minIn', '#secIn'].forEach(sel => {
      const el = $(sel);
      if (el) el.onchange = () => sync();
    });
    $$('.time-step2 .step-col button').forEach(b => b.onclick = () => {
      const adj = +b.dataset.adj;
      const unit = b.dataset.unit;
      if (unit === 'min') {
        const mi = $('#minIn');
        mi.value = clamp((+mi.value || 0) + adj / 60, 0, 15);
      } else {
        const se = $('#secIn');
        let v = (+se.value || 0) + adj;
        const mi = $('#minIn');
        if (v > 59) { v -= 60; mi.value = clamp((+mi.value || 0) + 1, 0, 15); }
        if (v < 0) { v += 60; mi.value = clamp((+mi.value || 0) - 1, 0, 15); }
        se.value = v;
      }
      sync();
    });
  },

  /* ------------------------ 逐圈接力：标记我方实际位置 ------------------------ */
  setPhasePos(p) {
    const g = App.game;
    const phase = g.planPhase || 1;
    g.phasePos[phase] = p;
    g.teamPos = p;
    const cur = App.circles[phase] || App.circleEdit;
    const inside = cur ? GeoUtil.dist(p, [cur.cx, cur.cy]) <= cur.r : true;
    MapView.renderOverlay();
    toast(inside
      ? `📍 已记录第 ${phase} 圈结束后我方的位置（在圈内）`
      : `📍 已记录第 ${phase} 圈结束后我方的位置（注意：这个位置在第 ${phase} 圈之外）`);

    // 自动衔接到下一圈：生成"从这个位置到下一个圈推荐站位"的方案
    const next = Math.min(8, phase + 1);
    if (next > phase) {
      g.planPhase = next; g.phase = next;
      g.remain = CIRCLE_RULES[g.circleMode].phases[next - 1].wait;
      if (!App.circles[next]) {
        this.ensureCircle(next, false);   // 自动生成（必然落在上一圈内）
      }
      this.renderStep3();
      setTimeout(() => {
        this.genPlan();
        toast(`✅ 已根据你标记的位置生成第 ${next} 圈进圈方案`);
      }, 80);
    }
  },

  /* ------------------------ 圈形编辑 ------------------------
   * 重要规则：下一个信号区一定完整包含在上一个信号区内。
   * 所有默认圈、拖动、滑杆、确定都会强制满足这条几何约束。
   * -------------------------------------------------------- */

  /* 把 child 收进 parent 内（圆完整包含），返回是否发生了修正 */
  clampInside(child, parent) {
    if (!parent || !child) return false;
    let fixed = false;
    if (child.r > parent.r * 0.92) { child.r = parent.r * 0.92; fixed = true; }
    const maxD = Math.max(0, parent.r - child.r);
    const dx = child.cx - parent.cx, dy = child.cy - parent.cy;
    const d = Math.hypot(dx, dy);
    if (d > maxD + 1e-9) {
      const k = maxD / (d || 1);
      child.cx = parent.cx + dx * k;
      child.cy = parent.cy + dy * k;
      fixed = true;
    }
    return fixed;
  },

  /* 推算下一圈：在上一个圈内部枚举圆心，选"圈内资源/掩体最多"的位置 */
  estimateNextCircle(cur, phase) {
    const rNext = circleRadiusPct(App.mapId, phase + 1);
    const maxOffset = Math.max(0, cur.r - rNext);
    const m = MAP();
    let best = { cx: cur.cx, cy: cur.cy, score: -1e9 };
    const N = 16;
    for (let i = 0; i < N; i++) {
      const ang = i / N * Math.PI * 2;
      for (const t of [0.2, 0.45, 0.7, 1.0]) {
        const cx = cur.cx + Math.cos(ang) * maxOffset * t;
        const cy = cur.cy + Math.sin(ang) * maxOffset * t;
        if (cx - rNext < 1 || cx + rNext > 99 || cy - rNext < 1 || cy + rNext > 99) continue;
        let score = 0;
        m.pois.forEach(p => {
          if (GeoUtil.dist(p.coords, [cx, cy]) <= rNext) {
            score += p.loot * 0.5 + (p.kind === 'compound' ? 7 : 0) + (p.kind === 'major' ? 5 : 0);
          }
        });
        (m.terrains || []).forEach(t2 => {
          if (GeoUtil.dist(t2.coords, [cx, cy]) <= rNext) score += 9;
        });
        score -= GeoUtil.dist([cx, cy], [50, 50]) * 0.25;   // 轻微偏向地图中心
        score += t * 0.6 - t * t * 4;                       // 位移轻微加权并做二次惩罚：内容相近时更倾向居中
        if (score > best.score) best = { cx, cy, score };
      }
    }
    return { cx: best.cx, cy: best.cy, r: rNext };
  },

  /* 改动外侧圈后，把里面所有已确定的圈重新约束一遍 */
  reclampChain(fromPhase) {
    let changed = false;
    for (let n = fromPhase + 1; n <= 8; n++) {
      if (!App.circles[n]) continue;
      const parent = App.circles[n - 1];
      if (!parent) continue;
      if (this.clampInside(App.circles[n], parent)) changed = true;
    }
    return changed;
  },

  ensureCircle(phase, force) {
    const exists = App.circles[phase];
    if (exists && !force) {
      App.circleEdit = { phase, cx: exists.cx, cy: exists.cy, r: exists.r, locked: true };
    } else {
      let cx = 50, cy = 50, r = circleRadiusPct(App.mapId, phase);
      if (phase > 1) {
        const prev = App.circles[phase - 1] ||
          (App.circleEdit && App.circleEdit.phase === phase - 1 ? App.circleEdit : null);
        if (prev) {
          const est = this.estimateNextCircle({ cx: prev.cx, cy: prev.cy, r: prev.r }, phase - 1);
          cx = est.cx; cy = est.cy; r = est.r;
        } else {
          // 上一圈还没设：先按同心圆放在地图中心，并提示
          toast('提示：第 ' + (phase - 1) + ' 圈还没设置，先按默认位置放，可以之后再回来调');
        }
      }
      App.circleEdit = { phase, cx, cy, r, locked: false };
    }
    // 强制收进上一圈
    if (phase > 1 && App.circles[phase - 1]) {
      const fixed = this.clampInside(App.circleEdit, App.circles[phase - 1]);
      if (fixed && !exists) toast('已自动把第 ' + phase + ' 圈放在第 ' + (phase - 1) + ' 圈内部');
    }
    const rr = $('#rRange');
    if (rr) { rr.value = Math.round(App.circleEdit.r * 80); this.syncRadius(Math.round(App.circleEdit.r * 80)); }
    App.circle = App.circleEdit;
    this.paintCircleEditor();
    MapView.renderOverlay();
    MapView.fitCircle(App.circleEdit);
  },

  paintCircleEditor() {
    const svg = $('#editSvg');
    const ed = App.circleEdit;
    if (!svg) return;
    if (!ed || App.mode !== 'game') { svg.innerHTML = ''; return; }
    const locked = !!App.circles[ed.phase];
    const parent = ed.phase > 1 ? App.circles[ed.phase - 1] : null;
    const px = (MapView.baseW * App.zoom) / 100 || 7;
    const hs = Math.max(2.4, 28 / px);
    const labelLeft = ed.cx + ed.r > 88;
    svg.innerHTML = `
      <circle cx="${ed.cx}" cy="${ed.cy}" r="${ed.r}" class="edit-circle${locked ? ' locked' : ''}"/>
      <circle cx="${ed.cx}" cy="${ed.cy}" r="0.9" class="edit-center"/>
      <rect x="${ed.cx + ed.r - hs / 2}" y="${ed.cy - hs / 2}" width="${hs}" height="${hs}" rx="0.35" class="edit-handle"/>
      <line x1="${ed.cx}" y1="${ed.cy}" x2="${ed.cx + ed.r}" y2="${ed.cy}" class="edit-radius"/>
      <text x="${labelLeft ? ed.cx + ed.r - hs / 2 - 0.8 : ed.cx + ed.r + hs / 2 + 0.8}" y="${ed.cy + 0.7}" class="edit-label" style="text-anchor:${labelLeft ? 'end' : 'start'}">第 ${ed.phase} 圈</text>
      ${parent ? `<text x="${parent.cx}" y="${parent.cy + parent.r + 2.2}" class="edit-label parent">必须完整落在第 ${ed.phase - 1} 圈内</text>` : ''}`;
  },

  /* 圈内拖动、手柄改半径。平移监听看到圈命中后会进这里。 */
  beginCircleDrag(mode, e) {
    const stage = MapView.stage;
    if (!stage) return;
    const apply = () => {
      const ed = App.circleEdit;
      if (!ed) return;
      if (ed.phase > 1 && App.circles[ed.phase - 1]) this.clampInside(ed, App.circles[ed.phase - 1]);
      const rr = $('#rRange');
      if (rr) { rr.value = Math.round(ed.r * 80); this.syncRadius(Math.round(ed.r * 80)); }
      this.paintCircleEditor();
      MapView.renderOverlay();
    };
    const move = (ev) => {
      const ed = App.circleEdit;
      if (!ed) return;
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 4) App.dragged = true;
      const pt = MapView.toPercent(ev.clientX, ev.clientY);
      if (mode === 'move') { ed.cx = pt[0]; ed.cy = pt[1]; }
      else ed.r = clamp(Math.hypot(pt[0] - ed.cx, pt[1] - ed.cy), 0.15, 30);
      apply();
    };
    const up = (ev) => {
      stage.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { stage.releasePointerCapture(ev.pointerId); } catch (_) { }
    };
    stage.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    try { stage.setPointerCapture(e.pointerId); } catch (_) { }
  },

  confirmCircle() {
    const ed = App.circleEdit;
    if (!ed) return;
    App.prediction = null;   // 圈形变了，旧预测作废
    const parent = ed.phase > 1 ? App.circles[ed.phase - 1] : null;
    let fixedMsg = '';
    if (parent) {
      const wasFixed = this.clampInside(ed, parent);
      if (wasFixed) fixedMsg = '（已按"下一圈必须在上一个圈内"自动贴合）';
    }
    App.circles[ed.phase] = { cx: ed.cx, cy: ed.cy, r: ed.r };
    this.reclampChain(ed.phase);
    App.circle = App.circles[ed.phase];
    const nextPhase = Math.min(8, ed.phase + 1);
    App.game.planPhase = nextPhase;
    App.game.phase = nextPhase;
    App.game.remain = CIRCLE_RULES[App.game.circleMode].phases[nextPhase - 1].wait;
    App.game.plan = null;
    this.renderStep3();
    MapView.renderOverlay();
    GameHUD.render();
    GameSidebar.render();
    toast(`✅ 第 ${ed.phase} 圈已确定${fixedMsg}${ed.phase < 8 ? `，已自动进入第 ${nextPhase} 圈` : ''}`);
  },

  /* ------------------------ 进圈方案 ------------------------ */
  genPlan() {
    const g = App.game;
    const phase = App.game.planPhase || g.phase || 1;
    if (!g.chosen) { toast('请先在第 1/2 步选一个落点或大头针'); return; }
    if (!App.circleEdit && !App.circles[phase]) { toast('请先确定当前圈的圈形'); return; }

    const readNum = (sel, fallback) => {
      const node = $(sel);
      if (!node || node.value === '') return fallback;
      return Fmt.parse(node.value, fallback);
    };
    const rules = CIRCLE_RULES[g.circleMode];
    g.remain = this.readTime(g.remain == null ? rules.phases[phase - 1].wait : g.remain);
    g.players = readNum('#playersIn', g.players || 50);

    const rule = rules.phases[phase - 1];
    const cur = App.circles[phase] || App.circleEdit;
    if (!App.circles[phase]) App.circles[phase] = { cx: cur.cx, cy: cur.cy, r: cur.r };

    // 起点：优先用"上一圈结束后标记的我方位置"，否则用落点
    const prevPos = phase > 1 ? g.phasePos[phase - 1] : null;
    const from = prevPos || g.chosen.coords;
    const startLabel = prevPos
      ? `第 ${phase - 1} 圈结束后标记的我方位置`
      : `${g.chosen.name}（落点）`;
    const inCircle = GeoUtil.dist(from, [cur.cx, cur.cy]) <= cur.r;

    let targetCircle, estFrom;
    if (App.circles[phase + 1]) {
      targetCircle = App.circles[phase + 1];
      estFrom = `你已设置的第 ${phase + 1} 圈`;
    } else {
      // 由圈形规律推算：候选圆心全部落在当前圈内部，取"圈内资源与掩体最多"的位置
      targetCircle = this.estimateNextCircle(cur, phase);
      const maxShift = Math.max(0, cur.r - targetCircle.r);
      estFrom = `圈形规律推算（圆心可在当前圈内最多移动 ${Math.round(maxShift * 80)}m，已保证完整落在当前圈内）`;
    }

    const target = { coords: [targetCircle.cx, targetCircle.cy], radius: targetCircle.r, name: '下个圈推荐站位' };
    const routes = this.genRoutes(from, cur, target, inCircle);

    g.plan = {
      phase, rule, inCircle, target, routes, selectedRouteIndex: 0,
      modeName: rules.name, dps: rule.dps, remain: g.remain,
      deadline: Date.now() + g.remain * 1000,
      estFrom, startLabel, from,
      radiusM: Math.round(cur.r * 80)
    };
    App.routes = routes;
    MapView.renderOverlay();
    this.showPlan();
    GameHUD.render();
    GameSidebar.render();
    toast(`✅ 第 ${phase} 圈进圈方案已生成`);
  },

  /* ------------------------ 路线生成（详细版） ------------------------ */
  genRoutes(from, circle, target, inCircle) {
    const m = MAP();
    const tgt = target.coords;
    const routes = [];
    const jitter = (p, seed, amt) => {
      const r = Math.sin(seed * 12.9898) * 43758.5453;
      const v = (r - Math.floor(r)) * 2 - 1;
      return [p[0] + v * amt, p[1] + v * amt];
    };
    const perp = (() => {
      const dx = tgt[0] - from[0], dy = tgt[1] - from[1];
      const L = Math.hypot(dx, dy) || 1;
      return [-dy / L, dx / L];
    })();
    const offsetPoint = (t, extra) => jitter([
      from[0] + (tgt[0] - from[0]) * t + perp[0] * extra,
      from[1] + (tgt[1] - from[1]) * t + perp[1] * extra
    ], t * 97 + extra, 1.2);
    const straight = GeoUtil.dist(from, tgt);

    const seg = (a, b, mode, extraTip) => {
      const br = Fmt.bearing(a, b);
      const d = GeoUtil.dist(a, b);
      const speed = mode === '载具' ? 19.5 : 5.8;
      return {
        text: extraTip || `向${br.name}推进`,
        dir: `${br.name} ${br.deg}°`, dist: Fmt.m(d), mode,
        time: Math.round(d * 80 / speed)
      };
    };

    /* ---------- 路线 1：快速路线 ---------- */
    const vs = [...(m.vehicles.fixed || []).map(v => ({ v, k: '固定' })),
    ...(m.vehicles.periodic || []).map(v => ({ v, k: '定期' }))]
      .filter(x => x.v.coords.length)
      .map(x => ({ ...x, d: GeoUtil.dist(x.v.coords, from), corridor: GeoUtil.distToSegment(x.v.coords, from, tgt) }))
      .filter(x => (x.corridor < 16 && x.d < 32) || (straight > 16 && x.d < 40))
      .sort((a, b) => (a.d + a.corridor * 1.6) - (b.d + b.corridor * 1.6));
    const carStop = vs[0];
    const fastPath = carStop ? [from, carStop.v.coords, tgt] : [from, tgt];
    const fastSegments = carStop ? [
      Object.assign(seg(from, carStop.v.coords, '步行', `去 ${carStop.v.location} 找 ${carStop.v.type}（含 12 秒取车）`),
        { time: Math.round(GeoUtil.dist(from, carStop.v.coords) * 80 / 5.8) + 12 }),
      seg(carStop.v.coords, tgt, '载具', `直插 ${target.name}`)
    ] : [seg(from, tgt, '步行', `徒步前往 ${target.name}`)];
    routes.push({
      name: '快速路线', short: '快速', color: '#ece8e1', path: fastPath,
      safety: clamp(58 + (carStop ? 6 : -8), 30, 90), loot: 45,
      segments: fastSegments.concat([{ text: '到位后检查掩体并占位', dir: '—', dist: '0m', mode: '占位', time: 8 }]),
      notes: [
        carStop ? `参考 ${carStop.v.location} 的 ${carStop.v.type}（${carStop.k}刷新，${Fmt.m(carStop.d)}m）；请现场确认有车` : '附近没有合适的参考载具点，当前按步行估时',
        '折线只表示转移思路；过河、绕山与道路情况需要自行核对',
        inCircle ? '当前位置在输入圈内，仍需根据所选路线预留出发时间' : '当前位置在输入圈外，优先评估转移与补给'
      ]
    });

    /* ---------- 路线 2：安全路线 ---------- */
    const hot = m.pois.filter(p => p.density >= 65 && GeoUtil.distToSegment(p.coords, from, tgt) < 12)
      .sort((a, b) => b.density - a.density)[0];
    let side = 1;
    if (hot) side = GeoUtil.dist(hot.coords, offsetPoint(0.5, 1)) < GeoUtil.dist(hot.coords, offsetPoint(0.5, -1)) ? -1 : 1;
    const cover = (m.terrains || []).filter(t =>
      ['reverseSlope', 'pit', 'hiddenSpot', 'relativeHigh', 'bridge', 'bunker'].includes(t.cat) &&
      GeoUtil.distToSegment(t.coords, from, tgt) < 16)
      .map(t => ({ t, proj: this.projT(t.coords, from, tgt) })).sort((a, b) => a.proj - b.proj);
    const safePath = [from];
    [0.3, 0.62].forEach((t, i) => {
      const cp = cover.find(c => Math.abs(c.proj - t) < 0.2);
      if (cp) safePath.push(jitter(cp.t.coords, i + 5, 0.6));
      else safePath.push(offsetPoint(t, side * (6 + i * 2)));
    });
    safePath.push(tgt);
    routes.push({
      name: '安全路线', short: '安全', color: '#3ecf8e', path: safePath,
      safety: clamp(84 + Math.min(cover.length, 6) * 2, 60, 96), loot: 55,
      segments: safePath.slice(1).map((p, i) => {
        const prev = safePath[i];
        const cv = cover.find(c => GeoUtil.dist(c.t.coords, p) < 3);
        return seg(prev, p, '步行', cv ? `借 ${TERRAIN_CATS[cv.t.cat].name}（${cv.t.name}）低姿态通过` : `贴边绕行，避开 ${hot ? hot.name : '开阔地'}`);
      }).concat([{ text: `抵达 ${target.name}，观察 20 秒后占位`, dir: '—', dist: '0m', mode: '观察 / 占位', time: 28 }]),
      notes: [
        hot ? `尝试绕开 ${hot.name}（静态密度 ${hot.density}），实际路线需自行确认` : '参考走廊内未标出高密度城区，仍需观察敌情',
        cover.length ? `途经掩体：${cover.slice(0, 4).map(c => TERRAIN_CATS[c.t.cat].name).join(' / ')}，可随时停下观察` : '沿途掩体较少，注意保持低姿态',
        '以掩体与绕行为优先的示意思路，参考分不代表真实安全程度或胜率'
      ]
    });

    /* ---------- 路线 3：资源路线 ---------- */
    const lootStops = m.pois.filter(p => p.loot >= 76 && p.density < 72 && GeoUtil.distToSegment(p.coords, from, tgt) < 14)
      .map(p => ({ p, proj: this.projT(p.coords, from, tgt) }))
      .filter(x => x.proj > 0.12 && x.proj < 0.9)
      .sort((a, b) => b.p.loot - a.p.loot).slice(0, 2)
      .sort((a, b) => a.proj - b.proj);
    const lootPath = [from, ...lootStops.map(x => x.p.coords), tgt];
    const lootSegments = lootPath.slice(1).map((p, i) => {
      const stop = lootStops[i];
      const step = seg(lootPath[i], p, '步行', stop
        ? `转进 ${stop.p.name} 搜刮（含 45 秒搜索；资源 ${stop.p.loot} / 密度 ${stop.p.density}）`
        : `前往 ${target.name}`);
      if (stop) step.time += 45;
      return step;
    });
    routes.push({
      name: '资源路线', short: '资源', color: '#f5a524', path: lootPath,
      safety: clamp(66 - lootStops.length * 4, 35, 85), loot: clamp(70 + lootStops.length * 12, 40, 98),
      segments: lootSegments.concat([{ text: '抵达后检查掩体并占位', dir: '—', dist: '0m', mode: '占位', time: 8 }]),
      notes: [
        lootStops.length ? `途经资源点：${lootStops.map(x => `${x.p.name}（${x.p.loot}）`).join('、')}` : '沿途资源点不多，收益有限',
        '每处停留不超过 45 秒，搜到枪/甲/药就走',
        '适合 1-2 圈与顺风局；圈外伤害变高以后不要选这条'
      ]
    });

    // 总时长始终来自界面列出的分段，包含取车、搜索、观察和占位。
    routes.forEach(route => { route.time = route.segments.reduce((sum, step) => sum + step.time, 0); });
    return routes;
  },

  projT(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy || 1;
    return clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1);
  },
  pathLen(path) {
    let s = 0;
    for (let i = 1; i < path.length; i++) s += GeoUtil.dist(path[i - 1], path[i]);
    return s;
  },

  selectedRoute(plan = App.game.plan) {
    if (!plan || !plan.routes || !plan.routes.length) return null;
    const index = Number.isInteger(plan.selectedRouteIndex) && plan.selectedRouteIndex >= 0
      && plan.selectedRouteIndex < plan.routes.length ? plan.selectedRouteIndex : 0;
    return plan.routes[index];
  },

  departureAdvice(plan, remain) {
    const route = this.selectedRoute(plan);
    if (!route) return '请先生成示意路线。';
    const buffer = 12;
    const leaveIn = remain - route.time - buffer;
    if (remain === 0) return `按已选的${route.name}，进圈估计需要 <b>${Fmt.zhDur(route.time)}</b>。这是计划圈，不会自动缩小。`;
    if (leaveIn > 25) return `按${route.name}，<b class="ok">建议 ${Fmt.mmss(leaveIn)} 后出发</b>，已预留 ${buffer} 秒额外缓冲。地形与敌情可能增加耗时。`;
    if (leaveIn > 0) return `<b class="warn">${Fmt.mmss(leaveIn)} 后应出发</b>：${route.name}估计需要 ${Fmt.mmss(route.time)}，已预留 ${buffer} 秒额外缓冲。`;
    return `<b class="danger">建议立刻出发</b>：按${route.name}已比参考出发时间晚 ${Fmt.mmss(-leaveIn)}。参考圈外伤害 ${plan.dps}/s，转移时留意补给。`;
  },

  showPlan() {
    const g = App.game, plan = g.plan;
    if (!plan) return;
    const box = $('#planResult');
    if (!box) return;
    const selected = this.selectedRoute(plan);
    if (!selected) return;
    plan.selectedRouteIndex = plan.routes.indexOf(selected);
    const remain = Number.isFinite(plan.deadline)
      ? Math.max(0, Math.round((plan.deadline - Date.now()) / 1000)) : plan.remain;
    const advice = this.departureAdvice(plan, remain);

    box.innerHTML = `
      <div class="plan-head ${plan.inCircle ? 'in' : 'out'}">
        <div class="plan-state">${plan.inCircle ? '✅ 当前位置在圈内' : '⚠️ 当前位置在圈外'}</div>
        <div class="plan-meta">${plan.modeName} · 第 ${plan.phase} 圈（半径约 ${plan.radiusM}m）· 距开始缩圈 <b id="planClock">${Fmt.mmss(remain)}</b></div>
      </div>
      <div class="start-box">
        <span>起点：<b>${plan.startLabel}</b></span>
        <button class="ghost-btn mini" onclick="MapView.focus(App.game.plan.from,2.4)">📍 定位起点</button>
        <button class="tool-btn mini" onclick="Tools.set('markpos')">📌 标记第 ${plan.phase} 圈结束后我方位置</button>
      </div>
      <div class="note-box advice">
        <div class="note-title">⏱ 何时进圈</div>
        <p id="planAdvice">${advice}</p>
        <p class="dim">本圈规则：等待 ${Fmt.mmss(plan.rule.wait)} → 缩圈 ${Fmt.mmss(plan.rule.shrink)} → 圈外 ${plan.rule.dps}/s；
          下一圈半径约 ${Math.round(plan.target.radius * 80)}m。</p>
      </div>
      <div class="section-title">🎯 下个圈推荐站位</div>
      <p class="hint">来源：${plan.estFrom}${plan.matchScore ? ` · 相似度 ${plan.matchScore}%` : ''}<br>
        预估中心 ${CirclePredictor.placeNear(plan.target.coords[0], plan.target.coords[1])} · 半径约 ${Math.round(plan.target.radius * 80)} 米
        <button class="ghost-btn mini" onclick="MapView.focus(App.game.plan.target.coords,2.6)">📍 定位</button></p>

      <div class="section-title">🛣 示意路线（点选后同步出发提醒）</div>
      <p class="hint route-disclaimer">路线连接参考点位，未校验道路、河流、山体和敌人位置。时间按步行 5.8m/s、载具 19.5m/s 估算，需结合实际地形调整；安全与资源为模型参考分。</p>
      ${plan.routes.map((r, i) => `
        <div class="route-card${i === plan.selectedRouteIndex ? ' active' : ''}" data-i="${i}" style="--c:${r.color}">
          <div class="route-top">
            <b>${r.name}</b>
            <span class="route-time">⏱ ${Fmt.mmss(r.time)}</span>
            <span class="route-tag">${Fmt.m(this.pathLen(r.path))}m</span>
          </div>
          <div class="rec-bars">
            ${[['安全参考分', r.safety, '#3ecf8e'], ['资源参考分', r.loot, '#f5a524']]
        .map(([n, v, c]) => `<div class="mini-meter"><span>${n}</span><i><b style="width:${v}%;background:${c}"></b></i><em>${v}</em></div>`).join('')}
          </div>
          <div class="seg-title">分段估时（共 ${r.segments.length} 步；地图数字标出沿途节点）</div>
          <ol class="seg-list">
            ${r.segments.map((s, si) => `
              <li>
                <span class="seg-i">${si + 1}</span>
                <div class="seg-body">
                  <b>${s.text}</b>
                  <em>${s.dir} · ${s.dist} · ${s.mode} · 约 ${Fmt.mmss(s.time)}</em>
                </div>
              </li>`).join('')}
          </ol>
          <ul class="tip-list small">${r.notes.map(n => `<li>${n}</li>`).join('')}</ul>
          <button class="ghost-btn wide" onclick="MapView.focus([${r.path[0][0]},${r.path[0][1]}],2.2)">📍 在地图上定位这条路</button>
        </div>`).join('')}
      <button class="primary-btn" onclick="Game.goStep(4)">下一步：战斗攻略与转移要点 →</button>`;

    $$('#planResult .route-card').forEach(c => c.onclick = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const i = +c.dataset.i;
      plan.selectedRouteIndex = i;
      this.showPlan();
      GameHUD.render();
    });
    App.routes = plan.routes;
    App.routes.forEach((r, i) => r.visible = i === plan.selectedRouteIndex);
    MapView.renderOverlay();
  },

  /* ============================== 第 4 步 ============================== */
  renderStep4() {
    const g = App.game, m = MAP();
    if (!g.chosen) {
      $('#inspector').innerHTML = `<div class="insp-head"><div class="insp-title">④ 战斗攻略</div><div class="insp-sub">请先选择落点</div></div>
        <div class="insp-body"><button class="primary-btn" onclick="Game.goStep(1)">去选跳点</button></div>`;
      return;
    }
    const p = g.chosen.coords;
    const roles = COMP_PRESETS[g.compSize] || COMP_PRESETS[4];
    const nearTer = (m.terrains || []).map(t => ({ t, d: GeoUtil.dist(t.coords, p) }))
      .filter(x => x.d <= 12).sort((a, b) => a.d - b.d).slice(0, 6);
    const vehRec = this.recommendVehicles(p, g);
    const route = this.selectedRoute();

    $('#inspector').innerHTML = `
      <div class="insp-head">
        <button class="back-btn" onclick="Game.goStep(3)">← 返回进圈</button>
        <div class="insp-title">④ ${g.chosen.name} · 战斗攻略</div>
        <div class="insp-sub">${m.name} · ${g.compSize} 人编制</div>
      </div>
      <div class="insp-body">
        ${route ? `<div class="note-box"><div class="note-title">当前转移方案</div><p>${route.name} · 估计 ${Fmt.zhDur(route.time)}（示意）</p><p class="hint">地图与缩圈提醒继续使用这条路线；可返回第 3 步切换。</p></div>` : ''}
        <button class="tool-btn wide" onclick="MapView.focus(App.game.chosen.coords,2.6)">📍 在地图上定位落点</button>
        <div class="section-title">🎭 分工（四人队标准站位）</div>
        <div class="role-grid">
          ${roles.map(([r, t]) => {
      const td = TACTIC_ROLES[t];
      return `<div class="role-card" style="--c:${td.color}">
              <div class="role-head"><b>${r}</b><span>${td.icon} ${t}</span></div>
              <p>${td.desc}</p>
              <div class="role-foot">装备：${td.equip.join(' / ')}</div>
              <div class="role-key">${td.key}</div>
            </div>`;
    }).join('')}
        </div>

        <div class="section-title">🚗 推荐载具配置</div>
        <div class="veh-rec">
          ${vehRec.map(v => `<div class="veh-rec-row"><span>${v.icon}</span><div><b>${v.title}</b><p>${v.desc}</p></div></div>`).join('')}
        </div>

        <div class="section-title">🏔 关键地形（${Fmt.m(12)}m 内）</div>
        ${nearTer.length ? nearTer.map(({ t, d }) => `
          <div class="mini-card" data-ter="${t.id}">
            <span class="mini-ico" style="--c:${TERRAIN_CATS[t.cat].color}">${TERRAIN_CATS[t.cat].icon}</span>
            <div><b>${TERRAIN_CATS[t.cat].name} · ${t.name}</b>
            <p>${Fmt.m(d)}m · ${t.tactics.join('/')} · 风险${t.risk}</p></div>
          </div>`).join('') : '<p class="hint">附近没有标注地形，说明这一带偏开阔，注意高点。</p>'}

        <div class="section-title">🧭 进圈与转移要点</div>
        <div class="note-box">
          <ul class="tip-list small">
            ${this.insightLines(p).map(x => `<li>${x}</li>`).join('')}
          </ul>
        </div>
      </div>`;

    $$('#inspector .mini-card').forEach(c => c.onclick = () => Inspector.terrain(m.terrains.find(t => t.id === c.dataset.ter)));
    if (g.plan) {
      App.routes = g.plan.routes;
      App.routes.forEach(r => r.visible = r === route);
    }
    MapView.renderOverlay();
  },

  /* 依据数据自动生成的进圈与转移要点 */
  insightLines(p) {
    const m = MAP();
    const out = [];
    const veh = this.vehNear(p, 12);
    const clusters = this.clustersNear(p, 14);
    const ter = (m.terrains || []).map(t => ({ t, d: GeoUtil.dist(t.coords, p) }))
      .filter(x => x.d <= 12).sort((a, b) => a.d - b.d);
    if (veh.bestFixed) out.push(`固定载具：${veh.bestFixed.v.type} 在 ${Fmt.m(veh.bestFixed.d)} 米处（${veh.bestFixed.v.location}），转移前先把车停到背坡。`);
    else if (veh.best) out.push(`附近没有固定载具点，最近的 ${veh.best.v.type} 在 ${Fmt.m(veh.best.d)} 米（${veh.best.k}刷新），要提前规划步行路线。`);
    else out.push('这一带没有任何载具刷新点，进圈只能靠步行或飘伞，务必提前出发。');
    if (clusters.length) {
      const shown = clusters.slice(0, 3);
      const head = clusters.length > shown.length
        ? `附近 ${clusters.length} 个房群，先去这 ${shown.length} 个：${shown.map(c => c.p.name).join('、')}`
        : `附近 ${clusters.length} 个房群可轮转：${shown.map(c => c.p.name).join('、')}`;
      out.push(head + '，搜完一处直接转下一处，不要在同一个点停太久。');
    }
    if (ter.length) out.push(`最近掩体：${ter.slice(0, 2).map(x => TERRAIN_CATS[x.t.cat].name + '·' + x.t.name).join('、')}，打架或躲枪线优先往这里走。`);
    const big = m.pois.filter(x => x.kind !== 'compound' && x.density >= 70 && GeoUtil.dist(x.coords, p) < 18)
      .sort((a, b) => GeoUtil.dist(a.coords, p) - GeoUtil.dist(b.coords, p))[0];
    if (big) out.push(`注意高密度区「${big.name}」在 ${Fmt.m(GeoUtil.dist(big.coords, p))} 米处，转移路线尽量绕开它。`);
    out.push('圈形规则：下一个信号区一定完整包含在当前圈内，圈心最多只会移动「当前圈半径 − 下一圈半径」的距离。');
    return out;
  },

  recommendVehicles(p, g) {
    const m = MAP();
    const out = [];
    const n = g.compSize;
    const coastal = p[0] < 12 || p[0] > 88 || p[1] < 12 || p[1] > 88 ||
      (m.terrains || []).some(t => ['waterEdge', 'island', 'bridge'].includes(t.cat) && GeoUtil.dist(t.coords, p) < 10);
    if (n >= 4) {
      out.push({ icon: '🚙', title: '主力车 ×1：吉普车 / 轿车', desc: '四人整队一台车，机动性与防护兼顾。停车永远停背坡或建筑背面，车头朝撤离方向。' });
      out.push({ icon: '🛻', title: '备用车 ×1：皮卡 / 蹦蹦', desc: '分车转移或爆车后的应急方案。3 圈以后建议分两台车走，前后间隔 50 米。' });
    } else if (n === 3) {
      out.push({ icon: '🚙', title: '主力车 ×1：吉普车 / 皮卡', desc: '三人一车刚好，留一个位置用于载人或救人。' });
    } else if (n === 2) {
      out.push({ icon: '🛺', title: '轻便车 ×1：蹦蹦 / 双人摩托', desc: '双人队追求速度和隐蔽，目标小、油耗低，但被打中容易爆，避免走公路主干。' });
    } else {
      out.push({ icon: '🏍', title: '单人：双人摩托', desc: '独狼最忌讳停在原地，摩托车是最快的转移工具，但噪声会暴露位置。' });
    }
    if (coastal) out.push({ icon: '🚤', title: '水路备选：快艇 ×1', desc: '落点靠水，圈切沿海时水路比陆路安全得多，可以绕开桥头卡点。' });
    if (g.plan && g.plan.phase >= 4) out.push({ icon: '⛽', title: '注意油量', desc: `${g.plan.phase} 圈之后转移距离变长，出发前把油加满。` });
    if (m.terrains.some(t => t.cat === 'absoluteHigh' && GeoUtil.dist(t.coords, p) < 18)) {
      out.push({ icon: '🚁', title: '紧急呼救器', desc: '附近有绝对制高点：可用呼救器直接上山顶或楼顶抢圈中心（电竞模式/比赛服屏蔽该道具）。' });
    }
    if (g.circleMode === 'esports' && m.id === 'rongdu') {
      out.push({ icon: '📡', title: '荣都召回基站', desc: '荣都开启召回基站：航班每 150 秒一班、每人仅 1 次被召回机会。倒人后先判断能否在基站附近接战，否则优先脱离。' });
    }
    if (g.circleMode === 'esports') {
      out.push({ icon: '📦', title: '物资与空投', desc: '电竞模式物资总量为经典的 130%，节奏更快；空投只掉一把武器，抢空投的收益通常低于抢圈中心。' });
    }
    return out;
  },

  fmt(s) { return Fmt.mmss(s); }
};

/* ====================== 方案卡导出（PlanCard）======================
 * 把当前局面画成一张 1080×1500 的 PNG：底图缩略 + 航线 + 圈形 +
 * 预测候选区 + 关键信息（打法/落点/圈形/预测/职业要点）+ 分享链接。
 * ================================================================== */
/* ====================== 方案卡导出（PlanCard · 沙盘志版式）======================
 * F 方向「民国书衣」专属版式：土黄纸 + 墨黑 + 朱红一处，外双线框，
 * 竖排题签，地图做旧裱框，文言批注。主站为 C「信号圈」皮肤——
 * 两种身份：工具是"作战台"，发给队友的卡是"兵书"。
 * ============================================================================== */
const PlanCard = {
  async export() {
    const m = MAP(), g = App.game;
    const hasStuff = App.flight || Object.keys(App.circles || {}).length || g.chosen || App.pin;
    if (!hasStuff) { toast('先画点内容再导出：航线 / 圈形 / 选点', 'warn'); return; }

    const img = await new Promise(res => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = () => res(null);
      i.src = m.image;
    });
    if (!img) { toast('底图加载失败，稍后再试', 'warn'); return; }

    const W = 1080, H = 1500;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const PAPER = '#cdc2a5', PAPER_LT = '#e8e0cc', INK = '#2a2418', INK2 = '#5a5138', SEAL = '#b03a2e';
    const SERIF = '"Noto Serif SC", serif';

    // 纸底 + 细纹
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(42,36,24,.025)';
    for (let ty = 0; ty < H; ty += 3) x.fillRect(0, ty, W, 1);

    // 外双线框
    x.strokeStyle = INK; x.lineWidth = 3; x.strokeRect(16, 16, W - 32, H - 32);
    x.lineWidth = 1; x.strokeRect(24, 24, W - 48, H - 48);

    // 竖排题签
    const lx = 52, ly = 60, lw = 54, lh = 300;
    x.fillStyle = PAPER_LT; x.fillRect(lx, ly, lw, lh);
    x.strokeStyle = INK; x.lineWidth = 1.5; x.strokeRect(lx, ly, lw, lh);
    x.fillStyle = INK; x.font = '700 44px ' + SERIF; x.textAlign = 'center';
    ['沙', '盘', '志'].forEach((ch, i) => x.fillText(ch, lx + lw / 2, ly + 62 + i * 76));
    x.textAlign = 'left';
    // 题签侧注
    x.save(); x.translate(lx + lw + 26, ly + 10);
    x.font = '400 20px ' + SERIF; x.fillStyle = INK2;
    const sideTxt = '兵要地志 · ' + m.name + '卷';
    for (let i = 0; i < sideTxt.length; i++) x.fillText(sideTxt[i], (i % 2) * 24, 24 + Math.floor(i / 2) * 26);
    x.restore();

    // 日轮（右上装饰）
    x.strokeStyle = INK; x.lineWidth = 2.5;
    x.beginPath(); x.arc(W - 130, 118, 40, 0, 7); x.stroke();
    x.fillStyle = SEAL; x.globalAlpha = .88;
    x.beginPath(); x.arc(W - 130, 118, 28, 0, 7); x.fill();
    x.globalAlpha = 1;

    // 地图裱框（做旧）
    const mx = 60, my = 400, mw = W - 120, mh = 760;
    x.fillStyle = PAPER_LT; x.fillRect(mx - 10, my - 10, mw + 20, mh + 20);
    x.strokeStyle = INK; x.lineWidth = 1.5; x.strokeRect(mx - 10, my - 10, mw + 20, mh + 20);
    x.save();
    x.filter = 'sepia(.28) saturate(.82) contrast(.96)';
    const ar2 = img.naturalWidth / img.naturalHeight;
    let dw = mw, dh = mw / ar2; if (dh > mh) { dh = mh; dw = mh * ar2; }
    x.drawImage(img, mx + (mw - dw) / 2, my + (mh - dh) / 2, dw, dh);
    x.restore();
    x.strokeStyle = INK; x.lineWidth = 1; x.strokeRect(mx + (mw - dw) / 2, my + (mh - dh) / 2, dw, dh);
    const ox = mx + (mw - dw) / 2, oy = my + (mh - dh) / 2;
    const P = pt => [ox + pt[0] / 100 * dw, oy + pt[1] / 100 * dh];

    // 航线（墨线）
    if (App.flight && App.flight.start && App.flight.end) {
      const f1 = P(App.flight.start), f2 = P(App.flight.end);
      x.strokeStyle = INK; x.lineWidth = 3.5;
      x.beginPath(); x.moveTo(f1[0], f1[1]); x.lineTo(f2[0], f2[1]); x.stroke();
      x.fillStyle = INK;
      x.beginPath(); x.arc(f1[0], f1[1], 6, 0, 7); x.fill();
      x.beginPath(); x.arc(f2[0], f2[1], 6, 0, 7); x.fill();
    }
    // 圈形（墨圈，最后一圈朱红）
    const cphases = Object.keys(App.circles || {}).map(Number).sort((a, b) => a - b);
    const lastPh = cphases.length ? cphases[cphases.length - 1] : 0;
    cphases.forEach(n => {
      const cc = App.circles[n], pp = P([cc.cx, cc.cy]);
      x.strokeStyle = n === lastPh ? SEAL : INK2; x.lineWidth = n === lastPh ? 3.5 : 2.5;
      x.setLineDash(n === 1 ? [] : [9, 6]);
      x.beginPath(); x.arc(pp[0], pp[1], cc.r / 100 * dw, 0, 7); x.stroke();
      x.setLineDash([]);
      x.fillStyle = n === lastPh ? SEAL : INK2; x.font = '700 20px ' + SERIF;
      x.fillText(n + '圈', pp[0] + cc.r / 100 * dw + 5, pp[1] - 5);
    });
    // 预测候选区（朱红虚圈）
    if (App.prediction && App.prediction.top && !App.prediction.error) {
      App.prediction.top.forEach(z => {
        const pp = P([z.cx, z.cy]);
        x.strokeStyle = z.rank === 1 ? SEAL : 'rgba(90,81,56,.7)';
        x.lineWidth = z.rank === 1 ? 3 : 2; x.setLineDash([7, 5]);
        x.beginPath(); x.arc(pp[0], pp[1], App.prediction.rNext / 100 * dw, 0, 7); x.stroke();
        x.setLineDash([]);
        if (z.rank === 1) {
          x.fillStyle = SEAL; x.font = '700 22px ' + SERIF;
          x.fillText('候选区一 · 权重 ' + Math.round(z.prob * 100) + '%', pp[0] - 60, pp[1] - App.prediction.rNext / 100 * dw - 10);
        }
      });
    }
    // 选点（朱点）
    const pinPt = g.chosen ? g.chosen.coords : (App.pin ? App.pin.coords : null);
    if (pinPt) {
      const pp = P(pinPt);
      x.fillStyle = SEAL;
      x.beginPath(); x.arc(pp[0], pp[1], 8, 0, 7); x.fill();
      x.strokeStyle = 'rgba(176,58,46,.3)'; x.lineWidth = 3;
      x.beginPath(); x.arc(pp[0], pp[1], 13, 0, 7); x.stroke();
      x.fillStyle = INK; x.font = '700 22px ' + SERIF;
      x.fillText(g.chosen ? g.chosen.name : '选点', pp[0] + 18, pp[1] + 7);
    }

    // 批注区（文言）
    let iy = my + mh + 74;
    const note = (label, val) => {
      x.fillStyle = INK; x.font = '700 24px ' + SERIF; x.fillText(label, 60, iy);
      x.fillStyle = INK2; x.font = '500 23px ' + SERIF;
      x.fillText(String(val).slice(0, 32), 190, iy);
      iy += 46;
    };
    const styleName = (LANDING_STYLES.find(t => t.id === g.style) || {}).name || '未定';
    const numCN = ['零', '一', '二', '三', '四', '五', '六', '七', '八'];
    note('打法', styleName);
    note('落点', g.chosen ? g.chosen.name : (App.pin ? '自择之点' : '未定'));
    note('圈形', cphases.length ? '已定' + numCN[cphases.length] + '圈，末圈半径约' + Math.round(App.circles[lastPh].r * 80) + '米' : '未定');
    if (App.prediction && !App.prediction.error && App.prediction.hold) {
      note('推演', '候选权重 ' + Math.round((App.prediction.top[0].prob || 0) * 100) + '%，参考占位：' + App.prediction.hold.name);
    }
    note('说明', '启发式推演，未经实际命中率校准');

    // 底部：日期 + 朱印（旋转）
    x.fillStyle = INK2; x.font = '400 19px ' + SERIF;
    x.fillText('沙盘志编辑部 · ' + new Date().toLocaleDateString('zh-CN') + ' · 玩家自制，与官方无涉', 60, H - 56);
    x.save();
    x.translate(W - 150, H - 120); x.rotate(-0.12);
    x.strokeStyle = SEAL; x.lineWidth = 2.5;
    x.beginPath(); x.arc(38, 38, 36, 0, 7); x.stroke();
    x.fillStyle = SEAL; x.font = '700 24px ' + SERIF; x.textAlign = 'center';
    x.fillText('非', 38, 32); x.fillText('官', 38, 62);
    x.textAlign = 'left';
    x.restore();

    const a = document.createElement('a');
    const day = new Date();
    const p2 = n => String(n).padStart(2, '0');
    a.download = '沙盘志-' + m.name + '-' + day.getFullYear() + '-' + p2(day.getMonth() + 1) + '-' + p2(day.getDate()) + '.png';
    a.href = c.toDataURL('image/png');
    a.click();
    toast('📜 沙盘志方案卡已生成');
  }
};

/* ============================ 游戏模式侧边栏 ============================ */
const GameSidebar = {
  render() {
    const g = App.game, m = MAP();
    const circleCount = Object.keys(App.circles || {}).length;
    const steps = [
      { n: 1, t: '落地打法与跳点', s: g.recommend.length ? `已生成 ${g.recommend.length} 个推荐点` : (g.style ? '已选打法，待计算' : '未开始') },
      { n: 2, t: '选点与载具', s: g.chosen ? `已选：${g.chosen.name}` : '未选点' },
      { n: 3, t: '圈形与进圈', s: circleCount ? `已确定 ${circleCount} 个圈${g.plan ? ' · 已出方案' : ''}` : '未设置圈形' },
      { n: 4, t: '战斗攻略', s: g.chosen ? '可查看分工与载具' : '未选点' }
    ];
    $('#sidebar').innerHTML = `
      <div class="side-sec">
        <div class="side-title">🎮 对局流程</div>
        ${steps.map(s => `
          <button class="step-row" data-step="${s.n}">
            <span class="step-n">${s.n}</span>
            <span class="step-body"><b>${s.t}</b><em>${s.s}</em></span>
          </button>`).join('')}
        <button class="exit-game-btn" id="exitGame">🚪 退出游戏模式</button>
      </div>
      <div class="side-sec">
        <div class="side-title">📌 对局信息</div>
        <div class="kv-list">
          <div class="kv"><span>地图</span><b>${m.name}</b></div>
          <div class="kv"><span>打法</span><b>${(LANDING_STYLES.find(x => x.id === g.style) || {}).name || '—'}</b></div>
          <div class="kv"><span>跟跳</span><b>${g.followers} 人</b></div>
          <div class="kv"><span>落点</span><b>${g.chosen ? g.chosen.name : '—'}</b></div>
          <div class="kv"><span>赛制</span><b>${CIRCLE_RULES[g.circleMode].name}</b></div>
          <div class="kv"><span>当前圈</span><b>第 ${App.game.planPhase || g.phase} 圈</b></div>
          <div class="kv"><span>已设圈形</span><b>${circleCount} 个</b></div>
          <div class="kv"><span>存活</span><b>${g.players} 人</b></div>
        </div>
      </div>
      <div class="side-sec">
        <div class="side-title">🗂 情报图层</div>
        ${LayerPresets.html()}
        ${[['pois', '主要点位'], ['density', '人口密度热区'], ['vehFixed', '固定载具点'], ['vehPeriodic', '定期载具点'], ['vehSpecial', '特殊载具点'], ['fav', '★ 我的收藏']]
        .map(([k, n]) => `<label class="layer-row"><input type="checkbox" data-layer="${k}" ${App.layers[k] ? 'checked' : ''}><span>${n}</span></label>`).join('')}
        <label class="layer-row"><input type="checkbox" data-terall ${Object.values(App.layers.terrain).every(Boolean) ? 'checked' : ''}><span>全部地形标注</span></label>
      </div>
      <div class="side-sec">
        <div class="side-title">⚡ 快捷操作</div>
        <button class="side-link" onclick="Tools.set('flight')">✈️ 绘制航线</button>
        <button class="side-link" onclick="Game.goStep(3)">⭕ 圈形设置</button>
        <button class="side-link" onclick="Tools.set('pin')">📌 大头针标点</button>
        <button class="side-link" onclick="App.routes=[];MapView.renderOverlay();toast('已清除路线')">🧹 清除路线</button>
        <button class="side-link pb-entry" onclick="Game.renderPro()">📖 职业运营手册</button>
        <button class="side-link pb-entry" onclick="Game.renderReplays()">📋 对局复盘</button>
        <button class="side-link pb-entry" onclick="ShareLink.copy()">📤 复制分享链接</button>
        <button class="side-link pb-entry" onclick="PlanCard.export()">📜 沙盘志方案卡</button>
        ${Pins.unassigned().length ? `<button class="side-link" onclick="Inspector.legacyPins()">★ 待归类收藏 · ${Pins.unassigned().length}</button>` : ''}
      </div>`;
    $$('#sidebar [data-step]').forEach(b => b.onclick = () => Game.goStep(+b.dataset.step));
    LayerPresets.bind();
    $$('#sidebar [data-layer]').forEach(i => i.onchange = () => { App.layers[i.dataset.layer] = i.checked; LayerPresets.sync(); MapView.renderAll(); });
    const all = $('#sidebar [data-terall]');
    if (all) all.onchange = () => {
      Object.keys(TERRAIN_CATS).forEach(k => App.layers.terrain[k] = all.checked);
      LayerPresets.sync();
      MapView.renderAll();
    };
    $('#exitGame').onclick = () => exitGameMode();
  }
};

/* 明确的"退出游戏模式"按钮 */
function exitGameMode() {
  App.tool = 'pan';
  App.circleEdit = null;
  App.game.plan = null;
  App.routes = [];
  const svg = $('#editSvg'); if (svg) svg.innerHTML = '';
  setMode('info');
  MapView.renderAll();
  toast('已退出游戏模式，回到情报模式');
}

/* ============================ 地图 HUD（缩圈倒计时） ============================
 * 关键点：DOM 只构建一次，倒计时只更新文字节点。
 * （之前每秒重建 innerHTML，真实点击的 mousedown/mouseup 之间按钮被替换，
 *   click 事件落到容器上，✕ 就"点不动"了。）
 * ============================================================================ */
const GameHUD = {
  _built: false,
  _t: null,

  build() {
    const hud = $('#gameHud');
    if (!hud || this._built) return;
    hud.innerHTML = `
      <div class="hud-btns">
        <button class="hud-btn" data-act="refresh" title="按当前分/秒重新计时">⟳</button>
        <button class="hud-btn" data-act="close" title="关闭缩圈提示">✕</button>
      </div>
      <div class="hud-line"><span class="hud-dot" id="hudDot"></span>
        <b id="hudMode"></b><span id="hudPhase"></span><span id="hudDps"></span></div>
      <div class="hud-clock" id="hudClock"></div>
      <div class="hud-advice" id="hudAdvice"></div>
      <div class="hud-sub" id="hudSub"></div>`;
    // pointerdown 立即响应：不等 mouseup，任何刷新都打断不了
    const act = (e) => {
      const btn = e.target.closest && e.target.closest('.hud-btn');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      if (btn.dataset.act === 'close') this.hide();
      else if (btn.dataset.act === 'refresh') this.refresh();
    };
    hud.addEventListener('pointerdown', act, true);
    hud.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.hud-btn')) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    this._built = true;
  },

  paint() {
    const hud = $('#gameHud');
    const g = App.game;
    if (!hud || !g.plan) return;
    const plan = g.plan;
    const left = Math.max(0, Math.round((plan.deadline - Date.now()) / 1000));
    const route = Game.selectedRoute(plan);
    if (!route) return;
    const travel = route.time;
    const go = left - travel - 12;
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const dot = document.getElementById('hudDot');
    if (dot) dot.className = 'hud-dot ' + (plan.inCircle ? 'in' : 'out');
    set('hudMode', plan.modeName);
    set('hudPhase', ` · 第 ${plan.phase} 圈 · 圈外 ${plan.dps}/s`);
    set('hudClock', left === 0 ? '计划圈，不会自动缩小' : '距缩圈 ' + Fmt.mmss(left));
    set('planClock', Fmt.mmss(left));
    const planAdvice = document.getElementById('planAdvice');
    if (planAdvice) planAdvice.innerHTML = Game.departureAdvice(plan, left);
    const clk = document.getElementById('hudClock');
    if (clk) clk.className = 'hud-clock' + (left === 0 ? ' zero' : '');
    const adv = document.getElementById('hudAdvice');
    if (adv) {
      if (left === 0) {
        adv.className = 'hud-advice ok';
        adv.textContent = '按' + route.name + '，进圈估计需要 ' + Fmt.zhDur(travel);
      } else {
        adv.className = 'hud-advice ' + (go <= 0 ? 'danger' : go < 25 ? 'warn' : 'ok');
        adv.textContent = go <= 0 ? `⚠️ 立刻出发（晚了 ${Fmt.mmss(-go)}）` : `建议 ${Fmt.mmss(go)} 后出发`;
      }
    }
    const fromName = CirclePredictor.placeNear(plan.from[0], plan.from[1]);
    const toName = CirclePredictor.placeNear(plan.target.coords[0], plan.target.coords[1]);
    const apart = Fmt.m(GeoUtil.dist(plan.from, plan.target.coords));
    set('hudSub', `从 ${fromName} 到 ${toName}，相距 ${apart} 米 · ${route.name} ${Fmt.mmss(travel)}（估计）`);
    if (left === 0) { clearInterval(this._t); this._t = null; }
  },

  render() {
    const hud = $('#gameHud'), pill = $('#hudRestore');
    if (!hud) return;
    const g = App.game;
    if (App.mode !== 'game' || !g.plan) {
      hud.classList.remove('show');
      if (pill) pill.classList.remove('show');
      clearInterval(this._t); this._t = null;
      return;
    }
    if (g.hudHidden) {
      hud.classList.remove('show');
      if (pill) { pill.classList.add('show'); pill.textContent = '⏱ 显示缩圈提示'; }
      clearInterval(this._t); this._t = null;
      return;
    }
    this.build();
    if (pill) pill.classList.remove('show');
    hud.classList.add('show');
    this.paint();
    clearInterval(this._t);
    this._t = setInterval(() => this.paint(), 1000);
  },

  hide() {
    App.game.hudHidden = true;
    this.render();
    toast('已关闭缩圈提示（点地图右上角「⏱ 显示缩圈提示」可重新打开）');
  },
  show() { App.game.hudHidden = false; this.render(); },
  /* 按当前输入的 分/秒 重新计时 */
  refresh() {
    const g = App.game;
    if (!g.plan) { toast('先生成进圈方案'); return; }
    const sec = Game.readTime ? Game.readTime(g.remain) : g.remain;
    g.remain = sec;
    g.plan.remain = sec;
    g.plan.deadline = Date.now() + sec * 1000;
    g.hudHidden = false;
    this.render();
    toast(`⏱ 缩圈提示已按 ${Fmt.mmss(sec)} 重新计时`);
  }
};

window.Game = Game;
window.CirclePredictor = CirclePredictor;
window.GameSidebar = GameSidebar;
window.GameHUD = GameHUD;
window.exitGameMode = exitGameMode;
window.Fmt = Fmt;
