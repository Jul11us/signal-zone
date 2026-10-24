/* =========================================================================
 * pano.js —— 360° 程序化地形全景渲染引擎
 * 用 Canvas 实时绘制每种地形/建筑的 360° 全景与多机位视角，
 * 无需外部图片资源，可无限缩放、可拖动环视、可导出任意角度。
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ----------------------------- 随机数 ----------------------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // 世界固定角度的周期噪声（保证 360° 环绕无缝）
  function ridgeNoise(azDeg, seed) {
    const r = mulberry32(seed);
    const a = [], N = 24;
    for (let i = 0; i < N; i++) a.push(r());
    const t = ((azDeg % 360) + 360) % 360 / 360 * N;
    const i0 = Math.floor(t) % N, i1 = (i0 + 1) % N, f = t - Math.floor(t);
    const s = f * f * (3 - 2 * f);
    return a[i0] * (1 - s) + a[i1] * s;
  }

  /* ----------------------------- 调色板 ----------------------------- */
  const PALETTE = {
    island: {
      skyTop: '#1b4f7a', skyMid: '#5fa8d3', skyLow: '#b9dcef',
      haze: '#cfe4ee', ground: '#42603a', groundFar: '#5f7b4e', groundNear: '#28401f',
      water: '#1d4f63', ridge: '#3d5a4a', ridgeFar: '#6f8d9c',
      veg: '#2f5230', vegLit: '#57853f', rock: '#6b6f63', road: '#8d8a7c',
      wall: '#c8c2ae', roof: '#8a4436', concrete: '#b6b3a6'
    },
    desert: {
      skyTop: '#2a5c8f', skyMid: '#8ec1e0', skyLow: '#e8dcc0',
      haze: '#e6d6b4', ground: '#c2a271', groundFar: '#d7bd92', groundNear: '#a98a5c',
      water: '#2a6478', ridge: '#9d8259', ridgeFar: '#c3ab84',
      veg: '#7d8a4f', vegLit: '#9aa55f', rock: '#a5906c', road: '#b9a888',
      wall: '#d8c9a6', roof: '#9c6b46', concrete: '#cdbb98'
    },
    rongdu: {
      skyTop: '#20496b', skyMid: '#6fa8c4', skyLow: '#cfe0e2',
      haze: '#d6e2df', ground: '#3a613a', groundFar: '#557d49', groundNear: '#233d23',
      water: '#174a52', ridge: '#38584a', ridgeFar: '#6d8a86',
      veg: '#2b5a30', vegLit: '#4f8a3e', rock: '#66695e', road: '#7f7d72',
      wall: '#d3d2c6', roof: '#7a4a3c', concrete: '#c0bfb2'
    }
  };

  /* ----------------------------- 地标几何 ----------------------------- */
  // 返回 features: { az, dist, kind, w, h, color, extra }
  function buildFeatures(scene) {
    const rnd = mulberry32(scene.seed);
    const p = scene.palette;
    const F = [];
    const push = (az, dist, kind, w, h, color, extra) => F.push({ az, dist, kind, w, h, color: color || p.concrete, extra: extra || {} });
    const lm = scene.landmark;
    const spread = (n, base, step) => { const out = []; let a = base; for (let i = 0; i < n; i++) { a += step * (0.6 + rnd() * 0.8); out.push(a); } return out; };

    // 远景山脊（所有地标共有）
    // 中景植被/岩石
    const vegCount = scene.biome === 'desert' ? 10 : 26;
    for (let i = 0; i < vegCount; i++) {
      push(rnd() * 360, 26 + rnd() * 40, scene.biome === 'desert' ? 'bush' : 'tree',
        10 + rnd() * 8, 16 + rnd() * 22, rnd() > 0.5 ? p.veg : p.vegLit, { scale: 0.6 + rnd() });
    }
    for (let i = 0; i < 12; i++) {
      push(rnd() * 360, 18 + rnd() * 30, 'rock', 6 + rnd() * 10, 4 + rnd() * 8, p.rock);
    }

    switch (lm) {
      case 'radar': {
        for (let i = 0; i < 5; i++) push(rnd() * 360, 40 + rnd() * 30, 'building2', 26, 20 + rnd() * 14, p.wall);
        push(0, 12, 'radartower', 22, 110, p.concrete);
        push(150, 20, 'container', 34, 12, '#e0663c');
        push(215, 24, 'container', 30, 11, '#3f7fa8');
        push(300, 16, 'antenna', 6, 60, '#9aa3ad');
        push(60, 30, 'watchtower', 16, 46, p.concrete);
        break;
      }
      case 'peak':
      case 'hill': {
        push(0, 10, 'viewpoint', 30, 8, p.rock);
        push(120, 55, 'ridge', 200, 26, p.ridge);
        push(240, 70, 'ridge', 260, 20, p.ridgeFar);
        for (let i = 0; i < 8; i++) push(rnd() * 360, 22 + rnd() * 34, 'tree', 12, 18 + rnd() * 16, p.veg);
        push(70, 46, 'building2', 20, 14, p.wall);
        push(300, 52, 'building2', 16, 12, p.wall);
        break;
      }
      case 'slope': {
        push(0, 8, 'slopeRidge', 320, 40, p.groundFar);
        for (let i = 0; i < 14; i++) push(rnd() * 360, 20 + rnd() * 36, 'grass', 5, 8 + rnd() * 8, p.vegLit);
        push(200, 40, 'tree', 14, 20, p.veg);
        push(60, 34, 'tree', 12, 18, p.veg);
        break;
      }
      case 'pit': {
        push(0, 6, 'pitHole', 120, 40, p.groundNear);
        for (let i = 0; i < 10; i++) push(rnd() * 360, 20 + rnd() * 30, 'rock', 6 + rnd() * 8, 5 + rnd() * 6, p.rock);
        push(150, 40, 'building2', 18, 12, p.wall);
        push(100, 34, 'tree', 12, 16, p.veg);
        break;
      }
      case 'toilet': {
        push(0, 6, 'toilet', 26, 20, p.wall);
        push(150, 40, 'building2', 22, 14, p.wall);
        push(210, 46, 'building3', 24, 24, p.wall);
        push(50, 26, 'tree', 14, 18, p.veg);
        push(300, 30, 'fence', 40, 8, '#8b7f6a');
        break;
      }
      case 'building2': {
        push(0, 8, 'building2', 60, 34, p.wall, { lit: true });
        push(95, 14, 'building3', 46, 46, p.wall);
        push(180, 12, 'building2', 44, 30, p.wall);
        push(265, 16, 'building3', 40, 42, p.wall);
        push(320, 22, 'car', 20, 8, '#c0392b');
        push(40, 24, 'tree', 12, 16, p.veg);
        push(220, 26, 'tree', 12, 16, p.veg);
        break;
      }
      case 'building3': {
        push(0, 9, 'building3', 74, 62, p.wall, { lit: true, floors: 3 });
        push(120, 15, 'building3', 56, 50, p.wall, { floors: 3 });
        push(230, 18, 'building2', 44, 26, p.wall);
        push(300, 26, 'car', 20, 8, '#2c3e50');
        push(60, 22, 'streetlamp', 4, 22, '#9aa3ad');
        push(200, 24, 'streetlamp', 4, 22, '#9aa3ad');
        break;
      }
      case 'warehouse': {
        push(0, 10, 'warehouse', 120, 34, p.concrete, { lit: true });
        push(140, 18, 'container', 34, 13, '#c0562f');
        push(200, 20, 'container', 32, 12, '#3f7fa8');
        push(250, 22, 'container', 30, 13, '#7a8b3f');
        push(70, 26, 'truck', 30, 14, '#dcdcdc');
        break;
      }
      case 'tower': {
        push(0, 10, 'watchtower', 30, 96, p.concrete, { lit: true });
        push(120, 20, 'warehouse', 60, 22, p.concrete);
        push(220, 24, 'container', 30, 12, '#c0562f');
        push(300, 28, 'fence', 50, 10, '#8b7f6a');
        for (let i = 0; i < 6; i++) push(rnd() * 360, 30 + rnd() * 24, 'rock', 7 + rnd() * 7, 5 + rnd() * 6, p.rock);
        break;
      }
      case 'gas': {
        push(0, 8, 'gasCanopy', 90, 34, '#e8e6df', { lit: true });
        push(120, 22, 'building2', 40, 22, p.wall);
        push(200, 26, 'car', 22, 9, '#b03a2e');
        push(250, 30, 'car', 22, 9, '#2e86c1');
        push(310, 20, 'sign', 10, 38, '#d35400');
        break;
      }
      case 'bunker': {
        push(0, 7, 'bunker', 130, 46, p.concrete, { lit: true });
        for (let i = 0; i < 8; i++) push(rnd() * 360, 22 + rnd() * 26, 'rock', 8 + rnd() * 8, 6 + rnd() * 8, p.rock);
        push(140, 34, 'tree', 12, 18, p.veg);
        push(230, 38, 'tree', 12, 16, p.veg);
        break;
      }
      case 'powertower': {
        push(0, 9, 'pylon', 44, 130, '#8d949c', { lit: true });
        push(90, 40, 'pylon', 30, 96, '#9aa3ad');
        push(280, 46, 'pylon', 26, 84, '#9aa3ad');
        push(160, 26, 'building2', 34, 18, p.wall);
        for (let i = 0; i < 10; i++) push(rnd() * 360, 24 + rnd() * 30, 'grass', 5, 8 + rnd() * 8, p.vegLit);
        break;
      }
      case 'water':
      case 'dock': {
        push(0, 22, 'waterBody', 620, 30, p.water);
        for (let i = 0; i < 7; i++) push(20 + rnd() * 320, 14 + rnd() * 16, 'shoreRock', 10 + rnd() * 14, 7 + rnd() * 9, p.rock);
        for (let i = 0; i < 12; i++) push(rnd() * 360, 8 + rnd() * 8, 'reed', 4, 14 + rnd() * 12, p.vegLit);
        if (lm === 'dock') {
          push(60, 18, 'dock', 90, 12, '#8a7f6a');
          push(80, 12, 'boat', 40, 14, '#d8d8d8');
          push(140, 16, 'boat', 36, 13, '#c8c8c8');
          push(220, 20, 'container', 34, 13, '#c0562f');
          push(270, 18, 'container', 32, 13, '#3f7fa8');
          push(330, 22, 'crane', 18, 60, '#e0a33c');
        } else {
          push(200, 30, 'boat', 34, 12, '#dcdcdc');
          push(280, 44, 'building2', 22, 14, p.wall);
        }
        break;
      }
      case 'forest': {
        for (let i = 0; i < 40; i++) push(rnd() * 360, 6 + rnd() * 40, 'tree', 10 + rnd() * 10, 20 + rnd() * 26, rnd() > 0.5 ? p.veg : p.vegLit, { dense: true });
        break;
      }
      case 'valley': {
        push(0, 30, 'ridge', 300, 60, p.ridge);
        push(180, 34, 'ridge', 300, 54, p.ridgeFar);
        for (let i = 0; i < 18; i++) push(rnd() * 360, 10 + rnd() * 30, 'tree', 10, 18 + rnd() * 18, p.veg);
        break;
      }
      case 'secret': {
        push(0, 6, 'secretDoor', 90, 60, p.concrete, { lit: true });
        push(140, 12, 'crateStack', 30, 20, '#8a6a45');
        push(210, 14, 'crateStack', 26, 18, '#7a5c3c');
        push(60, 16, 'barrel', 12, 16, '#b03a2e');
        push(300, 18, 'barrel', 12, 16, '#b03a2e');
        break;
      }
      case 'bridge': {
        push(0, 15, 'bridgeDeck', 460, 30, '#9b9689', { lit: true });
        push(0, 45, 'waterBody', 620, 26, p.water);
        push(70, 26, 'pylon', 22, 90, '#9aa3ad');
        push(290, 26, 'pylon', 22, 90, '#9aa3ad');
        push(150, 50, 'car', 22, 9, '#c0392b');
        push(210, 60, 'car', 24, 10, '#2c3e50');
        for (let i = 0; i < 6; i++) push(180 + rnd() * 180, 22 + rnd() * 20, 'tree', 10, 16, p.veg);
        break;
      }
      case 'explosive': {
        push(0, 10, 'barrelCluster', 70, 26, '#b03a2e', { lit: true });
        push(110, 24, 'warehouse', 60, 22, p.concrete);
        push(200, 30, 'truck', 28, 13, '#cfcfcf');
        push(280, 26, 'barrel', 12, 16, '#c0392b');
        for (let i = 0; i < 6; i++) push(rnd() * 360, 26 + rnd() * 24, 'rock', 6 + rnd() * 6, 5 + rnd() * 5, p.rock);
        break;
      }
      case 'island': {
        push(0, 30, 'waterBody', 900, 34, p.water);
        push(180, 26, 'beach', 300, 14, '#e3d3a8');
        for (let i = 0; i < 8; i++) push(140 + rnd() * 120, 18 + rnd() * 16, 'tree', 14, 22 + rnd() * 14, p.veg);
        for (let i = 0; i < 6; i++) push(rnd() * 360, 12 + rnd() * 14, 'shoreRock', 12 + rnd() * 10, 8 + rnd() * 8, p.rock);
        push(60, 20, 'boat', 34, 13, '#dcdcdc');
        push(40, 34, 'building2', 23, 15, p.wall);
        break;
      }
      default: {
        for (let i = 0; i < 6; i++) push(rnd() * 360, 20 + rnd() * 30, 'building2', 24, 18, p.wall);
      }
    }
    F.sort((a, b) => b.dist - a.dist);
    return F;
  }

  /* ----------------------------- 场景构建 ----------------------------- */
  function buildScene(mapId, terrain) {
    const biome = PALETTE[mapId] ? mapId : 'island';
    return {
      id: terrain.id,
      biome,
      palette: PALETTE[biome],
      landmark: terrain.landmark || 'building2',
      seed: hashStr(terrain.id + terrain.name),
      seed2: hashStr(terrain.name + mapId),
      name: terrain.name,
      cat: terrain.cat,
      features: null
    };
  }

  /* ----------------------------- 尺寸放大系数（让不同类物体比例协调） ----------------------------- */
  const KIND_MAG = {
    tree: 3.0, bush: 2.6, grass: 2.4, reed: 2.2, rock: 1.8, shoreRock: 1.8,
    car: 1.6, truck: 1.5, boat: 1.5, barrel: 1.5, barrelCluster: 1.2,
    pylon: 1.5, antenna: 1.8, radartower: 1.3, watchtower: 1.1,
    building2: 1.0, building3: 1.0, warehouse: 1.05, toilet: 1.3,
    container: 1.2, gasCanopy: 1.1, sign: 1.6, bunker: 0.9, secretDoor: 0.9,
    crateStack: 1.5, fence: 1.2, streetlamp: 2.2, slopeRidge: 1.0, pitHole: 1.0,
    beach: 1.0, viewpoint: 1.4, dock: 1.0, crane: 1.2, bridgeDeck: 1.0
  };

  /* ----------------------------- 绘制基元 ----------------------------- */
  function shade(hex, amt) {
    const c = hex.replace('#', '');
    const n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + amt)));
    g = Math.max(0, Math.min(255, Math.round(g + amt)));
    b = Math.max(0, Math.min(255, Math.round(b + amt)));
    return `rgb(${r},${g},${b})`;
  }

  function drawPrimitive(ctx, kind, x, baseY, w, h, color, extra, ctxInfo) {
    const p = ctxInfo.palette;
    ctx.save();
    switch (kind) {
      case 'building2':
      case 'building3': {
        const floors = extra.floors || (kind === 'building3' ? 3 : 2);
        ctx.fillStyle = shade(color, -26);
        ctx.fillRect(x - w / 2, baseY - h, w, h);
        ctx.fillStyle = color;
        ctx.fillRect(x - w / 2, baseY - h, w * 0.62, h);
        // 屋顶
        ctx.fillStyle = p.roof;
        ctx.beginPath();
        ctx.moveTo(x - w / 2 - 3, baseY - h);
        ctx.lineTo(x - w / 2 + w * 0.62 + 3, baseY - h);
        ctx.lineTo(x - w / 2 + w * 0.56, baseY - h - 7);
        ctx.lineTo(x - w / 2 + 3, baseY - h - 7);
        ctx.closePath();
        ctx.fill();
        // 窗
        const cols = Math.max(1, Math.round(w / 12));
        for (let f = 0; f < floors; f++) {
          for (let c = 0; c < cols; c++) {
            const wx = x - w / 2 + 5 + c * (w - 10) / cols;
            const wy = baseY - h + 6 + f * (h - 10) / floors;
            ctx.fillStyle = extra.lit && (f + c) % 3 !== 1 ? 'rgba(255,214,140,0.85)' : shade(color, -55);
            ctx.fillRect(wx, wy, Math.max(3, (w - 10) / cols * 0.45), Math.max(3, (h - 10) / floors * 0.4));
          }
        }
        break;
      }
      case 'warehouse': {
        ctx.fillStyle = shade(color, -30);
        ctx.fillRect(x - w / 2, baseY - h, w, h);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY - h);
        ctx.lineTo(x, baseY - h - 12);
        ctx.lineTo(x + w / 2, baseY - h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = shade(color, -70);
        for (let i = 0; i < 4; i++) ctx.fillRect(x - w / 2 + 8 + i * (w - 16) / 4, baseY - h * 0.75, (w - 16) / 5, h * 0.7);
        break;
      }
      case 'toilet': {
        ctx.fillStyle = shade(color, -22);
        ctx.fillRect(x - w / 2, baseY - h, w, h);
        ctx.fillStyle = color;
        ctx.fillRect(x - w / 2, baseY - h, w * 0.7, h);
        ctx.fillStyle = shade(color, -60);
        ctx.fillRect(x - w * 0.12, baseY - h * 0.78, w * 0.28, h * 0.78);
        ctx.fillStyle = p.roof;
        ctx.fillRect(x - w / 2 - 2, baseY - h - 4, w + 4, 4);
        break;
      }
      case 'container': {
        ctx.fillStyle = color;
        ctx.fillRect(x - w / 2, baseY - h, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(x - w / 2 + i * w / 5, baseY - h);
          ctx.lineTo(x - w / 2 + i * w / 5, baseY);
          ctx.stroke();
        }
        break;
      }
      case 'watchtower': {
        ctx.fillStyle = shade(color, -40);
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, baseY);
        ctx.lineTo(x - w * 0.28, baseY - h);
        ctx.lineTo(x + w * 0.28, baseY - h);
        ctx.lineTo(x + w * 0.5, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillRect(x - w * 0.62, baseY - h - 14, w * 1.24, 14);
        ctx.fillStyle = p.roof;
        ctx.fillRect(x - w * 0.68, baseY - h - 19, w * 1.36, 5);
        ctx.fillStyle = shade(color, -30);
        for (let i = 1; i < 4; i++) {
          const yy = baseY - i * h / 4;
          ctx.fillRect(x - w * 0.5 + i * w * 0.06, yy, w * (1 - i * 0.12), 2);
        }
        break;
      }
      case 'radartower': {
        ctx.fillStyle = shade(color, -35);
        ctx.fillRect(x - w * 0.22, baseY - h, w * 0.44, h);
        ctx.fillStyle = color;
        ctx.fillRect(x - w * 0.45, baseY - h * 0.42, w * 0.9, 8);
        ctx.fillStyle = shade(color, -18);
        ctx.beginPath();
        ctx.arc(x, baseY - h - 12, w * 0.5, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, baseY - h - 12, w * 0.34, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(x, baseY - h - 12, 3.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'antenna': {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY); ctx.lineTo(x, baseY - h); ctx.lineTo(x + w / 2, baseY);
        ctx.moveTo(x - w * 0.35, baseY - h * 0.45); ctx.lineTo(x + w * 0.35, baseY - h * 0.45);
        ctx.moveTo(x - w * 0.22, baseY - h * 0.72); ctx.lineTo(x + w * 0.22, baseY - h * 0.72);
        ctx.stroke();
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(x, baseY - h - 3, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'pylon': {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, baseY);
        ctx.lineTo(x - w * 0.16, baseY - h);
        ctx.moveTo(x + w * 0.5, baseY);
        ctx.lineTo(x + w * 0.16, baseY - h);
        for (let i = 1; i < 6; i++) {
          const t = i / 6, yy = baseY - h * t, hw = w * (0.5 - 0.34 * t);
          ctx.moveTo(x - hw, yy); ctx.lineTo(x + hw, yy);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - w * 1.1, baseY - h * 0.86); ctx.lineTo(x + w * 1.1, baseY - h * 0.86);
        ctx.moveTo(x - w * 0.8, baseY - h * 0.7); ctx.lineTo(x + w * 0.8, baseY - h * 0.7);
        ctx.stroke();
        break;
      }
      case 'gasCanopy': {
        ctx.fillStyle = shade(color, -20);
        ctx.fillRect(x - w / 2, baseY - h, w, 8);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x - w / 2, baseY - h, w, 4);
        ctx.fillStyle = shade(color, -45);
        ctx.fillRect(x - w * 0.38, baseY - h + 8, w * 0.07, h - 8);
        ctx.fillRect(x + w * 0.31, baseY - h + 8, w * 0.07, h - 8);
        ctx.fillStyle = '#d8d8d8';
        ctx.fillRect(x - w * 0.2, baseY - 12, w * 0.14, 12);
        ctx.fillRect(x + w * 0.06, baseY - 12, w * 0.14, 12);
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(x - w * 0.2, baseY - 16, w * 0.14, 4);
        ctx.fillRect(x + w * 0.06, baseY - 16, w * 0.14, 4);
        break;
      }
      case 'sign': {
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(x - 2, baseY - h, 4, h);
        ctx.fillStyle = color;
        ctx.fillRect(x - 9, baseY - h - 10, 18, 14);
        break;
      }
      case 'building2small': break;
      case 'bunker': {
        ctx.fillStyle = shade(color, -30);
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY);
        ctx.lineTo(x - w / 2, baseY - h * 0.55);
        ctx.quadraticCurveTo(x, baseY - h * 1.25, x + w / 2, baseY - h * 0.55);
        ctx.lineTo(x + w / 2, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = shade(color, 12);
        ctx.fillRect(x - w * 0.22, baseY - h * 0.62, w * 0.44, h * 0.62);
        ctx.fillStyle = '#0b0f12';
        ctx.fillRect(x - w * 0.15, baseY - h * 0.5, w * 0.3, h * 0.5);
        ctx.fillStyle = 'rgba(255,214,140,0.35)';
        ctx.fillRect(x - w * 0.15, baseY - h * 0.5, w * 0.3, h * 0.12);
        break;
      }
      case 'secretDoor': {
        ctx.fillStyle = shade(p.concrete, -45);
        ctx.fillRect(x - w / 2, baseY - h, w, h);
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(x - w * 0.2, baseY - h * 0.75, w * 0.4, h * 0.75);
        ctx.fillStyle = '#8e8e8e';
        ctx.fillRect(x - w * 0.055, baseY - h * 0.45, w * 0.05, h * 0.06);
        ctx.fillStyle = 'rgba(255,214,140,0.18)';
        ctx.fillRect(x - w * 0.2, baseY - h * 0.75, w * 0.4, h * 0.2);
        break;
      }
      case 'crateStack': {
        ctx.fillStyle = color;
        ctx.fillRect(x - w / 2, baseY - h, w, h);
        ctx.fillRect(x - w * 0.34, baseY - h * 1.85, w * 0.7, h * 0.85);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - w / 2, baseY - h, w, h);
        ctx.strokeRect(x - w * 0.34, baseY - h * 1.85, w * 0.7, h * 0.85);
        break;
      }
      case 'barrel': {
        ctx.fillStyle = color;
        ctx.fillRect(x - w / 2, baseY - h, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x - w / 2, baseY - h * 0.72, w, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x - w / 2, baseY - h * 0.38, w, 3);
        break;
      }
      case 'barrelCluster': {
        const bw = w / 5.4, bh = h;
        const pos = [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1.5, 1], [-0.5, 1], [0.5, 1], [1.5, 1]];
        pos.forEach(([ix, iy]) => {
          ctx.fillStyle = iy ? shade(color, 22) : color;
          ctx.fillRect(x + ix * bw - bw / 2, baseY - bh * (1 + iy), bw, bh);
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.fillRect(x + ix * bw - bw / 2, baseY - bh * (1 + iy) + 3, bw, 2);
        });
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(x - bw * 2.6, baseY - bh * 2.05, bw * 1.2, 4);
        break;
      }
      case 'car':
      case 'truck': {
        const hh = kind === 'truck' ? h : h;
        ctx.fillStyle = color;
        ctx.fillRect(x - w / 2, baseY - hh, w, hh);
        ctx.fillStyle = shade(color, -30);
        ctx.fillRect(x - w / 2, baseY - hh, w, hh * 0.28);
        ctx.fillStyle = '#1b1f24';
        ctx.beginPath(); ctx.arc(x - w * 0.28, baseY, hh * 0.24, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + w * 0.28, baseY, hh * 0.24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(180,220,255,0.55)';
        ctx.fillRect(x - w * 0.18, baseY - hh * 0.82, w * 0.36, hh * 0.3);
        break;
      }
      case 'boat': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY - h);
        ctx.lineTo(x + w / 2, baseY - h);
        ctx.lineTo(x + w * 0.34, baseY);
        ctx.lineTo(x - w * 0.34, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x - w * 0.1, baseY - h - 6, 3, 6);
        break;
      }
      case 'dock': {
        ctx.fillStyle = color;
        ctx.fillRect(x - w / 2, baseY - h, w, h);
        ctx.fillStyle = shade(color, -35);
        for (let i = 0; i < 6; i++) ctx.fillRect(x - w / 2 + i * w / 6, baseY, w / 14, h * 0.9);
        break;
      }
      case 'crane': {
        ctx.fillStyle = color;
        ctx.fillRect(x - 3, baseY - h, 6, h);
        ctx.fillRect(x - w / 2, baseY - h, w, 5);
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, baseY - h); ctx.lineTo(x + w * 0.4, baseY - h * 0.55); ctx.stroke();
        break;
      }
      case 'fence': {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        for (let i = 0; i <= 8; i++) {
          const fx = x - w / 2 + i * w / 8;
          ctx.beginPath(); ctx.moveTo(fx, baseY); ctx.lineTo(fx, baseY - h); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(x - w / 2, baseY - h * 0.6); ctx.lineTo(x + w / 2, baseY - h * 0.6); ctx.stroke();
        break;
      }
      case 'streetlamp': {
        ctx.fillStyle = color;
        ctx.fillRect(x - 1.5, baseY - h, 3, h);
        ctx.fillRect(x - 1.5, baseY - h, w * 2, 2.5);
        ctx.fillStyle = 'rgba(255,220,150,0.8)';
        ctx.beginPath(); ctx.arc(x + w * 2 - 3, baseY - h + 3, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'tree': {
        const dense = extra.dense;
        ctx.fillStyle = '#4a3a28';
        ctx.fillRect(x - w * 0.08, baseY - h * 0.45, Math.max(1.5, w * 0.16), h * 0.45);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, baseY - h);
        ctx.lineTo(x + w * 0.6, baseY - h * 0.36);
        ctx.lineTo(x - w * 0.6, baseY - h * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, baseY - h * 0.82);
        ctx.lineTo(x + w * 0.5, baseY - h * 0.2);
        ctx.lineTo(x - w * 0.5, baseY - h * 0.2);
        ctx.closePath();
        ctx.fill();
        if (dense) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x - w * 0.6, baseY - h * 0.2, w * 1.2, h * 0.2); }
        break;
      }
      case 'bush': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, baseY - h * 0.35, w * 0.7, h * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'grass':
      case 'reed': {
        ctx.strokeStyle = color; ctx.lineWidth = 1.6;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(x + i * 2, baseY);
          ctx.quadraticCurveTo(x + i * 3.5, baseY - h * 0.6, x + i * 5, baseY - h);
          ctx.stroke();
        }
        break;
      }
      case 'rock':
      case 'shoreRock': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY);
        ctx.lineTo(x - w * 0.3, baseY - h);
        ctx.lineTo(x + w * 0.25, baseY - h * 0.8);
        ctx.lineTo(x + w / 2, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(x - w * 0.3, baseY - h);
        ctx.lineTo(x + w * 0.25, baseY - h * 0.8);
        ctx.lineTo(x + w * 0.1, baseY - h * 0.35);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'slopeRidge': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY);
        ctx.quadraticCurveTo(x - w * 0.15, baseY - h, x + w * 0.15, baseY - h * 0.75);
        ctx.quadraticCurveTo(x + w * 0.36, baseY - h * 0.5, x + w / 2, baseY - h * 0.3);
        ctx.lineTo(x + w / 2, baseY);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'pitHole': {
        const g = ctx.createRadialGradient(x, baseY - h * 0.1, 4, x, baseY - h * 0.1, w * 0.5);
        g.addColorStop(0, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, baseY - h * 0.1, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, baseY - h * 0.1, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'bridgeDeck': {
        const dh = Math.max(5, h);
        ctx.fillStyle = shade('#8d8a7c', -48);
        for (let i = 1; i <= 4; i++) ctx.fillRect(x - w / 2 + i * w / 5 - 2.5, baseY - dh * 0.1, 5, dh * 1.5);
        ctx.fillStyle = '#8d8a7c';
        ctx.fillRect(x - w / 2, baseY - dh, w, dh);
        ctx.fillStyle = shade('#8d8a7c', 22);
        ctx.fillRect(x - w / 2, baseY - dh, w, dh * 0.32);
        ctx.fillStyle = shade('#8d8a7c', -26);
        ctx.fillRect(x - w / 2, baseY - dh * 0.16, w, dh * 0.16);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = Math.max(1, dh * 0.07);
        ctx.setLineDash([dh * 0.85, dh * 0.85]);
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY - dh * 0.52);
        ctx.lineTo(x + w / 2, baseY - dh * 0.52);
        ctx.stroke();
        ctx.setLineDash([]);
        const rn = Math.max(4, Math.round(w / 30));
        ctx.strokeStyle = 'rgba(226,232,240,0.85)';
        ctx.lineWidth = Math.max(1, dh * 0.1);
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY - dh * 1.02);
        ctx.lineTo(x + w / 2, baseY - dh * 1.02);
        ctx.stroke();
        for (let i = 0; i <= rn; i++) {
          const px = x - w / 2 + i * w / rn;
          ctx.beginPath();
          ctx.moveTo(px, baseY - dh * 1.02);
          ctx.lineTo(px, baseY - dh * 0.98);
          ctx.stroke();
        }
        break;
      }
      case 'beach': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, baseY, w * 0.5, h, 0, Math.PI, 0);
        ctx.fill();
        break;
      }
      case 'viewpoint': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY);
        ctx.lineTo(x, baseY - h);
        ctx.lineTo(x + w / 2, baseY);
        ctx.closePath();
        ctx.fill();
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  /* ----------------------------- 主渲染 ----------------------------- */
  function render(canvas, scene, opt) {
    opt = opt || {};
    const yaw = opt.yaw || 0;
    const pitch = opt.pitch == null ? 4 : opt.pitch;   // -22 ~ +58
    const fov = opt.fov || 75;
    const dpr = opt.dpr || Math.min(2, global.devicePixelRatio || 1);
    const W = canvas.width / dpr, H = canvas.height / dpr;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const p = scene.palette;
    if (!scene.features) scene.features = buildFeatures(scene);
    const F = scene.features;

    const horizon = H * 0.52 - pitch * (H / 62);
    const pxPerDeg = W / fov;
    const focal = W / (2 * Math.tan(fov * Math.PI / 360));
    const SIZE_UNIT = 0.062;   // 世界单位 → 米 的换算系数
    const azToX = (az) => {
      const d = ((az - yaw) % 360 + 540) % 360 - 180;
      return W / 2 + d * pxPerDeg;
    };
    // 地面平面投影：距离 d 处的着地屏幕高度
    const groundY = (d) => horizon + (H * 0.30) * (10 / Math.max(d, 1.2));

    /* ---------- 天空 ---------- */
    const skyBottom = Math.max(1, horizon);
    const g1 = ctx.createLinearGradient(0, Math.min(0, horizon - H * 0.9), 0, skyBottom);
    g1.addColorStop(0, p.skyTop);
    g1.addColorStop(0.58, p.skyMid);
    g1.addColorStop(1, p.skyLow);
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, skyBottom);

    /* 太阳 */
    const sunAz = 138, sunAlt = 30;
    const sx = azToX(sunAz), sy = horizon - (sunAlt + pitch) * (H / 62) * 0.92;
    if (sy < horizon + 30) {
      const rg = ctx.createRadialGradient(sx, sy, 2, sx, sy, H * 0.34);
      rg.addColorStop(0, 'rgba(255,247,220,0.95)');
      rg.addColorStop(0.12, 'rgba(255,238,188,0.40)');
      rg.addColorStop(1, 'rgba(255,238,188,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, Math.max(0, horizon + 30));
      ctx.fillStyle = 'rgba(255,253,240,0.96)';
      ctx.beginPath(); ctx.arc(sx, sy, H * 0.024, 0, Math.PI * 2); ctx.fill();
    }
    /* 云 */
    const cr = mulberry32(scene.seed2);
    for (let i = 0; i < 10; i++) {
      const caz = cr() * 360, calt = 10 + cr() * 32, cw = 70 + cr() * 150;
      const cx = azToX(caz), cy = horizon - (calt + pitch * 0.55) * (H / 62);
      if (cy > horizon + 8) continue;
      const cxp = ((cx % (W + 400)) + (W + 400)) % (W + 400) - 200;
      ctx.fillStyle = `rgba(255,255,255,${0.09 + cr() * 0.15})`;
      ctx.beginPath();
      ctx.ellipse(cxp, cy, cw * 0.5, cw * 0.12, 0, 0, Math.PI * 2);
      ctx.ellipse(cxp + cw * 0.2, cy + 3, cw * 0.3, cw * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ---------- 远景山脊（世界固定，无缝环绕） ---------- */
    for (let layer = 0; layer < 2; layer++) {
      const amp = layer === 0 ? H * 0.155 : H * 0.095;
      const base = layer === 0 ? H * 0.05 : H * 0.018;
      ctx.globalAlpha = layer === 0 ? 0.6 : 0.85;
      ctx.fillStyle = layer === 0 ? p.ridgeFar : p.ridge;
      ctx.beginPath();
      ctx.moveTo(-10, horizon + 2);
      for (let x = -10; x <= W + 10; x += 6) {
        const az = yaw + (x - W / 2) / pxPerDeg;
        const n = ridgeNoise(az * (layer ? 1.7 : 1.1) + layer * 33, scene.seed + layer * 17);
        ctx.lineTo(x, horizon - base - n * amp);
      }
      ctx.lineTo(W + 10, horizon + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ---------- 地面底色 ---------- */
    const g2 = ctx.createLinearGradient(0, Math.max(0, horizon), 0, H);
    g2.addColorStop(0, p.groundFar);
    g2.addColorStop(0.4, p.ground);
    g2.addColorStop(1, p.groundNear);
    ctx.fillStyle = g2;
    ctx.fillRect(0, Math.max(0, horizon), W, H - Math.max(0, horizon));

    /* ---------- 地面色块起伏 ---------- */
    const gp = mulberry32(scene.seed + 7);
    for (let i = 0; i < 20; i++) {
      const az = gp() * 360, d = 8 + gp() * 60;
      const x = azToX(az);
      const w = Math.max(24, focal * (20 + gp() * 46) / d);
      if (x < -w || x > W + w) continue;
      const y = groundY(d);
      ctx.globalAlpha = 0.09 + gp() * 0.1;
      ctx.fillStyle = gp() > 0.5 ? shade(p.groundFar, 24) : shade(p.groundNear, -18);
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.5, Math.max(2, w * 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* ---------- 地平雾带 ---------- */
    const hz = ctx.createLinearGradient(0, horizon - H * 0.04, 0, horizon + H * 0.1);
    hz.addColorStop(0, 'rgba(255,255,255,0)');
    hz.addColorStop(0.4, p.haze);
    hz.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = hz;
    ctx.fillRect(0, horizon - H * 0.04, W, H * 0.14);
    ctx.globalAlpha = 1;

    /* ---------- 水面（远岸 → 近岸的带状，而非铺满下半屏） ---------- */
    const waters = F.filter(f => f.kind === 'waterBody').sort((a, b) => b.dist - a.dist);
    let nearEdge = null;
    waters.forEach(f => {
      const x = azToX(f.az);
      const w = Math.max(90, (f.w / 5) * pxPerDeg);
      if (x < -w || x > W + w) return;
      const yFar = groundY(f.dist);
      const yNear = groundY(f.dist * 0.30);
      const wg = ctx.createLinearGradient(0, yFar, 0, yNear);
      wg.addColorStop(0, shade(p.water, 62));
      wg.addColorStop(0.26, p.water);
      wg.addColorStop(1, shade(p.water, -32));
      ctx.fillStyle = wg;
      ctx.fillRect(x - w / 2, yFar, w, Math.max(2, yNear - yFar));
      // 波光
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const yy = yFar + (i + 0.8) * (yNear - yFar) / 10;
        const off = Math.sin((yaw + i * 43) * Math.PI / 180) * 20;
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + 10 + off, yy);
        ctx.lineTo(x + w / 2 - 10 + off, yy);
        ctx.stroke();
      }
      // 对岸岸线
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, yFar);
      ctx.lineTo(x + w / 2, yFar);
      ctx.stroke();
      nearEdge = nearEdge == null ? yNear : Math.min(nearEdge, yNear);
    });

    /* 近岸地面（覆盖水带下方，形成"站在岸边/桥上看水"的层次） */
    if (nearEdge != null && nearEdge < H) {
      const ng = ctx.createLinearGradient(0, nearEdge, 0, H);
      ng.addColorStop(0, shade(p.ground, 6));
      ng.addColorStop(1, p.groundNear);
      ctx.fillStyle = ng;
      ctx.fillRect(0, nearEdge, W, H - nearEdge);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, nearEdge); ctx.lineTo(W, nearEdge); ctx.stroke();
    }

    /* ---------- 中景地标 ---------- */
    const compScale = 0.86 + 0.14 * (1 - Math.min(1, Math.max(0, pitch / 55)));
    F.forEach(f => {
      if (f.kind === 'waterBody') return;
      const x = azToX(f.az);
      const mag = KIND_MAG[f.kind] || 1;
      const near = f.dist <= 14 ? 1.24 : 1;
      const w = Math.max(1.5, focal * f.w * SIZE_UNIT * mag * near / f.dist);
      const h = Math.max(1.5, focal * f.h * SIZE_UNIT * mag * near / f.dist) * compScale;
      if (x < -w * 3 || x > W + w * 3) return;
      const baseY = groundY(f.dist) + 1;
      if (baseY - h * 1.4 > H + 20) return;
      ctx.globalAlpha = clamp(1.22 - f.dist / 115, 0.42, 1);
      // 影子
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(x, baseY, Math.max(3, w * 0.5), Math.max(1.5, w * 0.12), 0, 0, Math.PI * 2);
      ctx.fill();
      drawPrimitive(ctx, f.kind, x, baseY, w, h, f.color, f.extra, { palette: p });
      if (x < W * 0.5) drawPrimitive(ctx, f.kind, x + 360 * pxPerDeg, baseY, w, h, f.color, f.extra, { palette: p });
      if (x > W * 0.5) drawPrimitive(ctx, f.kind, x - 360 * pxPerDeg, baseY, w, h, f.color, f.extra, { palette: p });
      ctx.globalAlpha = 1;
    });

    /* ---------- 前景草叶 ---------- */
    const gr = mulberry32(scene.seed + 99);
    const fgTop = nearEdge == null ? horizon + (H - horizon) * 0.55 : nearEdge;
    for (let i = 0; i < 80; i++) {
      const az = gr() * 360, d = 1.15 + gr() * 2.6;
      const x = azToX(az);
      if (x < -20 || x > W + 20) continue;
      const y = Math.max(fgTop + 4, groundY(d));
      if (y > H + 10) continue;
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = p.vegLit;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, Math.min(H, y));
      ctx.lineTo(x + 2, Math.min(H, y) - 6 - gr() * 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* ---------- 俯视辅助：平面轮廓 ---------- */
    if (pitch > 24) {
      const a = Math.min(0.45, (pitch - 24) / 70);
      ctx.globalAlpha = a;
      F.forEach(f => {
        if (f.kind === 'waterBody') return;
        const x = azToX(f.az);
        const w = Math.max(4, focal * f.w * SIZE_UNIT * (KIND_MAG[f.kind] || 1) / f.dist);
        const y = groundY(f.dist) + 1;
        if (x < -w || x > W + w || y > H) return;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(x, y, w * 0.62, w * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    /* ---------- 暗角 ---------- */
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.34, W / 2, H * 0.5, Math.max(W, H) * 0.76);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.36)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    drawCompass(ctx, W, H, yaw, pitch, fov, scene);
    ctx.restore();
  }

  function drawCompass(ctx, W, H, yaw, pitch, fov, scene) {
    const cy = H - 22;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(8,14,20,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    const bw = Math.min(W * 0.8, 460), bx = (W - bw) / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, cy - 10, bw, 22, 6); else ctx.rect(bx, cy - 10, bw, 22);
    ctx.fill(); ctx.stroke();

    const pxPerDeg = bw / fov;
    const dirs = [[0, '北'], [45, '东北'], [90, '东'], [135, '东南'], [180, '南'], [225, '西南'], [270, '西'], [315, '西北']];
    dirs.forEach(([az, label]) => {
      let d = ((az - yaw) % 360 + 540) % 360 - 180;
      const x = bx + bw / 2 + d * pxPerDeg;
      if (x < bx + 6 || x > bx + bw - 6) return;
      ctx.fillStyle = az === 0 ? '#f87171' : 'rgba(226,240,250,0.9)';
      ctx.font = '600 11px "Noto Sans SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, cy + 5);
    });
    // 中心刻度
    ctx.strokeStyle = '#ece8e1';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx + bw / 2, cy - 12); ctx.lineTo(bx + bw / 2, cy - 4); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(226,240,250,0.72)';
    ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(`方位 ${Math.round(((yaw % 360) + 360) % 360)}°  ·  俯仰 ${pitch > 0 ? '俯' : '仰'}${Math.abs(Math.round(pitch))}°  ·  FOV ${Math.round(fov)}°`, bx + 6, cy - 16);
    ctx.restore();
  }

  /* ----------------------------- 预设机位 ----------------------------- */
  const PRESETS = [
    { key: 'n',  name: '朝北 · 平视',   yaw: 0,   pitch: 4,  fov: 75 },
    { key: 'e',  name: '朝东 · 平视',   yaw: 90,  pitch: 4,  fov: 75 },
    { key: 's',  name: '朝南 · 平视',   yaw: 180, pitch: 4,  fov: 75 },
    { key: 'w',  name: '朝西 · 平视',   yaw: 270, pitch: 4,  fov: 75 },
    { key: 'top', name: '高点俯视',     yaw: 45,  pitch: 42, fov: 88 },
    { key: 'low', name: '贴地仰视',     yaw: 200, pitch: -12, fov: 80 },
    { key: 'wide', name: '广角全景',    yaw: 120, pitch: 14, fov: 118 }
  ];

  global.PanoEngine = {
    buildScene,
    render,
    PRESETS,
    thumb(terrain, mapId, preset, w, h) {
      const c = document.createElement('canvas');
      const dpr = 1;
      c.width = w * dpr; c.height = h * dpr;
      c.style.width = w + 'px'; c.style.height = h + 'px';
      const sc = buildScene(mapId, terrain);
      render(c, sc, { yaw: preset.yaw, pitch: preset.pitch, fov: preset.fov, dpr });
      return c;
    }
  };
})(window);
