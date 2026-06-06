import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeAge,
  createLatestOnlyRunner,
  formatAka,
  formatApiKeyError,
  localizeDepartment,
  getActiveYears,
  getCenterPull,
  getEdgeStyle,
  getEntranceProgress,
  getFloatOffset,
  getGraphMetrics,
  getMobileOrbitPosition,
  getSharedWorkPreview,
  getYearLabel,
  selectPopularWorks,
  selectRevenueWorks,
} from '../js/state.js';

test('createLatestOnlyRunner only commits the newest async result', async () => {
  const commits = [];
  const runner = createLatestOnlyRunner();
  let resolveFirst;
  let resolveSecond;

  const first = runner.run(
    () => new Promise(resolve => { resolveFirst = resolve; }),
    value => commits.push(value),
  );
  const second = runner.run(
    () => new Promise(resolve => { resolveSecond = resolve; }),
    value => commits.push(value),
  );

  resolveSecond('newer result');
  await second;
  resolveFirst('older result');
  await first;

  assert.deepEqual(commits, ['newer result']);
});

test('selectPopularWorks returns unique popular works without extra detail data', () => {
  const movieCredits = [
    { id: 1, title: 'Quiet Film', release_date: '2020-01-01', popularity: 2, poster_path: '/quiet.jpg' },
    { id: 2, title: 'Hit Film', release_date: '2021-01-01', popularity: 90, poster_path: '/hit.jpg' },
    { id: 2, title: 'Hit Film Duplicate', release_date: '2021-01-01', popularity: 90, poster_path: '/hit.jpg' },
  ];
  const tvCredits = [
    { id: 7, name: 'Famous Show', first_air_date: '2022-01-01', popularity: 70, poster_path: '/show.jpg' },
  ];

  assert.deepEqual(selectPopularWorks(movieCredits, tvCredits, 3), [
    { id: 2, type: 'movie', title: 'Hit Film', date: '2021-01-01', popularity: 90, poster_path: '/hit.jpg' },
    { id: 7, type: 'tv', title: 'Famous Show', date: '2022-01-01', popularity: 70, poster_path: '/show.jpg' },
    { id: 1, type: 'movie', title: 'Quiet Film', date: '2020-01-01', popularity: 2, poster_path: '/quiet.jpg' },
  ]);
});

test('selectRevenueWorks sorts movie credits by box office revenue', () => {
  const movieCredits = [
    { id: 1, title: 'Small Film', release_date: '2020-01-01', popularity: 80, poster_path: '/small.jpg' },
    { id: 2, title: 'Big Film', release_date: '2021-01-01', popularity: 50, poster_path: '/big.jpg' },
    { id: 3, title: 'Unknown Film', release_date: '2022-01-01', popularity: 90, poster_path: '/unknown.jpg' },
  ];
  const movieDetails = [
    { id: 1, revenue: 1000 },
    { id: 2, revenue: 9000, release_date: '2021-05-06' },
    { id: 3, revenue: 0 },
  ];

  assert.deepEqual(selectRevenueWorks(movieCredits, movieDetails, 3), [
    { id: 2, type: 'movie', title: 'Big Film', date: '2021-05-06', popularity: 50, poster_path: '/big.jpg', revenue: 9000 },
    { id: 1, type: 'movie', title: 'Small Film', date: '2020-01-01', popularity: 80, poster_path: '/small.jpg', revenue: 1000 },
    { id: 3, type: 'movie', title: 'Unknown Film', date: '2022-01-01', popularity: 90, poster_path: '/unknown.jpg', revenue: 0 },
  ]);
});

test('getYearLabel returns a release year or placeholder', () => {
  assert.equal(getYearLabel({ date: '2021-05-06' }), '2021');
  assert.equal(getYearLabel({ release_date: '1994-09-17' }), '1994');
  assert.equal(getYearLabel({ first_air_date: '2000-01-01' }), '2000');
  assert.equal(getYearLabel({}), '—');
});

test('formatApiKeyError gives clear API key guidance', () => {
  assert.equal(formatApiKeyError(new Error('INVALID_API_KEY')), 'API Key 无效，请检查后再保存');
  assert.equal(formatApiKeyError(new Error('RATE_LIMITED')), '请求太频繁，稍等再试');
  assert.equal(formatApiKeyError(new Error('NO_NETWORK')), '无法连接 TMDB，请检查网络后重试');
});

test('getGraphMetrics scales node radius and edge width by collaboration count', () => {
  assert.deepEqual(getGraphMetrics(7, 7), { radius: 19, edgeWidth: 3.1, edgeAlpha: 0.58 });
  assert.deepEqual(getGraphMetrics(1, 7), { radius: 11.7, edgeWidth: 0.9, edgeAlpha: 0.24 });
});

test('getMobileOrbitPosition keeps stronger collaborators closer to center with organic offsets', () => {
  assert.deepEqual(getMobileOrbitPosition(0, 12, 320, 420, 7, 7), { x: 160, y: 102.9, orbit: 115.1 });
  assert.deepEqual(getMobileOrbitPosition(8, 12, 320, 420, 2, 7), { x: 52.3, y: 292, orbit: 130.7 });
});

test('getSharedWorkPreview returns compact shared work labels', () => {
  const works = [
    { title: '花样年华', date: '2000-09-29' },
    { title: '英雄', date: '2002-12-19' },
    { title: '东邪西毒', date: '' },
  ];

  assert.deepEqual(getSharedWorkPreview(works, 2), ['花样年华 · 2000', '英雄 · 2002']);
});

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

test('localizeDepartment: maps known TMDB values to Chinese, passes unknown through', () => {
  assert.equal(localizeDepartment('Acting'), '演员');
  assert.equal(localizeDepartment('Directing'), '导演');
  assert.equal(localizeDepartment('Costume & Make-Up'), '服装造型');
  assert.equal(localizeDepartment('SomeNewDept'), 'SomeNewDept'); // pass-through
  assert.equal(localizeDepartment(''), '');
  assert.equal(localizeDepartment(), '');
});
