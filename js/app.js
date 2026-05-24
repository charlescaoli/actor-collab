import {
  backdropUrl,
  getConfiguration,
  getMovieCredits,
  getMovieDetails,
  getPersonDetails,
  getPersonMovieCredits,
  getPersonTVCredits,
  getTVDetails,
  getTVCredits,
  getApiKey,
  posterUrl,
  profileUrl,
  searchPerson,
  setApiKey,
} from './api.js';

import {
  createLatestOnlyRunner,
  formatApiKeyError,
  getGraphMetrics,
  getMobileOrbitPosition,
  getSharedWorkPreview,
  getYearLabel,
  normalizeWorks,
  selectPopularWorks,
  selectRevenueWorks,
  sortWorksByDate,
} from './state.js';

// ── Force Graph (graph.js) ─────────────────────
class ForceGraph {
  constructor(container, collabs, centerName, options = {}) {
    this.container = container;
    this.centerName = centerName;
    this.onNodeSelect = options.onNodeSelect;
    this.isMobile = window.matchMedia('(max-width: 600px)').matches;

    const sorted = [...collabs].sort((a, b) => b.count - a.count).slice(0, this.isMobile ? 12 : 30);
    this.maxCount = Math.max(...sorted.map(c => c.count), 1);
    this.nodes = sorted.map(c => {
      const metrics = getGraphMetrics(c.count, this.maxCount);
      const n = {
        id: c.id, name: c.name, count: c.count, sharedWorks: c.sharedWorks,
        radius: metrics.radius, edgeWidth: metrics.edgeWidth, edgeAlpha: metrics.edgeAlpha,
        profile_path: c.profile_path, x: 0, y: 0, vx: 0, vy: 0, img: null
      };
      if (c.profile_path) {
        n.img = new Image();
        n.img.crossOrigin = 'anonymous';
        n.img.src = profileUrl(c.profile_path, 'w92');
      }
      return n;
    });

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.center = { x: 0, y: 0, fixed: true };
    this.scale = 1; this.offset = { x: 0, y: 0 };
    this.dragging = null; this.hovered = null;
    this.selected = this.nodes.find(n => n.id === options.selectedId) || this.nodes[0] || null;
    this.frameCount = 0; this.maxFrames = 120; this.destroyed = false;

    container.appendChild(this.canvas);
    this.resize();
    this.initNodes();
    this.bindEvents();
    this.simulate();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width; this.h = rect.height;
    this.center.x = this.w / 2; this.center.y = this.h / 2;
  }

  initNodes() {
    if (this.isMobile) {
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        const pos = getMobileOrbitPosition(i, this.nodes.length, this.w, this.h, n.count, this.maxCount);
        n.baseX = pos.x;
        n.baseY = pos.y;
        n.floatPhase = i * 0.7;
        n.x = pos.x;
        n.y = pos.y;
        n.vx = 0; n.vy = 0;
      }
      return;
    }
    for (const n of this.nodes) {
      const angle = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * Math.min(this.w, this.h) * 0.32;
      n.x = this.center.x + Math.cos(angle) * r;
      n.y = this.center.y + Math.sin(angle) * r;
    }
  }

  reshuffle() {
    this.frameCount = 0;
    this.initNodes();
    this.simulate();
  }

  simulate() {
    if (this.destroyed) return;
    if (this.isMobile) {
      this.draw();
      this._raf = requestAnimationFrame(() => this.simulate());
      return;
    }
    if (this.frameCount >= this.maxFrames) { this.draw(); return; }

    const cp = 0.004, damping = 0.82;

    for (const n of this.nodes) {
      if (n === this.dragging) continue;
      n.vx += (this.center.x - n.x) * cp;
      n.vy += (this.center.y - n.y) * cp;
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
        const rf = 300 / (dist * dist);
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
    if (this.frameCount < this.maxFrames) {
      this._raf = requestAnimationFrame(() => this.simulate());
    }
  }

  draw() {
    const { ctx, w, h, center, nodes, hovered } = this;
    ctx.clearRect(0, 0, w, h);
    const pulse = this.isMobile ? (0.88 + Math.sin(performance.now() / 900) * 0.12) : 1;

    for (const n of nodes) {
      if (this.isMobile) this.updateFloatingPosition(n);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y); ctx.lineTo(n.x, n.y);
      const dim = this.selected && n !== this.selected ? 0.42 : 1;
      ctx.strokeStyle = `rgba(245,197,24,${(n === this.selected ? Math.min(0.86, n.edgeAlpha + 0.24) * pulse : n.edgeAlpha) * dim})`;
      ctx.lineWidth = n === this.selected ? (n.edgeWidth + 1.4) * pulse : n.edgeWidth;
      ctx.stroke();
    }
    for (const n of nodes) this.drawNode(n, n === hovered, n === this.selected);
    this.drawCenter(center.x, center.y);
  }

  drawCenter(x, y) {
    const { ctx } = this;
    ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI*2); ctx.fillStyle = 'rgba(245,197,24,0.15)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI*2);
    ctx.fillStyle = '#f5c518'; ctx.shadowColor = 'rgba(245,197,24,0.7)'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px -apple-system, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(this.centerName.slice(0, 8), x, y - 24);
  }

  drawNode(n, highlighted, selected) {
    const { ctx } = this;
    const x = n.x, y = n.y, r = highlighted || selected ? n.radius + 2 : n.radius;
    const alpha = this.selected && !selected && !highlighted ? 0.55 : 1;

    // Avatar circle clip
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (n.img && n.img.complete && n.img.naturalWidth > 0) {
      // cover-style: scale to fill circle, center crop
      const iw = n.img.naturalWidth, ih = n.img.naturalHeight;
      const scale = Math.max(2 * r / iw, 2 * r / ih);
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(n.img, x - dw/2, y - dh/2, dw, dh);
    } else {
      ctx.fillStyle = highlighted || selected ? '#f5c518' : 'rgba(210,215,235,0.85)';
      ctx.fill();
      ctx.fillStyle = highlighted || selected ? '#15151d' : '#fff';
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.name.slice(0, 1), x, y + 3);
    }
    ctx.restore();

    // Border ring with subtle glow
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = highlighted || selected ? '#f5c518' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = highlighted || selected ? 2.2 : 1.4;
    ctx.shadowColor = highlighted || selected ? 'rgba(245,197,24,0.5)' : 'rgba(255,255,255,0.08)';
    ctx.shadowBlur = highlighted || selected ? 9 : 3;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    if (!this.isMobile) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(n.name.slice(0, 6), x, y + r + 13);
      ctx.fillStyle = '#f5c518'; ctx.font = '8px -apple-system, sans-serif';
      ctx.fillText(`${n.count} 次`, x, y + r + 25);
    }

    if (!this.isMobile && (highlighted || selected)) {
      const preview = getSharedWorkPreview(n.sharedWorks, 2);
      const tipW = 138, tipH = preview.length ? 56 : 40;
      const tipX = Math.max(6, Math.min(this.w - tipW - 6, x - tipW/2));
      const tipY = Math.max(6, y - r - tipH - 12);
      ctx.fillStyle = 'rgba(20,20,35,0.92)';
      ctx.beginPath(); ctx.roundRect(tipX, tipY, tipW, tipH, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(245,197,24,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(tipX, tipY, tipW, tipH, 6); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(n.name, tipX + tipW/2, tipY + 14);
      ctx.fillStyle = '#f5c518'; ctx.font = '7px -apple-system, sans-serif';
      ctx.fillText(`合作 ${n.count} 次`, tipX + tipW/2, tipY + 27);
      ctx.fillStyle = '#bdbdca';
      preview.forEach((work, i) => ctx.fillText(work.slice(0, 18), tipX + tipW/2, tipY + 40 + i * 10));
    }

  }

  updateFloatingPosition(n) {
    const t = performance.now() / 1000;
    const selectedBoost = n === this.selected ? 1.25 : 1;
    n.x = n.baseX + Math.sin(t * 1.05 + n.floatPhase) * 5.5 * selectedBoost;
    n.y = n.baseY + Math.cos(t * 0.9 + n.floatPhase * 1.3) * 4.5 * selectedBoost;
  }

  getPos(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX-r.left)/this.scale, y: (e.clientY-r.top)/this.scale }; }

  hitTest(px, py) {
    if (Math.hypot(px-this.center.x, py-this.center.y) < 20) return { type: 'center' };
    for (const n of this.nodes) { if (Math.hypot(px-n.x, py-n.y) < n.radius+7) return { type: 'actor', node: n }; }
    return null;
  }

  bindEvents() {
    this._onMouseDown = e => { const p = this.getPos(e); const h = this.hitTest(p.x,p.y); if (h?.type==='actor') { this.dragging=h.node; this.canvas.style.cursor='grabbing'; } };
    this._onMouseMove = e => { const p = this.getPos(e); if (this.dragging) { this.dragging.x=p.x; this.dragging.y=p.y; this.dragging.vx=0; this.dragging.vy=0; this.draw(); } else { const h=this.hitTest(p.x,p.y); this.hovered=h?.type==='actor'?h.node:null; this.canvas.style.cursor=this.hovered?'pointer':''; this.draw(); } };
    this._onMouseUp = () => { this.dragging=null; this.canvas.style.cursor=this.hovered?'pointer':''; };
    this._onClick = e => {
      const p=this.getPos(e); const h=this.hitTest(p.x,p.y);
      if (h?.type==='actor') {
        this.selected = h.node;
        this.draw();
        if (this.onNodeSelect) this.onNodeSelect(h.node);
      }
    };
    this._onWheel = e => { e.preventDefault(); this.scale *= e.deltaY<0?1.08:0.92; this.scale=Math.max(0.3,Math.min(3,this.scale)); this.canvas.style.transform=`scale(${this.scale})`; this.canvas.style.transformOrigin='center center'; };
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('click', this._onClick);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  destroy() {
    this.destroyed = true; if (this._raf) cancelAnimationFrame(this._raf);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('click', this._onClick);
    this.canvas.removeEventListener('wheel', this._onWheel);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}

// ── App Logic ──────────────────────────────────
// DOM refs
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
const graphActions = document.getElementById('graphActions');
const graphTrail = document.getElementById('graphTrail');
const graphShuffleBtn = document.getElementById('graphShuffleBtn');
const graphContainer = document.getElementById('graphContainer');
const graphDetail = document.getElementById('graphDetail');
const graphDetailName = document.getElementById('graphDetailName');
const graphDetailMeta = document.getElementById('graphDetailMeta');
const graphSharedWorks = document.getElementById('graphSharedWorks');
const graphJumpBtn = document.getElementById('graphJumpBtn');
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

// State
let searchTimer = null;
let currentActor = null;
let currentCollabs = null;
let currentGraph = null;
let currentGraphSelection = null;
let toastTimer;
const creditsCache = new Map();
const collabCache = new Map();
const searchRunner = createLatestOnlyRunner();

// API Key init
const savedKey = localStorage.getItem('tmdb_api_key');
if (savedKey) setApiKey(savedKey);
if (getApiKey()) showApp();

saveApiKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  const previousKey = getApiKey();
  setApiKey(key);
  saveApiKeyBtn.disabled = true;
  saveApiKeyBtn.textContent = '验证中';
  try {
    await getConfiguration();
    localStorage.setItem('tmdb_api_key', key);
    showApp();
    showToast('API Key 已保存');
  } catch (err) {
    setApiKey(previousKey || '');
    showToast(formatApiKeyError(err));
  } finally {
    saveApiKeyBtn.disabled = false;
    saveApiKeyBtn.textContent = '保存';
  }
});

apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveApiKeyBtn.click(); });

function showApp() {
  apiKeyPrompt.classList.remove('show');
  searchWrapper.style.display = '';
  suggestions.style.display = '';
  landingState.style.display = '';
}

function showToast(msg) {
  clearTimeout(toastTimer);
  errorToast.textContent = msg;
  errorToast.classList.add('show');
  toastTimer = setTimeout(() => errorToast.classList.remove('show'), 3000);
}

// Search
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  if (!query) { searchResults.classList.remove('show'); searchSpinner.classList.remove('active'); return; }
  actorBanner.classList.remove('show'); collabSection.classList.remove('show'); hideGraphView();
  loadingSection.classList.remove('show'); graphToggleBtn.classList.remove('active');
  graphToggleBtn.textContent = '🔗 关系图'; landingState.style.display = 'none';
  if (currentGraph) { currentGraph.destroy(); currentGraph = null; }
  searchSpinner.classList.add('active');
  searchTimer = setTimeout(() => doSearch(query), 300);
});

function doSearch(query) {
  searchRunner.run(
    () => searchPerson(query),
    r => { searchSpinner.classList.remove('active'); renderSearchResults(r); },
    err => {
      searchSpinner.classList.remove('active');
      if (err.message === 'INVALID_API_KEY') resetApiKey();
      console.error('TMDB error:', err);
      showToast(formatApiKeyError(err));
    }
  );
}

function renderSearchResults(results) {
  searchResults.innerHTML = '';
  if (!results.length) { searchResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">未找到匹配的演员</div>'; searchResults.classList.add('show'); return; }
  results.slice(0, 8).forEach(person => {
    const div = document.createElement('div'); div.className = 'search-result-item';
    const kf = (person.known_for||[]).slice(0,3).map(m=>m.title||m.name).join(', ');
    div.innerHTML = `${person.profile_path?`<img src="${profileUrl(person.profile_path)}" alt="" loading="lazy">`:`<div class="no-avatar">🎬</div>`}<div class="info"><h3>${esc(person.name)}</h3><span>${person.known_for_department||''}${kf?' · '+kf:''}</span></div>`;
    addClickable(div, ()=>selectActor(person));
    searchResults.appendChild(div);
  });
  searchResults.classList.add('show');
}

suggestions.addEventListener('click', (e) => {
  const chip = e.target.closest('.suggestion-chip');
  if (!chip) return;
  searchInput.value = chip.dataset.name;
  searchResults.classList.remove('show'); landingState.style.display = 'none';
  doSearch(chip.dataset.name);
});

// Actor Selection
async function selectActor(person) {
  currentActor = person; currentCollabs = null;
  if (currentGraph) { currentGraph.destroy(); currentGraph = null; }
  searchResults.classList.remove('show'); searchInput.value = '';
  bannerAvatar.src = profileUrl(person.profile_path); bannerAvatar.alt = person.name;
  bannerName.textContent = person.name; bannerDetails.textContent = person.known_for_department || '';
  bannerTopMovies.innerHTML = ''; actorBanner.classList.add('show'); landingState.style.display = 'none';
  collabSection.classList.remove('show'); hideGraphView();
  graphToggleBtn.classList.remove('active'); graphToggleBtn.textContent = '🔗 关系图';
  loadingSection.classList.add('show'); loadingText.textContent = '正在加载作品列表…'; progressFill.style.width = '0%';

  try {
    const [details, movieCredits, tvCredits] = await Promise.all([
      getPersonDetails(person.id), getPersonMovieCredits(person.id), getPersonTVCredits(person.id)
    ]);
    bannerDetails.textContent = [details.birthday?`🎂 ${details.birthday}`:'', details.place_of_birth?`📍 ${details.place_of_birth}`:''].filter(Boolean).join('  ·  ')||person.known_for_department||'';
    bannerBio.textContent = details.biography ? details.biography.slice(0,150).replace(/\n/g,' ')+(details.biography.length>150?'…':'') : '';

    const uniqueCredits = normalizeWorks(movieCredits, tvCredits);
    bannerTopMovies.innerHTML = '<div class="top-movie-loading">正在加载票房作品…</div>';
    loadRevenueTopWorks(movieCredits).catch(err => {
      console.error('TMDB revenue error:', err);
      const fallbackTop5 = selectPopularWorks(movieCredits, [], 5).map(work => ({ ...work, revenue: 0 }));
      renderTopWorks(fallbackTop5);
    });

    let collabs;
    if (collabCache.has(person.id)) { collabs=collabCache.get(person.id); loadingSection.classList.remove('show'); }
    else { const byDate=sortWorksByDate(uniqueCredits); collabs=await computeCollaborations(person.id,byDate); collabCache.set(person.id,collabs); }
    currentCollabs = collabs;
    renderCollaborations(collabs, person.name);
  } catch(err) {
    loadingSection.classList.remove('show');
    if (err.message==='INVALID_API_KEY') resetApiKey();
    console.error('TMDB error:', err);
    showToast(formatApiKeyError(err));
  }
}

function renderTopWorks(works) {
  bannerTopMovies.innerHTML = works.map(w=>`<div class="top-movie-item">${w.poster_path?`<img src="${posterUrl(w.poster_path,'w92')}" alt="${esc(w.title)}" loading="lazy" data-movie-type="${w.type}" data-movie-id="${w.id}">`:`<div style="width:62px;height:93px;background:rgba(255,255,255,0.04);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#5a5a6e;cursor:pointer" data-movie-type="${w.type}" data-movie-id="${w.id}">${esc(w.title)}</div>`}<div class="t-label">${esc(w.title)}</div><div class="t-revenue">${w.revenue?'$'+fmtMoney(w.revenue):'票房暂无'} · ${getYearLabel(w)}</div></div>`).join('');
}

async function loadRevenueTopWorks(movieCredits) {
  const candidates = selectPopularWorks(movieCredits, [], 15);
  const detailResults = await Promise.allSettled(candidates.map(work => getMovieDetails(work.id)));
  const details = detailResults
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
  renderTopWorks(selectRevenueWorks(candidates, details, 5));
}

// Collaboration
async function computeCollaborations(actorId, sortedWorks) {
  const MAX=50; let sampled;
  if (sortedWorks.length<=MAX) sampled=sortedWorks;
  else { const step=sortedWorks.length/MAX; sampled=[]; for(let i=0;i<MAX;i++) sampled.push(sortedWorks[Math.floor(i*step)]); }
  const total=sampled.length, collabMap=new Map();
  loadingText.textContent=`正在分析 ${total} 部作品中的合作演员...`;

  for (let i=0; i<sampled.length; i+=8) {
    const batch=sampled.slice(i,i+8);
    const results=await Promise.allSettled(batch.map(w=>{
      const ck=`${w.type}-${w.id}`;
      if(creditsCache.has(ck)) return Promise.resolve(creditsCache.get(ck));
      return (w.type==='movie'?getMovieCredits(w.id):getTVCredits(w.id)).then(cast=>{creditsCache.set(ck,cast);return cast;});
    }));
    results.forEach((r,j)=>{
      if(r.status!=='fulfilled')return; const work=batch[j];
      for(const cm of r.value){
        if(cm.id===actorId)continue;
        const key=cm.id;
        if(!collabMap.has(key)) collabMap.set(key,{id:cm.id,name:cm.name,profile_path:cm.profile_path,count:0,sharedWorks:new Map()});
        const e=collabMap.get(key); e.count++;
        const sw=`${work.type}-${work.id}`;
        if(!e.sharedWorks.has(sw)) e.sharedWorks.set(sw,work);
      }
    });
    const done=Math.min(i+8,total); progressFill.style.width=`${(done/total)*100}%`;
    loadingText.textContent=`正在分析 ${done}/${total} 部作品...`;
  }
  return [...collabMap.values()].sort((a,b)=>b.count-a.count).slice(0,50).map(c=>({...c,sharedWorks:[...c.sharedWorks.values()].sort((a,b)=>b.popularity-a.popularity).slice(0,5)}));
}

function renderCollaborations(collabs, actorName) {
  loadingSection.classList.remove('show'); collabGrid.innerHTML='';
  if(!collabs.length){collabGrid.innerHTML='<p style="text-align:center;color:var(--text-secondary);grid-column:1/-1;padding:40px">未找到合作演员数据</p>';collabSection.classList.add('show');return;}
  collabTitle.innerHTML=`与 <strong>「${esc(actorName)}」</strong> 合作过的演员 · ${collabs.length} 人`;
  collabs.forEach(c=>{
    const card=document.createElement('div'); card.className='collab-card';
    const sh=c.sharedWorks.map(w=>`<div class="shared-movie-row">${w.poster_path?`<img class="shared-movie-thumb" src="${posterUrl(w.poster_path,'w92')}" alt="${esc(w.title)}" title="${esc(w.title)}" loading="lazy" data-movie-type="${w.type}" data-movie-id="${w.id}">`:`<div class="shared-movie-thumb-placeholder" data-movie-type="${w.type}" data-movie-id="${w.id}">🎬</div>`}<span class="shared-movie-title">${esc(w.title.slice(0,8))}<em>${getYearLabel(w)}</em></span></div>`).join('');
    card.innerHTML=`${c.profile_path?`<img class="avatar" src="${profileUrl(c.profile_path,'w185')}" alt="${esc(c.name)}" loading="lazy">`:`<div class="no-avatar-card">🎬</div>`}<div class="meta"><h4>${esc(c.name)}</h4><span class="count">合作 ${c.count} 次</span></div><div class="shared-movies">${sh}</div>`;
    addClickable(card,()=>{selectActor({id:c.id,name:c.name,profile_path:c.profile_path,known_for_department:''});window.scrollTo({top:0,behavior:'smooth'});});
    collabGrid.appendChild(card);
  });
  collabSection.classList.add('show');
}

// Back
backBtn.addEventListener('click',()=>{
  currentActor=null;currentCollabs=null;if(currentGraph){currentGraph.destroy();currentGraph=null;}
  actorBanner.classList.remove('show');collabSection.classList.remove('show');hideGraphView();
  loadingSection.classList.remove('show');graphToggleBtn.classList.remove('active');graphToggleBtn.textContent='🔗 关系图';
  searchInput.value='';landingState.style.display='';searchInput.focus();
});

// Click delegation
document.addEventListener('click',(e)=>{
  if(!searchResults.contains(e.target)&&e.target!==searchInput) searchResults.classList.remove('show');
  const mt=e.target.closest('[data-movie-type]'); if(mt){const t=mt.dataset.movieType,id=parseInt(mt.dataset.movieId);if(t&&id)openMovieDetail(t,id);}
});

// Movie Modal
modalClose.addEventListener('click',closeModal);
movieModal.addEventListener('click',(e)=>{if(e.target===movieModal)closeModal();});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')closeModal();});

function closeModal(){movieModal.classList.remove('show');document.body.style.overflow='';}

async function openMovieDetail(type,id){
  movieModal.classList.add('show');document.body.style.overflow='hidden';
  modalHero.style.backgroundImage='';modalPoster.src='';modalTitle.textContent='加载中...';modalMetaBar.innerHTML='';
  modalOverview.textContent='';modalCast.innerHTML='<div class="modal-loading">正在加载…</div>';
  try{
    const [details,credits]=await Promise.all([type==='movie'?getMovieDetails(id):getTVDetails(id),(async()=>{const ck=`${type}-${id}`;if(creditsCache.has(ck))return creditsCache.get(ck);const cast=type==='movie'?await getMovieCredits(id):await getTVCredits(id);creditsCache.set(ck,cast);return cast;})()]);
    if(details.backdrop_path) modalHero.style.backgroundImage=`url(${backdropUrl(details.backdrop_path)})`;
    modalPoster.src=posterUrl(details.poster_path,'w342');
    modalTitle.textContent=details.title||details.name||'';
    const year=(details.release_date||details.first_air_date||'').slice(0,4),runtime=details.runtime?`${details.runtime}分钟`:'';
    const genres=(details.genres||[]).map(g=>g.name).join(' / '),rating=details.vote_average?`★ ${details.vote_average.toFixed(1)}`:'';
    modalMetaBar.innerHTML=[year,runtime,genres,rating].filter(Boolean).map(s=>`<span>${s}</span>`).join('');
    modalOverview.textContent=details.overview||'暂无简介';
    const topCast=(credits||[]).slice(0,30);
    modalCast.innerHTML=topCast.map(c=>`<button class="modal-cast-item" data-person-id="${c.id}" data-person-name="${esc(c.name)}" data-person-profile="${c.profile_path||''}">${c.profile_path?`<img class="cast-img" src="${profileUrl(c.profile_path)}" alt="${esc(c.name)}" loading="lazy">`:`<div class="cast-no-img">🎬</div>`}<div class="cast-name">${esc(c.name)}</div>${c.character?`<div class="cast-char">${esc(c.character)}</div>`:''}</button>`).join('');
    modalCast.querySelectorAll('.modal-cast-item').forEach(chip=>{addClickable(chip,()=>{const pid=parseInt(chip.dataset.personId),pname=chip.dataset.personName,pprofile=chip.dataset.personProfile;closeModal();selectActor({id:pid,name:pname,profile_path:pprofile,known_for_department:''});});});
  }catch(err){modalCast.innerHTML='<div class="modal-loading">加载失败</div>';showToast('加载电影详情失败');}
}

// Utils
function esc(str){const d=document.createElement('div');d.textContent=str;return d.innerHTML;}
function fmtMoney(n){if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(0)+'M';return n.toString();}

function addClickable(el, handler) {
  el.addEventListener('click', handler);
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'button');
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(e); } });
}

function resetApiKey(){
  localStorage.removeItem('tmdb_api_key');setApiKey('');
  apiKeyPrompt.classList.add('show');searchWrapper.style.display='none';suggestions.style.display='none';landingState.style.display='none';
  actorBanner.classList.remove('show');collabSection.classList.remove('show');hideGraphView();
  loadingSection.classList.remove('show');graphToggleBtn.classList.remove('active');graphToggleBtn.textContent='🔗 关系图';
  if(currentGraph){currentGraph.destroy();currentGraph=null;}
}

// Graph Toggle
graphToggleBtn.addEventListener('click',()=>{
  if(graphContainer.classList.contains('show')){
    hideGraphView();collabSection.classList.add('show');
    graphToggleBtn.textContent='🔗 关系图';graphToggleBtn.classList.remove('active');
    if(currentGraph){currentGraph.destroy();currentGraph=null;}
  }else{
    collabSection.classList.remove('show');showGraphView();
    graphToggleBtn.textContent='📋 列表';graphToggleBtn.classList.add('active');
    renderGraph();
  }
});

graphShuffleBtn.addEventListener('click',()=>{
  if(currentGraph) currentGraph.reshuffle();
});

graphJumpBtn.addEventListener('click',()=>{
  if(!currentGraphSelection) return;
  selectActor({
    id: currentGraphSelection.id,
    name: currentGraphSelection.name,
    profile_path: currentGraphSelection.profile_path || '',
    known_for_department: ''
  });
  window.scrollTo({top:0,behavior:'smooth'});
});

function showGraphView(){
  graphActions.classList.add('show');
  graphContainer.classList.add('show');
  graphDetail.classList.add('show');
}

function hideGraphView(){
  graphActions.classList.remove('show');
  graphContainer.classList.remove('show');
  graphDetail.classList.remove('show');
  currentGraphSelection = null;
}

function renderGraph(){
  if(!currentCollabs||!currentCollabs.length)return;
  graphContainer.innerHTML='';
  currentGraphSelection = currentGraphSelection || currentCollabs[0];
  currentGraph=new ForceGraph(graphContainer,currentCollabs,currentActor.name,{
    selectedId: currentGraphSelection.id,
    onNodeSelect: renderGraphDetail
  });
  renderGraphDetail(currentGraphSelection);
}

function renderGraphDetail(node){
  currentGraphSelection = node;
  graphTrail.innerHTML = `<span class="crumb">${esc(currentActor.name)}</span><span>→</span><span class="crumb">${esc(node.name)}</span>`;
  graphDetailName.textContent = node.name;
  graphDetailMeta.textContent = `与 ${currentActor.name} 合作 ${node.count} 次`;
  const works = getSharedWorkPreview(node.sharedWorks, 4);
  graphSharedWorks.innerHTML = works.length
    ? works.map(work => `<span class="graph-work-chip">${esc(work)}</span>`).join('')
    : '<span class="graph-work-chip">暂无共同作品标题</span>';
}

if(getApiKey())showApp();
