# 演员详情页丰富化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 就地扩展演员 banner，加入可展开完整传记 + 年龄、剧照画廊（带翻页灯箱）、数据统计条 + 别名。

**Architecture:** 纯逻辑（年龄/活跃年份/别名格式化）放 `js/state.js` 用 `node:test` 单测；数据多带回靠 `getPersonDetails` 的 `append_to_response=images`（不增请求数）；DOM 填充与灯箱交互在 `js/app.js`，标记结构在 `index.html`，样式在 `css/style.css`。

**Tech Stack:** 原生 ES Modules，`node:test`（`node --test test/state.test.mjs`），本地静态服务器 + 浏览器预览（带 TMDB key 的真实数据验证）。

**基线：** 分支 `actor-detail-enrich`（含设计稿）。规格见 [docs/superpowers/specs/2026-06-06-actor-detail-enrich-design.md](../specs/2026-06-06-actor-detail-enrich-design.md)。

**验证服务器：** `python3 -m http.server 8765`（仓库根）。真实应用 `http://localhost:8765/index.html`（需在页面里存入 TMDB key）。

---

## File Structure

- `js/state.js` — **修改**：新增 `computeAge` / `getActiveYears` / `formatAka` 纯函数。
- `test/state.test.mjs` — **修改**：上述三函数单测。
- `js/api.js` — **修改**：`getPersonDetails` 加 `append_to_response=images`。
- `index.html` — **修改**：`#actorBanner` 内新增别名行/统计条/bio toggle/画廊；尾部新增灯箱 `#photoLightbox`。
- `css/style.css` — **修改**：统计条、别名、bio 折叠、画廊、灯箱样式。
- `js/app.js` — **修改**：`selectActor` 填充丰富字段；bio 折叠、画廊点击、灯箱交互。

---

## Task 1: state.js 纯函数 helper（TDD）

**Files:**
- Modify: `js/state.js`（文件末尾追加）
- Test: `test/state.test.mjs`

- [ ] **Step 1: 写失败测试**

`test/state.test.mjs` 顶部 import 块追加（与现有合并）：`computeAge, getActiveYears, formatAka`。文件末尾追加：

```js
test('computeAge: living person uses now, respects birthday not yet reached', () => {
  assert.deepEqual(computeAge('1956-07-09', null, new Date('2026-06-06')), { age: 69, deceased: false });
});

test('computeAge: deceased uses deathday for 享年', () => {
  assert.deepEqual(computeAge('1918-08-25', '1990-10-14'), { age: 72, deceased: true });
});

test('computeAge: missing birthday returns null age', () => {
  assert.equal(computeAge('', null).age, null);
});

test('getActiveYears: earliest and latest year across movie+tv credits', () => {
  assert.deepEqual(
    getActiveYears([{ release_date: '1994-07-06' }], [{ first_air_date: '2026-01-01' }]),
    { first: '1994', last: '2026' }
  );
});

test('getActiveYears: empty credits -> nulls', () => {
  assert.deepEqual(getActiveYears([], []), { first: null, last: null });
});

test('formatAka: joins up to limit with 、', () => {
  assert.equal(formatAka(['A', 'B', 'C', 'D'], 3), 'A、B、C');
  assert.equal(formatAka([]), '');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/state.test.mjs`
Expected: FAIL，`does not provide an export named 'computeAge'`。

- [ ] **Step 3: 实现**

`js/state.js` 末尾追加：

```js
// ── Actor detail helpers (pure, tested) ──────────────

// Age from birthday to deathday (享年) or now. UTC accessors keep it timezone-stable.
export function computeAge(birthday, deathday = null, now = new Date()) {
  const deceased = !!deathday;
  if (!birthday) return { age: null, deceased };
  const start = new Date(birthday);
  const end = deathday ? new Date(deathday) : now;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return { age: null, deceased };
  let age = end.getUTCFullYear() - start.getUTCFullYear();
  const m = end.getUTCMonth() - start.getUTCMonth();
  if (m < 0 || (m === 0 && end.getUTCDate() < start.getUTCDate())) age--;
  return { age, deceased };
}

// Earliest and latest 4-digit year across movie (release_date) and tv (first_air_date) credits.
export function getActiveYears(movieCredits = [], tvCredits = []) {
  const years = [];
  for (const m of movieCredits) { const y = (m.release_date || '').slice(0, 4); if (/^\d{4}$/.test(y)) years.push(y); }
  for (const t of tvCredits) { const y = (t.first_air_date || '').slice(0, 4); if (/^\d{4}$/.test(y)) years.push(y); }
  if (!years.length) return { first: null, last: null };
  years.sort();
  return { first: years[0], last: years[years.length - 1] };
}

// First `limit` aliases joined by 、 (empty array -> '').
export function formatAka(alsoKnownAs = [], limit = 3) {
  return alsoKnownAs.slice(0, limit).join('、');
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/state.test.mjs`
Expected: PASS，全部通过（原有 + 6 个新测试）。

- [ ] **Step 5: 提交**

```bash
git add js/state.js test/state.test.mjs
git commit -m "feat(actor): add age/active-years/aka helpers with tests"
```

---

## Task 2: 标记结构 + 样式（静态，无行为）

**Files:**
- Modify: `index.html`（`#actorBanner` 内 + 尾部灯箱）
- Modify: `css/style.css`

- [ ] **Step 1: index.html 在 banner 内加别名行 + 统计条**

把：
```html
      <p class="bio" id="bannerDetails"></p>
      <p class="actor-bio" id="bannerBio"></p>
```
改为：
```html
      <p class="bio" id="bannerDetails"></p>
      <p class="banner-aka" id="bannerAka" hidden></p>
      <div class="banner-stats" id="bannerStats"></div>
      <p class="actor-bio collapsed" id="bannerBio"></p>
      <button class="bio-toggle" id="bioToggle" hidden>展开全文 ▾</button>
```

- [ ] **Step 2: index.html 在票房作品前加画廊**

把：
```html
      <div class="top-movies" id="bannerTopMovies"></div>
```
改为：
```html
      <div class="banner-gallery" id="bannerGallery" hidden></div>
      <div class="top-movies" id="bannerTopMovies"></div>
```

- [ ] **Step 3: index.html 尾部加灯箱遮罩**

在 `<div class="modal-overlay" id="movieModal">…</div>` 整块之后（同级）插入：
```html
  <div class="lightbox-overlay" id="photoLightbox">
    <button class="lightbox-close" id="lightboxClose" aria-label="关闭">&times;</button>
    <button class="lightbox-nav prev" id="lightboxPrev" aria-label="上一张">‹</button>
    <img class="lightbox-img" id="lightboxImg" src="" alt="">
    <button class="lightbox-nav next" id="lightboxNext" aria-label="下一张">›</button>
  </div>
```

- [ ] **Step 4: css 改 bio 折叠 + 新增样式**

把现有规则（`css/style.css`）：
```css
.actor-banner .info .actor-bio {
  color: #b0b0bc; font-size: 0.78rem; line-height: 1.55; margin-top: 6px;
  max-height: 72px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
```
改为（把 clamp 移到 `.collapsed`）：
```css
.actor-banner .info .actor-bio { color: #b0b0bc; font-size: 0.78rem; line-height: 1.55; margin-top: 6px; }
.actor-banner .info .actor-bio.collapsed {
  max-height: 72px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
.banner-aka { color: var(--text-secondary); font-size: 0.76rem; margin-top: 4px; }
.banner-stats { display: flex; gap: 22px; flex-wrap: wrap; padding: 10px 0; margin-top: 10px;
  border-top: 1px solid #2a2a2a; border-bottom: 1px solid #2a2a2a; }
.banner-stats .stat { display: flex; flex-direction: column; gap: 1px; }
.banner-stats .stat .lbl { font-size: 0.66rem; color: #777; text-transform: uppercase; letter-spacing: 0.04em; }
.banner-stats .stat .val { font-size: 0.86rem; color: #ddd; font-weight: 600; }
.banner-stats .stat .val.gold { color: var(--accent); }
.bio-toggle { background: none; border: none; color: var(--accent); font-size: 0.78rem; cursor: pointer; padding: 4px 0 0; }
.banner-gallery { display: flex; gap: 8px; overflow-x: auto; margin-top: 12px; padding-bottom: 4px; }
.gallery-shot { width: 92px; height: 138px; flex: 0 0 auto; border-radius: 8px; object-fit: cover;
  background: #23232e; border: 1px solid #30303f; cursor: pointer; }
```

- [ ] **Step 5: css 加灯箱样式**

在上一步之后追加：
```css
.lightbox-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.92);
  display: none; align-items: center; justify-content: center; }
.lightbox-overlay.show { display: flex; }
.lightbox-img { max-width: 92vw; max-height: 88vh; border-radius: 8px; object-fit: contain; }
.lightbox-close { position: absolute; top: 16px; right: 20px; background: none; border: none;
  color: #fff; font-size: 2rem; cursor: pointer; line-height: 1; }
.lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.4);
  color: #fff; border: none; font-size: 2.4rem; width: 48px; height: 64px; cursor: pointer; border-radius: 8px; }
.lightbox-nav.prev { left: 12px; }
.lightbox-nav.next { right: 12px; }
@media (max-width: 600px) { .lightbox-nav { display: none; } }
```

- [ ] **Step 6: 验证静态结构**

启动 `python3 -m http.server 8765`，浏览器开 `http://localhost:8765/index.html`。在控制台跑：
```js
['bannerAka','bannerStats','bioToggle','bannerGallery','photoLightbox','lightboxImg','lightboxPrev','lightboxNext','lightboxClose'].map(id=>[id,!!document.getElementById(id)])
```
Expected: 9 个全部 `true`。确认页面无报错、灯箱不可见（`getComputedStyle(document.getElementById('photoLightbox')).display === 'none'`）。

- [ ] **Step 7: 提交**

```bash
git add index.html css/style.css
git commit -m "feat(actor): markup + styles for aliases, stats, bio toggle, gallery, lightbox"
```

---

## Task 3: 数据 + 填充（api append images + selectActor 丰富字段 + bio 折叠）

**Files:**
- Modify: `js/api.js`（`getPersonDetails`）
- Modify: `js/app.js`（import、DOM refs、模块状态、`selectActor` 填充、bio toggle 绑定）

需 TMDB key 在真实应用验证。

- [ ] **Step 1: api.js 带回 images**

把：
```js
export async function getPersonDetails(id) {
  return fetchTMDB(`/person/${id}`);
}
```
改为：
```js
export async function getPersonDetails(id) {
  return fetchTMDB(`/person/${id}`, { append_to_response: 'images' });
}
```

- [ ] **Step 2: app.js import 三个 helper**

`js/app.js` 顶部 `from './state.js'` 的 import 块内追加：`computeAge,`、`getActiveYears,`、`formatAka,`（与现有保持字母序不强制，能解析即可）。

- [ ] **Step 3: app.js 加 DOM refs + 模块状态**

在现有 banner refs 附近（`const bannerBio = document.getElementById('bannerBio');` 之后）追加：
```js
const bannerAka     = document.getElementById('bannerAka');
const bannerStats   = document.getElementById('bannerStats');
const bioToggle     = document.getElementById('bioToggle');
const bannerGallery = document.getElementById('bannerGallery');
const photoLightbox = document.getElementById('photoLightbox');
const lightboxImg   = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev  = document.getElementById('lightboxPrev');
const lightboxNext  = document.getElementById('lightboxNext');
```
在模块状态区（`let selectGen = 0;` 附近）追加：
```js
let currentPhotos = [];   // file_path[] for the lightbox
let lightboxIndex = 0;
```

- [ ] **Step 4: app.js 填充丰富字段**

在 `selectActor` 中，把现有这两行：
```js
    bannerDetails.textContent = [details.birthday?`🎂 ${details.birthday}`:'', details.place_of_birth?`📍 ${details.place_of_birth}`:''].filter(Boolean).join('  ·  ')||person.known_for_department||'';
    bannerBio.textContent = details.biography ? details.biography.slice(0,150).replace(/\n/g,' ')+(details.biography.length>150?'…':'') : '';
```
替换为：
```js
    const { age, deceased } = computeAge(details.birthday, details.deathday);
    const ageStr = age != null ? (deceased ? `（享年 ${age} 岁）` : `（${age} 岁）`) : '';
    bannerDetails.textContent = [
      details.birthday ? `🎂 ${details.birthday}${ageStr}` : '',
      details.place_of_birth ? `📍 ${details.place_of_birth}` : '',
      details.known_for_department ? `🎭 ${details.known_for_department}` : ''
    ].filter(Boolean).join('  ·  ') || person.known_for_department || '';

    const aka = formatAka(details.also_known_as || [], 3);
    bannerAka.textContent = aka ? `别名：${aka}` : '';
    bannerAka.hidden = !aka;

    const totalWorks = normalizeWorks(movieCredits, tvCredits).length;
    const years = getActiveYears(movieCredits, tvCredits);
    const activeStr = years.first ? (years.first === years.last ? years.first : `${years.first} – ${years.last}`) : '—';
    bannerStats.innerHTML = [
      { lbl: '作品', val: `${totalWorks} 部`, gold: true },
      { lbl: '活跃年份', val: activeStr },
      details.known_for_department ? { lbl: '代表领域', val: details.known_for_department } : null,
      details.popularity ? { lbl: '人气', val: Math.round(details.popularity).toLocaleString() } : null
    ].filter(Boolean).map(s => `<div class="stat"><span class="lbl">${esc(s.lbl)}</span><span class="val${s.gold ? ' gold' : ''}">${esc(String(s.val))}</span></div>`).join('');

    const bioText = (details.biography || '').trim();
    bannerBio.textContent = bioText || '暂无简介';
    bannerBio.classList.add('collapsed');
    bioToggle.hidden = !bioText || bioText.length < 80;
    bioToggle.textContent = '展开全文 ▾';

    const profiles = (details.images && details.images.profiles) ? details.images.profiles.slice(0, 12) : [];
    currentPhotos = profiles.map(p => p.file_path);
    bannerGallery.innerHTML = currentPhotos
      .map((fp, i) => `<img class="gallery-shot" src="${profileUrl(fp, 'w185')}" alt="" loading="lazy" data-photo-index="${i}">`).join('');
    bannerGallery.hidden = !currentPhotos.length;
```

- [ ] **Step 5: app.js 重置丰富字段（搜索新演员前）**

在 `selectActor` 顶部同步区，现有 `bannerName.textContent = person.name; bannerDetails.textContent = person.known_for_department || '';` 之后追加：
```js
  bannerAka.hidden = true; bannerStats.innerHTML = ''; bioToggle.hidden = true;
  bannerGallery.innerHTML = ''; bannerGallery.hidden = true; currentPhotos = [];
```

- [ ] **Step 6: app.js 绑定 bio 折叠（一次性）**

在事件绑定区（如 `backBtn.addEventListener` 附近）追加：
```js
bioToggle.addEventListener('click', () => {
  const collapsed = bannerBio.classList.toggle('collapsed');
  bioToggle.textContent = collapsed ? '展开全文 ▾' : '收起 ▴';
});
```

- [ ] **Step 7: 验证（真实应用）**

`node --check js/app.js && node --check js/api.js`。启动服务器，开 `http://localhost:8765/index.html`（存好 key）。搜「Tom Hanks」→ 选中，确认：
- meta 行含年龄 `（69岁）`；别名行显示「别名：…」。
- 统计条显示 作品 N 部 / 活跃年份 / 代表领域 / 人气。
- 简介默认 3 行截断，「展开全文」点击后展开、文案变「收起」。
- 画廊出现一排剧照缩略图。
搜一个已故演员（如「Audrey Hepburn」）确认显示「享年 …」。控制台无报错。

- [ ] **Step 8: 提交**

```bash
git add js/api.js js/app.js
git commit -m "feat(actor): enrich banner with age, aliases, stats, full bio, photo gallery"
```

---

## Task 4: 剧照灯箱交互（点击 / 翻页 / 关闭 / 滑动）

**Files:**
- Modify: `js/app.js`（灯箱函数 + 事件绑定）

- [ ] **Step 1: app.js 加灯箱逻辑**

在事件绑定区追加：
```js
function openLightbox(i) {
  if (!currentPhotos.length) return;
  lightboxIndex = (i + currentPhotos.length) % currentPhotos.length;
  lightboxImg.src = profileUrl(currentPhotos[lightboxIndex], 'h632');
  photoLightbox.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  photoLightbox.classList.remove('show');
  document.body.style.overflow = '';
}
function lightboxStep(d) { openLightbox(lightboxIndex + d); }

bannerGallery.addEventListener('click', (e) => {
  const img = e.target.closest('[data-photo-index]');
  if (img) openLightbox(parseInt(img.dataset.photoIndex));
});
lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => lightboxStep(-1));
lightboxNext.addEventListener('click', () => lightboxStep(1));
photoLightbox.addEventListener('click', (e) => { if (e.target === photoLightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => {
  if (!photoLightbox.classList.contains('show')) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') lightboxStep(-1);
  else if (e.key === 'ArrowRight') lightboxStep(1);
});
let lightboxTouchX = null;
photoLightbox.addEventListener('touchstart', (e) => { lightboxTouchX = e.changedTouches[0].clientX; }, { passive: true });
photoLightbox.addEventListener('touchend', (e) => {
  if (lightboxTouchX == null) return;
  const dx = e.changedTouches[0].clientX - lightboxTouchX;
  lightboxTouchX = null;
  if (Math.abs(dx) > 40) lightboxStep(dx < 0 ? 1 : -1);
});
```

- [ ] **Step 2: 验证（真实应用，桌面 + 手机）**

`node --check js/app.js`。开 `http://localhost:8765/index.html`，选演员 → 点剧照缩略图：
- 灯箱全屏弹出显示大图；左右箭头切换；Esc / × / 点空白处关闭。
- 把视口调到 ≤600px：箭头隐藏，左右滑动切换图片，× 关闭。
控制台无报错。

- [ ] **Step 3: 提交**

```bash
git add js/app.js
git commit -m "feat(actor): photo gallery lightbox with paging, swipe, keyboard"
```

---

## 收尾（全部完成后）

- [ ] 删除原型文件：`rm -f _detaildemo.html`
- [ ] 跑 `node --test test/state.test.mjs` 确认全绿。
- [ ] 用 `superpowers:finishing-a-development-branch` 决定 `actor-detail-enrich` 去向。

---

## 规格覆盖自查

- 数据 `append_to_response=images` → Task 3 Step 1 ✓
- 纯函数 computeAge/getActiveYears/formatAka + 单测 → Task 1 ✓
- 完整传记 + 展开/收起 → Task 2（css 折叠）+ Task 3 Step 4/6 ✓
- 年龄 / 享年 → Task 1 + Task 3 Step 4 ✓
- 别名行 → Task 2 + Task 3 Step 4 ✓
- 统计条（作品/活跃年份/代表领域/人气）→ Task 2 + Task 3 Step 4 ✓
- 照片画廊 → Task 2 + Task 3 Step 4 ✓
- 灯箱（翻页/Esc/滑动/关闭）→ Task 2（结构/样式）+ Task 4 ✓
- 边界降级（无生日/已故/无图/无别名/空传记）→ Task 3 Step 4（hidden + 条件）✓
- 手机适配 → Task 2 css（灯箱箭头隐藏）+ Task 4 Step 2（滑动验证）✓
- 非目标（不做外链/不做独立页/不改图&列表&modal）→ 计划未触碰 ✓
