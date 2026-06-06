export function createLatestOnlyRunner() {
  let latestId = 0;

  return {
    async run(task, onCommit, onError) {
      const id = ++latestId;
      try {
        const value = await task();
        if (id === latestId) onCommit(value);
        return value;
      } catch (error) {
        if (id === latestId && onError) onError(error);
        return undefined;
      }
    },
    isLatest(id) {
      return id === latestId;
    },
  };
}

export function normalizeWorks(movieCredits = [], tvCredits = []) {
  const works = [
    ...movieCredits.map(movie => ({
      id: movie.id,
      type: 'movie',
      title: movie.title || movie.original_title || '',
      date: movie.release_date || '',
      popularity: movie.popularity || 0,
      poster_path: movie.poster_path || '',
    })),
    ...tvCredits.map(show => ({
      id: show.id,
      type: 'tv',
      title: show.name || show.original_name || '',
      date: show.first_air_date || '',
      popularity: show.popularity || 0,
      poster_path: show.poster_path || '',
    })),
  ];

  const seen = new Set();
  const unique = [];
  for (const work of works) {
    const key = `${work.type}-${work.id}`;
    if (!work.id || seen.has(key)) continue;
    seen.add(key);
    unique.push(work);
  }
  return unique;
}

export function selectPopularWorks(movieCredits = [], tvCredits = [], limit = 5) {
  return normalizeWorks(movieCredits, tvCredits)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function selectRevenueWorks(movieCredits = [], movieDetails = [], limit = 5) {
  const detailsById = new Map(movieDetails.map(detail => [detail.id, detail]));
  const movies = normalizeWorks(movieCredits, [])
    .map(work => ({
      ...work,
      date: detailsById.get(work.id)?.release_date || work.date,
      revenue: detailsById.get(work.id)?.revenue || 0,
    }));

  return movies
    .sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return b.popularity - a.popularity;
    })
    .slice(0, limit);
}

export function sortWorksByDate(works = []) {
  return [...works].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function formatApiKeyError(error) {
  const message = error?.message || '';
  if (message === 'INVALID_API_KEY') return 'API Key 无效，请检查后再保存';
  if (message === 'API_KEY_NOT_SET') return '请先输入 TMDB API Key';
  if (message === 'RATE_LIMITED') return '请求太频繁，稍等再试';
  if (message === 'Failed to fetch' || message === 'NO_NETWORK') return '无法连接 TMDB，请检查网络后重试';
  return `请求失败：${message || '未知错误'}`;
}

export function getGraphMetrics(count = 1, maxCount = 1) {
  const ratio = Math.max(0, Math.min(1, count / Math.max(maxCount, 1)));
  return {
    radius: Number((10.5 + ratio * 8.5).toFixed(1)),
    edgeWidth: Number((0.5 + ratio * 2.6).toFixed(1)),
    edgeAlpha: Number((0.18 + ratio * 0.4).toFixed(2)),
  };
}

export function getMobileOrbitPosition(index, total, width, height, count = 1, maxCount = 1) {
  const centerX = width / 2;
  const centerY = height / 2 + 8;
  const strength = Math.max(0, Math.min(1, count / Math.max(maxCount, 1)));
  const baseOrbit = Math.min(width, height) * (0.42 - strength * 0.11);
  const organicOffset = Math.sin((index + 1) * 1.7) * 16;
  const orbit = Number((baseOrbit + organicOffset).toFixed(1));
  const angle = -Math.PI / 2 + (index / Math.max(total, 1)) * Math.PI * 2 + Math.sin(index * 2.3) * 0.18;

  return {
    x: Number((centerX + Math.cos(angle) * orbit).toFixed(1)),
    y: Number((centerY + Math.sin(angle) * orbit).toFixed(1)),
    orbit,
  };
}

export function getSharedWorkPreview(works = [], limit = 3) {
  return works.slice(0, limit).map(work => {
    const year = getYearLabel(work);
    return year ? `${work.title} · ${year}` : work.title;
  });
}

export function getYearLabel(work = {}) {
  return (work.date || work.release_date || work.first_air_date || '').slice(0, 4) || '—';
}

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

// TMDB known_for_department is English even with language=zh-CN. Localize to Chinese;
// unknown values pass through unchanged so future TMDB additions don't break the UI.
const DEPARTMENT_ZH = {
  Acting: '演员', Directing: '导演', Writing: '编剧', Production: '制片',
  Camera: '摄影', Editing: '剪辑', Sound: '音效', Art: '美术',
  'Costume & Make-Up': '服装造型', 'Visual Effects': '视觉特效',
  Lighting: '灯光', Crew: '剧组', Creator: '主创',
};
export function localizeDepartment(department = '') {
  if (!department) return '';
  return DEPARTMENT_ZH[department] || department;
}
