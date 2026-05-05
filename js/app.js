import {
  setApiKey, getApiKey,
  searchPerson, getPersonDetails,
  getPersonMovieCredits, getPersonTVCredits,
  getMovieCredits, getTVCredits,
  getMovieDetails, getTVDetails,
  profileUrl, posterUrl, backdropUrl
} from './api.js';

// ── DOM refs ──────────────────────────────────
const $ = id => document.getElementById(id);
const apiKeyPrompt  = $('apiKeyPrompt');
const apiKeyInput   = $('apiKeyInput');
const saveApiKeyBtn = $('saveApiKey');
const searchWrapper = $('searchWrapper');
const searchInput   = $('searchInput');
const searchSpinner = $('searchSpinner');
const searchResults = $('searchResults');
const suggestions   = $('suggestions');
const landingState  = $('landingState');
const actorBanner   = $('actorBanner');
const bannerAvatar  = $('bannerAvatar');
const bannerName    = $('bannerName');
const bannerDetails = $('bannerDetails');
const bannerBio     = $('bannerBio');
const bannerTopMovies = $('bannerTopMovies');
const backBtn       = $('backBtn');
const graphToggleBtn = $('graphToggleBtn');
const loadingSection = $('loadingSection');
const loadingText   = $('loadingText');
const progressFill  = $('progressFill');
const graphContainer = $('graphContainer');
const collabSection = $('collabSection');
const collabTitle   = $('collabTitle');
const collabGrid    = $('collabGrid');
const errorToast    = $('errorToast');
const movieModal    = $('movieModal');

// ── State ─────────────────────────────────────
let searchTimer = null;
let currentCollabs = [];  // store current collab data for graph

// ── Cache ─────────────────────────────────────
const creditsCache = new Map();
const collabCache = new Map();
const revenueCache = new Map(); // key: "movie-123" → revenue number

// ── Init (deferred to DOM ready) ──────────────
function initApp() {
  // API Key
  saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;
    setApiKey(key);
    localStorage.setItem('tmdb_api_key', key);
    showApp();
  });
  apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveApiKeyBtn.click(); });

  // Search
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    if (!query) { searchResults.classList.remove('show'); searchSpinner.classList.remove('active'); return; }
    actorBanner.classList.remove('show'); collabSection.classList.remove('show');
    graphContainer.classList.remove('show'); loadingSection.classList.remove('show');
    landingState.style.display = 'none';
    searchSpinner.classList.add('active');
    searchTimer = setTimeout(() => doSearch(query), 300);
  });

  suggestions.addEventListener('click', e => {
    const chip = e.target.closest('.suggestion-chip');
    if (!chip) return;
    searchInput.value = chip.dataset.name;
    searchResults.classList.remove('show'); landingState.style.display = 'none';
    doSearch(chip.dataset.name);
  });

  // Graph toggle
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
      initGraph();
    }
  });

  // Back button
  backBtn.addEventListener('click', () => {
    actorBanner.classList.remove('show'); collabSection.classList.remove('show');
    graphContainer.classList.remove('show'); loadingSection.classList.remove('show');
    graphToggleBtn.classList.remove('active'); graphToggleBtn.textContent = '🔗 关系图';
    searchInput.value = ''; landingState.style.display = '';
    searchInput.focus(); currentCollabs = [];
  });

  // Click outside search
  document.addEventListener('click', e => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.classList.remove('show');
    const movieThumb = e.target.closest('[data-movie-type]');
    if (movieThumb) openMovieDetail(movieThumb.dataset.movieType, parseInt(movieThumb.dataset.movieId));
  });

  // Modal close
  modalClose.addEventListener('click', closeModal);
  movieModal.addEventListener('click', e => { if (e.target === movieModal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  if (getApiKey()) showApp();
}

}

// ── Graph (DOM nodes + SVG) ──────────────────
let simRunning = false;
let simNodes = [], simLinks = [];
let hoverNodeEl = null;

function initGraph() {
  buildGraphDOM();
  if (!simRunning) runSimDOM();
}

function buildGraphDOM() {
  if (!currentCollabs.length) return;
  const container = graphContainer;
  const svg = document.getElementById('graphSvg');
  const nodesLayer = document.getElementById('graphNodesLayer');
  svg.innerHTML = '';
  nodesLayer.innerHTML = '';

  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const cx = cw / 2, cy = ch / 2;
  const actorName = bannerName.textContent;

  simNodes = [];
  simLinks = [];

  // Center node
  simNodes.push({ name: actorName, id: null, count: 0, type: 'center', x: cx, y: cy, vx: 0, vy: 0, el: null });

  // Actor nodes from top 30
  const topActors = currentCollabs.slice(0, 30);
  for (const c of topActors) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 90 + Math.random() * 160;
    simNodes.push({
      name: c.name, id: c.id, count: c.count, type: 'actor',
      x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, vx: 0, vy: 0, el: null
    });
    simLinks.push({ source: actorName, target: c.name, weight: c.count, type: 'collab' });
  }

  // Film nodes from shared works
  const filmSet = new Map();
  for (const c of topActors) {
    for (const [key, w] of c.sharedWorks) {
      if (!filmSet.has(key)) filmSet.set(key, { ...w, actors: [] });
      filmSet.get(key).actors.push(c.name);
    }
  }
  for (const [key, m] of filmSet) {
    let ax = cx, ay = cy, n = 0;
    for (const an of m.actors) {
      const sn = simNodes.find(nn => nn.name === an);
      if (sn) { ax += sn.x; ay += sn.y; n++; }
    }
    if (n > 0) { ax /= n; ay /= n; }
    simNodes.push({
      name: m.title, id: m.id, count: 0, type: 'film', filmType: m.type,
      x: ax + (Math.random() - 0.5) * 60, y: ay + (Math.random() - 0.5) * 60, vx: 0, vy: 0, el: null
    });
    for (const an of m.actors) {
      simLinks.push({ source: m.title, target: an, weight: 1, type: 'film' });
    }
    simLinks.push({ source: m.title, target: actorName, weight: 1, type: 'film' });
  }

  // Co-star links
  for (let i = 0; i < topActors.length; i++) {
    for (let j = i + 1; j < topActors.length; j++) {
      const shared = [...topActors[i].sharedWorks.keys()].filter(k => topActors[j].sharedWorks.has(k));
      if (shared.length) simLinks.push({ source: topActors[i].name, target: topActors[j].name, weight: shared.length, type: 'costar' });
    }
  }

  // Create DOM elements for nodes
  for (const n of simNodes) {
    const el = document.createElement('div');
    if (n.type === 'center') el.className = 'gnode gnode-center';
    else if (n.type === 'actor') el.className = n.count >= 5 ? 'gnode gnode-actor-strong' : 'gnode gnode-actor';
    else el.className = 'gnode gnode-film';

    const label = document.createElement('div');
    label.className = 'gnode-label';
    label.textContent = n.name;
    el.appendChild(label);

    if (n.type === 'actor') {
      const countEl = document.createElement('div');
      countEl.className = 'gnode-count';
      countEl.textContent = `合作${n.count}次`;
      el.appendChild(countEl);
    }

    el.addEventListener('mouseenter', () => highlightNode(n, el));
    el.addEventListener('mouseleave', () => unhighlightAll());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (n.type === 'actor' && n.id) {
        selectActor({ id: n.id, name: n.name, profile_path: '', known_for_department: '' });
        graphContainer.classList.remove('show');
        collabSection.classList.add('show');
        graphToggleBtn.textContent = '🔗 关系图';
        graphToggleBtn.classList.remove('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    // Drag
    let dragging = false;
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true; e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      n.x = mx; n.y = my; n.vx = 0; n.vy = 0;
    });
    window.addEventListener('mouseup', () => { dragging = false; });

    nodesLayer.appendChild(el);
    n.el = el;
  }

  updatePositions();
}

function highlightNode(n, el) {
  hoverNodeEl = el;
  const name = n.name;
  const related = new Set([name]);
  for (const l of simLinks) {
    if (l.source === name) related.add(l.target);
    if (l.target === name) related.add(l.source);
  }
  for (const sn of simNodes) {
    if (sn.el) {
      if (related.has(sn.name)) {
        sn.el.classList.remove('gnode-faded');
        if (sn.type === 'actor' && sn.name !== name) sn.el.classList.add('gnode-highlight');
      } else {
        sn.el.classList.add('gnode-faded');
      }
    }
  }
  // Update SVG links
  drawLinks(name, related);
}

function unhighlightAll() {
  hoverNodeEl = null;
  for (const sn of simNodes) {
    if (sn.el) { sn.el.classList.remove('gnode-faded', 'gnode-highlight'); }
  }
  drawLinks(null, new Set());
}

function drawLinks(activeName, related) {
  const svg = document.getElementById('graphSvg');
  svg.innerHTML = '';
  for (const l of simLinks) {
    const s = simNodes.find(n => n.name === l.source);
    const t = simNodes.find(n => n.name === l.target);
    if (!s || !t) continue;
    const relatedTo = activeName && (related.has(s.name) && related.has(t.name));
    if (activeName && !relatedTo && l.type === 'film') continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', s.x); line.setAttribute('y1', s.y);
    line.setAttribute('x2', t.x); line.setAttribute('y2', t.y);
    const alpha = l.type === 'film' ? (relatedTo ? 0.5 : 0.1) : (relatedTo ? 0.7 : 0.15);
    const color = l.type === 'film' ? `rgba(130,160,220,${alpha})` : (relatedTo ? `rgba(245,197,24,${alpha})` : `rgba(160,160,190,${alpha})`);
    const width = l.type === 'film' ? 0.4 : (relatedTo ? Math.max(0.8, l.weight * 0.4) : Math.max(0.3, l.weight * 0.15));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', width);
    svg.appendChild(line);
  }
}

function updatePositions() {
  for (const n of simNodes) {
    if (n.el) { n.el.style.left = n.x + 'px'; n.el.style.top = n.y + 'px'; }
  }
  if (!hoverNodeEl) drawLinks(null, new Set());
}

function runSimDOM() {
  simRunning = true;
  function step() {
    if (!graphContainer.classList.contains('show')) { simRunning = false; return; }
    for (const n of simNodes) {
      if (n.type === 'center') continue;
      const damp = n.type === 'film' ? 0.6 : 0.5;
      n.vx *= damp; n.vy *= damp;
      for (const m of simNodes) {
        if (n === m || m.type === 'film') continue;
        let dx = n.x - m.x, dy = n.y - m.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (n.type === 'film' ? 150 : 500) / (dist * dist);
        n.vx += (dx / dist) * force;
        n.vy += (dy / dist) * force;
      }
    }
    for (const l of simLinks) {
      const s = simNodes.find(n => n.name === l.source);
      const t = simNodes.find(n => n.name === l.target);
      if (!s || !t) continue;
      let dx = t.x - s.x, dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ideal = l.type === 'film' ? 40 : 55 + 50 / l.weight;
      const force = (dist - ideal) * (l.type === 'film' ? 0.04 : 0.02);
      s.vx += dx * force * 0.5; s.vy += dy * force * 0.5;
      t.vx -= dx * force * 0.5; t.vy -= dy * force * 0.5;
    }
    const cw = graphContainer.clientWidth, ch = graphContainer.clientHeight;
    const center = simNodes[0];
    center.vx += (cw / 2 - center.x) * 0.02;
    center.vy += (ch / 2 - center.y) * 0.02;
    for (const n of simNodes) {
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(12, Math.min(cw - 12, n.x));
      n.y = Math.max(12, Math.min(ch - 12, n.y));
    }
    updatePositions();
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Movie Detail Modal (IMDB Style) ───────────
const modalClose    = $('modalClose');
const modalHero     = $('modalHero');
const modalPoster   = $('modalPoster');
const modalTitle    = $('modalTitle');
const modalOrigTitle = $('modalOrigTitle');
const modalMetaBar  = $('modalMetaBar');
const modalStats    = $('modalStats');
const modalGenres   = $('modalGenres');
const modalOverview = $('modalOverview');
const modalCast     = $('modalCast');
const modalCastTitle = $('modalCastTitle');

movieModal.addEventListener('click', e => { if (e.target === movieModal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });


async function openMovieDetail(type, id) {
  movieModal.classList.add('show');
  document.body.style.overflow = 'hidden';
  modalHero.style.backgroundImage = '';
  modalPoster.src = ''; modalTitle.textContent = '加载中...'; modalOrigTitle.textContent = '';
  modalMetaBar.innerHTML = ''; modalStats.innerHTML = ''; modalGenres.innerHTML = '';
  modalOverview.textContent = ''; modalCast.innerHTML = '';

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

    // Hero backdrop
    if (details.backdrop_path) modalHero.style.backgroundImage = `url(${backdropUrl(details.backdrop_path)})`;

    // Poster (use backdrop for landscape, or poster for portrait fallback)
    const landscapeImg = details.backdrop_path ? backdropUrl(details.backdrop_path, 'w780') : posterUrl(details.poster_path, 'w342');
    modalPoster.src = landscapeImg;
    modalPoster.style.objectFit = 'cover';

    // Title
    modalTitle.textContent = details.title || details.name || '';
    modalOrigTitle.textContent = details.original_title && details.original_title !== details.title ? details.original_title : '';

    // Meta bar
    const year = (details.release_date || details.first_air_date || '').slice(0, 4);
    const rating = details.vote_average ? details.vote_average.toFixed(1) : '';
    const cert = details.certification || '';
    const runtime = details.runtime ? `${details.runtime} min` : (details.episode_run_time?.[0] ? `${details.episode_run_time[0]} min/ep` : '');
    modalMetaBar.innerHTML = [
      rating ? `<span class="star">★</span><strong>${rating}</strong><span style="color:#888;font-size:0.78rem">/10</span>` : '',
      year ? `<span style="color:#444">·</span><span>${year}</span>` : '',
      cert ? `<span style="color:#444">·</span><span>${cert}</span>` : '',
      runtime ? `<span style="color:#444">·</span><span>${runtime}</span>` : '',
    ].join('');

    // Stats
    const revenue = details.revenue || 0;
    const budget = details.budget || 0;
    const country = (details.production_countries || []).map(c => c.name).join(' / ') || '—';
    const lang = (details.spoken_languages || []).map(l => l.name).join(' / ') || '—';
    modalStats.innerHTML = [
      revenue ? `<div class="stat"><span class="lbl">全球票房</span><span class="val gold">$${fmtMoney(revenue)}</span></div>` : '',
      budget ? `<div class="stat"><span class="lbl">预算</span><span class="val">$${fmtMoney(budget)}</span></div>` : '',
      year ? `<div class="stat"><span class="lbl">上映日期</span><span class="val">${details.release_date || details.first_air_date || '—'}</span></div>` : '',
      `<div class="stat"><span class="lbl">制片国家</span><span class="val">${country}</span></div>`,
      `<div class="stat"><span class="lbl">语言</span><span class="val">${lang}</span></div>`,
    ].join('');

    // Genres
    modalGenres.innerHTML = (details.genres || []).map(g => `<span>${g.name}</span>`).join('');

    // Overview
    modalOverview.textContent = details.overview || '暂无简介';

    // Cast
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
        const pid = parseInt(item.dataset.personId);
        closeModal();
        selectActor({ id: pid, name: item.dataset.personName, profile_path: item.dataset.personProfile, known_for_department: '' });
      });
    });

  } catch (err) { showToast('加载电影详情失败'); }
}

// ── Utils ─────────────────────────────────────
function esc(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

function fmtMoney(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toString();
}

function handleApiError(err) {
  if (err.message === 'INVALID_API_KEY') { showToast('API Key 无效'); resetApiKey(); }
  else if (err.message === 'RATE_LIMITED') { showToast('请求太频繁，请稍等'); }
  else if (err.message !== 'API_KEY_NOT_SET') { showToast('请求失败，请检查网络'); }
}

function resetApiKey() {
  localStorage.removeItem('tmdb_api_key'); setApiKey('');
  apiKeyPrompt.classList.add('show'); searchWrapper.style.display = 'none'; suggestions.style.display = 'none';
  landingState.style.display = 'none'; actorBanner.classList.remove('show'); collabSection.classList.remove('show');
  graphContainer.classList.remove('show'); loadingSection.classList.remove('show');
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
