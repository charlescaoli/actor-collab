# 演员详情页丰富化设计

日期：2026-06-06
方案：**A 就地扩展**现有演员 banner（`#actorBanner`），单页下滑风格不变。

## 背景与目标

目标：让选中演员后的详情区信息更丰富。现状（`selectActor` + `#actorBanner`）已有：主头像、🎂生日、📍出生地、截断到 150 字的简介、票房代表作 Top5。

用户选定新增三组（**不做外部链接**）：
1. **完整传记 + 年龄** —— 简介改为可展开全文；由生日（及忌日）算出年龄/享年。
2. **照片画廊** —— 多张剧照横向滚动，点击进**灯箱**看大图，支持前后翻页。
3. **数据统计 + 别名** —— 作品总数、活跃年份、代表领域、人气；别名（`also_known_as`）。

## 数据来源（关键：不增加请求数）

`getPersonDetails` 改为带 `append_to_response=images`，一次请求即返回：

- 人物基础字段（本就返回）：`biography`（完整）、`birthday`、`deathday`、`place_of_birth`、`known_for_department`、`popularity`、`also_known_as`、`gender`。
- `images.profiles[]`：多张演员照片（`file_path`），用于画廊。

`movie_credits` / `tv_credits` 已在 `selectActor` 中并行获取，用于算「作品总数」「活跃年份」，无需新请求。

## 纯逻辑（state.js，可测）

新增纯函数，沿用 `state.js` 既有「图/数据数学 + node:test」模式：

- `computeAge(birthday, deathday = null, now = new Date())` → 返回 `{ age: number|null, deceased: boolean }`。健在用 now，已故用 deathday 算享年；无生日返回 `{age:null}`。
- `getActiveYears(movieCredits = [], tvCredits = [])` → `{ first: string|null, last: string|null }`，从 `release_date`/`first_air_date` 取最早与最晚年份（忽略空值与未来占位中的空串）。
- `formatAka(alsoKnownAs = [], limit = 3)` → 取前 limit 个别名拼成字符串（空数组返回 ''）。

## UI 结构（index.html + css + app.js）

`#actorBanner` 内，自上而下：

1. **头部行**（现有 + 增强）：头像 + 名字；meta 行 `#bannerDetails` 在生日后追加**年龄**（`（69岁）` 或 `享年 67岁`）；新增**别名行** `#bannerAka`（无别名则隐藏）。
2. **统计条** `#bannerStats`（新）：复用电影 modal 的 `.stat/.lbl/.val` 风格——作品 N 部（gold）· 活跃 1980–2026 · 代表领域 · 人气。
3. **简介** `#bannerBio`（改）：默认 3 行截断（CSS `-webkit-line-clamp`），下方 `#bioToggle` 切换「展开全文 / 收起」。传记本身短于 3 行时隐藏 toggle。
4. **剧照画廊** `#bannerGallery`（新）：横向滚动缩略图（`profileUrl(file_path,'w185')`，最多 12 张），点击打开灯箱。无照片则隐藏整段。
5. **票房代表作** `#bannerTopMovies`（现有，不动）。

**灯箱** `#photoLightbox`（新，复用 `modal-overlay` 遮罩样式）：
- 全屏暗遮罩 + 居中大图（`profileUrl(file_path,'h632')`）。
- 桌面左右**翻页箭头**；手机**滑动**切换（touchstart/touchend 水平位移判定）。
- 关闭：× 按钮 / Esc / 点遮罩空白处。
- 维护当前索引 + 照片数组；prev/next 取模循环。

## app.js 改动

- `selectActor` 在拿到 `details`（含 images）后（token 校验之后），填充：年龄、别名、统计条、完整传记 + 折叠态、画廊缩略图。统计「活跃年份」用已取的 credits 调 `getActiveYears`，「作品总数」用 `normalizeWorks(movieCredits, tvCredits).length`。
- 绑定一次性事件（模块加载时）：`#bioToggle` 切换折叠；`#bannerGallery` 点击委托打开灯箱；灯箱 prev/next/close/Esc/滑动。
- 当前照片集合存模块变量；切换演员时重置。
- 竞态：`selectActor` 已有 `selectGen` token，丰富字段在 await 之后同步渲染，沿用守卫即可。

## 受影响文件

- `js/api.js` —— `getPersonDetails` 加 `append_to_response=images`。
- `js/state.js` —— `computeAge` / `getActiveYears` / `formatAka`（纯函数 + 单测）。
- `index.html` —— `#actorBanner` 内新增别名行、统计条、bio toggle、画廊；新增 `#photoLightbox` 遮罩。
- `js/app.js` —— `selectActor` 填充丰富字段；bio 折叠、画廊、灯箱交互。
- `css/style.css` —— 统计条、别名、bio toggle、画廊、灯箱样式（桌面 + 手机）。

## 边界与降级

- 无 `birthday` → 不显示年龄。
- 有 `deathday` → 年龄位显示「享年 N 岁」（不额外显示忌日日期，保持 meta 行简洁）。
- `images.profiles` 为空 → 隐藏画廊段。
- `also_known_as` 为空 → 隐藏别名行。
- 传记为空 → 显示「暂无简介」，无 toggle。
- 画廊/灯箱图片加载失败 → 占位，不阻塞。

## 手机适配

- 统计条 `flex-wrap` 换行；画廊横向滚动；灯箱全屏 + 滑动翻页；bio toggle 正常。所有新增块在 ≤600px 下实测排布。

## 非目标（明确不做）

- 不做外部链接（IMDB/社交）——用户未选。
- 不做独立详情页或标签页（方案 B/C 已否决）。
- 不改关系图、合作列表、电影 modal。

## 可测点（写计划时落到单测）

- `computeAge('1956-07-09', null, new Date('2026-06-06'))` → `{age:69, deceased:false}`。
- `computeAge('1918-08-25','1990-10-14')` → `{age:72, deceased:true}`。
- `computeAge('', null)` → `{age:null}`。
- `getActiveYears([{release_date:'1994-07-06'}],[{first_air_date:'2026-01-01'}])` → `{first:'1994', last:'2026'}`。
- `formatAka(['A','B','C','D'],3)` → `'A、B、C'`；`formatAka([])` → `''`。
