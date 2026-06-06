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
  computeAge,
  createLatestOnlyRunner,
  formatAka,
  formatApiKeyError,
  getActiveYears,
  getSharedWorkPreview,
  getYearLabel,
  normalizeWorks,
  selectPopularWorks,
  selectRevenueWorks,
  sortWorksByDate,
} from './state.js';

import { ForceGraph } from './graph.js';

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
const bannerAka     = document.getElementById('bannerAka');
const bannerStats   = document.getElementById('bannerStats');
const bioToggle     = document.getElementById('bioToggle');
const bannerGallery = document.getElementById('bannerGallery');
const photoLightbox = document.getElementById('photoLightbox');
const lightboxImg   = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev  = document.getElementById('lightboxPrev');
const lightboxNext  = document.getElementById('lightboxNext');
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
const modalOrigTitle = document.getElementById('modalOrigTitle');
const modalMetaBar  = document.getElementById('modalMetaBar');
const modalStats    = document.getElementById('modalStats');
const modalGenres   = document.getElementById('modalGenres');
const modalOverview = document.getElementById('modalOverview');
const modalCastTitle = document.getElementById('modalCastTitle');
const modalCast     = document.getElementById('modalCast');

// State
let searchTimer = null;
let currentActor = null;
let currentCollabs = null;
let currentGraph = null;
let currentGraphSelection = null;
let toastTimer;
let selectGen = 0; // bumped on every selectActor call to discard stale async results
let currentPhotos = [];   // file_path[] for the lightbox
let lightboxIndex = 0;
const creditsCache = new Map();
const collabCache = new Map();
const movieDetailsCache = new Map();
const searchRunner = createLatestOnlyRunner();

// Bounded LRU-ish cache: re-insert on access, evict oldest when over limit
const CREDITS_CACHE_MAX = 300;
const COLLAB_CACHE_MAX = 60;
const MOVIE_DETAILS_CACHE_MAX = 120;
function cachePut(map, key, value, max) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value);
}

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
  const token = ++selectGen;
  currentActor = person; currentCollabs = null;
  if (currentGraph) { currentGraph.destroy(); currentGraph = null; }
  searchResults.classList.remove('show'); searchInput.value = '';
  bannerAvatar.src = profileUrl(person.profile_path); bannerAvatar.alt = person.name;
  bannerName.textContent = person.name; bannerDetails.textContent = person.known_for_department || '';
  bannerAka.hidden = true; bannerStats.innerHTML = ''; bioToggle.hidden = true;
  bannerGallery.innerHTML = ''; bannerGallery.hidden = true; currentPhotos = [];
  bannerTopMovies.innerHTML = ''; actorBanner.classList.add('show'); landingState.style.display = 'none';
  collabSection.classList.remove('show'); hideGraphView();
  graphToggleBtn.classList.remove('active'); graphToggleBtn.textContent = '🔗 关系图';
  loadingSection.classList.add('show'); loadingText.textContent = '正在加载作品列表…'; progressFill.style.width = '0%';

  try {
    const [details, movieCredits, tvCredits] = await Promise.all([
      getPersonDetails(person.id), getPersonMovieCredits(person.id), getPersonTVCredits(person.id)
    ]);
    if (token !== selectGen) return;
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
    const birthYear = (details.birthday || '').slice(0, 4);
    let firstYear = years.first;
    if (firstYear && birthYear && firstYear < birthYear) firstYear = birthYear; // ignore pre-birth archival credits
    const activeStr = firstYear ? (firstYear === years.last ? firstYear : `${firstYear} – ${years.last}`) : '—';
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

    const uniqueCredits = normalizeWorks(movieCredits, tvCredits);
    bannerTopMovies.innerHTML = '<div class="top-movie-loading">正在加载票房作品…</div>';
    loadRevenueTopWorks(movieCredits, token).catch(err => {
      console.error('TMDB revenue error:', err);
      if (token !== selectGen) return;
      const fallbackTop5 = selectPopularWorks(movieCredits, [], 5).map(work => ({ ...work, revenue: 0 }));
      renderTopWorks(fallbackTop5);
    });

    let collabs;
    if (collabCache.has(person.id)) { collabs=collabCache.get(person.id); loadingSection.classList.remove('show'); }
    else { const byDate=sortWorksByDate(uniqueCredits); collabs=await computeCollaborations(person.id,byDate,token); cachePut(collabCache,person.id,collabs,COLLAB_CACHE_MAX); }
    if (token !== selectGen) return;
    currentCollabs = collabs;
    renderCollaborations(collabs, person.name);
  } catch(err) {
    if (token !== selectGen) return;
    loadingSection.classList.remove('show');
    if (err.message==='INVALID_API_KEY') resetApiKey();
    console.error('TMDB error:', err);
    showToast(formatApiKeyError(err));
  }
}

function renderTopWorks(works) {
  bannerTopMovies.innerHTML = works.map(w=>`<div class="top-movie-item">${w.poster_path?`<img src="${posterUrl(w.poster_path,'w92')}" alt="${esc(w.title)}" loading="lazy" data-movie-type="${w.type}" data-movie-id="${w.id}">`:`<div style="width:62px;height:93px;background:rgba(255,255,255,0.04);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#5a5a6e;cursor:pointer" data-movie-type="${w.type}" data-movie-id="${w.id}">${esc(w.title)}</div>`}<div class="t-label">${esc(w.title)}</div><div class="t-revenue">${w.revenue?'$'+fmtMoney(w.revenue):'票房暂无'} · ${getYearLabel(w)}</div></div>`).join('');
}

async function loadRevenueTopWorks(movieCredits, token) {
  const candidates = selectPopularWorks(movieCredits, [], 15);
  const detailResults = await Promise.allSettled(candidates.map(work => getMovieDetails(work.id)));
  if (token !== selectGen) return;
  const details = detailResults
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
  renderTopWorks(selectRevenueWorks(candidates, details, 5));
}

// Collaboration
async function computeCollaborations(actorId, sortedWorks, token) {
  const MAX=50; let sampled;
  if (sortedWorks.length<=MAX) sampled=sortedWorks;
  else { const step=sortedWorks.length/MAX; sampled=[]; for(let i=0;i<MAX;i++) sampled.push(sortedWorks[Math.floor(i*step)]); }
  const total=sampled.length, collabMap=new Map();
  if (token === selectGen) loadingText.textContent=`正在分析 ${total} 部作品中的合作演员...`;

  for (let i=0; i<sampled.length; i+=8) {
    const batch=sampled.slice(i,i+8);
    const results=await Promise.allSettled(batch.map(w=>{
      const ck=`${w.type}-${w.id}`;
      if(creditsCache.has(ck)) return Promise.resolve(creditsCache.get(ck));
      return (w.type==='movie'?getMovieCredits(w.id):getTVCredits(w.id)).then(cast=>{cachePut(creditsCache,ck,cast,CREDITS_CACHE_MAX);return cast;});
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
    if (token === selectGen) {
      const done=Math.min(i+8,total); progressFill.style.width=`${(done/total)*100}%`;
      loadingText.textContent=`正在分析 ${done}/${total} 部作品...`;
    }
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

// Bio expand/collapse
bioToggle.addEventListener('click', () => {
  const collapsed = bannerBio.classList.toggle('collapsed');
  bioToggle.textContent = collapsed ? '展开全文 ▾' : '收起 ▴';
});

// Photo gallery lightbox
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

// Back
backBtn.addEventListener('click',()=>{
  selectGen++; // invalidate any in-flight actor load
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
  modalHero.style.backgroundImage='';modalPoster.src='';modalTitle.textContent='加载中...';
  modalOrigTitle.textContent='';modalMetaBar.innerHTML='';modalStats.innerHTML='';modalGenres.innerHTML='';
  modalOverview.textContent='';modalCastTitle.textContent='演员表';modalCast.innerHTML='<div class="modal-loading">正在加载…</div>';
  try{
    const [details,credits]=await Promise.all([type==='movie'?getMovieDetails(id):getTVDetails(id),(async()=>{const ck=`${type}-${id}`;if(creditsCache.has(ck))return creditsCache.get(ck);const cast=type==='movie'?await getMovieCredits(id):await getTVCredits(id);cachePut(creditsCache,ck,cast,CREDITS_CACHE_MAX);return cast;})()]);
    if(details.backdrop_path) modalHero.style.backgroundImage=`url(${backdropUrl(details.backdrop_path)})`;
    modalPoster.src=posterUrl(details.poster_path,'w342');

    const displayTitle=details.title||details.name||'';
    const origTitle=details.original_title||details.original_name||'';
    modalTitle.textContent=displayTitle;
    modalOrigTitle.textContent=(origTitle&&origTitle!==displayTitle)?origTitle:'';

    const year=(details.release_date||details.first_air_date||'').slice(0,4);
    const runtime=details.runtime?`${details.runtime} 分钟`:(details.episode_run_time&&details.episode_run_time[0]?`${details.episode_run_time[0]} 分钟/集`:'');
    const typeLabel=type==='movie'?'电影':'剧集';
    modalMetaBar.innerHTML=[typeLabel,year,runtime].filter(Boolean).map(s=>`<span>${esc(s)}</span>`).join('');

    const stats=[];
    if(details.vote_average) stats.push({lbl:'评分',val:`★ ${details.vote_average.toFixed(1)}`,gold:true});
    if(details.vote_count) stats.push({lbl:'评分人数',val:details.vote_count.toLocaleString()});
    if(type==='movie'){
      if(details.revenue) stats.push({lbl:'票房',val:`$${fmtMoney(details.revenue)}`});
      if(details.budget) stats.push({lbl:'预算',val:`$${fmtMoney(details.budget)}`});
    }else{
      if(details.number_of_seasons) stats.push({lbl:'季数',val:`${details.number_of_seasons} 季`});
      if(details.number_of_episodes) stats.push({lbl:'集数',val:`${details.number_of_episodes} 集`});
    }
    if(details.popularity) stats.push({lbl:'人气',val:Math.round(details.popularity).toLocaleString()});
    modalStats.innerHTML=stats.map(s=>`<div class="stat"><span class="lbl">${esc(s.lbl)}</span><span class="val${s.gold?' gold':''}">${esc(String(s.val))}</span></div>`).join('');

    modalGenres.innerHTML=(details.genres||[]).map(g=>`<span>${esc(g.name)}</span>`).join('');
    modalOverview.textContent=details.overview||'暂无简介';

    const topCast=(credits||[]).slice(0,30);
    modalCastTitle.textContent=topCast.length?`演员表 · ${topCast.length} 人`:'演员表';
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

  // header: actor photo + name + meta
  const avatar = node.profile_path
    ? `<img class="graph-detail-avatar" src="${profileUrl(node.profile_path,'w185')}" alt="${esc(node.name)}">`
    : `<div class="graph-detail-avatar no-avatar">🎬</div>`;
  graphDetailName.innerHTML = `${avatar}<span class="graph-detail-who"><strong>${esc(node.name)}</strong><em>与 ${esc(currentActor.name)} 合作 ${node.count} 次</em></span>`;
  graphDetailMeta.textContent = '';

  // shared works as poster cards (clickable -> movie modal). Revenue filled in async.
  const works = (node.sharedWorks || []).slice(0, 6);
  graphSharedWorks.innerHTML = works.length
    ? works.map(w => `
      <div class="graph-work-card" data-movie-type="${w.type}" data-movie-id="${w.id}">
        ${w.poster_path
          ? `<img class="graph-work-poster" src="${posterUrl(w.poster_path,'w92')}" alt="${esc(w.title)}" loading="lazy">`
          : `<div class="graph-work-poster no-poster">🎬</div>`}
        <span class="graph-work-name">${esc(w.title)}</span>
        <span class="graph-work-rev" data-rev-for="${w.type}-${w.id}">${getYearLabel(w)}</span>
      </div>`).join('')
    : '<span class="graph-work-empty">暂无共同作品</span>';

  fillSharedWorkRevenue(node, works);
}

// Fetch revenue for movie works on demand; only write back if this node is still selected.
async function fillSharedWorkRevenue(node, works){
  for (const w of works) {
    if (w.type !== 'movie') continue;
    try {
      let details = movieDetailsCache.get(w.id);
      if (!details) { details = await getMovieDetails(w.id); cachePut(movieDetailsCache, w.id, details, MOVIE_DETAILS_CACHE_MAX); }
      if (currentGraphSelection !== node) return; // selection changed — stop
      const el = graphSharedWorks.querySelector(`[data-rev-for="movie-${w.id}"]`);
      if (el && details.revenue) el.textContent = `$${fmtMoney(details.revenue)} · ${getYearLabel(w)}`;
    } catch { /* leave year-only on failure */ }
  }
}
