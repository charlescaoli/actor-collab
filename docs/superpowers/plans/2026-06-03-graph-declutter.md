# 关系图减负 + 动感改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重做合作关系图：去掉常驻标签/画布悬浮卡/嘈杂连线，加入入场动画与持续轻漂，并增强「当前选中」面板（演员照片 + 可点击作品海报 + 票房），桌面与手机全面适配。

**Architecture:** 纯逻辑（图数学：向心力 ramp、浮动偏移、入场缓动、边样式）抽到 `js/state.js`，用 `node:test` 单测；canvas 渲染改在 `js/graph.js`，用 mock 数据的 HTML harness 截图做可视化验证（免 TMDB key）；「当前选中」面板改在 `js/app.js` + `css/style.css`，因涉及按需拉取票房，在真实应用里用 TMDB key 验证。

**Tech Stack:** 原生 ES Modules，Canvas 2D，`node:test`（无 package.json，用 `node --test test/`），本地静态服务器（`python3 -m http.server`）+ 浏览器预览。

**基线：** 本计划基于 `graph-declutter` 分支（已含 bug 修复 + 设计稿）。规格见 [docs/superpowers/specs/2026-06-03-graph-declutter-design.md](../specs/2026-06-03-graph-declutter-design.md)。

**验证服务器：** 多个任务需在浏览器看效果。启动：`python3 -m http.server 8765` （在仓库根目录）。harness 地址 `http://localhost:8765/test/graph-harness.html`，真实应用 `http://localhost:8765/index.html`。

---

## File Structure

- `js/state.js` — **修改**：新增 4 个纯图数学 helper（`getCenterPull` / `getFloatOffset` / `getEntranceProgress` / `getEdgeStyle`）。
- `test/state.test.mjs` — **修改**：为 4 个新 helper 加单测。
- `test/graph-harness.html` — **新建**：用 mock 数据实例化真实 `ForceGraph`，供免 key 可视化验证（贯穿 Task 2–4）。
- `js/graph.js` — **修改**：渲染减负（标签/悬浮卡/边/压暗）+ 入场动画 + 持续轻漂（桌面力导向、手机环位两条路径）。
- `js/app.js` — **修改**：`renderGraphDetail` 面板增强 + 新增有上限的电影详情缓存。
- `css/style.css` — **修改**：`graph-detail` 面板的头像与海报卡样式（桌面 + 手机底部抽屉）。

---

## Task 1: state.js 新增图数学 helper（TDD）

**Files:**
- Modify: `js/state.js`（文件末尾追加）
- Test: `test/state.test.mjs`

- [ ] **Step 1: 写失败测试**

在 `test/state.test.mjs` 顶部 import 块追加这 4 个名字（与现有 import 合并）：`getCenterPull, getFloatOffset, getEntranceProgress, getEdgeStyle`。然后在文件末尾追加：

```js
test('getCenterPull ramps from 0.010 to 0.022 across settle frames', () => {
  assert.ok(Math.abs(getCenterPull(0, 150) - 0.010) < 1e-9);
  assert.ok(Math.abs(getCenterPull(150, 150) - 0.022) < 1e-9);
  assert.ok(Math.abs(getCenterPull(75, 150) - 0.016) < 1e-9);
  // clamps past settleFrames
  assert.ok(Math.abs(getCenterPull(300, 150) - 0.022) < 1e-9);
});

test('getFloatOffset returns sinusoidal offset, larger when selected', () => {
  const base = getFloatOffset(0, 0, 10, false);
  assert.ok(Math.abs(base.dx - 0) < 1e-9);     // sin(0)*10
  assert.ok(Math.abs(base.dy - 10) < 1e-9);    // cos(0)*10
  const sel = getFloatOffset(0, 0, 10, true);
  assert.ok(Math.abs(sel.dy - 14) < 1e-9);     // *1.4 boost
});

test('getEntranceProgress is eased 0..1 (ease-out cubic), clamped', () => {
  assert.equal(getEntranceProgress(0, 500), 0);
  assert.equal(getEntranceProgress(500, 500), 1);
  assert.equal(getEntranceProgress(1000, 500), 1); // clamp
  assert.ok(Math.abs(getEntranceProgress(250, 500) - 0.875) < 1e-9); // 1-(0.5)^3
});

test('getEdgeStyle gives gold for selected, faint otherwise', () => {
  assert.deepEqual(getEdgeStyle(true), { strokeStyle: 'rgba(245,197,24,0.65)', lineWidth: 2 });
  assert.deepEqual(getEdgeStyle(false), { strokeStyle: 'rgba(255,255,255,0.07)', lineWidth: 0.7 });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/`
Expected: FAIL，报 `getCenterPull is not defined`（及其余三个）。

- [ ] **Step 3: 实现 helper**

在 `js/state.js` 末尾追加：

```js
// ── Graph motion / styling math (pure, tested) ──────────────

// Entrance: center pull ramps up over the settle window so nodes overshoot then come home.
export function getCenterPull(frame, settleFrames) {
  return 0.010 + Math.min(frame / settleFrames, 1) * 0.012;
}

// Continuous float offset around a node's base position; selected drifts a bit more.
export function getFloatOffset(t, phase, amp, selected = false) {
  const boost = selected ? 1.4 : 1;
  return {
    dx: Math.sin(t * 0.9 + phase) * amp * boost,
    dy: Math.cos(t * 0.75 + phase * 1.3) * amp * boost,
  };
}

// Mobile entrance: eased 0..1 progress (ease-out cubic) for lerp + scale + alpha.
export function getEntranceProgress(elapsedMs, durationMs) {
  const p = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  return 1 - Math.pow(1 - p, 3);
}

// Edge style: gold highlight for the selected node's edge, faint hairline otherwise.
export function getEdgeStyle(isSelected) {
  return isSelected
    ? { strokeStyle: 'rgba(245,197,24,0.65)', lineWidth: 2 }
    : { strokeStyle: 'rgba(255,255,255,0.07)', lineWidth: 0.7 };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/`
Expected: PASS，全部测试通过（含原有 state 测试）。

- [ ] **Step 5: 提交**

```bash
git add js/state.js test/state.test.mjs
git commit -m "feat(graph): add pure motion/style helpers with tests"
```

---

## Task 2: 渲染减负 + mock harness（标签按需 / 去悬浮卡 / 淡边 / 压暗）

**Files:**
- Create: `test/graph-harness.html`
- Modify: `js/graph.js`（`draw` 的边绘制、`drawNode` 整体）

- [ ] **Step 1: 建可视化验证 harness（免 key）**

Create `test/graph-harness.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN" style="color-scheme:dark">
<head><meta charset="UTF-8"><title>graph harness</title>
<style>
  body{margin:0;background:#0a0a0f;font-family:-apple-system,sans-serif}
  #gc{width:100%;height:560px;position:relative;overflow:hidden}
  .bar{padding:8px 12px}.bar button{background:#1d1d28;color:#e8e8ef;border:1px solid #33333f;border-radius:6px;padding:6px 12px;cursor:pointer}
</style></head>
<body>
<div class="bar"><button id="replay">↻ replay</button></div>
<div id="gc"></div>
<script type="module">
import { ForceGraph } from '../js/graph.js';
const names=[['梁朝伟',9],['张曼玉',7],['刘德华',6],['张国荣',6],['林青霞',5],['Tony',5],['王家卫',4],['Maggie',4],['周星驰',4],['巩俐',3],['Tom',3],['章子怡',3],['Andy',3],['吴镇宇',2],['Scar',2],['Brad',2],['金城武',2],['杨紫琼',2],['黄秋生',1],['Leslie',1]];
const works=['花样年华','重庆森林','无间道','春光乍泄','东邪西毒','2046','阿飞正传','英雄'];
function mk(){return names.map(([name,count],i)=>({id:i+1,name,count,profile_path:null,sharedWorks:Array.from({length:Math.min(count,5)},(_,k)=>({title:works[(i+k)%works.length],type:'movie',id:100+i*10+k,date:String(1990+((i+k)%20)),popularity:10-k}))}));}
let g=new ForceGraph(document.getElementById('gc'),mk(),'中心演员',{selectedId:1});
document.getElementById('replay').addEventListener('click',()=>{g.destroy();g=new ForceGraph(document.getElementById('gc'),mk(),'中心演员',{selectedId:1});});
window.__g=g;
</script>
</body></html>
```

- [ ] **Step 2: 改 `draw()` 的边绘制为淡边 + 选中金线**

在 `js/graph.js` 顶部 import 追加 `getEdgeStyle`（与现有 state import 合并）：
```js
import { getGraphMetrics, getMobileOrbitPosition, getSharedWorkPreview, getEdgeStyle } from './state.js';
```
把 `draw()` 中绘制连线的循环（当前用 `n.edgeAlpha`/`n.edgeWidth` 和 `dim`）替换为：

```js
    for (const n of nodes) {
      if (this.isMobile) this.updateFloatingPosition(n);
      const { strokeStyle, lineWidth } = getEdgeStyle(n === this.selected);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y); ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
```

- [ ] **Step 3: 重写 `drawNode` —— 标签按需、去悬浮卡、保留压暗**

将 `js/graph.js` 的整个 `drawNode(n, highlighted, selected) { ... }` 方法体替换为：

```js
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
```

注意：原 `drawNode` 末尾那段绘制 tooltip 卡片的代码（`!this.isMobile && (highlighted || selected)` 分支里 `roundRect` 那一整块）随本次整体替换被删除——确认替换后文件中已无 `roundRect` 调用。

- [ ] **Step 4: 可视化验证**

启动服务器（若未起）：`python3 -m http.server 8765`
浏览器打开 `http://localhost:8765/test/graph-harness.html`，确认：
- 非选中节点**无文字**；只有选中（默认 id:1「梁」）显示名字 + 合作次数。
- 鼠标悬停任一节点 → 出现其名字/次数；移开消失（选中的始终在）。
- 没有画布悬浮卡片。
- 连线统一很淡，只有选中那条是金色。
- 非选中节点整体偏暗。
- 浏览器控制台无报错。

- [ ] **Step 5: 提交**

```bash
git add test/graph-harness.html js/graph.js
git commit -m "feat(graph): on-demand labels, drop canvas tooltip, calm edges, focus dimming"
```

---

## Task 3: 桌面入场弹散 + 持续轻漂

**Files:**
- Modify: `js/graph.js`（import、节点构造加 `floatAmp`、`initNodes`、`simulate`）

- [ ] **Step 1: import 追加 helper**

把 Task 2 改过的 state import 行再加两个：
```js
import { getGraphMetrics, getMobileOrbitPosition, getSharedWorkPreview, getEdgeStyle, getCenterPull, getFloatOffset } from './state.js';
```

- [ ] **Step 2: 节点构造时算 `floatAmp` 与 `floatPhase`（单一定义源）**

把构造函数里 `this.nodes = sorted.map(c => {` 的回调签名改为带索引：`this.nodes = sorted.map((c, i) => {`。在返回 `n` 之前（`const metrics = getGraphMetrics(c.count, this.maxCount);` 之后）追加：
```js
      const ratio = c.count / this.maxCount;
      n.floatAmp = 3.5 + ratio * 2.5;
      n.floatPhase = i * 0.7;
```
这里成为 `floatPhase` 的**唯一定义处**（Task 4 会删掉手机 `initNodes` 里原本的 `floatPhase` 赋值）。

- [ ] **Step 3: 桌面 `initNodes` 改为从中心起步**

把 `initNodes()` 中**非手机**分支（`for (const n of this.nodes) { const angle=...}`）替换为：

```js
    for (const n of this.nodes) {
      n.x = this.center.x + (Math.random() - 0.5) * 8;
      n.y = this.center.y + (Math.random() - 0.5) * 8;
      n.vx = 0; n.vy = 0;
    }
```
（手机分支不动。）

- [ ] **Step 4: 桌面 `simulate` 用 ramp 向心力 + 软轨道上限，落点后转持续浮动**

在构造函数里把 `this.frameCount = 0; this.maxFrames = 120;` 改为 `this.frameCount = 0; this.maxFrames = 150; this.settled = false;`

把桌面 `simulate()`（非 `isMobile` 分支）整体替换为：

```js
  simulate() {
    if (this.destroyed) return;
    if (this.isMobile) {
      this.draw();
      this._raf = requestAnimationFrame(() => this.simulate());
      return;
    }
    if (this.settled) {
      this.floatStep();
      this.draw();
      this._raf = requestAnimationFrame(() => this.simulate());
      return;
    }

    const cp = getCenterPull(this.frameCount, this.maxFrames);
    const damping = 0.86;
    const maxOrbit = Math.min(this.w, this.h) * 0.42;

    for (const n of this.nodes) {
      if (n === this.dragging) continue;
      n.vx += (this.center.x - n.x) * cp;
      n.vy += (this.center.y - n.y) * cp;
      const dcx = n.x - this.center.x, dcy = n.y - this.center.y;
      const d = Math.hypot(dcx, dcy) || 1;
      if (d > maxOrbit) { const k = (d - maxOrbit) * 0.05; n.vx -= dcx / d * k; n.vy -= dcy / d * k; }
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
        const rf = 260 / (dist * dist);
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
    if (this.frameCount >= this.maxFrames) {
      for (const n of this.nodes) { n.baseX = n.x; n.baseY = n.y; }
      this.settled = true;
    }
    this._raf = requestAnimationFrame(() => this.simulate());
  }

  floatStep() {
    const t = performance.now() / 1000;
    for (const n of this.nodes) {
      if (n === this.dragging) continue;
      const o = getFloatOffset(t, n.floatPhase, n.floatAmp, n === this.selected);
      n.x = n.baseX + o.dx;
      n.y = n.baseY + o.dy;
    }
  }
```

拖拽处理需在松手时更新 base：在 `bindEvents` 的 `_onMouseMove` 拖拽分支里，设置 `this.dragging.x=p.x; this.dragging.y=p.y;` 处追加 `this.dragging.baseX=p.x; this.dragging.baseY=p.y;`。

`reshuffle()` 改为重新入场：方法体替换为 `this.frameCount = 0; this.settled = false; this.initNodes(); if (!this._raf) this.simulate();`

- [ ] **Step 5: 可视化验证**

打开 `http://localhost:8765/test/graph-harness.html`，点「↻ replay」，确认：
- 节点从中心**弹散开**、轻微过冲后收拢成一团（不贴墙）。
- 到位后所有节点**持续轻轻漂浮**（不冻结），选中节点漂幅略大。
- 拖动一个节点后松手，它在新位置继续漂。
- 控制台无报错。

- [ ] **Step 6: 提交**

```bash
git add js/graph.js
git commit -m "feat(graph): desktop entrance burst + continuous float"
```

---

## Task 4: 手机端环位缩放入场 + 浮动

**Files:**
- Modify: `js/graph.js`（import、`initNodes` 手机分支记录目标环位、`simulate` 手机分支加入场插值、`draw`/`drawNode` 读 entrance scale）

- [ ] **Step 1: import 追加 `getEntranceProgress`**

```js
import { getGraphMetrics, getMobileOrbitPosition, getSharedWorkPreview, getEdgeStyle, getCenterPull, getFloatOffset, getEntranceProgress } from './state.js';
```

- [ ] **Step 2: 手机 `initNodes` 记录目标环位 + 入场起点在中心**

把 `initNodes()` 手机分支替换为：

```js
    if (this.isMobile) {
      this._enterStart = performance.now();
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        const pos = getMobileOrbitPosition(i, this.nodes.length, this.w, this.h, n.count, this.maxCount);
        n.baseX = pos.x; n.baseY = pos.y;     // orbit slot (float anchor)
        n.x = this.center.x; n.y = this.center.y; // start at center for scale-in
      }
      return;
    }
```

- [ ] **Step 3: 把 `draw()` 里对 `updateFloatingPosition` 的调用删除**

Task 2 Step 2 改后的 `draw()` 边循环里仍有一行 `if (this.isMobile) this.updateFloatingPosition(n);`。手机运动从本任务起改由 `simulate` 负责（在 `draw` 前已写好坐标），故**删除该行**，避免位置被二次叠加。`updateFloatingPosition` 方法可一并删除（不再被调用）。

- [ ] **Step 4: 手机 `simulate`：入场插值 → 浮动**

把手机 `simulate()` 分支（`if (this.isMobile) { this.draw(); this._raf=...; return; }`）替换为：

```js
    if (this.isMobile) {
      const elapsed = performance.now() - this._enterStart;
      const p = getEntranceProgress(elapsed, 500);
      this._enterScale = p; // consumed by draw/drawNode
      const t = performance.now() / 1000;
      for (const n of this.nodes) {
        if (n === this.dragging) continue;
        const o = (p >= 1) ? getFloatOffset(t, n.floatPhase, n.floatAmp, n === this.selected) : { dx: 0, dy: 0 };
        // lerp center -> orbit slot during entrance, then float around slot
        n.x = this.center.x + (n.baseX - this.center.x) * p + o.dx;
        n.y = this.center.y + (n.baseY - this.center.y) * p + o.dy;
      }
      this.draw();
      this._raf = requestAnimationFrame(() => this.simulate());
      return;
    }
```

- [ ] **Step 5: 入场期间节点缩放 + 淡入**

在 `drawNode` 开头，`const alpha = (this.selected && !active) ? 0.45 : 1;` 之后插入：
```js
    const enter = (this.isMobile && this._enterScale != null) ? this._enterScale : 1;
```
然后把该方法内所有 `globalAlpha = alpha;` 改为 `globalAlpha = alpha * enter;`，并把半径 `const x = n.x, y = n.y, r = active ? n.radius + 2 : n.radius;` 改为：
```js
    const x = n.x, y = n.y, r = (active ? n.radius + 2 : n.radius) * (0.4 + 0.6 * enter);
```
（入场时从 40% 尺寸放大到 100%。）

- [ ] **Step 6: 可视化验证（手机视口）**

在浏览器把视口宽度调到 ≤600px（开发者工具设备模拟，或窗口拉窄到手机宽度），打开 `http://localhost:8765/test/graph-harness.html` 并 replay，确认：
- 12 个节点从中心**缩放 + 淡入**到环形位置（不是力导向乱飞）。
- 到位后持续轻漂。
- 点击某节点 → 该节点显示名字/次数标签（手机无 hover，仅点选）。
- 控制台无报错。

- [ ] **Step 7: 提交**

```bash
git add js/graph.js
git commit -m "feat(graph): mobile orbit scale-in entrance + float"
```

---

## Task 5: 「当前选中」面板增强（头像 + 海报卡 + 票房）

**Files:**
- Modify: `js/app.js`（import、新增 `movieDetailsCache`、重写 `renderGraphDetail`、新增异步补票房）
- Modify: `css/style.css`（`graph-detail` 头像与海报卡，桌面 + 手机抽屉）

本任务涉及真实票房数据，需在真实应用里用 TMDB key 验证（harness 无 API）。

- [ ] **Step 1: app.js 准备依赖**

确认 `js/app.js` 顶部 api import 含 `posterUrl, profileUrl, getMovieDetails`（已有）。在模块状态区（`const collabCache = new Map();` 附近）新增：
```js
const movieDetailsCache = new Map();
const MOVIE_DETAILS_CACHE_MAX = 120;
```
（`cachePut` 已存在于 app.js，复用。）

- [ ] **Step 2: 重写 `renderGraphDetail`**

把 `js/app.js` 的 `renderGraphDetail(node)` 整体替换为：

```js
function renderGraphDetail(node){
  currentGraphSelection = node;
  graphTrail.innerHTML = `<span class="crumb">${esc(currentActor.name)}</span><span>→</span><span class="crumb">${esc(node.name)}</span>`;

  // header: actor photo + name + meta
  const avatar = node.profile_path
    ? `<img class="graph-detail-avatar" src="${profileUrl(node.profile_path,'w185')}" alt="${esc(node.name)}">`
    : `<div class="graph-detail-avatar no-avatar">🎬</div>`;
  graphDetailName.innerHTML = `${avatar}<span class="graph-detail-who"><strong>${esc(node.name)}</strong><em>与 ${esc(currentActor.name)} 合作 ${node.count} 次</em></span>`;
  graphDetailMeta.textContent = '';

  // shared works as poster cards (clickable -> movie modal). Revenue filled in async.
  const works = (node.sharedWorks || []).slice(0, 6);
  graphSharedWorks.innerHTML = works.length
    ? works.map(w => `
      <div class="graph-work-card" data-movie-type="${w.type}" data-movie-id="${w.id}">
        ${w.poster_path
          ? `<img class="graph-work-poster" src="${posterUrl(w.poster_path,'w92')}" alt="${esc(w.title)}" loading="lazy">`
          : `<div class="graph-work-poster no-poster">🎬</div>`}
        <span class="graph-work-name">${esc(w.title)}</span>
        <span class="graph-work-rev" data-rev-for="${w.type}-${w.id}">${getYearLabel(w)}</span>
      </div>`).join('')
    : '<span class="graph-work-empty">暂无共同作品</span>';

  fillSharedWorkRevenue(node, works);
}

// Fetch revenue for movie works on demand; only write back if this node is still selected.
async function fillSharedWorkRevenue(node, works){
  for (const w of works) {
    if (w.type !== 'movie') continue;
    try {
      let details = movieDetailsCache.get(w.id);
      if (!details) { details = await getMovieDetails(w.id); cachePut(movieDetailsCache, w.id, details, MOVIE_DETAILS_CACHE_MAX); }
      if (currentGraphSelection !== node) return; // selection changed — stop
      const el = graphSharedWorks.querySelector(`[data-rev-for="movie-${w.id}"]`);
      if (el && details.revenue) el.textContent = `$${fmtMoney(details.revenue)} · ${getYearLabel(w)}`;
    } catch { /* leave year-only on failure */ }
  }
}
```

- [ ] **Step 3: css 加面板头像 + 海报卡样式**

在 `css/style.css` 的 `.graph-detail p { ... }` 之后插入：

```css
.graph-detail-name-row, #graphDetailName { display: flex; align-items: center; gap: 12px; }
.graph-detail-avatar { width: 52px; height: 52px; border-radius: 50%; object-fit: cover;
  flex-shrink: 0; border: 1.5px solid rgba(245,197,24,0.5); background: #2a2a3a; }
.graph-detail-avatar.no-avatar { display: flex; align-items: center; justify-content: center; font-size: 1.3rem; }
.graph-detail-who { display: flex; flex-direction: column; gap: 2px; }
.graph-detail-who strong { font-size: 1rem; color: #fff; }
.graph-detail-who em { font-style: normal; font-size: 0.78rem; color: var(--text-secondary); }
.graph-shared-works { margin-top: 4px; }
.graph-work-card { width: 64px; flex: 0 0 auto; cursor: pointer; }
.graph-work-poster { width: 64px; height: 96px; border-radius: 6px; object-fit: cover;
  background: #23232e; border: 1px solid #30303f; display: block; }
.graph-work-poster.no-poster { display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }
.graph-work-name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; font-size: 0.64rem; color: #ccc; margin-top: 4px; line-height: 1.25; }
.graph-work-rev { display: block; font-size: 0.6rem; color: #f5c518; margin-top: 1px; }
.graph-work-empty { font-size: 0.74rem; color: var(--text-secondary); }
```

注意：`.graph-shared-works` 在桌面 `.graph-detail` 里原是 `flex-wrap: wrap`（chip 用）。海报卡需横向排列，把桌面 `.graph-shared-works` 规则改为 `display:flex; gap:10px; flex-wrap:nowrap; overflow-x:auto;`（找到现有 `.graph-shared-works { display: flex; flex-wrap: wrap; gap: 6px; }` 改为 `display: flex; gap: 10px; flex-wrap: nowrap; overflow-x: auto;`）。手机分支 `@media (max-width:600px)` 里已有 `.graph-shared-works { flex-wrap: nowrap; overflow-x: auto; }`，保留。

- [ ] **Step 4: 手机抽屉容纳校验样式**

在 `css/style.css` 的 `@media (max-width: 600px)` 块内（`.graph-detail` 抽屉规则附近）追加，确保海报在 38vh 抽屉里更紧凑：

```css
  .graph-detail-avatar { width: 44px; height: 44px; }
  .graph-work-card { width: 56px; }
  .graph-work-poster { width: 56px; height: 84px; }
```

- [ ] **Step 5: 真实应用验证（需 TMDB key）**

启动服务器，浏览器打开 `http://localhost:8765/index.html`（localStorage 已有 key，否则先存）。搜索「Tom Hanks」→ 选中 → 点「🔗 关系图」→ 在关系图里点一个节点，确认下方面板：
- 顶部显示**该演员圆形头像** + 名字 + 「与 X 合作 N 次」。
- 共同作品为**一排海报卡**（海报 + 片名 + 年份），横向可滚。
- 电影卡的年份处**短暂后变为「$票房 · 年份」**（剧集保持年份）。
- 点海报 → 打开该电影 modal。
- 快速连点不同节点 → 不会出现把旧节点票房写到新节点的错乱（race 守卫生效）。
然后把视口调到 ≤600px，确认底部抽屉里头像 + 海报排得下、海报可横滑、跳转按钮整行。

- [ ] **Step 6: 提交**

```bash
git add js/app.js css/style.css
git commit -m "feat(graph): enrich selected panel with actor photo + poster cards + revenue"
```

---

## 收尾（实现全部完成后）

- [ ] 删除临时原型文件：`rm -f _graphdemo.html _graphdemo2.html _paneldemo.html`
- [ ] `test/graph-harness.html` 保留（可复用的可视化验证工具）。
- [ ] 跑一遍 `node --test test/` 确认全绿。
- [ ] 用 `superpowers:finishing-a-development-branch` 决定 `graph-declutter` 的去向（合并/PR）。

---

## 规格覆盖自查

- §1 标签按需 → Task 2 Step 3 ✓
- §2 去画布悬浮卡 → Task 2 Step 3（删除 roundRect 块）✓
- §3 边压淡 → Task 1（`getEdgeStyle`）+ Task 2 Step 2 ✓
- §4 选中聚焦压暗 → Task 2 Step 3（alpha 0.45）✓
- §5 入场动画 → Task 3（桌面）+ Task 4（手机）✓
- §6 持续轻漂 → Task 1（`getFloatOffset`）+ Task 3（桌面 floatStep）+ Task 4（手机）✓
- §7 面板增强（头像/海报/票房/可点击/防竞态）→ Task 5 ✓
- 手机端适配（环位缩放入场、抽屉容纳、点选标签、触屏不新增拖拽）→ Task 4 + Task 5 Step 4 ✓
- 非目标（不减节点数、不做 reduced-motion、不加触屏拖拽）→ 计划未触碰，符合 ✓
