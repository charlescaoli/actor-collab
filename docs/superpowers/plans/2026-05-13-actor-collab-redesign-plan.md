# Actor Collab Redesign 实现计划

> **For agentic workers:** 使用 subagent-driven-development 分任务实施。

**目标:** 修复所有 bug、重构文件结构、用 Canvas 实现可交互力导向图。

**架构:** 纯前端 HTML/CSS/JS，TMDB API。index.html 只做结构，CSS 独立，JS 拆为 api/config/app/graph 四个模块。无外部依赖。

---

### Task 1: 删除死代码 + 准备新文件

**操作:**
- 删除 `js/app2.js`（与 app.js 完全重复）
- 删除 `js/config.js`（API key 硬编码在此文件中，新实现放 app.js 中管理）

Commit.

---

### Task 2: 拆分 index.html → 独立 CSS + HTML

**操作:**
- 创建 `css/style.css`，将 index.html 中 `<style>` 标签内容（第 7-326 行）移入
- 修复 HTML 中 `#graphContainer` class：`graph-gallery` → `graph-container`（匹配 CSS `.graph-container`）
- 修复弹窗 meta：`id="modalMeta"` → 改 HTML，改用真实存在的 id
    - 当前 HTML 有 `modalMetaBar`（即原 modalMeta），但 JS 中引用了不存在的 `modalMeta`。统一在 HTML 中添加 `id="modalMeta"` 给 `<div class="modal-meta-bar" id="modalMetaBar">` → 改为 `id="modalMetaBar modalMeta"` 或直接用 `modalMetaBar`
    - 方案：JS 改用 `modalMetaBar` 作为 id（因为 HTML 已有此 id），删除 `modalMeta` 引用
- 删除 `<style>` 标签，替换为 `<link rel="stylesheet" href="css/style.css">`
- 删除底部 `<script>` 标签（第 330-998 行），替换为 `<script type="module" src="js/app.js"></script>`
- 删除 `modalBackdrop` 引用对应的 JS 代码（此 id 不存在）→ 后续 Task 处理

Commit.

---

### Task 3: 创建 js/api.js

将 index.html 中以下函数移入 `js/api.js`，全部 export：

```js
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

// API_KEY 由 app.js 注入

export function setApiKey(key) { ... }
export function getApiKey() { ... }

async function fetchTMDB(path, params = {}) { ... }
export async function searchPerson(query) { ... }
export async function getPersonDetails(id) { ... }
export async function getPersonMovieCredits(id) { ... }
export async function getPersonTVCredits(id) { ... }
export async function getMovieCredits(movieId) { ... }
export async function getTVCredits(tvId) { ... }
export async function getMovieDetails(movieId) { ... }
export async function getTVDetails(tvId) { ... }
export function profileUrl(path, size = 'w185') { ... }
export function posterUrl(path, size = 'w92') { ... }
export function backdropUrl(path, size = 'w780') { ... }
```

**关键修改:** `API_KEY` 变量用 `let API_KEY = ''` 初始化，不再硬编码。

Commit.

---

### Task 4: 创建 js/app.js（主逻辑）

将 index.html 中剩余 JS 移入 `js/app.js`，从 `api.js` import。

**关键修改:**

1. `collabMap` key 从 `name` 改为 `id`：
   ```js
   // Before: collabMap.has(name) → collabMap.set(name, ...) → collabMap.get(name)
   // After:  collabMap.has(actorId) → collabMap.set(actorId, ...) → collabMap.get(actorId)
   ```

2. `modalBackdrop` → `modalHero`：将 JS 中所有 `modalBackdrop` 改为 `modalHero`

3. `modalMeta` → `modalMetaBar`：JS 中 `getElementById('modalMeta')` 改为 `getElementById('modalMetaBar')`，变量名同步改

4. 弹窗演员 HTML 类名对齐 CSS：
   ```js
   // Before: class="modal-cast-chip" / no-avatar-small / cast-role
   // After:  class="modal-cast-item"  / cast-no-img    / cast-char
   ```
   同时 `data-person-*` 属性保留在 div 上。

5. API Key 管理：
   - `API_KEY` 初始值为空字符串
   - 启动时从 `localStorage.getItem('tmdb_api_key')` 恢复
   - 删除 `var TMDB_API_KEY = "..."` 硬编码行

6. 删除 `graphGalleryScroll` / `renderGraphGallery`：不保留旧的横向 gallery，之后用 Canvas 替代

Commit.

---

### Task 5: 创建 js/graph.js（力导向图）

新文件，约 200 行。在 `graphContainer` 内创建 Canvas，消费 `currentCollabs` 数据。

**数据结构：**
```js
// 输入: collabResults[] (来自 computeCollaborations)
// { id, name, profile_path, count, sharedWorks: [...] }

// 内部节点:
// centerNode: { x, y, fixed: true }
// actorNodes: [{ id, name, count, x, y, vx, vy }]
```

**核心实现：**

```js
export class ForceGraph {
  constructor(container, collabs, centerName, onActorClick) {
    this.container = container;
    this.collabs = collabs.slice(0, 30); // top 30
    this.centerName = centerName;
    this.onActorClick = onActorClick;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.nodes = [];
    this.center = { x: 0, y: 0, fixed: true };
    this.scale = 1;
    this.offset = { x: 0, y: 0 };
    this.dragging = null;
    this.hovered = null;
    this.animating = true;
    this.frameCount = 0;

    container.appendChild(this.canvas);
    this.resize();
    this.initNodes();
    this.bindEvents();
    this.simulate();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.center.x = rect.width / 2;
    this.center.y = rect.height / 2;
  }

  initNodes() {
    const maxCount = Math.max(...this.collabs.map(c => c.count), 1);
    this.nodes = this.collabs.map(c => ({
      id: c.id,
      name: c.name,
      count: c.count,
      sharedWorks: c.sharedWorks,
      radius: 4 + (c.count / maxCount) * 10, // 3档: 4~14px
      x: this.center.x + (Math.random() - 0.5) * 200,
      y: this.center.y + (Math.random() - 0.5) * 200,
      vx: 0, vy: 0
    }));
  }

  simulate() {
    if (!this.animating) return;

    // 力导向迭代
    const centerPull = 0.003;
    const nodeRepel = 200;
    const damping = 0.85;

    for (const n of this.nodes) {
      // pull to center
      n.vx += (this.center.x - n.x) * centerPull;
      n.vy += (this.center.y - n.y) * centerPull;
    }

    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = nodeRepel / (dist * dist);
        a.vx -= dx / dist * force;
        a.vy -= dy / dist * force;
        b.vx += dx / dist * force;
        b.vy += dy / dist * force;
      }
    }

    for (const n of this.nodes) {
      n.vx *= damping; n.vy *= damping;
      n.x += n.vx; n.y += n.vy;
    }

    this.draw();
    this.frameCount++;

    if (this.frameCount < 120) {
      requestAnimationFrame(() => this.simulate());
    } else {
      this.animating = false;
      this.draw();
      this.showHint();
    }
  }

  draw() {
    const { ctx, canvas, center, nodes } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 连线
    for (const n of nodes) {
      const alpha = 0.15 + n.count / Math.max(...nodes.map(x => x.count), 1) * 0.35;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = `rgba(245,197,24,${alpha})`;
      ctx.lineWidth = 0.5 + n.count / Math.max(...nodes.map(x => x.count), 1) * 2;
      ctx.stroke();
    }

    // 中心节点
    this.drawNode(center.x, center.y, 18, '#f5c518', this.centerName, true);

    // 合作演员节点
    for (const n of nodes) {
      this.drawNode(n.x, n.y, n.radius, 'rgba(210,215,235,0.85)', n.name, n === this.hovered);
    }
  }

  drawNode(x, y, r, color, label, highlighted) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, highlighted ? r * 1.3 : r, 0, Math.PI * 2);
    ctx.fillStyle = highlighted ? '#f5c518' : color;
    ctx.shadowColor = highlighted ? 'rgba(245,197,24,0.7)' : 'rgba(245,197,24,0.3)';
    ctx.shadowBlur = highlighted ? 20 : 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (highlighted || r >= 12) {
      ctx.fillStyle = highlighted ? '#f5c518' : '#aaa';
      ctx.font = `${highlighted ? '10' : '8'}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y - r - 6);
    }
  }

  // 事件: mousedown/mousemove/mouseup/click/wheel
  bindEvents() {
    this.canvas.addEventListener('mousedown', e => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', e => this.onMouseUp(e));
    this.canvas.addEventListener('click', e => this.onClick(e));
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.onWheel(e); });
  }

  getWorldPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.offset.x) / this.scale,
      y: (e.clientY - rect.top - this.offset.y) / this.scale
    };
  }

  hitTest(wx, wy) {
    // 检测中心
    const dc = Math.hypot(wx - this.center.x, wy - this.center.y);
    if (dc < 18) return { type: 'center' };
    // 检测演员节点
    for (const n of this.nodes) {
      if (Math.hypot(wx - n.x, wy - n.y) < n.radius + 4) return { type: 'actor', node: n };
    }
    return null;
  }

  onMouseDown(e) {
    const pos = this.getWorldPos(e);
    const hit = this.hitTest(pos.x, pos.y);
    if (hit?.type === 'actor') {
      this.dragging = hit.node;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  onMouseMove(e) {
    const pos = this.getWorldPos(e);
    if (this.dragging) {
      this.dragging.x = pos.x;
      this.dragging.y = pos.y;
      this.dragging.vx = 0; this.dragging.vy = 0;
      this.draw();
    } else {
      const hit = this.hitTest(pos.x, pos.y);
      this.hovered = hit?.type === 'actor' ? hit.node : null;
      this.canvas.style.cursor = this.hovered ? 'pointer' : '';
      this.draw();
    }
  }

  onMouseUp() {
    this.dragging = null;
    this.canvas.style.cursor = this.hovered ? 'pointer' : '';
  }

  onClick(e) {
    const pos = this.getWorldPos(e);
    const hit = this.hitTest(pos.x, pos.y);
    if (hit?.type === 'actor' && this.onActorClick) {
      this.onActorClick(hit.node);
    }
  }

  onWheel(e) {
    this.scale *= e.deltaY < 0 ? 1.1 : 0.9;
    this.scale = Math.max(0.3, Math.min(3, this.scale));
    // 应用缩放变换
    this.canvas.style.transform = `scale(${this.scale})`;
    this.draw();
  }

  showHint() {
    // 底部提示 "拖拽移动节点 · 点击跳转"
  }
}
```

**导出接口：**
```js
export { ForceGraph };
```

**app.js 中的调用：**
```js
import { ForceGraph } from './graph.js';

// 在 renderGraph 中：
function renderGraph() {
  graphContainer.innerHTML = ''; // 清空旧的 gallery
  currentGraph = new ForceGraph(
    graphContainer,
    currentCollabs,
    currentActor.name,
    (node) => {
      // 点击合作演员 → 跳转
      selectActor({ id: node.id, name: node.name, profile_path: '', known_for_department: '' });
    }
  );
}
```

Commit.

---

### Task 6: 清理 CSS 中无用的图节点样式

从 `css/style.css` 删除以下不再需要的 CSS 块：
- `.graph-svg` 及其子元素
- `.graph-nodes` 及其子元素
- `.gnode`、`.gnode-center`、`.gnode-actor`、`.gnode-actor-strong`、`.gnode-film`、`.gnode-highlight`、`.gnode-faded`
- `.gnode-label`、`.gnode-count`
- `.graph-hint`
- `.graph-gallery`、`.graph-gallery-scroll` 如果存在

Commit.

---

### Task 7: 验证

打开 `index.html`（用 live-server 或直接浏览器打开），测试：
1. 搜索演员 → 能看到搜索结果
2. 点演员 → Banner 显示 + 合作列表出现
3. 点「关系图」→ Canvas 力导向图显示
4. 图上点合作演员 → 跳转到该演员
5. 拖拽节点 → 节点移动
6. 点电影海报 → 弹窗显示正确信息
7. 弹窗背景图正常（modalHero 生效）

Commit.
