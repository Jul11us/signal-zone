'use strict';
(function (root) {
  const SurveyMath = {
    valid(p) { return Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100); },
    distance(points) {
      if (!Array.isArray(points) || !points.every(p => this.valid(p))) throw new Error('无效的测距坐标');
      return points.reduce((total, p, i) => i ? total + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) * 80 : 0, 0);
    },
    format(metres) { return metres >= 1000 ? (metres / 1000).toFixed(2) + ' km' : Math.round(metres) + ' m'; }
  };
  root.SurveyMath = SurveyMath;
  if (typeof module !== 'undefined') module.exports = SurveyMath;
  if (typeof document === 'undefined') return;
  const q = s => document.querySelector(s);
  const survey = {
    points: [], grid: false, mapId: null,
    init() {
      this.svg = q('#surveySvg');
      q('#toggleGrid').onclick = () => { this.grid = !this.grid; this.sync(); };
      q('#clearMeasure').onclick = () => { this.points = []; this.sync(); };
      q('#undoMeasure').onclick = () => { this.points.pop(); this.sync(); };
      q('#mapStage').addEventListener('pointermove', e => {
        const r = q('#mapViewport').getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { q('#mapCoordinates').textContent = '移入地图查看坐标'; return; }
        const p = root.MapView.toPercent(e.clientX, e.clientY);
        q('#mapCoordinates').textContent = `X ${p[0].toFixed(1)}%　Y ${p[1].toFixed(1)}%`;
      });
      q('#mapStage').addEventListener('pointerleave', () => { q('#mapCoordinates').textContent = '移入地图查看坐标'; });
      this.sync();
    },
    add(point) {
      if (!SurveyMath.valid(point)) return;
      if (this.points.length >= 30) { root.toast('最多支持 30 个测距节点，请先清空'); return; }
      this.points.push(point.slice()); this.sync();
    },
    sync() {
      if (!this.svg) return;
      if (this.mapId !== root.App.mapId) { this.mapId = root.App.mapId; this.points = []; }
      const active = root.App.tool === 'measure';
      q('#mapStage').classList.toggle('survey-active', active);
      q('#measureReadout').hidden = !active && !this.points.length;
      q('#measureTotal').textContent = this.points.length ? SurveyMath.format(SurveyMath.distance(this.points)) : '点击地图开始测距';
      q('#measureMeta').textContent = this.points.length > 1 ? `${this.points.length - 1} 段 · 直线累计估算` : '逐点连线 · 按 8 km 地图估算';
      q('#undoMeasure').disabled = !this.points.length; q('#clearMeasure').disabled = !this.points.length;
      q('#toggleGrid').setAttribute('aria-pressed', String(this.grid)); q('#toggleGrid').classList.toggle('active', this.grid);
      let svg = '';
      if (this.grid) {
        for (let i = 1; i < 8; i++) {
          const n = i * 12.5;
          svg += `<path d="M${n} 0V100M0 ${n}H100" class="survey-grid"/>`;
        }
      }
      if (this.points.length) {
        svg += `<polyline points="${this.points.map(p => p.join(',')).join(' ')}" class="survey-path"/>`;
        this.points.forEach((p, i) => {
          svg += `<circle cx="${p[0]}" cy="${p[1]}" r=".6" class="survey-node"/>`;
          if (i) {
            const previous = this.points[i - 1];
            svg += `<text x="${(p[0] + previous[0]) / 2}" y="${(p[1] + previous[1]) / 2 - .8}" class="survey-label">${SurveyMath.format(SurveyMath.distance([previous, p]))}</text>`;
          }
        });
      }
      this.svg.innerHTML = svg;
    }
  };
  root.MapSurvey = survey;
  document.addEventListener('DOMContentLoaded', () => survey.init());
})(typeof window !== 'undefined' ? window : globalThis);
