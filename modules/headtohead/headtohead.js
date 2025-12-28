import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { uniq, toNumber } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

/**
 * Head-to-Head
 * - Aantal rijders: 2-4 (default 2)
 * - Filters: Toernooi (kolom F / Wedstrijd), Afstand (kolom H / Afstand)
 * - Data (metrics) kiesbaar:
 *   - Aantal keer gewonnen (Ranking=1)
 *   - Aantal keer tegen elkaar gereden (unieke race-instanties met overlap)
 *   - + extra's (starts/podiums/avg/best)
 *
 * Alles wordt herleid uit geüploade dataset.
 */
export function mountHeadToHead(root){
  clear(root);

  const rowsAll = loadDataset();
  if(!rowsAll || rowsAll.length === 0){
    root.appendChild(sectionCard({
      title:"Head-to-Head",
      subtitle:"Upload eerst een Excel-bestand in het hoofdmenu.",
      children:[ el("div", { class:"notice" }, "Geen data gevonden. Ga naar Menu → Upload Excel.") ]
    }));
    return;
  }

  const cols = Object.keys(rowsAll[0] || {});
  const map = getMappingWithFallback(cols);
  const pick = (preferred, fallback) => cols.includes(preferred) ? preferred : fallback;

  const col = {
    race:        pick("Race",      map.race),
    ranking:     pick("Ranking",   map.ranking),
    rider:       pick("Naam",      map.rider),
    nat:         pick("Nat.",      map.nat),
    competition: pick("Wedstrijd", map.competition),
    location:    pick("Locatie",   map.location),
    distance:    pick("Afstand",   map.distance),
    date:        pick("Datum",     map.date),
    season:      pick("Seizoen",   map.season),
    sex:         pick("Sekse",     map.sex),
  };

  const missing = Object.entries(col).filter(([_, v]) => !v || !cols.includes(v)).map(([k]) => k);
  if(missing.length){
    root.appendChild(sectionCard({
      title:"Head-to-Head",
      subtitle:"Kolommen ontbreken of zijn niet herkend.",
      children:[
        el("div", { class:"notice" },
          "Ik kan deze kolommen niet vinden: " + missing.join(", ") +
          ". Controleer de kolomkoppen of stel mapping in via het tandwiel.")
      ]
    }));
    return;
  }

  const norm = (v) => String(v ?? "").trim();
  const lower = (v) => norm(v).toLowerCase();

  // Options for filters derived from dataset content
  const competitions = uniq(rowsAll.map(r => norm(r[col.competition])).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));

  const distances = uniq(rowsAll.map(r => norm(r[col.distance])).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));

  // Riders (global list)
  const riders = uniq(rowsAll.map(r => norm(r[col.rider])).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));
  const riderOptions = riders.map(r => ({ value:r, label:r }));

  // State
  const MAX = 4;
  let count = 2;
  const selected = new Array(MAX).fill("");

  const state = {
    competition: "", // all
    distance: "",    // all
  };

  // Filter selectors (typable)
  const competitionSel = createSearchableSelect({
    label:"Toernooi",
    placeholder:"Alle toernooien (typ om te zoeken…)",
    options:[{ value:"", label:"Alle toernooien" }, ...competitions.map(v => ({ value:v, label:v }))],
    value:"",
    onChange:(v)=>{ state.competition = v || ""; renderAll(); }
  });

  const distanceSel = createSearchableSelect({
    label:"Afstand",
    placeholder:"Alle afstanden (typ om te zoeken…)",
    options:[{ value:"", label:"Alle afstanden" }, ...distances.map(v => ({ value:v, label:v }))],
    value:"",
    onChange:(v)=>{ state.distance = v || ""; renderAll(); }
  });

  // Count selector (max 4, default 2)
  const countSel = createSearchableSelect({
    label:"Aantal rijders",
    options:[2,3,4].map(n => ({ value:String(n), label:`${n} rijders` })),
    value:String(count),
    onChange:(v)=>{
      count = Math.min(MAX, Math.max(2, Number(v)||2));
      renderSelectors();
      renderAll();
    }
  });

  // Data (metrics) selection
  const METRICS = [
    { key:"wins",     label:"Aantal keer gewonnen", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"meetings", label:"Aantal keer tegen elkaar gereden", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"starts",   label:"Starts / rijen", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"podiums",  label:"Podiums (≤3)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"avg",      label:"Gem. ranking", lowerBetter:true, fmt:(v)=> v == null ? "—" : Number(v).toFixed(2) },
    { key:"best",     label:"Beste ranking", lowerBetter:true, fmt:(v)=> v == null ? "—" : String(v) },
  ];

  const selectedMetrics = new Set(["wins","meetings"]);

  // UI containers
  const topFilters = el("div", { class:"grid grid--4" });
  const selectorsWrap = el("div", { class:"grid grid--4" });
  const dataWrap = el("div", {});
  const tableWrap = el("div", {});

  function getFilteredRows(){
    return rowsAll.filter(r => {
      if(state.competition && norm(r[col.competition]) !== state.competition) return false;
      if(state.distance && norm(r[col.distance]) !== state.distance) return false;
      return true;
    });
  }

  // Build indexes from filtered rows so "meetings" respects selection
  function buildIndexes(rows){
    const eventToRiders = new Map(); // eventKey -> Set(name)
    const riderToEvents = new Map(); // name -> Set(eventKey)

    const eventKey = (r) => [
      lower(r[col.competition]),
      lower(r[col.location]),
      lower(r[col.distance]),
      lower(r[col.date]),
      lower(r[col.race]),
      lower(r[col.sex]),
      lower(r[col.season]),
    ].join("||");

    for(const r of rows){
      const name = norm(r[col.rider]);
      if(!name) continue;
      const k = eventKey(r);

      if(!eventToRiders.has(k)) eventToRiders.set(k, new Set());
      eventToRiders.get(k).add(name);

      if(!riderToEvents.has(name)) riderToEvents.set(name, new Set());
      riderToEvents.get(name).add(k);
    }

    return { eventToRiders, riderToEvents };
  }

  function kpisFor(name, rows){
    const rRows = rows.filter(r => norm(r[col.rider]) === name);
    const rk = rRows.map(r => toNumber(r[col.ranking])).filter(n => n != null);

    const starts = rRows.length;
    const wins = rk.filter(n => n === 1).length;
    const podiums = rk.filter(n => n <= 3).length;
    const avg = rk.length ? rk.reduce((a,b)=>a+b,0) / rk.length : null;
    const best = rk.length ? Math.min(...rk) : null;

    return { starts, wins, podiums, avg, best };
  }

  function meetingsFor(name, chosen, idx){
    if(!name) return 0;
    if(!chosen || chosen.length < 2) return 0;

    const others = new Set(chosen.filter(n => n && n !== name));
    if(others.size === 0) return 0;

    const events = idx.riderToEvents.get(name);
    if(!events) return 0;

    let c = 0;
    for(const k of events){
      const set = idx.eventToRiders.get(k);
      if(!set) continue;
      let hit = false;
      for(const o of others){
        if(set.has(o)){ hit = true; break; }
      }
      if(hit) c += 1;
    }
    return c;
  }

  function renderSelectors(){
    clear(selectorsWrap);
    for(let i=0;i<count;i++){
      const sel = createSearchableSelect({
        label:`Rijder ${i+1}`,
        placeholder:"Typ om te zoeken…",
        options:[{ value:"", label:"— kies rijder —" }, ...riderOptions],
        value:selected[i] || "",
        onChange:(v)=>{ selected[i] = v || ""; renderAll(); }
      });
      selectorsWrap.appendChild(sel.el);
    }
  }

  function metricPill(metricKey){
    const def = METRICS.find(m => m.key === metricKey);
    const txt = def ? def.label : metricKey;

    const pill = el("button", {
      type:"button",
      class:"pill pill--clickable",
      style:"cursor:pointer; border:1px solid rgba(255,255,255,.12)"
    }, txt);

    pill.addEventListener("click", ()=>{
      if(selectedMetrics.has(metricKey)) selectedMetrics.delete(metricKey);
      else selectedMetrics.add(metricKey);
      renderAll();
    });

    if(selectedMetrics.has(metricKey)){
      pill.style.borderColor = "rgba(82,232,232,.35)";
      pill.style.fontWeight = "900";
    } else {
      pill.style.opacity = ".75";
    }
    return pill;
  }

  function renderDataPicker(){
    clear(dataWrap);

    const titleRow = el("div", { class:"row", style:"align-items:flex-end;" }, [
      el("div", { style:"min-width:140px;" }, [
        el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, "Data"),
        el("div", { class:"muted", style:"font-size:12px; opacity:.8" }, "Klik om aan/uit te zetten")
      ]),
      el("div", { class:"spacer" })
    ]);

    const search = el("input", { class:"input", type:"text", placeholder:"Zoek data-parameter…", value:"" });
    const list = el("div", { style:"display:flex; flex-wrap:wrap; gap:10px;" });

    function renderList(){
      clear(list);
      const q = lower(search.value);
      METRICS
        .filter(m => !q || lower(m.label).includes(q))
        .forEach(m => list.appendChild(metricPill(m.key)));
      if(list.childNodes.length === 0){
        list.appendChild(el("div", { class:"muted", style:"font-size:12px; opacity:.8" }, "Geen resultaten."));
      }
    }
    search.addEventListener("input", renderList);
    renderList();

    dataWrap.appendChild(titleRow);
    dataWrap.appendChild(el("div", { style:"height:10px" }));
    dataWrap.appendChild(el("div", { class:"row", style:"gap:12px; align-items:flex-start; flex-wrap:wrap;" }, [
      el("div", { style:"min-width:260px; flex:1;" }, search),
      el("div", { style:"flex:3; min-width:320px;" }, list),
    ]));
  }

  function renderTable(){
    clear(tableWrap);

    const chosen = selected.slice(0,count).filter(Boolean);
    if(chosen.length === 0){
      tableWrap.appendChild(el("div", { class:"notice" }, "Selecteer één of meer rijders om te vergelijken."));
      return;
    }

    const activeMetricKeys = METRICS.map(m => m.key).filter(k => selectedMetrics.has(k));
    if(activeMetricKeys.length === 0){
      tableWrap.appendChild(el("div", { class:"notice" }, "Selecteer minimaal één data-parameter."));
      return;
    }

    const rows = getFilteredRows();
    const idx = buildIndexes(rows);

    const stats = chosen.map(n => {
      const base = kpisFor(n, rows);
      const meetings = meetingsFor(n, chosen, idx);
      return { name:n, meetings, ...base };
    });

    const ranges = {};
    for(const key of activeMetricKeys){
      const vals = stats.map(s => s[key]).filter(v => v != null);
      ranges[key] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min:null, max:null };
    }

    const defs = activeMetricKeys.map(k => METRICS.find(m => m.key === k)).filter(Boolean);

    // Context line to show current filters
    const parts = [];
    if(state.competition) parts.push(state.competition);
    if(state.distance) parts.push(state.distance);
    const ctx = parts.length ? parts.join(" | ") : "Alle data";
    tableWrap.appendChild(el("div", { class:"muted", style:"font-size:12px; font-weight:800; opacity:.9; margin-bottom:8px" }, ctx));

    tableWrap.appendChild(el("table", { class:"table" }, [
      el("thead", {}, el("tr", {}, ["Data", ...chosen].map(h => el("th", {}, h)))),
      el("tbody", {}, defs.map(def => {
        const key = def.key;
        const bestVal = def.lowerBetter ? ranges[key].min : ranges[key].max;

        return el("tr", {}, [
          el("td", {}, def.label),
          ...stats.map(s => {
            const v = s[key];
            const isBest = (v != null && bestVal != null && v === bestVal);
            return el("td", {
              style: isBest ? "font-weight:900; border-bottom-color: rgba(82,232,232,.35)" : ""
            }, def.fmt(v));
          })
        ]);
      }))
    ]));
  }

  function renderAll(){
    renderDataPicker();
    renderTable();
  }

  // Top filters row
  clear(topFilters);
  topFilters.appendChild(competitionSel.el);
  topFilters.appendChild(distanceSel.el);
  topFilters.appendChild(countSel.el);
  // empty filler so it aligns nicely in grid--4
  topFilters.appendChild(el("div", {}));

  renderSelectors();
  renderAll();

  root.appendChild(sectionCard({
    title:"Head-to-Head",
    subtitle:"Vergelijk rijders in één oogopslag (met filters op toernooi en afstand).",
    children:[
      topFilters,
      el("div", { class:"hr" }),
      selectorsWrap,
      el("div", { class:"hr" }),
      dataWrap,
      el("div", { class:"hr" }),
      tableWrap
    ]
  }));
}
