/* SILO (v0)
   - Single-page, no build step
   - Upload Excel (.xlsx)
   - Auto mapping + manual mapping
   - Modules: Dashboard, Query Builder, Head-to-Head, Champions
*/

const state = {
  fileName: null,
  rows: [],
  columns: [],
  mapping: {
    rider: null,
    gender: null,
    country: null,
    distance: null,
    time: null,
    rank: null,
    date: null,
    competition: null,
  },
  rules: [],
  h2hMetricRows: [],
};

const el = (id) => document.getElementById(id);

const toastEl = el('toast');
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(toastEl._t);
  toastEl._t = window.setTimeout(()=>toastEl.classList.remove('show'), 2200);
}

function norm(s){
  return String(s ?? '').trim().toLowerCase();
}

function uniq(arr){
  return [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ''))];
}

function guessColumn(columns, keywords){
  const colsNorm = columns.map(c => ({ c, n: norm(c) }));
  for (const kw of keywords){
    const hit = colsNorm.find(x => x.n.includes(kw));
    if (hit) return hit.c;
  }
  return null;
}

function loadSavedMapping(){
  try{
    const raw = localStorage.getItem('silo_mapping');
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object'){
      state.mapping = { ...state.mapping, ...obj };
    }
  }catch{ /* ignore */ }
}

function saveMapping(){
  localStorage.setItem('silo_mapping', JSON.stringify(state.mapping));
}

function isNumericLike(v){
  if (v === null || v === undefined) return false;
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  const s = String(v).trim();
  if (!s) return false;
  // allow comma decimals
  const cleaned = s.replace(',', '.');
  return !Number.isNaN(Number(cleaned)) && cleaned.match(/^-?\d+(\.\d+)?$/);
}

function toNumber(v){
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Parse time values into seconds.
// Supports:
// - Excel numeric times (fraction of a day)
// - "mm:ss.xxx" / "m:ss" / "hh:mm:ss" / "ss.xxx"
function timeToSeconds(v){
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number' && Number.isFinite(v)){
    // Excel stores times as fraction of a day
    // If value is small (< 1), assume fraction day
    if (v > 0 && v < 1) return v * 24 * 3600;
    // Otherwise treat as seconds
    return v;
  }
  const s0 = String(v).trim();
  if (!s0) return NaN;
  const s = s0.replace(',', '.');
  // If it's numeric
  if (s.match(/^-?\d+(\.\d+)?$/)){
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const parts = s.split(':').map(p => p.trim());
  if (parts.length === 1){
    const n = Number(parts[0]);
    return Number.isFinite(n) ? n : NaN;
  }
  // last part may contain decimals
  const last = Number(parts[parts.length - 1]);
  if (!Number.isFinite(last)) return NaN;
  if (parts.length === 2){
    const m = Number(parts[0]);
    if (!Number.isFinite(m)) return NaN;
    return m * 60 + last;
  }
  if (parts.length === 3){
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 3600 + m * 60 + last;
  }
  return NaN;
}

function secondsToTime(s){
  if (!Number.isFinite(s)) return '—';
  if (s < 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s - h*3600) / 60);
  const sec = s - h*3600 - m*60;
  const secStr = sec.toFixed(sec >= 10 ? 3 : 3);
  const pad2 = (x) => String(x).padStart(2,'0');
  if (h > 0) return `${h}:${pad2(m)}:${pad2(secStr)}`;
  return `${m}:${pad2(secStr)}`;
}

function parseDate(v){
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'number' && Number.isFinite(v)){
    // Excel date serial
    // XLSX uses 1900 date system by default. Excel incorrectly treats 1900 as leap.
    const excelEpoch = new Date(Date.UTC(1899,11,30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  // Try ISO / locale parsing
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  // Try dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m){
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yy = Number(m[3]) < 100 ? (2000 + Number(m[3])) : Number(m[3]);
    const d2 = new Date(yy, mm, dd);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  return null;
}

function formatDate(d){
  if (!d) return '—';
  try{
    return d.toLocaleDateString('nl-NL', { year:'numeric', month:'short', day:'2-digit' });
  }catch{
    return d.toISOString().slice(0,10);
  }
}

function setStatus(){
  el('statusFile').textContent = state.fileName ?? '—';
  el('statusRows').textContent = state.rows.length ? String(state.rows.length) : '—';
  el('statusCols').textContent = state.columns.length ? String(state.columns.length) : '—';
  el('statusHint').textContent = state.rows.length ? 'Dataset geladen. Kies een module.' : 'Upload een Excel-bestand (.xlsx) om te starten.';
}

function setControlsEnabled(enabled){
  el('dashRider').disabled = !enabled;
  el('btnAddRule').disabled = !enabled;
  el('btnRunQuery').disabled = !enabled;
  el('h2hCount').disabled = !enabled;
  el('btnBuildH2H').disabled = !enabled;
  el('h2hMetric').disabled = !enabled;
  el('h2hAgg').disabled = !enabled;
  el('btnAddMetricRow').disabled = !enabled;
  el('btnRenderH2HTable').disabled = !enabled;
  el('btnBuildChamps').disabled = !enabled;
  el('chTypeCol').disabled = !enabled;
  el('chYearCol').disabled = !enabled;
  el('chWorldValue').disabled = !enabled;
  el('chOlympicValue').disabled = !enabled;

  // Keep any type-to-search inputs aligned with the underlying select disabled state.
  syncAllTypeable();
}

function navInit(){
  document.querySelectorAll('.navItem').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.navItem').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      el(`view-${view}`).classList.remove('hidden');
    });
  });
}

function fillSelect(selectEl, options, { includeEmpty = true, emptyLabel = '—' } = {}){
  selectEl.innerHTML = '';
  const opts = includeEmpty ? [emptyLabel, ...options] : [...options];
  for (const o of opts){
    const opt = document.createElement('option');
    opt.value = o === emptyLabel ? '' : o;
    opt.textContent = o;
    selectEl.appendChild(opt);
  }

  // If this select is enhanced with a type-to-search UI, keep the input in sync.
  if (selectEl && typeof selectEl._typeableSync === 'function'){
    selectEl._typeableSync();
  }
}

// ---------------- Type-to-search dropdowns ----------------

// Global registry so we only need one outside-click handler.
const __typeableRegistry = new Set();
if (!window.__typeableOutsideClickBound){
  window.__typeableOutsideClickBound = true;
  document.addEventListener('click', (e) => {
    __typeableRegistry.forEach(wrap => {
      if (!wrap.contains(e.target)){
        if (typeof wrap._typeableClose === 'function') wrap._typeableClose();
        else wrap.classList.remove('open');
      }
    });
  });
}

function syncAllTypeable(){
  document.querySelectorAll('select[data-typeable="1"]').forEach(sel => {
    if (sel._typeableInput){
      sel._typeableInput.disabled = !!sel.disabled;
    }
  });
}

function makeTypeableSelect(selectEl, { placeholder = 'Typ om te zoeken…', maxItems = 250 } = {}){
  if (!selectEl) return;
  if (selectEl.dataset.typeable === '1'){
    if (typeof selectEl._typeableSync === 'function') selectEl._typeableSync();
    if (selectEl._typeableInput) selectEl._typeableInput.disabled = !!selectEl.disabled;
    return;
  }
  selectEl.dataset.typeable = '1';

  const wrapper = document.createElement('div');
  wrapper.className = 'typeSelect';
  __typeableRegistry.add(wrapper);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'typeSelectInput';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder;

  // Make label clicks focus the input (if the label uses "for=<selectId>")
  if (selectEl.id){
    input.id = `${selectEl.id}__type`;
    const esc = (window.CSS && typeof CSS.escape === 'function') ? CSS.escape(selectEl.id) : selectEl.id;
    const lab = document.querySelector(`label[for="${esc}"]`);
    if (lab) lab.setAttribute('for', input.id);
  }

  const list = document.createElement('div');
  list.className = 'typeSelectList';

  // Insert wrapper where the select is, then move select inside wrapper.
  const parent = selectEl.parentNode;
  parent.insertBefore(wrapper, selectEl);
  wrapper.appendChild(input);
  wrapper.appendChild(list);
  wrapper.appendChild(selectEl);

  // Hide the native select (we keep it for value + change events)
  selectEl.classList.add('srOnly');

  let activeIdx = -1;
  let currentItems = [];

  const normText = (s) => String(s ?? '').toLowerCase();
  const selectedText = () => {
    const opt = selectEl.options[selectEl.selectedIndex];
    return opt ? (opt.textContent ?? '') : '';
  };

  const close = () => {
    wrapper.classList.remove('open');
    list.innerHTML = '';
    activeIdx = -1;
    currentItems = [];
  };

  // Used by the global outside-click handler.
  wrapper._typeableClose = close;

  const open = () => {
    if (selectEl.disabled) return;
    wrapper.classList.add('open');
  };

  const render = (filterText) => {
    const q = normText(filterText).trim();
    const opts = [...selectEl.options].map(o => ({ value: o.value, text: (o.textContent ?? '') }));

    let items = opts;
    if (q){
      items = opts.filter(o => normText(o.text).includes(q));
    }
    items = items.slice(0, maxItems);

    currentItems = items;
    activeIdx = -1;

    list.innerHTML = '';
    if (!items.length){
      const empty = document.createElement('div');
      empty.className = 'typeSelectEmpty';
      empty.textContent = 'Geen matches';
      list.appendChild(empty);
      return;
    }

    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'typeSelectOption';
      row.dataset.idx = String(idx);
      row.textContent = it.text;
      if (String(selectEl.value) === String(it.value)){
        row.classList.add('selected');
      }
      row.addEventListener('mousedown', (e) => {
        // mousedown so we can select before blur closes the list
        e.preventDefault();
        setValue(it.value, it.text);
        close();
      });
      list.appendChild(row);
    });
  };

  const setValue = (val, text) => {
    selectEl.value = val;
    input.value = text ?? selectedText();
    selectEl.dispatchEvent(new Event('change', { bubbles:true }));
  };

  // Keep input aligned with select
  selectEl._typeableInput = input;
  selectEl._typeableSync = () => {
    input.disabled = !!selectEl.disabled;
    // If select has no value, show empty string instead of "—" label by default.
    const txt = selectedText();
    input.value = (selectEl.value === '' ? '' : txt);
  };
  selectEl._typeableSync();

  input.addEventListener('focus', () => {
    open();
    render(input.value);
  });
  input.addEventListener('click', () => {
    open();
    render(input.value);
  });
  input.addEventListener('input', () => {
    open();
    render(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (!wrapper.classList.contains('open')){
      if (e.key === 'ArrowDown'){
        open();
        render(input.value);
        e.preventDefault();
      }
      return;
    }

    const rows = [...list.querySelectorAll('.typeSelectOption')];
    if (e.key === 'ArrowDown'){
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, rows.length - 1);
    }else if (e.key === 'ArrowUp'){
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
    }else if (e.key === 'Enter'){
      e.preventDefault();
      if (activeIdx >= 0 && currentItems[activeIdx]){
        const it = currentItems[activeIdx];
        setValue(it.value, it.text);
      }else if (currentItems.length){
        // Pick first match
        setValue(currentItems[0].value, currentItems[0].text);
      }
      close();
      return;
    }else if (e.key === 'Escape'){
      e.preventDefault();
      close();
      input.blur();
      return;
    }else{
      return;
    }

    rows.forEach(r => r.classList.remove('active'));
    const r = rows[activeIdx];
    if (r){
      r.classList.add('active');
      // scroll into view
      const rTop = r.offsetTop;
      const rBottom = rTop + r.offsetHeight;
      if (rTop < list.scrollTop) list.scrollTop = rTop;
      if (rBottom > list.scrollTop + list.clientHeight) list.scrollTop = rBottom - list.clientHeight;
    }
  });

  input.addEventListener('blur', () => {
    // Give click handlers time to run
    window.setTimeout(() => {
      if (!wrapper.contains(document.activeElement)){
        // If input doesn't match an option exactly, revert to selected value
        const t = input.value.trim();
        const opts = [...selectEl.options].map(o => ({ value:o.value, text:(o.textContent ?? '').trim() }));
        const exact = opts.find(o => o.text.toLowerCase() === t.toLowerCase());
        if (exact){
          setValue(exact.value, exact.text);
        }else{
          selectEl._typeableSync();
        }
        close();
      }
    }, 120);
  });

  // Outside clicks are handled globally.
}

function applyAutoMapping(){
  const cols = state.columns;
  const rider = guessColumn(cols, ['rijder','rider','athlete','naam','name','skater','persoon','person']);
  const gender = guessColumn(cols, ['gender','geslacht','sex','m/v','m-f']);
  const country = guessColumn(cols, ['country','land','noc','nation','team']);
  const distance = guessColumn(cols, ['afstand','distance','event','discipline','category']);
  const time = guessColumn(cols, ['time','tijd','result','lap time','performance']);
  const rank = guessColumn(cols, ['rank','positie','place','pos','finish','result rank']);
  const date = guessColumn(cols, ['date','datum','day','start date','competition date']);
  const competition = guessColumn(cols, ['competition','wedstrijd','venue','location','event name','meet']);

  state.mapping = {
    ...state.mapping,
    rider: rider ?? state.mapping.rider,
    gender: gender ?? state.mapping.gender,
    country: country ?? state.mapping.country,
    distance: distance ?? state.mapping.distance,
    time: time ?? state.mapping.time,
    rank: rank ?? state.mapping.rank,
    date: date ?? state.mapping.date,
    competition: competition ?? state.mapping.competition,
  };
}

function updateMappingUI(){
  const cols = state.columns;
  const mapEls = {
    rider: el('mapRider'),
    gender: el('mapGender'),
    country: el('mapCountry'),
    distance: el('mapDistance'),
    time: el('mapTime'),
    rank: el('mapRank'),
    date: el('mapDate'),
    competition: el('mapCompetition'),
  };

  Object.values(mapEls).forEach(sel => fillSelect(sel, cols, { includeEmpty:true, emptyLabel:'—' }));

  // Set selected
  mapEls.rider.value = state.mapping.rider ?? '';
  mapEls.gender.value = state.mapping.gender ?? '';
  mapEls.country.value = state.mapping.country ?? '';
  mapEls.distance.value = state.mapping.distance ?? '';
  mapEls.time.value = state.mapping.time ?? '';
  mapEls.rank.value = state.mapping.rank ?? '';
  mapEls.date.value = state.mapping.date ?? '';
  mapEls.competition.value = state.mapping.competition ?? '';

  // Make mapping dropdowns typeable.
  Object.values(mapEls).forEach(sel => makeTypeableSelect(sel, { placeholder:'Typ om een kolom te zoeken…' }));
  syncAllTypeable();
}

function updateModuleInputs(){
  // Rider select
  const riderCol = state.mapping.rider || state.columns[0];
  const riders = uniq(state.rows.map(r => r[riderCol]).filter(v => v !== undefined)).map(v => String(v));
  riders.sort((a,b) => a.localeCompare(b,'nl'));
  fillSelect(el('dashRider'), riders, { includeEmpty:false });
  el('dashRider').disabled = riders.length === 0;
  makeTypeableSelect(el('dashRider'), { placeholder:'Typ om een rijder te zoeken…' });

  // H2H metric col list
  fillSelect(el('h2hMetric'), state.columns, { includeEmpty:false });
  makeTypeableSelect(el('h2hMetric'), { placeholder:'Typ om een kolom te zoeken…' });
  makeTypeableSelect(el('h2hAgg'), { placeholder:'Typ om te zoeken…' });
  makeTypeableSelect(el('h2hCount'), { placeholder:'Typ aantal…' });

  // Champions selects
  fillSelect(el('chTypeCol'), state.columns, { includeEmpty:true, emptyLabel:'—' });
  fillSelect(el('chYearCol'), state.columns, { includeEmpty:true, emptyLabel:'—' });
  makeTypeableSelect(el('chTypeCol'), { placeholder:'Typ om een kolom te zoeken…' });
  makeTypeableSelect(el('chYearCol'), { placeholder:'Typ om een kolom te zoeken…' });

  // Query default first rule
  if (state.rules.length === 0 && state.columns.length){
    state.rules.push({ logic:'AND', col: state.columns[0], op:'contains', val:'' });
  }
  renderRules();

  // H2H selectors
  buildH2HSelectors();

  // Seed default metric rows
  seedDefaultMetricRows();

  syncAllTypeable();
}

function openMapping(){
  el('mappingModal').classList.remove('hidden');
}
function closeMapping(){
  el('mappingModal').classList.add('hidden');
}

function bindMapping(){
  el('btnOpenMapping').addEventListener('click', () => {
    if (!state.columns.length){ toast('Upload eerst een dataset'); return; }
    updateMappingUI();
    openMapping();
  });
  el('btnCloseMapping').addEventListener('click', closeMapping);
  el('mappingModal').addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.close === 'true') closeMapping();
  });

  el('btnResetMapping').addEventListener('click', () => {
    applyAutoMapping();
    updateMappingUI();
    toast('Auto-mapping toegepast');
  });

  el('btnSaveMapping').addEventListener('click', () => {
    state.mapping = {
      rider: el('mapRider').value || null,
      gender: el('mapGender').value || null,
      country: el('mapCountry').value || null,
      distance: el('mapDistance').value || null,
      time: el('mapTime').value || null,
      rank: el('mapRank').value || null,
      date: el('mapDate').value || null,
      competition: el('mapCompetition').value || null,
    };
    saveMapping();
    updateModuleInputs();
    renderDashboard();
    toast('Mapping opgeslagen');
    closeMapping();
  });
}

function parseExcel(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lezen mislukt'));
    reader.onload = () => {
      try{
        const data = new Uint8Array(reader.result);
        const wb = XLSX.read(data, { type:'array' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        resolve(json);
      }catch(err){
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

async function handleUpload(file){
  if (!file) return;
  try{
    const rows = await parseExcel(file);
    state.fileName = file.name;
    state.rows = rows;
    const cols = new Set();
    for (const r of rows){
      Object.keys(r).forEach(k => cols.add(k));
    }
    state.columns = [...cols];

    loadSavedMapping();
    applyAutoMapping();

    setStatus();
    setControlsEnabled(state.rows.length > 0);

    updateMappingUI();
    updateModuleInputs();
    renderDashboard();

    toast('Dataset geladen');
  }catch(err){
    console.error(err);
    toast('Upload/parse mislukt');
  }
}

// ---------------- Dashboard ----------------

function riderRows(){
  const riderCol = state.mapping.rider || state.columns[0];
  const rider = el('dashRider').value;
  return state.rows.filter(r => String(r[riderCol] ?? '') === rider);
}

function computeStats(rows){
  const m = state.mapping;

  const starts = rows.length;

  const ranks = m.rank ? rows.map(r => toNumber(r[m.rank])).filter(Number.isFinite) : [];
  const bestRank = ranks.length ? Math.min(...ranks) : NaN;
  const wins = ranks.length ? ranks.filter(x => x === 1).length : 0;
  const podiums = ranks.length ? ranks.filter(x => x >= 1 && x <= 3).length : 0;

  const times = m.time ? rows.map(r => timeToSeconds(r[m.time])).filter(Number.isFinite) : [];
  const bestTime = times.length ? Math.min(...times) : NaN;
  const avgTime = times.length ? (times.reduce((a,b)=>a+b,0) / times.length) : NaN;

  const dates = m.date ? rows.map(r => parseDate(r[m.date])).filter(Boolean) : [];
  const lastDate = dates.length ? new Date(Math.max(...dates.map(d=>d.getTime()))) : null;

  let topDistance = null;
  if (m.distance){
    const dist = rows.map(r => String(r[m.distance] ?? '').trim()).filter(Boolean);
    const freq = new Map();
    dist.forEach(d => freq.set(d, (freq.get(d) || 0) + 1));
    const sorted = [...freq.entries()].sort((a,b)=>b[1]-a[1]);
    topDistance = sorted.length ? sorted[0][0] : null;
  }

  return {
    starts,
    wins,
    podiums,
    bestTime,
    avgTime,
    bestRank,
    lastDate,
    topDistance,
  };
}

function renderDashboard(){
  const tiles = el('dashTiles');
  const details = el('dashDetails');

  if (!state.rows.length){
    details.innerHTML = '<div class="empty">Upload een dataset om details te zien.</div>';
    tiles.querySelectorAll('[data-tile]').forEach(x => x.textContent = '—');
    return;
  }

  const rows = riderRows();
  if (!rows.length){
    details.innerHTML = '<div class="empty">Kies een rijder.</div>';
    tiles.querySelectorAll('[data-tile]').forEach(x => x.textContent = '—');
    return;
  }

  const s = computeStats(rows);
  const setTile = (key, value) => {
    const node = tiles.querySelector(`[data-tile="${key}"]`);
    if (!node) return;
    node.textContent = value;
  };

  setTile('starts', String(s.starts));
  setTile('wins', String(s.wins));
  setTile('podiums', String(s.podiums));
  setTile('bestTime', secondsToTime(s.bestTime));
  setTile('avgTime', Number.isFinite(s.avgTime) ? secondsToTime(s.avgTime) : '—');
  setTile('bestRank', Number.isFinite(s.bestRank) ? String(s.bestRank) : '—');
  setTile('lastDate', formatDate(s.lastDate));
  setTile('topDistance', s.topDistance ?? '—');

  // Details block
  const m = state.mapping;
  const sample = rows[0];
  const badges = [];
  if (m.country && sample[m.country]) badges.push(`<span class="badge">${escapeHtml(sample[m.country])}</span>`);
  if (m.gender && sample[m.gender]) badges.push(`<span class="badge">${escapeHtml(sample[m.gender])}</span>`);
  if (m.distance && s.topDistance) badges.push(`<span class="badge">Top afstand: ${escapeHtml(s.topDistance)}</span>`);

  // top competitions
  let topComp = [];
  if (m.competition){
    const comps = rows.map(r => String(r[m.competition] ?? '').trim()).filter(Boolean);
    const freq = new Map();
    comps.forEach(c => freq.set(c, (freq.get(c)||0)+1));
    topComp = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  }

  let compHtml = '';
  if (topComp.length){
    compHtml = `
      <div style="margin-top:10px">
        <div class="muted" style="margin-bottom:6px">Meest voorkomende wedstrijden/events</div>
        <div class="tableWrap">
          <table class="table" style="min-width:420px">
            <thead><tr><th>Event</th><th>Aantal</th></tr></thead>
            <tbody>
              ${topComp.map(([c,n]) => `<tr><td>${escapeHtml(c)}</td><td>${n}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  details.innerHTML = `
    <div>
      <div class="diffRow">${badges.length ? badges.join('') : '<span class="muted">(Geen badges: voeg mapping toe voor land/gender)</span>'}</div>
      ${compHtml}
    </div>
  `;
}

// ---------------- Query Builder ----------------

const OPS = [
  { v:'contains', t:'bevat' },
  { v:'equals', t:'is gelijk aan' },
  { v:'starts', t:'begint met' },
  { v:'ends', t:'eindigt met' },
  { v:'gt', t:'>' },
  { v:'gte', t:'>=' },
  { v:'lt', t:'<' },
  { v:'lte', t:'<=' },
  { v:'between', t:'tussen (a..b)' },
  { v:'empty', t:'is leeg' },
  { v:'notempty', t:'is niet leeg' },
];

function renderRules(){
  const wrap = el('rules');
  wrap.innerHTML = '';

  if (!state.columns.length){
    wrap.innerHTML = '<div class="empty">Upload een dataset om filters te gebruiken.</div>';
    return;
  }

  state.rules.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.className = 'ruleRow';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '110px 1fr 170px 1fr 44px';
    row.style.gap = '10px';
    row.style.alignItems = 'end';
    row.style.marginBottom = '10px';

    const logicSel = document.createElement('select');
    logicSel.innerHTML = `<option value="AND">AND</option><option value="OR">OR</option>`;
    logicSel.value = rule.logic || 'AND';
    logicSel.disabled = idx === 0; // first rule logic not needed

    const colSel = document.createElement('select');
    fillSelect(colSel, state.columns, { includeEmpty:false });
    colSel.value = rule.col;

    const opSel = document.createElement('select');
    OPS.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.t;
      opSel.appendChild(opt);
    });
    opSel.value = rule.op;

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.placeholder = rule.op === 'between' ? 'bijv. 0.0..60.0' : 'waarde';
    valInput.value = rule.val ?? '';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btnGhost';
    delBtn.textContent = '✕';
    delBtn.title = 'Verwijderen';

    const mkControl = (labelText, node) => {
      const c = document.createElement('div');
      c.className = 'control';
      const lab = document.createElement('label');
      lab.textContent = labelText;
      c.appendChild(lab);
      c.appendChild(node);
      return c;
    };

    row.appendChild(mkControl('Logica', logicSel));
    row.appendChild(mkControl('Kolom', colSel));
    row.appendChild(mkControl('Operator', opSel));
    row.appendChild(mkControl('Waarde', valInput));
    row.appendChild(delBtn);

    logicSel.addEventListener('change', () => { rule.logic = logicSel.value; });
    colSel.addEventListener('change', () => { rule.col = colSel.value; });
    opSel.addEventListener('change', () => {
      rule.op = opSel.value;
      valInput.placeholder = rule.op === 'between' ? 'bijv. 0.0..60.0' : 'waarde';
    });
    valInput.addEventListener('input', () => { rule.val = valInput.value; });
    delBtn.addEventListener('click', () => {
      state.rules.splice(idx, 1);
      if (state.rules.length === 0){
        state.rules.push({ logic:'AND', col: state.columns[0], op:'contains', val:'' });
      }
      renderRules();
    });

    wrap.appendChild(row);

    // Enhance dropdowns *after* they are in the DOM (so they have a parentNode).
    makeTypeableSelect(logicSel, { placeholder:'Typ AND/OR…' });
    makeTypeableSelect(colSel, { placeholder:'Typ om een kolom te zoeken…' });
    makeTypeableSelect(opSel, { placeholder:'Typ om een operator te zoeken…' });
  });

  syncAllTypeable();
}

function evalRule(rule, row){
  const col = rule.col;
  const op = rule.op;
  const raw = row[col];
  const a = String(raw ?? '').trim();
  const b = String(rule.val ?? '').trim();

  if (op === 'empty') return a === '';
  if (op === 'notempty') return a !== '';

  if (op === 'contains') return norm(a).includes(norm(b));
  if (op === 'equals') return norm(a) === norm(b);
  if (op === 'starts') return norm(a).startsWith(norm(b));
  if (op === 'ends') return norm(a).endsWith(norm(b));

  // Numeric comparisons
  const av = isNumericLike(raw) ? toNumber(raw) : timeToSeconds(raw);
  if (['gt','gte','lt','lte','between'].includes(op)){
    if (!Number.isFinite(av)) return false;
    if (op === 'between'){
      const parts = b.split('..').map(x => x.trim());
      if (parts.length !== 2) return false;
      const lo = Number(parts[0].replace(',', '.'));
      const hi = Number(parts[1].replace(',', '.'));
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
      return av >= lo && av <= hi;
    }
    const bv = Number(b.replace(',', '.'));
    if (!Number.isFinite(bv)) return false;
    if (op === 'gt') return av > bv;
    if (op === 'gte') return av >= bv;
    if (op === 'lt') return av < bv;
    if (op === 'lte') return av <= bv;
  }

  return false;
}

function runQuery(){
  if (!state.rows.length) return [];
  let out = [];
  for (const row of state.rows){
    let ok = true;
    for (let i=0;i<state.rules.length;i++){
      const rule = state.rules[i];
      const pass = evalRule(rule, row);
      if (i === 0){
        ok = pass;
      }else{
        ok = (rule.logic === 'OR') ? (ok || pass) : (ok && pass);
      }
    }
    if (ok) out.push(row);
  }
  return out;
}

function renderTable(tableEl, rows, columns){
  tableEl.innerHTML = '';
  if (!rows.length){
    tableEl.innerHTML = '<thead><tr><th>Geen resultaten</th></tr></thead>';
    return;
  }

  const cols = columns.slice(0, 24);

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  cols.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c;
    hr.appendChild(th);
  });
  thead.appendChild(hr);

  const tbody = document.createElement('tbody');
  rows.slice(0, 250).forEach(r => {
    const tr = document.createElement('tr');
    cols.forEach(c => {
      const td = document.createElement('td');
      const v = r[c];
      td.textContent = (v === null || v === undefined || v === '') ? '—' : String(v);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  tableEl.appendChild(thead);
  tableEl.appendChild(tbody);
}

// ---------------- Head-to-Head ----------------

function buildH2HSelectors(){
  const wrap = el('h2hSelectors');
  wrap.innerHTML = '';

  if (!state.rows.length){
    wrap.innerHTML = '<div class="empty">Upload een dataset om te starten.</div>';
    return;
  }

  const riderCol = state.mapping.rider || state.columns[0];
  const riders = uniq(state.rows.map(r => r[riderCol]).filter(Boolean)).map(String).sort((a,b)=>a.localeCompare(b,'nl'));

  const count = Number(el('h2hCount').value || 2);
  for (let i=0;i<count;i++){
    const c = document.createElement('div');
    c.className = 'control';
    const lab = document.createElement('label');
    lab.textContent = `Rijder ${i+1}`;
    const sel = document.createElement('select');
    fillSelect(sel, riders, { includeEmpty:true, emptyLabel:'—' });
    sel.dataset.idx = String(i);
    c.appendChild(lab);
    c.appendChild(sel);
    wrap.appendChild(c);

    // Enhance dropdown *after* it's in the DOM.
    makeTypeableSelect(sel, { placeholder:'Typ om een rijder te zoeken…' });
  }

  syncAllTypeable();
}

function seedDefaultMetricRows(){
  const m = state.mapping;
  state.h2hMetricRows = [];
  if (!state.columns.length) return;
  // Try to create sensible defaults
  if (m.time) state.h2hMetricRows.push({ col: m.time, agg:'best' });
  if (m.rank) state.h2hMetricRows.push({ col: m.rank, agg:'best' });
  state.h2hMetricRows.push({ col: m.distance || state.columns[0], agg:'count' });
}

function getSelectedRiders(){
  const sels = [...el('h2hSelectors').querySelectorAll('select')];
  return sels.map(s => s.value).filter(Boolean);
}

function rowsForRider(rider){
  const riderCol = state.mapping.rider || state.columns[0];
  return state.rows.filter(r => String(r[riderCol] ?? '') === String(rider));
}

function aggValue(rows, col, agg){
  const valuesRaw = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (agg === 'count') return valuesRaw.length;

  // Decide numeric/time
  const numeric = valuesRaw.map(v => toNumber(v)).filter(Number.isFinite);
  const time = valuesRaw.map(v => timeToSeconds(v)).filter(Number.isFinite);

  const useTime = time.length >= Math.max(3, Math.floor(valuesRaw.length*0.5));
  const arr = useTime ? time : numeric;
  if (!arr.length) return NaN;

  if (agg === 'best') return Math.min(...arr);
  if (agg === 'max') return Math.max(...arr);
  if (agg === 'avg') return arr.reduce((a,b)=>a+b,0)/arr.length;
  return NaN;
}

function renderH2HSummary(){
  const riders = getSelectedRiders();
  const out = el('h2hSummary');

  if (!state.rows.length){
    out.innerHTML = '<div class="empty">Upload een dataset om te starten.</div>';
    return;
  }
  if (riders.length < 2){
    out.innerHTML = '<div class="empty">Selecteer minimaal 2 rijders.</div>';
    return;
  }

  // Compute core stats per rider
  const stats = riders.map(name => {
    const rs = rowsForRider(name);
    const s = computeStats(rs);
    return { name, rs, s };
  });

  const rowHtml = stats.map(({name, s}) => {
    const bits = [
      `<div class="muted">Starts</div><div><b>${s.starts}</b></div>`,
      `<div class="muted">Wins</div><div><b>${s.wins}</b></div>`,
      `<div class="muted">Podiums</div><div><b>${s.podiums}</b></div>`,
      `<div class="muted">Beste tijd</div><div><b>${secondsToTime(s.bestTime)}</b></div>`,
      `<div class="muted">Gem. tijd</div><div><b>${Number.isFinite(s.avgTime) ? secondsToTime(s.avgTime) : '—'}</b></div>`,
      `<div class="muted">Beste rank</div><div><b>${Number.isFinite(s.bestRank) ? s.bestRank : '—'}</b></div>`,
      `<div class="muted">Laatste start</div><div><b>${formatDate(s.lastDate)}</b></div>`,
    ];
    return `
      <div class="diffCard">
        <div class="diffTitle">${escapeHtml(name)}</div>
        <div style="display:grid;grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px">${bits.map(x => `<div>${x}</div>`).join('')}</div>
      </div>
    `;
  }).join('');

  // Difference indicators (leaders)
  const leaders = [];
  const leaderFor = (key, betterFn, fmt = (x)=>String(x)) => {
    const vals = stats.map(x => ({ name: x.name, v: x.s[key] }));
    const finite = vals.filter(x => x.v !== null && x.v !== undefined && (typeof x.v === 'number' ? Number.isFinite(x.v) : true));
    if (finite.length < 2) return;
    const best = finite.reduce((a,b) => betterFn(a.v, b.v) ? a : b);
    leaders.push({ label: key, best });
  };

  leaderFor('wins', (a,b)=>a>b);
  leaderFor('podiums', (a,b)=>a>b);
  leaderFor('bestRank', (a,b)=>a<b);
  leaderFor('bestTime', (a,b)=>a<b);

  const leaderText = leaders.map(({label, best}) => {
    const pretty = ({ wins:'Meeste wins', podiums:'Meeste podiums', bestRank:'Beste rank', bestTime:'Snelste beste tijd' })[label] || label;
    const v = label === 'bestTime' ? secondsToTime(best.v) : String(best.v);
    return `<div class="badge">${pretty}: ${escapeHtml(best.name)} (${escapeHtml(v)})</div>`;
  }).join(' ');

  out.innerHTML = `
    <div class="diffRow">${leaderText || '<span class="muted">(Nog geen duidelijke leaders: check mapping voor rank/tijd)</span>'}</div>
    <div class="diffRow" style="margin-top:10px">${rowHtml}</div>
  `;
}

function renderH2HTable(){
  const riders = getSelectedRiders();
  const table = el('h2hTable');

  if (riders.length < 2){
    table.innerHTML = '<thead><tr><th>Selecteer minimaal 2 rijders</th></tr></thead>';
    return;
  }

  const metricRows = state.h2hMetricRows.length ? state.h2hMetricRows : [{ col: state.columns[0], agg:'count' }];

  // Build header
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Metric', 'Aggregatie', ...riders].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);

  const tbody = document.createElement('tbody');

  for (const mr of metricRows){
    const tr = document.createElement('tr');

    const tdMetric = document.createElement('td');
    tdMetric.textContent = mr.col;
    tr.appendChild(tdMetric);

    const tdAgg = document.createElement('td');
    tdAgg.textContent = ({ best:'Beste (min)', avg:'Gemiddelde', max:'Max', count:'Aantal' })[mr.agg] || mr.agg;
    tr.appendChild(tdAgg);

    // compute values
    const vals = riders.map(r => {
      const rs = rowsForRider(r);
      const v = aggValue(rs, mr.col, mr.agg);
      return v;
    });

    // highlight best based on agg
    const finiteVals = vals.map((v,i)=>({v,i})).filter(x => Number.isFinite(x.v));
    let bestIndex = -1;
    if (finiteVals.length){
      if (mr.agg === 'max' || mr.agg === 'count'){
        bestIndex = finiteVals.reduce((a,b)=> (a.v >= b.v ? a : b)).i;
      }else{
        bestIndex = finiteVals.reduce((a,b)=> (a.v <= b.v ? a : b)).i;
      }
    }

    vals.forEach((v, i) => {
      const td = document.createElement('td');
      let txt = '—';
      if (mr.agg === 'count') txt = Number.isFinite(v) ? String(v) : '0';
      else{
        // if it looks like time and mapping time col, render time
        const isTimeCol = state.mapping.time && mr.col === state.mapping.time;
        txt = Number.isFinite(v) ? (isTimeCol ? secondsToTime(v) : String(roundSmart(v))) : '—';
      }
      td.textContent = txt;
      if (i === bestIndex){
        td.style.fontWeight = '800';
        td.style.borderLeft = '3px solid rgba(82,232,232,0.65)';
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }

  table.innerHTML = '';
  table.appendChild(thead);
  table.appendChild(tbody);
}

function roundSmart(v){
  if (!Number.isFinite(v)) return v;
  const abs = Math.abs(v);
  if (abs >= 1000) return Math.round(v);
  if (abs >= 100) return Number(v.toFixed(1));
  if (abs >= 10) return Number(v.toFixed(2));
  return Number(v.toFixed(3));
}

function renderH2HBars(){
  // Optional: render compact bars for starts/wins/podiums
  // (kept simple in v0; could be expanded later)
}

// ---------------- Champions ----------------

function renderChampions(){
  const out = el('champsResult');
  const typeCol = el('chTypeCol').value;
  const yearCol = el('chYearCol').value;
  const worldVal = norm(el('chWorldValue').value);
  const olympicVal = norm(el('chOlympicValue').value);

  const riderCol = state.mapping.rider || state.columns[0];

  if (!typeCol || !yearCol || (!worldVal && !olympicVal)){
    out.innerHTML = '<div class="empty">Selecteer titeltype + jaar en vul ten minste één waarde in.</div>';
    return;
  }

  const groups = {
    world: new Map(),
    olympic: new Map(),
  };

  for (const r of state.rows){
    const t = norm(r[typeCol]);
    if (!t) continue;

    const rider = String(r[riderCol] ?? '').trim();
    if (!rider) continue;

    let y = r[yearCol];
    let year = null;
    if (typeof y === 'number' && Number.isFinite(y)){
      // if it's excel date or year
      if (y > 1900 && y < 2200) year = Math.floor(y);
      else{
        const d = parseDate(y);
        year = d ? d.getFullYear() : null;
      }
    }else{
      const s = String(y ?? '').trim();
      const m = s.match(/(19\d{2}|20\d{2})/);
      if (m) year = Number(m[1]);
      else{
        const d = parseDate(s);
        year = d ? d.getFullYear() : null;
      }
    }
    if (!year) continue;

    if (worldVal && t.includes(worldVal)){
      if (!groups.world.has(year)) groups.world.set(year, new Set());
      groups.world.get(year).add(rider);
    }
    if (olympicVal && t.includes(olympicVal)){
      if (!groups.olympic.has(year)) groups.olympic.set(year, new Set());
      groups.olympic.get(year).add(rider);
    }
  }

  const renderGroup = (title, map) => {
    const years = [...map.keys()].sort((a,b)=>b-a);
    if (!years.length) return `<div class="empty">Geen resultaten voor ${escapeHtml(title)}.</div>`;
    return years.map(y => {
      const names = [...map.get(y)].sort((a,b)=>a.localeCompare(b,'nl'));
      return `
        <div style="margin-bottom:14px">
          <div class="badge">${escapeHtml(title)} • ${y}</div>
          <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px">
            ${names.map(n => `<span class="badge">${escapeHtml(n)}</span>`).join('')}
          </div>
        </div>
      `;
    }).join('');
  };

  out.innerHTML = `
    <div class="grid2">
      <div>${renderGroup('Wereldkampioen', groups.world)}</div>
      <div>${renderGroup('Olympisch kampioen', groups.olympic)}</div>
    </div>
  `;
}

// ---------------- Helpers ----------------

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

// ---------------- Bindings ----------------

function bindUI(){
  navInit();
  bindMapping();

  el('fileInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    handleUpload(file);
    e.target.value = '';
  });

  el('dashRider').addEventListener('change', renderDashboard);

  el('btnAddRule').addEventListener('click', () => {
    state.rules.push({ logic:'AND', col: state.columns[0], op:'contains', val:'' });
    renderRules();
  });

  el('btnRunQuery').addEventListener('click', () => {
    const results = runQuery();
    el('queryCount').textContent = String(results.length);
    renderTable(el('queryTable'), results, state.columns);
    toast(`Resultaten: ${results.length}`);
  });

  el('h2hCount').addEventListener('change', () => {
    buildH2HSelectors();
  });

  el('btnBuildH2H').addEventListener('click', () => {
    renderH2HSummary();
    renderH2HTable();
  });

  el('btnAddMetricRow').addEventListener('click', () => {
    const col = el('h2hMetric').value;
    const agg = el('h2hAgg').value;
    state.h2hMetricRows.push({ col, agg });
    toast('Metric toegevoegd');
  });

  el('btnRenderH2HTable').addEventListener('click', () => {
    renderH2HTable();
    toast('Tabel bijgewerkt');
  });

  el('btnBuildChamps').addEventListener('click', () => {
    renderChampions();
  });
}

// ---------------- Init ----------------

(function init(){
  setStatus();
  setControlsEnabled(false);
  bindUI();
})();
