# Actor Collab Redesign — 设计文档

## 目标

修复所有阻塞性 bug，重构代码结构，增加可交互的力导向关系图，让影迷用户可以"顺着链条逛"探索演员合作关系。

## 用户场景

- 影迷/爱好者休闲浏览，发现演员之间的合作惊喜
- 核心情绪：发现惊喜（"原来他们也合作过！"）
- 核心交互：在关系图上点击任意节点，直接跳转到该演员

## 文件结构

```
/
├── index.html          ← 纯 HTML 结构，只保留 DOM 骨架
├── css/
│   └── style.css       ← 所有样式（保留现有暗色主题 + 修复类名）
├── js/
│   ├── config.js       ← API key 管理 + localStorage
│   ├── api.js          ← TMDB API 封装
│   ├── graph.js        ← 力导向图绘制（纯 Canvas，无外部依赖）
│   └── app.js          ← 主逻辑：搜索、演员详情、合作计算、UI 渲染
```

### 删除项

- `js/app2.js` — 与 app.js 完全重复
- `index.html` 中的 `<style>` 和 `<script>` 块 — 迁移到独立文件
- `css/style.css` 中不再需要的图节点 CSS（`.gnode-*`、`.graph-nodes`、`.graph-svg` 等）— 新图用 Canvas

## 数据流

```
用户搜索 → searchPerson() → 展示搜索结果列表
                                ↓ 点击演员
                          selectActor()
                              ↓
              ┌───────────────┴───────────────┐
              ↓                               ↓
     getPersonDetails()              getPersonMovieCredits()
                                     getPersonTVCredits()
              ↓                               ↓
         渲染 Banner                  去重 → 按日期排序 → 采样(max 50)
                                              ↓
                                    computeCollaborations()
                                    (批量拉取每部作品的 cast, batch=8)
                                              ↓
                                    ┌─────────┴─────────┐
                                    ↓                   ↓
                            renderCollaborations()   renderGraph()
                              (网格卡片列表)         (力导向图，可点击)
```

- **Cache 两层**：`creditsCache`（作品→cast）、`collabCache`（演员→合作结果），均为内存 Map
- **采样策略**：最多 50 部作品，超过则均匀采样覆盖全职业生涯
- **图数据复用**：`renderGraph()` 直接消费 `currentCollabs`，不额外请求 API
- **API Key**：首次提示输入 → 存 localStorage → 后续自动使用，不再硬编码默认 key

## Bug 修复清单

| # | 问题 | 修复 |
|---|------|------|
| 1 | `modalBackdrop` 元素不存在 | 改用 `modalHero` 设置背景图 |
| 2 | `modalMeta` id 错误 | 改为正确的 `modalMetaBar` |
| 3 | 弹窗演员列表类名不匹配（JS: `modal-cast-chip` vs CSS: `modal-cast-item`） | JS 统一为 `modal-cast-item` / `cast-img` / `cast-char` |
| 4 | `#graphContainer` class 是 `graph-gallery`，CSS 选择器是 `.graph-container` | HTML class 改为 `graph-container` |
| 5 | 合作演员按 name 去重，同名演员数据被合并 | `collabMap` key 改为 `castMember.id` |
| 6 | 关系图 Gallery 没有 CSS | 新 Canvas 图不需要这些 CSS |
| 7 | API Key 硬编码在多处 | 移除硬编码，只依赖用户通过 UI 输入 |

## 力导向图设计

**技术选型：** 纯 Canvas + requestAnimationFrame，无外部依赖，约 200 行。

**节点规则：**
- 中心节点：当前演员（金色大圆）
- 合作演员节点：半径按合作次数分 3 档
- 不显示作品节点（减少噪音，作品信息在 hover 时展示）

**布局算法：**
- 中心固定
- 合作演员受引力拉向中心 + 节点间互斥力
- 迭代约 100 帧后稳定，停止动画

**交互：**
- 拖拽合作演员节点
- 点击合作演员 → 直接跳转到该演员的合作页面
- Hover → 显示 tooltip（演员名 + 合作次数 + 共同作品列表）
- 滚轮缩放

**视觉：**
- 连线：金色渐变到半透明，合作次数越多越粗越亮
- 暗色背景保持与现有风格一致
- 节点有微弱发光阴影

## 不变项

- 暗色主题和所有现有视觉风格保持不变
- API 层函数签名向后兼容
- 搜索、建议、电影弹窗、返回按钮等交互逻辑保持不变
