// ── API Layer (api.js) ────────────────────────
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

let API_KEY = '';

function setApiKey(key) { API_KEY = key; }
function getApiKey() { return API_KEY; }

async function fetchTMDB(path, params = {}) {
  if (!API_KEY) { throw new Error('API_KEY_NOT_SET'); }
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('language', 'zh-CN');
  for (const [k, v] of Object.entries(params)) { url.searchParams.set(k, v); }
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) throw new Error('INVALID_API_KEY');
    if (res.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

async function searchPerson(query) { const data = await fetchTMDB('/search/person', { query }); return data.results || []; }
async function getPersonDetails(id) { return fetchTMDB(`/person/${id}`); }
async function getPersonMovieCredits(id) { const data = await fetchTMDB(`/person/${id}/movie_credits`); return data.cast || []; }
async function getPersonTVCredits(id) { const data = await fetchTMDB(`/person/${id}/tv_credits`); return data.cast || []; }
async function getMovieCredits(movieId) { const data = await fetchTMDB(`/movie/${movieId}/credits`); return data.cast || []; }
async function getTVCredits(tvId) { const data = await fetchTMDB(`/tv/${tvId}/credits`); return data.cast || []; }
function profileUrl(path, size = 'w185') { if (!path) return ''; return `${IMG_BASE}/${size}${path}`; }
function posterUrl(path, size = 'w92') { if (!path) return ''; return `${IMG_BASE}/${size}${path}`; }
function backdropUrl(path, size = 'w780') { if (!path) return ''; return `${IMG_BASE}/${size}${path}`; }
async function getMovieDetails(movieId) { return fetchTMDB(`/movie/${movieId}`); }
async function getTVDetails(tvId) { return fetchTMDB(`/tv/${tvId}`); }

// ── Force Graph (graph.js) ─────────────────────
class ForceGraph {
  constructor(container, collabs, centerName, onActorClick) {
    this.container = container;
    this.centerName = centerName;
    this.onActorClick = onActorClick;

    const sorted = [...collabs].sort((a, b) => b.count - a.count).slice(0, 30);
    const maxCount = Math.max(...sorted.map(c => c.count), 1);
    this.nodes = sorted.map(c => {
      const n = {
        id: c.id, name: c.name, count: c.count, sharedWorks: c.sharedWorks,
        radius: 14, x: 0, y: 0, vx: 0, vy: 0, img: null
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
    for (const n of this.nodes) {
      const angle = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 150;
      n.x = this.center.x + Math.cos(angle) * r;
      n.y = this.center.y + Math.sin(angle) * r;
    }
  }

  simulate() {
    if (this.destroyed) return;
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
        const minD = 14 + 14 + 12;
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
      n.x = Math.max(14, Math.min(this.w - 14, n.x));
      n.y = Math.max(14, Math.min(this.h - 14, n.y));
    }

    this.draw(); this.frameCount++;
    if (this.frameCount < this.maxFrames) {
      this._raf = requestAnimationFrame(() => this.simulate());
    }
  }

  draw() {
    const { ctx, w, h, center, nodes, hovered } = this;
    ctx.clearRect(0, 0, w, h);

    // Thin uniform lines
    for (const n of nodes) {
      ctx.beginPath();
      ctx.moveTo(center.x, center.y); ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = 'rgba(245,197,24,0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    for (const n of nodes) this.drawNode(n, n === hovered);
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

  drawNode(n, highlighted) {
    const { ctx } = this;
    const x = n.x, y = n.y, r = highlighted ? 16 : 14;

    // Avatar circle clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (n.img && n.img.complete && n.img.naturalWidth > 0) {
      ctx.drawImage(n.img, x - r, y - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = highlighted ? '#f5c518' : 'rgba(210,215,235,0.85)';
      ctx.fill();
    }
    // Border ring
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = highlighted ? '#f5c518' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = highlighted ? 2 : 1;
    ctx.stroke();
    ctx.restore();

    if (highlighted) {
      ctx.shadowColor = 'rgba(245,197,24,0.7)'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Name below
    ctx.fillStyle = highlighted ? '#f5c518' : '#ccc';
    ctx.font = `${highlighted ? 9 : 8}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(n.name.slice(0, 5), x, y + r + 12);

    // Count below name
    ctx.fillStyle = highlighted ? '#f5c518' : '#888';
    ctx.font = `${highlighted ? 8 : 7}px -apple-system, sans-serif`;
    ctx.fillText(`合作${n.count}次`, x, y + r + 24);
  }

  getPos(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX-r.left)/this.scale, y: (e.clientY-r.top)/this.scale }; }

  hitTest(px, py) {
    if (Math.hypot(px-this.center.x, py-this.center.y) < 20) return { type: 'center' };
    for (const n of this.nodes) { if (Math.hypot(px-n.x, py-n.y) < 16+5) return { type: 'actor', node: n }; }
    return null;
  }

  bindEvents() {
    this._onMouseDown = e => { const p = this.getPos(e); const h = this.hitTest(p.x,p.y); if (h?.type==='actor') { this.dragging=h.node; this.canvas.style.cursor='grabbing'; } };
    this._onMouseMove = e => { const p = this.getPos(e); if (this.dragging) { this.dragging.x=p.x; this.dragging.y=p.y; this.dragging.vx=0; this.dragging.vy=0; this.draw(); } else { const h=this.hitTest(p.x,p.y); this.hovered=h?.type==='actor'?h.node:null; this.canvas.style.cursor=this.hovered?'pointer':''; this.draw(); } };
    this._onMouseUp = () => { this.dragging=null; this.canvas.style.cursor=this.hovered?'pointer':''; };
    this._onClick = e => { const p=this.getPos(e); const h=this.hitTest(p.x,p.y); if (h?.type==='actor' && this.onActorClick) this.onActorClick(h.node); };
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

// State
let searchTimer = null;
let currentActor = null;
let currentCollabs = null;
let currentGraph = null;
let toastTimer;
const creditsCache = new Map();
const collabCache = new Map();

// API Key init
const savedKey = localStorage.getItem('tmdb_api_key');
if (savedKey) setApiKey(savedKey);
if (getApiKey()) showApp();

saveApiKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  setApiKey(key);
  localStorage.setItem('tmdb_api_key', key);
  showApp();
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
  actorBanner.classList.remove('show'); collabSection.classList.remove('show'); graphContainer.classList.remove('show');
  loadingSection.classList.remove('show'); graphToggleBtn.classList.remove('active');
  graphToggleBtn.textContent = '🔗 关系图'; landingState.style.display = 'none';
  if (currentGraph) { currentGraph.destroy(); currentGraph = null; }
  searchSpinner.classList.add('active');
  searchTimer = setTimeout(() => doSearch(query), 300);
});

function doSearch(query) {
  searchPerson(query)
    .then(r => { searchSpinner.classList.remove('active'); renderSearchResults(r); })
    .catch(err => {
      searchSpinner.classList.remove('active');
      if (err.message === 'INVALID_API_KEY') { showToast('API Key 无效'); resetApiKey(); }
      else if (err.message === 'RATE_LIMITED') showToast('请求太频繁，稍等再试');
      else { console.error('TMDB error:', err); showToast('搜索失败: '+err.message); }
    });
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
  collabSection.classList.remove('show'); graphContainer.classList.remove('show');
  graphToggleBtn.classList.remove('active'); graphToggleBtn.textContent = '🔗 关系图';
  loadingSection.classList.add('show'); loadingText.textContent = '正在加载作品列表…'; progressFill.style.width = '0%';

  try {
    const [details, movieCredits, tvCredits] = await Promise.all([
      getPersonDetails(person.id), getPersonMovieCredits(person.id), getPersonTVCredits(person.id)
    ]);
    bannerDetails.textContent = [details.birthday?`🎂 ${details.birthday}`:'', details.place_of_birth?`📍 ${details.place_of_birth}`:''].filter(Boolean).join('  ·  ')||person.known_for_department||'';
    bannerBio.textContent = details.biography ? details.biography.slice(0,150).replace(/\n/g,' ')+(details.biography.length>150?'…':'') : '';

    const allCredits = [
      ...movieCredits.map(m=>({id:m.id,type:'movie',title:m.title||m.original_title,date:m.release_date||'',popularity:m.popularity,poster_path:m.poster_path})),
      ...tvCredits.map(t=>({id:t.id,type:'tv',title:t.name||t.original_name,date:t.first_air_date||'',popularity:t.popularity,poster_path:t.poster_path}))
    ];
    const seen = new Set(); const uniqueCredits = [];
    for (const w of allCredits) { const k=`${w.type}-${w.id}`; if(seen.has(k))continue; seen.add(k); uniqueCredits.push(w); }

    const moviesOnly = uniqueCredits.filter(w=>w.type==='movie');
    const topPop = [...moviesOnly].sort((a,b)=>b.popularity-a.popularity).slice(0,15);
    const mds = await Promise.allSettled(topPop.map(w=>getMovieDetails(w.id)));
    const withRev = topPop.map((w,i)=>({...w,revenue:mds[i].status==='fulfilled'?(mds[i].value.revenue||0):0})).sort((a,b)=>b.revenue-a.revenue);
    const top5 = withRev.slice(0,5);
    bannerTopMovies.innerHTML = top5.map(w=>`<div class="top-movie-item">${w.poster_path?`<img src="${posterUrl(w.poster_path,'w92')}" alt="${esc(w.title)}" loading="lazy" data-movie-type="${w.type}" data-movie-id="${w.id}">`:`<div style="width:62px;height:93px;background:rgba(255,255,255,0.04);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#5a5a6e;cursor:pointer" data-movie-type="${w.type}" data-movie-id="${w.id}">${esc(w.title)}</div>`}<div class="t-label">${esc(w.title)}</div><div class="t-revenue">${w.revenue?'$'+fmtMoney(w.revenue):''} · ${w.date.slice(0,4)||'—'}</div></div>`).join('');

    let collabs;
    if (collabCache.has(person.id)) { collabs=collabCache.get(person.id); loadingSection.classList.remove('show'); }
    else { const byDate=[...uniqueCredits].sort((a,b)=>b.date.localeCompare(a.date)); collabs=await computeCollaborations(person.id,byDate); collabCache.set(person.id,collabs); }
    currentCollabs = collabs;
    renderCollaborations(collabs, person.name);
  } catch(err) {
    loadingSection.classList.remove('show');
    if (err.message==='INVALID_API_KEY') { showToast('API Key 无效'); resetApiKey(); }
    else { console.error('TMDB error:', err); showToast('加载失败: '+err.message); }
  }
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
    const sh=c.sharedWorks.map(w=>`<div class="shared-movie-row">${w.poster_path?`<img class="shared-movie-thumb" src="${posterUrl(w.poster_path,'w92')}" alt="${esc(w.title)}" title="${esc(w.title)}" loading="lazy" data-movie-type="${w.type}" data-movie-id="${w.id}">`:`<div class="shared-movie-thumb-placeholder" data-movie-type="${w.type}" data-movie-id="${w.id}">🎬</div>`}<span class="shared-movie-title">${esc(w.title.slice(0,8))}</span></div>`).join('');
    card.innerHTML=`${c.profile_path?`<img class="avatar" src="${profileUrl(c.profile_path,'w185')}" alt="${esc(c.name)}" loading="lazy">`:`<div class="no-avatar-card">🎬</div>`}<div class="meta"><h4>${esc(c.name)}</h4><span class="count">合作 ${c.count} 次</span></div><div class="shared-movies">${sh}</div>`;
    addClickable(card,()=>{selectActor({id:c.id,name:c.name,profile_path:c.profile_path,known_for_department:''});window.scrollTo({top:0,behavior:'smooth'});});
    collabGrid.appendChild(card);
  });
  collabSection.classList.add('show');
}

// Back
backBtn.addEventListener('click',()=>{
  currentActor=null;currentCollabs=null;if(currentGraph){currentGraph.destroy();currentGraph=null;}
  actorBanner.classList.remove('show');collabSection.classList.remove('show');graphContainer.classList.remove('show');
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
    modalCast.innerHTML=topCast.map(c=>`<div class="modal-cast-item" data-person-id="${c.id}" data-person-name="${esc(c.name)}" data-person-profile="${c.profile_path||''}">${c.profile_path?`<img class="cast-img" src="${profileUrl(c.profile_path)}" alt="${esc(c.name)}" loading="lazy">`:`<div class="cast-no-img">🎬</div>`}<div class="cast-name">${esc(c.name)}</div>${c.character?`<div class="cast-char">${esc(c.character)}</div>`:''}</div>`).join('');
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
  actorBanner.classList.remove('show');collabSection.classList.remove('show');graphContainer.classList.remove('show');
  loadingSection.classList.remove('show');graphToggleBtn.classList.remove('active');graphToggleBtn.textContent='🔗 关系图';
  if(currentGraph){currentGraph.destroy();currentGraph=null;}
}

// Graph Toggle
graphToggleBtn.addEventListener('click',()=>{
  if(graphContainer.classList.contains('show')){
    graphContainer.classList.remove('show');collabSection.classList.add('show');
    graphToggleBtn.textContent='🔗 关系图';graphToggleBtn.classList.remove('active');
    if(currentGraph){currentGraph.destroy();currentGraph=null;}
  }else{
    collabSection.classList.remove('show');graphContainer.classList.add('show');
    graphToggleBtn.textContent='📋 列表';graphToggleBtn.classList.add('active');
    renderGraph();
  }
});

function renderGraph(){
  if(!currentCollabs||!currentCollabs.length)return;
  graphContainer.innerHTML='';
  currentGraph=new ForceGraph(graphContainer,currentCollabs,currentActor.name,(node)=>{selectActor({id:node.id,name:node.name,profile_path:'',known_for_department:''});});
}

if(getApiKey())showApp();
