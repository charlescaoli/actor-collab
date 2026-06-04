import { profileUrl } from './api.js';
import { getGraphMetrics, getMobileOrbitPosition, getSharedWorkPreview, getEdgeStyle } from './state.js';

export class ForceGraph {
  constructor(container, collabs, centerName, options = {}) {
    this.container = container;
    this.centerName = centerName;
    this.onNodeSelect = options.onNodeSelect;
    this.isMobile = window.matchMedia('(max-width: 600px)').matches;

    const sorted = [...collabs].sort((a, b) => b.count - a.count).slice(0, this.isMobile ? 12 : 30);
    this.maxCount = Math.max(...sorted.map(c => c.count), 1);
    this.nodes = sorted.map(c => {
      const metrics = getGraphMetrics(c.count, this.maxCount);
      const n = {
        id: c.id, name: c.name, count: c.count, sharedWorks: c.sharedWorks,
        radius: metrics.radius, edgeWidth: metrics.edgeWidth, edgeAlpha: metrics.edgeAlpha,
        profile_path: c.profile_path, x: 0, y: 0, vx: 0, vy: 0, img: null
      };
      if (c.profile_path) {
        n.img = new Image();
        n.img.crossOrigin = 'anonymous';
        n.img.src = profileUrl(c.profile_path, 'w92');
      }
      return n;
    });

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.center = { x: 0, y: 0, fixed: true };
    this.scale = 1; this.offset = { x: 0, y: 0 };
    this.dragging = null; this.hovered = null;
    this.selected = this.nodes.find(n => n.id === options.selectedId) || this.nodes[0] || null;
    this.frameCount = 0; this.maxFrames = 120; this.destroyed = false;

    container.appendChild(this.canvas);
    this.resize();
    this.initNodes();
    this.bindEvents();
    this.simulate();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width; this.h = rect.height;
    this.center.x = this.w / 2; this.center.y = this.h / 2;
  }

  initNodes() {
    if (this.isMobile) {
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        const pos = getMobileOrbitPosition(i, this.nodes.length, this.w, this.h, n.count, this.maxCount);
        n.baseX = pos.x;
        n.baseY = pos.y;
        n.floatPhase = i * 0.7;
        n.x = pos.x;
        n.y = pos.y;
        n.vx = 0; n.vy = 0;
      }
      return;
    }
    for (const n of this.nodes) {
      const angle = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * Math.min(this.w, this.h) * 0.32;
      n.x = this.center.x + Math.cos(angle) * r;
      n.y = this.center.y + Math.sin(angle) * r;
    }
  }

  reshuffle() {
    this.frameCount = 0;
    this.initNodes();
    this.simulate();
  }

  simulate() {
    if (this.destroyed) return;
    if (this.isMobile) {
      this.draw();
      this._raf = requestAnimationFrame(() => this.simulate());
      return;
    }
    if (this.frameCount >= this.maxFrames) { this.draw(); return; }

    const cp = 0.004, damping = 0.82;

    for (const n of this.nodes) {
      if (n === this.dragging) continue;
      n.vx += (this.center.x - n.x) * cp;
      n.vy += (this.center.y - n.y) * cp;
    }

    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        if (a === this.dragging || b === this.dragging) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minD = a.radius + b.radius + 14;
        if (dist < minD) {
          const f = (minD - dist) * 0.5, nx = dx / dist, ny = dy / dist;
          a.vx -= nx * f * 0.5; a.vy -= ny * f * 0.5;
          b.vx += nx * f * 0.5; b.vy += ny * f * 0.5;
        }
        const rf = 300 / (dist * dist);
        a.vx -= dx / dist * rf * 0.3; a.vy -= dy / dist * rf * 0.3;
        b.vx += dx / dist * rf * 0.3; b.vy += dy / dist * rf * 0.3;
      }
    }

    for (const n of this.nodes) {
      if (n === this.dragging) continue;
      n.vx *= damping; n.vy *= damping;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(n.radius + 4, Math.min(this.w - n.radius - 4, n.x));
      n.y = Math.max(n.radius + 4, Math.min(this.h - n.radius - 4, n.y));
    }

    this.draw(); this.frameCount++;
    if (this.frameCount < this.maxFrames) {
      this._raf = requestAnimationFrame(() => this.simulate());
    }
  }

  draw() {
    const { ctx, w, h, center, nodes, hovered } = this;
    ctx.clearRect(0, 0, w, h);

    for (const n of nodes) {
      if (this.isMobile) this.updateFloatingPosition(n);
      const { strokeStyle, lineWidth } = getEdgeStyle(n === this.selected);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y); ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    for (const n of nodes) this.drawNode(n, n === hovered, n === this.selected);
    this.drawCenter(center.x, center.y);
  }

  drawCenter(x, y) {
    const { ctx } = this;
    ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI*2); ctx.fillStyle = 'rgba(245,197,24,0.15)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI*2);
    ctx.fillStyle = '#f5c518'; ctx.shadowColor = 'rgba(245,197,24,0.7)'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px -apple-system, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(this.centerName.slice(0, 8), x, y - 24);
  }

  drawNode(n, highlighted, selected) {
    const { ctx } = this;
    const active = highlighted || selected;
    const x = n.x, y = n.y, r = active ? n.radius + 2 : n.radius;
    const alpha = (this.selected && !active) ? 0.45 : 1;

    // avatar (or letter fallback) clipped to circle
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    if (n.img && n.img.complete && n.img.naturalWidth > 0) {
      const iw = n.img.naturalWidth, ih = n.img.naturalHeight;
      const s = Math.max(2 * r / iw, 2 * r / ih);
      ctx.drawImage(n.img, x - iw * s / 2, y - ih * s / 2, iw * s, ih * s);
    } else {
      ctx.fillStyle = active ? '#f5c518' : 'rgba(210,215,235,0.85)';
      ctx.fill();
      ctx.fillStyle = active ? '#15151d' : '#fff';
      ctx.font = 'bold 11px -apple-system, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(n.name.slice(0, 1), x, y + 4);
    }
    ctx.restore();

    // ring
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = active ? '#f5c518' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = active ? 2.2 : 1.2;
    if (active) { ctx.shadowColor = 'rgba(245,197,24,0.5)'; ctx.shadowBlur = 9; }
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();

    // label ONLY when hovered or selected (selected persists). Desktop only — mobile
    // shows it for the selected node via the same `active` path when tapped.
    if (active) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px -apple-system, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(n.name.slice(0, 8), x, y + r + 15);
      ctx.fillStyle = '#f5c518'; ctx.font = '9px -apple-system, sans-serif';
      ctx.fillText(`合作 ${n.count} 次`, x, y + r + 28);
    }
  }

  updateFloatingPosition(n) {
    const t = performance.now() / 1000;
    const selectedBoost = n === this.selected ? 1.25 : 1;
    n.x = n.baseX + Math.sin(t * 1.05 + n.floatPhase) * 5.5 * selectedBoost;
    n.y = n.baseY + Math.cos(t * 0.9 + n.floatPhase * 1.3) * 4.5 * selectedBoost;
  }

  getPos(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX-r.left)/this.scale, y: (e.clientY-r.top)/this.scale }; }

  hitTest(px, py) {
    if (Math.hypot(px-this.center.x, py-this.center.y) < 20) return { type: 'center' };
    for (const n of this.nodes) { if (Math.hypot(px-n.x, py-n.y) < n.radius+7) return { type: 'actor', node: n }; }
    return null;
  }

  bindEvents() {
    this._onMouseDown = e => { const p = this.getPos(e); const h = this.hitTest(p.x,p.y); if (h?.type==='actor') { this.dragging=h.node; this.canvas.style.cursor='grabbing'; } };
    this._onMouseMove = e => { const p = this.getPos(e); if (this.dragging) { this.dragging.x=p.x; this.dragging.y=p.y; this.dragging.vx=0; this.dragging.vy=0; this.draw(); } else { const h=this.hitTest(p.x,p.y); this.hovered=h?.type==='actor'?h.node:null; this.canvas.style.cursor=this.hovered?'pointer':''; this.draw(); } };
    this._onMouseUp = () => { this.dragging=null; this.canvas.style.cursor=this.hovered?'pointer':''; };
    this._onClick = e => {
      const p=this.getPos(e); const h=this.hitTest(p.x,p.y);
      if (h?.type==='actor') {
        this.selected = h.node;
        this.draw();
        if (this.onNodeSelect) this.onNodeSelect(h.node);
      }
    };
    this._onWheel = e => { e.preventDefault(); this.scale *= e.deltaY<0?1.08:0.92; this.scale=Math.max(0.3,Math.min(3,this.scale)); this.canvas.style.transform=`scale(${this.scale})`; this.canvas.style.transformOrigin='center center'; };
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('click', this._onClick);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  destroy() {
    this.destroyed = true; if (this._raf) cancelAnimationFrame(this._raf);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('click', this._onClick);
    this.canvas.removeEventListener('wheel', this._onWheel);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}
