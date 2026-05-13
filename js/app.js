import {
  setApiKey, getApiKey,
  searchPerson, getPersonDetails,
  getPersonMovieCredits, getPersonTVCredits,
  getMovieCredits, getTVCredits,
  getMovieDetails, getTVDetails,
  profileUrl, posterUrl, backdropUrl
} from './api.js';
import { ForceGraph } from './graph.js';

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
const bannerTopMovies = document.getElementById('bannerTopMovies');
const bannerBio     = document.getElementById('bannerBio');
const backBtn       = document.getElementById('backBtn');
const graphToggleBtn = document.getElementById('graphToggleBtn');
const graphContainer = document.getElementById('graphContainer');
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
const modalMetaBar  = document.getElementById('modalMetaBar');
const modalOverview = document.getElementById('modalOverview');
const modalCast     = document.getElementById('modalCast');

// ── State ─────────────────────────────────────
let searchTimer = null;
let currentActor = null;
let currentCollabs = null;
let currentGraph = null;

// ── Cache ─────────────────────────────────────
const creditsCache = new Map();    // key: "movie-123" or "tv-456" → cast[]
const collabCache = new Map();     // key: actorId → collab results

// ── API Key ───────────────────────────────────
const savedKey = localStorage.getItem('tmdb_api_key');
if (savedKey) {
  setApiKey(savedKey);
}

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

  actorBanner.classList.remove('show');
  collabSection.classList.remove('show');
  graphContainer.classList.remove('show');
  loadingSection.classList.remove('show');
  graphToggleBtn.classList.remove('active');
  graphToggleBtn.textContent = '🔗 关系图';
  landingState.style.display = 'none';
  if (currentGraph) { currentGraph.destroy(); currentGraph = null; }

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
  currentCollabs = null;
  if (currentGraph) { currentGraph.destroy(); currentGraph = null; }
  searchResults.classList.remove('show');
  searchInput.value = '';

  bannerAvatar.src = profileUrl(person.profile_path);
  bannerAvatar.alt = person.name;
  bannerName.textContent = person.name;
  bannerDetails.textContent = person.known_for_department || '';
  bannerTopMovies.innerHTML = '';
  actorBanner.classList.add('show');
  landingState.style.display = 'none';

  collabSection.classList.remove('show');
  graphContainer.classList.remove('show');
  graphToggleBtn.classList.remove('active');
  graphToggleBtn.textContent = '🔗 关系图';
  loadingSection.classList.add('show');
  loadingText.textContent = '正在加载作品列表...';
  progressFill.style.width = '0%';

  try {
    const [details, movieCredits, tvCredits] = await Promise.all([
      getPersonDetails(person.id),
      getPersonMovieCredits(person.id),
      getPersonTVCredits(person.id)
    ]);

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

    let collabs;
    if (collabCache.has(person.id)) {
      collabs = collabCache.get(person.id);
      loadingSection.classList.remove('show');
    } else {
      const creditsByDate = [...uniqueCredits].sort((a, b) => b.date.localeCompare(a.date));
      collabs = await computeCollaborations(person.id, creditsByDate);
      collabCache.set(person.id, collabs);
    }
    currentCollabs = collabs;
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

  // Key: actorId (was: actor name — FIXED)
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
        const collabKey = castMember.id; // FIXED: was castMember.name
        if (!collabMap.has(collabKey)) {
          collabMap.set(collabKey, {
            id: castMember.id,
            name: castMember.name,
            profile_path: castMember.profile_path,
            count: 0,
            sharedWorks: new Map()
          });
        }
        const entry = collabMap.get(collabKey);
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
function renderCollaborations(collabs, actorName) {
  loadingSection.classList.remove('show');
  collabGrid.innerHTML = '';

  if (!collabs.length) {
    collabGrid.innerHTML = '<p style="text-align:center;color:var(--text-secondary);grid-column:1/-1;padding:40px">未找到合作演员数据</p>';
    collabSection.classList.add('show');
    return;
  }

  collabTitle.innerHTML = `与 <strong>「${esc(actorName)}」</strong> 合作过的演员 · ${collabs.length} 人`;

  collabs.forEach(c => {
    const card = document.createElement('div');
    card.className = 'collab-card';

    const sharedHTML = c.sharedWorks.map(w => {
      if (w.poster_path) {
        return `<img class="shared-movie-thumb" src="${posterUrl(w.poster_path, 'w92')}" alt="${esc(w.title)}" title="${esc(w.title)}" loading="lazy" data-movie-type="${w.type}" data-movie-id="${w.id}">`;
      }
      return `<div class="shared-movie-thumb-placeholder" title="${esc(w.title)}" data-movie-type="${w.type}" data-movie-id="${w.id}" style="cursor:pointer">${esc(w.title.slice(0, 4))}</div>`;
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
  currentCollabs = null;
  if (currentGraph) { currentGraph.destroy(); currentGraph = null; }
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
  modalMetaBar.innerHTML = '';
  modalOverview.textContent = '';
  modalCast.innerHTML = '<div class="modal-loading">正在加载...</div>';

  try {
    const [details, credits] = await Promise.all([
      type === 'movie' ? getMovieDetails(id) : getTVDetails(id),
      (async () => {
        const cacheKey = `${type}-${id}`;
        if (creditsCache.has(cacheKey)) return creditsCache.get(cacheKey);
        const cast = type === 'movie' ? await getMovieCredits(id) : await getTVCredits(id);
        creditsCache.set(cacheKey, cast);
        return cast;
      })()
    ]);

    if (details.backdrop_path) {
      modalHero.style.backgroundImage = `url(${backdropUrl(details.backdrop_path)})`;
    }

    modalPoster.src = posterUrl(details.poster_path, 'w342');
    modalTitle.textContent = details.title || details.name || '';

    const year = (details.release_date || details.first_air_date || '').slice(0, 4);
    const runtime = details.runtime ? `${details.runtime}分钟` : '';
    const genres = (details.genres || []).map(g => g.name).join(' / ');
    const rating = details.vote_average ? `★ ${details.vote_average.toFixed(1)}` : '';
    modalMetaBar.innerHTML = [year, runtime, genres, rating].filter(Boolean).map(s => `<span>${s}</span>`).join('');

    modalOverview.textContent = details.overview || '暂无简介';

    const topCast = (credits || []).slice(0, 30);
    modalCast.innerHTML = topCast.map(c => `
      <div class="modal-cast-item" data-person-id="${c.id}" data-person-name="${esc(c.name)}" data-person-profile="${c.profile_path || ''}">
        ${c.profile_path
          ? `<img class="cast-img" src="${profileUrl(c.profile_path)}" alt="${esc(c.name)}" loading="lazy">`
          : `<div class="cast-no-img">🎬</div>`
        }
        <div class="cast-name">${esc(c.name)}</div>
        ${c.character ? `<div class="cast-char">${esc(c.character)}</div>` : ''}
      </div>
    `).join('');

    modalCast.querySelectorAll('.modal-cast-item').forEach(chip => {
      chip.addEventListener('click', () => {
        const pid = parseInt(chip.dataset.personId);
        const pname = chip.dataset.personName;
        const pprofile = chip.dataset.personProfile;
        closeModal();
        selectActor({ id: pid, name: pname, profile_path: pprofile, known_for_department: '' });
      });
    });

  } catch (err) {
    modalCast.innerHTML = '<div class="modal-loading">加载失败</div>';
    showToast('加载电影详情失败');
  }
}

// ── Utils ─────────────────────────────────────
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
  graphContainer.classList.remove('show');
  loadingSection.classList.remove('show');
  graphToggleBtn.classList.remove('active');
  graphToggleBtn.textContent = '🔗 关系图';
  if (currentGraph) { currentGraph.destroy(); currentGraph = null; }
}

// ── Graph Toggle ──────────────────────────────
graphToggleBtn.addEventListener('click', () => {
  const isGraph = graphContainer.classList.contains('show');
  if (isGraph) {
    graphContainer.classList.remove('show');
    collabSection.classList.add('show');
    graphToggleBtn.textContent = '🔗 关系图';
    graphToggleBtn.classList.remove('active');
    if (currentGraph) { currentGraph.destroy(); currentGraph = null; }
  } else {
    collabSection.classList.remove('show');
    graphContainer.classList.add('show');
    graphToggleBtn.textContent = '📋 列表';
    graphToggleBtn.classList.add('active');
    renderGraph();
  }
});

function renderGraph() {
  if (!currentCollabs || !currentCollabs.length) return;
  graphContainer.innerHTML = '';
  currentGraph = new ForceGraph(
    graphContainer,
    currentCollabs,
    currentActor.name,
    (node) => {
      selectActor({ id: node.id, name: node.name, profile_path: '', known_for_department: '' });
    }
  );
}

// ── fmtMoney ──────────────────────────────────
function fmtMoney(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  return n.toString();
}

if (getApiKey()) showApp();
setTimeout(function(){ if (document.getElementById("apiKeyPrompt").classList.contains("show")) showApp(); }, 50);
