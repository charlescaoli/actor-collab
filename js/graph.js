export class ForceGraph {
  constructor(container, collabs, centerName, onActorClick) {
    this.container = container;
    this.centerName = centerName;
    this.onActorClick = onActorClick;

    // Take top 30 collaborators
    const sorted = [...collabs].sort((a, b) => b.count - a.count).slice(0, 30);
    const maxCount = Math.max(...sorted.map(c => c.count), 1);
    this.nodes = sorted.map(c => ({
      id: c.id,
      name: c.name,
      count: c.count,
      sharedWorks: c.sharedWorks,
      radius: 5 + (c.count / maxCount) * 10, // 5-15px
      x: 0, y: 0, vx: 0, vy: 0
    }));

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.center = { x: 0, y: 0, fixed: true };
    this.scale = 1;
    this.offset = { x: 0, y: 0 };
    this.dragging = null;
    this.hovered = null;
    this.frameCount = 0;
    this.maxFrames = 120;
    this.destroyed = false;

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
    this.w = rect.width;
    this.h = rect.height;
    this.center.x = this.w / 2;
    this.center.y = this.h / 2;
  }

  initNodes() {
    for (const n of this.nodes) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 80 + Math.random() * 150;
      n.x = this.center.x + Math.cos(angle) * radius;
      n.y = this.center.y + Math.sin(angle) * radius;
    }
  }

  simulate() {
    if (this.destroyed) return;
    if (this.frameCount >= this.maxFrames) {
      this.draw();
      return;
    }

    const centerPull = 0.004;
    const nodeRepel = 300;
    const damping = 0.82;

    for (const n of this.nodes) {
      if (n === this.dragging) continue;
      n.vx += (this.center.x - n.x) * centerPull;
      n.vy += (this.center.y - n.y) * centerPull;
    }

    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        if (a === this.dragging || b === this.dragging) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = a.radius + b.radius + 12;
        if (dist < minDist) {
          const force = (minDist - dist) * 0.5;
          const nx = dx / dist, ny = dy / dist;
          a.vx -= nx * force * 0.5;
          a.vy -= ny * force * 0.5;
          b.vx += nx * force * 0.5;
          b.vy += ny * force * 0.5;
        }
        const repelForce = nodeRepel / (dist * dist);
        a.vx -= dx / dist * repelForce * 0.3;
        a.vy -= dy / dist * repelForce * 0.3;
        b.vx += dx / dist * repelForce * 0.3;
        b.vy += dy / dist * repelForce * 0.3;
      }
    }

    for (const n of this.nodes) {
      if (n === this.dragging) continue;
      n.vx *= damping; n.vy *= damping;
      n.x += n.vx; n.y += n.vy;
      // Clamp to canvas
      n.x = Math.max(n.radius, Math.min(this.w - n.radius, n.x));
      n.y = Math.max(n.radius, Math.min(this.h - n.radius, n.y));
    }

    this.draw();
    this.frameCount++;

    if (this.frameCount < this.maxFrames) {
      this._raf = requestAnimationFrame(() => this.simulate());
    }
  }

  draw() {
    const { ctx, w, h, center, nodes, hovered } = this;
    ctx.clearRect(0, 0, w, h);

    const maxCount = Math.max(...nodes.map(n => n.count), 1);

    // Lines from center to each node
    for (const n of nodes) {
      const alpha = 0.1 + (n.count / maxCount) * 0.3;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = `rgba(245,197,24,${alpha})`;
      ctx.lineWidth = 0.4 + (n.count / maxCount) * 1.6;
      ctx.stroke();
    }

    // Actor nodes
    for (const n of nodes) {
      this.drawNode(n.x, n.y, n.radius, n.name, n === hovered, n.count, maxCount);
    }

    // Center node on top
    this.drawCenter(center.x, center.y);
  }

  drawCenter(x, y) {
    const { ctx } = this;
    // Outer glow
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245,197,24,0.15)';
    ctx.fill();
    // Main circle
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#f5c518';
    ctx.shadowColor = 'rgba(245,197,24,0.7)';
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Border
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.centerName.slice(0, 8), x, y - 24);
  }

  drawNode(x, y, r, name, highlighted, count, maxCount) {
    const { ctx } = this;
    const isStrong = count >= maxCount * 0.5;

    ctx.beginPath();
    ctx.arc(x, y, highlighted ? r * 1.2 : r, 0, Math.PI * 2);
    if (highlighted) {
      ctx.fillStyle = '#f5c518';
      ctx.shadowColor = 'rgba(245,197,24,0.7)';
    } else if (isStrong) {
      ctx.fillStyle = '#f0d060';
      ctx.shadowColor = 'rgba(245,197,24,0.4)';
    } else {
      ctx.fillStyle = 'rgba(210,215,235,0.85)';
      ctx.shadowColor = 'rgba(210,215,235,0.3)';
    }
    ctx.shadowBlur = highlighted ? 14 : 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Label
    if (highlighted || r >= 10) {
      ctx.fillStyle = highlighted ? '#f5c518' : '#aaa';
      ctx.font = `${highlighted ? '9' : '7.5'}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(name.slice(0, 6), x, y - r - 5);
    }
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.scale,
      y: (e.clientY - rect.top) / this.scale
    };
  }

  hitTest(px, py) {
    const dc = Math.hypot(px - this.center.x, py - this.center.y);
    if (dc < 20) return { type: 'center' };
    for (const n of this.nodes) {
      if (Math.hypot(px - n.x, py - n.y) < n.radius + 5) {
        return { type: 'actor', node: n };
      }
    }
    return null;
  }

  bindEvents() {
    this._onMouseDown = e => {
      const pos = this.getPos(e);
      const hit = this.hitTest(pos.x, pos.y);
      if (hit?.type === 'actor') {
        this.dragging = hit.node;
        this.canvas.style.cursor = 'grabbing';
      }
    };

    this._onMouseMove = e => {
      const pos = this.getPos(e);
      if (this.dragging) {
        this.dragging.x = pos.x;
        this.dragging.y = pos.y;
        this.dragging.vx = 0;
        this.dragging.vy = 0;
        this.draw();
      } else {
        const hit = this.hitTest(pos.x, pos.y);
        this.hovered = hit?.type === 'actor' ? hit.node : null;
        this.canvas.style.cursor = this.hovered ? 'pointer' : '';
        this.draw();
      }
    };

    this._onMouseUp = () => {
      this.dragging = null;
      this.canvas.style.cursor = this.hovered ? 'pointer' : '';
    };

    this._onClick = e => {
      const pos = this.getPos(e);
      const hit = this.hitTest(pos.x, pos.y);
      if (hit?.type === 'actor' && this.onActorClick) {
        this.onActorClick(hit.node);
      }
    };

    this._onWheel = e => {
      e.preventDefault();
      this.scale *= e.deltaY < 0 ? 1.08 : 0.92;
      this.scale = Math.max(0.3, Math.min(3, this.scale));
      this.canvas.style.transform = `scale(${this.scale})`;
      this.canvas.style.transformOrigin = 'center center';
    };

    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('click', this._onClick);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  destroy() {
    this.destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('click', this._onClick);
    this.canvas.removeEventListener('wheel', this._onWheel);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}
