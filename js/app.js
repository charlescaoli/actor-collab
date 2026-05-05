import {
  setApiKey, getApiKey,
  searchPerson, getPersonDetails,
  getPersonMovieCredits, getPersonTVCredits,
  getMovieCredits, getTVCredits,
  getMovieDetails, getTVDetails,
  profileUrl, posterUrl, backdropUrl
} from './api.js';

// ── DOM refs ──────────────────────────────────
const apiKeyPrompt  = document.getElementById('apiKeyPrompt');
const apiKeyInput   = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const searchWrapper = document.getElementById('searchWrapper');
const searchInput   = document.getElementById('searchInput');
const searchSpinner = document.getElementById('searchSpinner');
const searchResults = document.getElementById('searchResults');
const suggestions   = document.getElementById('suggestions');
const landingState  = document.getElementById('landingState');
const actorBanner   = document.getElementById('actorBanner');
const bannerAvatar  = document.getElementById('bannerAvatar');
const bannerName    = document.getElementById('bannerName');
const bannerDetails = document.getElementById('bannerDetails');
const bannerBio     = document.getElementById('bannerBio');
const bannerTopMovies = document.getElementById('bannerTopMovies');
const backBtn       = document.getElementById('backBtn');
const graphToggleBtn = document.getElementById('graphToggleBtn');
const graphContainer = document.getElementById('graphContainer');
const graphCanvas   = document.getElementById('graphCanvas');
const loadingSection = document.getElementById('loadingSection');
const loadingText   = document.getElementById('loadingText');
const progressFill  = document.getElementById('progressFill');
const collabSection = document.getElementById('collabSection');
const collabTitle   = document.getElementById('collabTitle');
const collabGrid    = document.getElementById('collabGrid');
const errorToast    = document.getElementById('errorToast');
const movieModal    = document.getElementById('movieModal');
const modalClose    = document.getElementById('modalClose');
const modalHero     = document.getElementById('modalHero');
const modalPoster   = document.getElementById('modalPoster');
const modalTitle    = document.getElementById('modalTitle');
const modalOrigTitle = document.getElementById('modalOrigTitle');
const modalMetaBar  = document.getElementById('modalMetaBar');
const modalStats    = document.getElementById('modalStats');
const modalGenres   = document.getElementById('modalGenres');
const modalOverview = document.getElementById('modalOverview');
const modalCast     = document.getElementById('modalCast');
const modalCastTitle = document.getElementById('modalCastTitle');

// ── State ─────────────────────────────────────
let searchTimer = null;
let currentActor = null;

// ── Cache ─────────────────────────────────────
const creditsCache = new Map();    // key: "movie-123" or "tv-456" → cast[]
const collabCache = new Map();     // key: actorId → collab results

// ── API Key ───────────────────────────────────
if (getApiKey()) {
  showApp();
}

saveApiKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  setApiKey(key);
  localStorage.setItem('tmdb_api_key', key);
  showApp();
});

apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveApiKeyBtn.click();
});

function showApp() {
  apiKeyPrompt.classList.remove('show');
  searchWrapper.style.display = '';
  suggestions.style.display = '';
  landingState.style.display = '';
}

// ── Toast ─────────────────────────────────────
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  errorToast.textContent = msg;
  errorToast.classList.add('show');
  toastTimer = setTimeout(() => errorToast.classList.remove('show'), 3000);
}

// ── Search ────────────────────────────────────
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();

  if (!query) {
    searchResults.classList.remove('show');
    searchSpinner.classList.remove('active');
    return;
  }

  // Hide previous results while searching
  actorBanner.classList.remove('show');
  collabSection.classList.remove('show');
  loadingSection.classList.remove('show');
  landingState.style.display = 'none';

  searchSpinner.classList.add('active');
  searchTimer = setTimeout(() => doSearch(query), 300);
});

function doSearch(query) {
  searchPerson(query)
    .then(results => {
      searchSpinner.classList.remove('active');
      renderSearchResults(results);
    })
    .catch(err => {
      searchSpinner.classList.remove('active');
      if (err.message === 'INVALID_API_KEY') {
        showToast('API Key 无效，请重新输入');
        resetApiKey();
      } else if (err.message === 'RATE_LIMITED') {
        showToast('请求太频繁，请稍等再试');
      } else {
        showToast('搜索失败，请检查网络连接');
      }
    });
}

function renderSearchResults(results) {
  searchResults.innerHTML = '';

  if (!results.length) {
    searchResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">未找到匹配的演员</div>';
    searchResults.classList.add('show');
    return;
  }

  const sliced = results.slice(0, 8);
  sliced.forEach(person => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    const knownFor = (person.known_for || []).slice(0, 3).map(m => m.title || m.name).join(', ');
    div.innerHTML = `
      ${person.profile_path
        ? `<img src="${profileUrl(person.profile_path)}" alt="" loading="lazy">`
        : `<div class="no-avatar">🎬</div>`
      }
      <div class="info">
        <h3>${esc(person.name)}</h3>
        <span>${person.known_for_department || ''}${knownFor ? ' · ' + knownFor : ''}</span>
      </div>
    `;
    div.addEventListener('click', () => selectActor(person));
    searchResults.appendChild(div);
  });

  searchResults.classList.add('show');
}

// ── Quick suggestions ─────────────────────────
suggestions.addEventListener('click', (e) => {
  const chip = e.target.closest('.suggestion-chip');
  if (!chip) return;
  const name = chip.dataset.name;
  searchInput.value = name;
  searchResults.classList.remove('show');
  landingState.style.display = 'none';
  doSearch(name);
});

// ── Actor Selection ───────────────────────────
async function selectActor(person) {
  currentActor = person;
  searchResults.classList.remove('show');
  searchInput.value = '';

  // Show banner immediately with what we have
  bannerAvatar.src = profileUrl(person.profile_path);
  bannerAvatar.alt = person.name;
  bannerName.textContent = person.name;
  bannerDetails.textContent = person.known_for_department || '';
  bannerTopMovies.innerHTML = '';
  actorBanner.classList.add('show');
  landingState.style.display = 'none';

  // Show loading
  collabSection.classList.remove('show');
  loadingSection.classList.add('show');
  loadingText.textContent = '正在加载作品列表...';
  progressFill.style.width = '0%';

  try {
    const [details, movieCredits, tvCredits] = await Promise.all([
      getPersonDetails(person.id),
      getPersonMovieCredits(person.id),
      getPersonTVCredits(person.id)
    ]);

    // Update banner with details + bio
    bannerDetails.textContent = [
      details.birthday ? `🎂 ${details.birthday}` : '',
      details.place_of_birth ? `📍 ${details.place_of_birth}` : '',
    ].filter(Boolean).join('  ·  ') || person.known_for_department || '';
    bannerBio.textContent = details.biography
      ? details.biography.slice(0, 150).replace(/\n/g, ' ') + (details.biography.length > 150 ? '…' : '')
      : '';

    const allCredits = [
      ...movieCredits.map(m => ({ id: m.id, type: 'movie', title: m.title || m.original_title, date: m.release_date || '', popularity: m.popularity, poster_path: m.poster_path })),
      ...tvCredits.map(t => ({ id: t.id, type: 'tv', title: t.name || t.original_name, date: t.first_air_date || '', popularity: t.popularity, poster_path: t.poster_path }))
    ];

    const seenWorks = new Set();
    const uniqueCredits = [];
    for (const w of allCredits) {
      const k = `${w.type}-${w.id}`;
      if (seenWorks.has(k)) continue;
      seenWorks.add(k);
      uniqueCredits.push(w);
    }

    // Banner top 5: sort by box office revenue (fetch details for top popular movies)
    const moviesOnly = uniqueCredits.filter(w => w.type === 'movie');
    const topPopular = [...moviesOnly].sort((a, b) => b.popularity - a.popularity).slice(0, 15);
    const movieDetails = await Promise.allSettled(
      topPopular.map(w => getMovieDetails(w.id))
    );
    const withRevenue = topPopular
      .map((w, i) => ({ ...w, revenue: movieDetails[i].status === 'fulfilled' ? (movieDetails[i].value.revenue || 0) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
    const top5 = withRevenue.slice(0, 5);

    bannerTopMovies.innerHTML = top5.map(w => `
      <div class="top-movie-item">
        ${w.poster_path
          ? `<img src="${posterUrl(w.poster_path, 'w92')}" alt="${esc(w.title)}" loading="lazy" data-movie-type="${w.type}" data-movie-id="${w.id}">`
          : `<div style="width:62px;height:93px;background:rgba(255,255,255,0.04);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#5a5a6e;cursor:pointer" data-movie-type="${w.type}" data-movie-id="${w.id}">${esc(w.title)}</div>`
        }
        <div class="t-label">${esc(w.title)}</div>
        <div class="t-revenue">${w.revenue ? '$' + fmtMoney(w.revenue) : ''} · ${w.date.slice(0,4) || '—'}</div>
      </div>`).join('');

    // Compute collaborations: sort by date DESC (newest first) to cover full career
    let collabs;
    if (collabCache.has(person.id)) {
      collabs = collabCache.get(person.id);
      loadingSection.classList.remove('show');
    } else {
      const creditsByDate = [...uniqueCredits].sort((a, b) => b.date.localeCompare(a.date));
      collabs = await computeCollaborations(person.id, creditsByDate);
      collabCache.set(person.id, collabs);
    }
    renderCollaborations(collabs, person.name);

  } catch (err) {
    loadingSection.classList.remove('show');
    if (err.message === 'INVALID_API_KEY') {
      showToast('API Key 无效，请重新输入');
      resetApiKey();
    } else {
      showToast('加载失败: ' + err.message);
    }
  }
}

// ── Collaboration Computation ─────────────────
async function computeCollaborations(actorId, sortedWorks) {
  // sortedWorks is pre-sorted by date DESC, already deduplicated
  // Uniform sampling across the career to cover ALL eras (not just recent)
  const MAX = 50;
  let sampledWorks;
  if (sortedWorks.length <= MAX) {
    sampledWorks = sortedWorks;
  } else {
    const step = sortedWorks.length / MAX;
    sampledWorks = [];
    for (let i = 0; i < MAX; i++) {
      sampledWorks.push(sortedWorks[Math.floor(i * step)]);
    }
  }
  const total = sampledWorks.length;

  const collabMap = new Map();

  loadingText.textContent = `正在分析 ${total} 部作品中的合作演员...`;

  const BATCH = 8;
  for (let i = 0; i < sampledWorks.length; i += BATCH) {
    const batch = sampledWorks.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(w => {
        const cacheKey = `${w.type}-${w.id}`;
        if (creditsCache.has(cacheKey)) {
          return Promise.resolve(creditsCache.get(cacheKey));
        }
        return (w.type === 'movie' ? getMovieCredits(w.id) : getTVCredits(w.id))
          .then(cast => { creditsCache.set(cacheKey, cast); return cast; });
      })
    );

    results.forEach((r, j) => {
      if (r.status !== 'fulfilled') return;
      const work = batch[j];
      for (const castMember of r.value) {
        if (castMember.id === actorId) continue;
        const name = castMember.name;
        if (!collabMap.has(name)) {
          collabMap.set(name, {
            id: castMember.id,
            name,
            profile_path: castMember.profile_path,
            count: 0,
            sharedWorks: new Map()
          });
        }
        const entry = collabMap.get(name);
        entry.count++;
        const swKey = `${work.type}-${work.id}`;
        if (!entry.sharedWorks.has(swKey)) {
          entry.sharedWorks.set(swKey, work);
        }
      }
    });

    const done = Math.min(i + BATCH, total);
    progressFill.style.width = `${(done / total) * 100}%`;
    loadingText.textContent = `正在分析 ${done}/${total} 部作品...`;
  }

  // Sort by count desc, take top 50, convert sharedWorks to sorted array (top 5)
  return [...collabMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 50)
    .map(c => ({
      ...c,
      sharedWorks: [...c.sharedWorks.values()]
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 5)
    }));
}

// ── Render Collaborations ─────────────────────
const revenueCache = new Map();
async function renderCollaborations(collabs, actorName) {
  loadingSection.classList.remove('show');
  collabGrid.innerHTML = '';

  if (!collabs.length) {
    collabGrid.innerHTML = '<p style="text-align:center;color:var(--text-secondary);grid-column:1/-1;padding:40px">未找到合作演员数据</p>';
    collabSection.classList.add('show');
    return;
  }

  collabTitle.innerHTML = `与 <strong>「${esc(actorName)}」</strong> 合作过的演员 · ${collabs.length} 人`;

  // Fetch revenue for shared movies
  const allMovies = new Map();
  for (const c of collabs) {
    for (const [key, w] of c.sharedWorks) {
      if (!allMovies.has(key) && w.type === 'movie') allMovies.set(key, w);
    }
  }
  const movieList = [...allMovies.values()];
  if (movieList.length) {
    const B = 10;
    for (let i = 0; i < movieList.length; i += B) {
      const batch = movieList.slice(i, i + B);
      const results = await Promise.allSettled(batch.map(w => {
        const ck = `movie-${w.id}`;
        if (revenueCache.has(ck)) return Promise.resolve(revenueCache.get(ck));
        return getMovieDetails(w.id).then(d => { const r = d.revenue || 0; revenueCache.set(ck, r); return r; });
      }));
      results.forEach((r, j) => { if (r.status === 'fulfilled') allMovies.get(`movie-${batch[j].id}`).revenue = r.value; });
    }
  }

  collabs.forEach(c => {
    const card = document.createElement('div');
    card.className = 'collab-card';

    const swList = [...c.sharedWorks.values()]
      .map(w => { w.revenue = w.revenue || revenueCache.get(`movie-${w.id}`) || 0; return w; })
      .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const sharedHTML = swList.map(w => {
      const year = w.date ? w.date.slice(0, 4) : '—';
      const rev = w.revenue && w.type === 'movie' ? '$' + fmtMoney(w.revenue) : '';
      return `<div class="shared-movie-line">
        ${w.poster_path ? `<img src="${posterUrl(w.poster_path, 'w92')}" alt="" data-movie-type="${w.type}" data-movie-id="${w.id}">` : ''}
        <span>${esc(w.title)}</span>
        <span class="sm-year">${year}</span>
        ${rev ? `<span class="sm-revenue">${rev}</span>` : ''}
      </div>`;
    }).join('');

    card.innerHTML = `
      ${c.profile_path
        ? `<img class="avatar" src="${profileUrl(c.profile_path, 'w185')}" alt="${esc(c.name)}" loading="lazy">`
        : `<div class="no-avatar-card">🎬</div>`
      }
      <div class="meta">
        <h4>${esc(c.name)}</h4>
        <span class="count">合作 ${c.count} 次</span>
      </div>
      <div class="shared-movies">${sharedHTML}</div>
    `;

    card.addEventListener('click', () => {
      selectActor({ id: c.id, name: c.name, profile_path: c.profile_path, known_for_department: '' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    collabGrid.appendChild(card);
  });

  collabSection.classList.add('show');
}

// ── Back button ───────────────────────────────
backBtn.addEventListener('click', () => {
  currentActor = null;
  actorBanner.classList.remove('show');
  collabSection.classList.remove('show');
  graphContainer.classList.remove('show');
  loadingSection.classList.remove('show');
  graphToggleBtn.classList.remove('active');
  graphToggleBtn.textContent = '🔗 关系图';
  searchInput.value = '';
  landingState.style.display = '';
  searchInput.focus();
});

// ── Click outside search results ──────────────
document.addEventListener('click', (e) => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.classList.remove('show');
  }

  // Movie poster click → open detail modal
  const movieThumb = e.target.closest('[data-movie-type]');
  if (movieThumb) {
    const type = movieThumb.dataset.movieType;
    const id = parseInt(movieThumb.dataset.movieId);
    if (type && id) openMovieDetail(type, id);
  }
});

// ── Movie Detail Modal ────────────────────────
modalClose.addEventListener('click', closeModal);
movieModal.addEventListener('click', (e) => {
  if (e.target === movieModal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  movieModal.classList.remove('show');
  document.body.style.overflow = '';
}

async function openMovieDetail(type, id) {
  movieModal.classList.add('show');
  document.body.style.overflow = 'hidden';
  modalHero.style.backgroundImage = '';
  modalPoster.src = '';
  modalTitle.textContent = '加载中...';
  modalOrigTitle.textContent = '';
  modalMetaBar.innerHTML = '';
  modalStats.innerHTML = '';
  modalGenres.innerHTML = '';
  modalOverview.textContent = '';
  modalCast.innerHTML = '';

  try {
    const [details, credits] = await Promise.all([
      type === 'movie' ? getMovieDetails(id) : getTVDetails(id),
      (async () => {
        const cacheKey = `${type}-${id}`;
        if (creditsCache.has(cacheKey)) return creditsCache.get(cacheKey);
        const cast = type === 'movie' ? await getMovieCredits(id) : await getTVCredits(id);
        creditsCache.set(cacheKey, cast); return cast;
      })()
    ]);

    if (details.backdrop_path) modalHero.style.backgroundImage = `url(${backdropUrl(details.backdrop_path)})`;
    modalPoster.src = details.backdrop_path ? backdropUrl(details.backdrop_path, 'w780') : posterUrl(details.poster_path, 'w342');

    modalTitle.textContent = details.title || details.name || '';
    modalOrigTitle.textContent = details.original_title && details.original_title !== details.title ? details.original_title : '';

    const year = (details.release_date || details.first_air_date || '').slice(0, 4);
    const rating = details.vote_average ? details.vote_average.toFixed(1) : '';
    const runtime = details.runtime ? `${details.runtime} min` : '';
    modalMetaBar.innerHTML = [
      rating ? `<span class="star">★</span><strong>${rating}</strong><small style="color:#888;font-size:0.72rem">/10</small>` : '',
      year ? `<span>${year}</span>` : '',
      runtime ? `<span>${runtime}</span>` : ''
    ].filter(Boolean).join('<span style="color:#444;margin:0 4px">·</span>');

    const revenue = details.revenue || 0;
    const budget = details.budget || 0;
    const country = (details.production_countries || []).map(c => c.name).join(' / ') || '—';
    const lang = (details.spoken_languages || []).map(l => l.name).join(' / ') || '—';
    modalStats.innerHTML = [
      revenue ? `<div class="stat"><span class="lbl">全球票房</span><span class="val gold">$${fmtMoney(revenue)}</span></div>` : '',
      budget ? `<div class="stat"><span class="lbl">预算</span><span class="val">$${fmtMoney(budget)}</span></div>` : '',
      year ? `<div class="stat"><span class="lbl">上映日期</span><span class="val">${details.release_date || details.first_air_date || '—'}</span></div>` : '',
      `<div class="stat"><span class="lbl">制片国家</span><span class="val">${country}</span></div>`,
      `<div class="stat"><span class="lbl">语言</span><span class="val">${lang}</span></div>`
    ].join('');

    modalGenres.innerHTML = (details.genres || []).map(g => `<span>${g.name}</span>`).join('');

    modalOverview.textContent = details.overview || '暂无简介';

    const topCast = (credits || []).slice(0, 20);
    modalCastTitle.textContent = `演员表 · ${topCast.length}`;
    modalCast.innerHTML = topCast.map(c => `
      <div class="modal-cast-item" data-person-id="${c.id}" data-person-name="${esc(c.name)}" data-person-profile="${c.profile_path || ''}">
        ${c.profile_path ? `<img class="cast-img" src="${profileUrl(c.profile_path)}" alt="${esc(c.name)}" loading="lazy">` : `<div class="cast-no-img">🎬</div>`}
        <div class="cast-name">${esc(c.name)}</div>
        ${c.character ? `<div class="cast-char">${esc(c.character)}</div>` : ''}
      </div>`).join('');

    modalCast.querySelectorAll('.modal-cast-item').forEach(item => {
      item.addEventListener('click', () => {
        closeModal();
        selectActor({ id: parseInt(item.dataset.personId), name: item.dataset.personName, profile_path: item.dataset.personProfile, known_for_department: '' });
      });
    });
  } catch (err) { showToast('加载电影详情失败'); }
}

// ── Graph Toggle ──────────────────────────────
graphToggleBtn.addEventListener('click', () => {
  const isGraph = graphContainer.classList.contains('show');
  if (isGraph) {
    graphContainer.classList.remove('show');
    collabSection.classList.add('show');
    graphToggleBtn.textContent = '🔗 关系图';
    graphToggleBtn.classList.remove('active');
  } else {
    collabSection.classList.remove('show');
    graphContainer.classList.add('show');
    graphToggleBtn.textContent = '📋 列表';
    graphToggleBtn.classList.add('active');
    if (!simRunning) initGraph();
  }
});

// ── Canvas Force Graph ────────────────────────
let graphCtx, graphW, graphH, simNodes = [], simLinks = [], simRunning = false;
let dragNode = null, hoverNode = null, viewX = 0, viewY = 0, viewScale = 1;
let mouseDown = false, lastMouse = null;

function initGraph() {
  graphCtx = graphCanvas.getContext('2d');
  resizeGraph();
  buildGraph();
  if (!simRunning) runSim();
}

function resizeGraph() {
  const rect = graphContainer.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  graphCanvas.width = rect.width * dpr;
  graphCanvas.height = 460 * dpr;
  graphCanvas.style.width = rect.width + 'px';
  graphCanvas.style.height = '460px';
  graphW = rect.width; graphH = 460;
  graphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function buildGraph() {
  if (!currentCollabs || !currentCollabs.length) return;
  simNodes = []; simLinks = [];
  const actorName = bannerName.textContent;
  const cx = graphW / 2, cy = graphH / 2;
  simNodes.push({ name: actorName, x: cx, y: cy, vx: 0, vy: 0, count: 0, type: 'center', id: null });

  const top30 = currentCollabs.slice(0, 30);
  for (const c of top30) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 180;
    simNodes.push({ name: c.name, id: c.id, count: c.count, type: 'actor', x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, vx: 0, vy: 0 });
    simLinks.push({ source: actorName, target: c.name, weight: c.count, type: 'collab' });
  }

  // Film nodes
  const filmSet = new Map();
  for (const c of top30) {
    for (const [key, w] of c.sharedWorks) {
      if (!filmSet.has(key)) filmSet.set(key, { ...w, actors: [] });
      filmSet.get(key).actors.push(c.name);
    }
  }
  for (const [key, m] of filmSet) {
    let ax = cx, ay = cy, n = 0;
    for (const an of m.actors) { const sn = simNodes.find(nn => nn.name === an); if (sn) { ax += sn.x; ay += sn.y; n++; } }
    if (n > 0) { ax /= n; ay /= n; }
    simNodes.push({ name: m.title, id: m.id, count: 0, type: 'film', x: ax + (Math.random() - 0.5) * 60, y: ay + (Math.random() - 0.5) * 60, vx: 0, vy: 0 });
    for (const an of m.actors) simLinks.push({ source: m.title, target: an, weight: 1, type: 'film' });
    simLinks.push({ source: m.title, target: actorName, weight: 1, type: 'film' });
  }

  // Co-star links
  for (let i = 0; i < top30.length; i++) {
    for (let j = i + 1; j < top30.length; j++) {
      const shared = [...top30[i].sharedWorks.keys()].filter(k => top30[j].sharedWorks.has(k));
      if (shared.length) simLinks.push({ source: top30[i].name, target: top30[j].name, weight: shared.length, type: 'costar' });
    }
  }
  viewScale = 1; viewX = 0; viewY = 0;
}

function runSim() {
  simRunning = true;
  function step() {
    if (!graphContainer.classList.contains('show')) { simRunning = false; return; }
    if (!dragNode) {
      for (const n of simNodes) {
        if (n.type === 'center') continue;
        n.vx *= n.type === 'film' ? 0.6 : 0.5; n.vy *= n.type === 'film' ? 0.6 : 0.5;
        for (const m of simNodes) {
          if (n === m || m.type === 'film') continue;
          let dx = n.x - m.x, dy = n.y - m.y;
          const dist = Math.max(Math.sqrt(dx*dx + dy*dy), 1);
          const force = (n.type === 'film' ? 150 : 500) / (dist * dist);
          n.vx += (dx / dist) * force; n.vy += (dy / dist) * force;
        }
      }
      for (const l of simLinks) {
        const s = simNodes.find(n => n.name === l.source);
        const t = simNodes.find(n => n.name === l.target);
        if (!s || !t) continue;
        let dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const ideal = l.type === 'film' ? 40 : 55 + 50 / l.weight;
        const force = (dist - ideal) * (l.type === 'film' ? 0.04 : 0.02);
        s.vx += dx * force * 0.5; s.vy += dy * force * 0.5;
        t.vx -= dx * force * 0.5; t.vy -= dy * force * 0.5;
      }
      const cw = graphContainer.clientWidth, ch = graphContainer.clientHeight;
      const center = simNodes[0];
      center.vx += (cw/2 - center.x) * 0.02; center.vy += (ch/2 - center.y) * 0.02;
      for (const n of simNodes) {
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(12, Math.min(cw-12, n.x)); n.y = Math.max(12, Math.min(ch-12, n.y));
      }
    }
    drawGraph();
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function drawGraph() {
  const ctx = graphCtx; const dpr = devicePixelRatio || 1;
  const bg = ctx.createRadialGradient(graphW/2, graphH/2, 0, graphW/2, graphH/2, Math.max(graphW, graphH)*0.7);
  bg.addColorStop(0, '#14141e'); bg.addColorStop(1, '#0a0a0f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, graphW, graphH);
  ctx.save(); ctx.translate(viewX, viewY); ctx.scale(viewScale, viewScale);

  const highlightSet = new Set();
  if (hoverNode) { highlightSet.add(hoverNode.name); for (const l of simLinks) { if (l.source === hoverNode.name) highlightSet.add(l.target); if (l.target === hoverNode.name) highlightSet.add(l.source); } }

  for (const l of simLinks) {
    const s = simNodes.find(n => n.name === l.source), t = simNodes.find(n => n.name === l.target);
    if (!s || !t) continue;
    const hl = hoverNode && highlightSet.has(s.name) && highlightSet.has(t.name);
    if (l.type === 'film' && hoverNode && !hl) continue;
    const a = l.type === 'film' ? (hl ? 0.4 : 0.08) : (hl ? Math.min(0.7, l.weight*0.18) : Math.min(0.18, l.weight*0.03));
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = l.type === 'film' ? `rgba(130,160,220,${a})` : (hl ? `rgba(245,197,24,${a})` : `rgba(150,150,180,${a})`);
    ctx.lineWidth = l.type === 'film' ? 0.3 : (hl ? Math.max(0.8, l.weight*0.5) : Math.max(0.3, l.weight*0.18));
    ctx.stroke();
  }

  for (const n of simNodes) {
    const hl = hoverNode && highlightSet.has(n.name), fd = hoverNode && !highlightSet.has(n.name);
    const r = n.type === 'center' ? 10 : n.type === 'film' ? 1.5 : Math.max(3, Math.min(7, 3 + n.count*0.5));
    if (n.type === 'film' && fd) continue;
    if (n.type === 'center') { for (let g=3;g>=1;g--) { const gr=ctx.createRadialGradient(n.x,n.y,r*0.2,n.x,n.y,r*g*2.5); gr.addColorStop(0,`rgba(245,197,24,${0.5/g})`); gr.addColorStop(1,'rgba(245,197,24,0)'); ctx.beginPath(); ctx.arc(n.x,n.y,r*g*2.5,0,Math.PI*2); ctx.fillStyle=gr; ctx.fill(); } }
    if (hl && n.type==='actor') { const hg=ctx.createRadialGradient(n.x,n.y,r*0.3,n.x,n.y,r*5); hg.addColorStop(0,'rgba(245,197,24,0.45)'); hg.addColorStop(1,'rgba(245,197,24,0)'); ctx.beginPath(); ctx.arc(n.x,n.y,r*5,0,Math.PI*2); ctx.fillStyle=hg; ctx.fill(); }
    ctx.beginPath(); ctx.arc(n.x, n.y, (hl && n.type==='actor') ? r*1.5 : r, 0, Math.PI*2);
    ctx.fillStyle = n.type==='center' ? '#f5c518' : n.type==='film' ? (hl?'rgba(150,180,255,0.7)':'rgba(120,140,200,0.25)') : hl?'#f5c518':fd?'rgba(80,80,110,0.2)':`rgba(190,200,225,${0.5+n.count*0.05})`;
    ctx.fill();
    if (n.type!=='film') { ctx.strokeStyle=n.type==='center'?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.08)'; ctx.lineWidth=n.type==='center'?2:0.5; ctx.stroke(); }
    if (n.type==='center'||(hl&&n.type==='actor')) { ctx.fillStyle=n.type==='center'?'#fff':'#f5c518'; ctx.font=(n.type==='center'?'bold 11px':'9px')+' -apple-system,sans-serif'; ctx.textAlign='center'; ctx.fillText(n.name,n.x,n.y-r-6); if(hl&&n.type==='actor'){ctx.fillStyle='#999';ctx.font='7.5px -apple-system,sans-serif';ctx.fillText('合作'+n.count+'次',n.x,n.y-r-18);} }
  }
  ctx.restore();
}

function screenToGraph(ex, ey) {
  const rect = graphCanvas.getBoundingClientRect();
  return { x: (ex - rect.left - viewX) / viewScale, y: (ey - rect.top - viewY) / viewScale };
}

graphCanvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return; const p = screenToGraph(e.clientX, e.clientY);
  for (const n of simNodes) { if (n.type === 'film') continue; const r = n.type === 'center' ? 10 : Math.max(3, 3+n.count*0.5); if ((p.x-n.x)**2+(p.y-n.y)**2 < (r+10)**2) { dragNode=n; return; } }
  mouseDown=true; lastMouse={x:e.clientX,y:e.clientY};
});
graphCanvas.addEventListener('mousemove', e => {
  if (dragNode) { const p=screenToGraph(e.clientX,e.clientY); dragNode.x=p.x; dragNode.y=p.y; dragNode.vx=0; dragNode.vy=0; return; }
  if (mouseDown&&lastMouse) { viewX+=e.clientX-lastMouse.x; viewY+=e.clientY-lastMouse.y; lastMouse={x:e.clientX,y:e.clientY}; return; }
  const p=screenToGraph(e.clientX,e.clientY); hoverNode=null;
  for (const n of simNodes) { if (n.type==='film') continue; const r=n.type==='center'?10:Math.max(3,3+n.count*0.5); if ((p.x-n.x)**2+(p.y-n.y)**2<(r+10)**2) { hoverNode=n; break; } }
  graphCanvas.style.cursor=hoverNode?'pointer':'grab';
});
window.addEventListener('mouseup', () => { dragNode=null; mouseDown=false; lastMouse=null; });
graphCanvas.addEventListener('click', e => {
  if (dragNode||mouseDown) return;
  if (hoverNode&&hoverNode.type==='actor'&&hoverNode.id) { selectActor({id:hoverNode.id,name:hoverNode.name,profile_path:'',known_for_department:''}); graphContainer.classList.remove('show'); collabSection.classList.add('show'); graphToggleBtn.textContent='🔗 关系图'; graphToggleBtn.classList.remove('active'); window.scrollTo({top:0,behavior:'smooth'}); }
});
graphCanvas.addEventListener('wheel', e => {
  e.preventDefault(); const delta=e.deltaY>0?0.88:1.12; viewScale=Math.max(0.25,Math.min(3.5,viewScale*delta));
  const mx=e.clientX-graphCanvas.getBoundingClientRect().left, my=e.clientY-graphCanvas.getBoundingClientRect().top;
  viewX=mx-(mx-viewX)*delta; viewY=my-(my-viewY)*delta;
});
graphCanvas.addEventListener('mouseleave', () => { hoverNode=null; });
window.addEventListener('resize', () => { if (graphContainer.classList.contains('show')) resizeGraph(); });

// ── Graph search fix ───────────────────────────
const origSearchInput = searchInput.addEventListener('input', () => {}); // already handled
// Hide graph when searching
const origHandler = searchInput.oninput; // will be overridden
searchInput.addEventListener('input', () => { graphContainer.classList.remove('show'); graphToggleBtn.classList.remove('active'); graphToggleBtn.textContent = '🔗 关系图'; });

// ── Utils ─────────────────────────────────────
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtMoney(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  return n.toString();
}

function resetApiKey() {
  localStorage.removeItem('tmdb_api_key');
  setApiKey('');
  apiKeyPrompt.classList.add('show');
  searchWrapper.style.display = 'none';
  suggestions.style.display = 'none';
  landingState.style.display = 'none';
  actorBanner.classList.remove('show');
  collabSection.classList.remove('show');
  loadingSection.classList.remove('show');
}
