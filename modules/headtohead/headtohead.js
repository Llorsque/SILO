import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { uniq, toNumber } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

/**
 * Head-to-Head (SILO)
 * - Aantal rijders: 2-4 (default 2)
 * - Filters:
 *   - Toernooi (dropdown / typbaar) op kolom F (Wedstrijd)
 *   - Afstanden (knoppen / multi-select) gebaseerd op waarden in de upload
 * - Data (metrics) kiesbaar:
 *   - Wins (pos 1), Zilver (pos 2), Brons (pos 3), Podiums (≤3)
 *   - WK medailles (≤3), OS medailles (≤3)
 *   - Aantal keer tegen elkaar gereden (overlap in unieke race-instanties)
 *   - Pairwise "wie eindigde vaker voor wie" per rijders-paar
 *
 * Alles is herleid uit de geüploade dataset.
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

  function tournamentType(v){
    const s = lower(v);
    if(s.includes("olympische spelen")) return "OS";
    if(s.includes("wereldkampioenschap")) return "WK";
    return null;
  }

  function distanceKey(v){
    const s = lower(v);
    // try to normalize on numbers
    if(s.includes("500")) return "500m";
    if(s.includes("1000")) return "1000m";
    if(s.includes("1500")) return "1500m";
    // fallback: compact label from original
    return norm(v) || "";
  }

  // Options for "Toernooi" derived from dataset content
  const competitions = uniq(rowsAll.map(r => norm(r[col.competition])).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));

  // Available distance keys present in data
  const availableDistKeys = uniq(rowsAll.map(r => distanceKey(r[col.distance])).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));

  // Riders list (global)
  const riders = uniq(rowsAll.map(r => norm(r[col.rider])).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));
  const riderOptions = riders.map(r => ({ value:r, label:r }));

  // State
  const MAX = 4;
  let count = 2;
  const selected = new Array(MAX).fill("");

  const state = {
    competition: "",      // all
    distances: new Set()  // empty = all
  };

  // Toernooi selector (typable)
  const competitionSel = createSearchableSelect({
    label:"Toernooi",
    placeholder:"Alle toernooien (typ om te zoeken…)",
    options:[{ value:"", label:"Alle toernooien" }, ...competitions.map(v => ({ value:v, label:v }))],
    value:"",
    onChange:(v)=>{ state.competition = v || ""; renderAll(); }
  });

  // Count selector
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

  // UI containers
  const topRow = el("div", { class:"grid grid--4" });
  const distanceRow = el("div", {});
  const selectorsWrap = el("div", { class:"grid grid--4" });
  const dataWrap = el("div", {});
  const tableWrap = el("div", {});
  const pairWrap = el("div", {});

  function getFilteredRows(){
    return rowsAll.filter(r => {
      if(state.competition && norm(r[col.competition]) !== state.competition) return false;
      if(state.distances.size){
        const dk = distanceKey(r[col.distance]);
        if(!state.distances.has(dk)) return false;
      }
      return true;
    });
  }

  // Build event indexes from filtered rows so meetings + pairwise respects current filters
  function buildIndexes(rows){
    const eventToRiders = new Map(); // eventKey -> Set(name)
    const riderToEvents = new Map(); // name -> Set(eventKey)
    const eventToRankByRider = new Map(); // eventKey -> Map(name -> rank)

    const eventKey = (r) => [
      lower(r[col.competition]),
      lower(r[col.location]),
      lower(distanceKey(r[col.distance])),
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

      const rk = toNumber(r[col.ranking]);
      if(rk != null){
        if(!eventToRankByRider.has(k)) eventToRankByRider.set(k, new Map());
        // If duplicates happen, keep best (lowest)
        const m = eventToRankByRider.get(k);
        const prev = m.get(name);
        if(prev == null || rk < prev) m.set(name, rk);
      }
    }

    return { eventToRiders, riderToEvents, eventToRankByRider };
  }

  // Rider KPIs from rows (respecting current filters)
  function kpisFor(name, rows){
    const rRows = rows.filter(r => norm(r[col.rider]) === name);
    const ranks = rRows.map(r => toNumber(r[col.ranking])).filter(n => n != null);

    const starts = rRows.length;
    const gold = ranks.filter(n => n === 1).length;
    const silver = ranks.filter(n => n === 2).length;
    const bronze = ranks.filter(n => n === 3).length;
    const podiums = ranks.filter(n => n <= 3).length;
    const avg = ranks.length ? ranks.reduce((a,b)=>a+b,0) / ranks.length : null;
    const best = ranks.length ? Math.min(...ranks) : null;

    const wkMedals = rRows.filter(r => tournamentType(r[col.competition]) === "WK")
      .map(r => toNumber(r[col.ranking])).filter(n => n != null && n <= 3).length;

    const osMedals = rRows.filter(r => tournamentType(r[col.competition]) === "OS")
      .map(r => toNumber(r[col.ranking])).filter(n => n != null && n <= 3).length;

    return { starts, gold, silver, bronze, podiums, avg, best, wkMedals, osMedals };
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

  function pairwiseStats(chosen, idx){
    // For each pair (A,B): count shared events and who ranked ahead more often
    const pairs = [];
    for(let i=0;i<chosen.length;i++){
      for(let j=i+1;j<chosen.length;j++){
        const a = chosen[i], b = chosen[j];
        let meetings = 0, aAhead = 0, bAhead = 0, ties = 0, unknown = 0;

        // iterate smaller set of events to be efficient
        const ea = idx.riderToEvents.get(a) || new Set();
        const eb = idx.riderToEvents.get(b) || new Set();
        const base = ea.size <= eb.size ? ea : eb;
        const other = ea.size <= eb.size ? eb : ea;

        for(const k of base){
          if(!other.has(k)) continue;
          meetings += 1;

          const ranks = idx.eventToRankByRider.get(k);
          const ra = ranks ? ranks.get(a) : null;
          const rb = ranks ? ranks.get(b) : null;

          if(ra == null || rb == null){
            unknown += 1;
            continue;
          }
          if(ra < rb) aAhead += 1;
          else if(rb < ra) bAhead += 1;
          else ties += 1;
        }

        pairs.push({ a, b, meetings, aAhead, bAhead, ties, unknown });
      }
    }
    return pairs.sort((x,y)=>y.meetings - x.meetings);
  }

  // Distance buttons (multi-select) + All toggle
  function toggleDistance(k){
    if(state.distances.has(k)) state.distances.delete(k);
    else state.distances.add(k);
    renderDistanceButtons();
    renderAll();
  }

  function renderDistanceButtons(){
    clear(distanceRow);

    const row = el("div", { class:"row", style:"gap:10px; flex-wrap:wrap; align-items:flex-end;" });
    const label = el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, "Afstanden");

    const allActive = availableDistKeys.length > 0 && availableDistKeys.every(k => state.distances.has(k));
    const btnAll = el("button", { class:"btn", type:"button", style:"padding:8px 10px; border-radius:14px; font-weight:800;" }, "All");
    btnAll.classList.toggle("btn--primary", allActive);
    btnAll.addEventListener("click", ()=>{
      if(allActive) availableDistKeys.forEach(k => state.distances.delete(k));
      else availableDistKeys.forEach(k => state.distances.add(k));
      renderDistanceButtons();
      renderAll();
    });

    const btnWrap = el("div", { class:"row", style:"gap:10px; flex-wrap:wrap;" });
    btnWrap.appendChild(btnAll);

    availableDistKeys.forEach(k => {
      const b = el("button", { class:"btn", type:"button", style:"padding:8px 10px; border-radius:14px; font-weight:800;" }, k);
      b.classList.toggle("btn--primary", state.distances.has(k));
      b.addEventListener("click", ()=>toggleDistance(k));
      btnWrap.appendChild(b);
    });

    distanceRow.appendChild(el("div", { style:"min-width:140px;" }, label));
    distanceRow.appendChild(btnWrap);
  }

  // Rider selectors
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

  // Metrics / Data picker
  const METRICS = [
    { key:"gold",     label:"🥇 Goud (pos 1)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"silver",   label:"🥈 Zilver (pos 2)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"bronze",   label:"🥉 Brons (pos 3)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"podiums",  label:"Podiums (≤3)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"wkMedals", label:"WK medailles (≤3)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"osMedals", label:"OS medailles (≤3)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"meetings", label:"Tegen elkaar gereden", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"starts",   label:"Starts / rijen", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"avg",      label:"Gem. ranking", lowerBetter:true, fmt:(v)=> v == null ? "—" : Number(v).toFixed(2) },
    { key:"best",     label:"Beste ranking", lowerBetter:true, fmt:(v)=> v == null ? "—" : String(v) },
  ];

  // Default selection requested
  const selectedMetrics = new Set(["gold","podiums","meetings","wkMedals","osMedals"]);

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

  function renderMainTable(chosen, rows, idx){
    clear(tableWrap);

    if(chosen.length === 0){
      tableWrap.appendChild(el("div", { class:"notice" }, "Selecteer één of meer rijders om te vergelijken."));
      return;
    }

    const activeMetricKeys = METRICS.map(m => m.key).filter(k => selectedMetrics.has(k));
    if(activeMetricKeys.length === 0){
      tableWrap.appendChild(el("div", { class:"notice" }, "Selecteer minimaal één data-parameter."));
      return;
    }

    const stats = chosen.map(n => {
      const base = kpisFor(n, rows);
      const meetings = meetingsFor(n, chosen, idx);
      return { name:n, meetings, ...base };
    });

    // Ranges for highlighting
    const ranges = {};
    for(const key of activeMetricKeys){
      const vals = stats.map(s => s[key]).filter(v => v != null);
      ranges[key] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min:null, max:null };
    }

    const defs = activeMetricKeys.map(k => METRICS.find(m => m.key === k)).filter(Boolean);

    // Context line
    const ctxParts = [];
    if(state.competition) ctxParts.push(state.competition);
    if(state.distances.size) ctxParts.push(Array.from(state.distances).join(" / "));
    const ctx = ctxParts.length ? ctxParts.join(" | ") : "Alle data";
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

  function renderPairwise(pairs){
    clear(pairWrap);

    if(pairs.length === 0) return;

    pairWrap.appendChild(el("div", { class:"muted", style:"font-size:12px; font-weight:900; margin: 6px 0 10px;" },
      "Head-to-head: wie eindigde vaker voor wie"
    ));

    pairWrap.appendChild(el("table", { class:"table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Duel"),
        el("th", {}, "Samen gereden"),
        el("th", {}, "A vóór B"),
        el("th", {}, "B vóór A"),
        el("th", {}, "Gelijk"),
        el("th", {}, "Onbekend"),
      ])),
      el("tbody", {}, pairs.map(p => {
        const duel = `${p.a} vs ${p.b}`;
        // best highlight: bigger of aAhead/bAhead
        const aBest = p.aAhead > p.bAhead;
        const bBest = p.bAhead > p.aAhead;
        return el("tr", {}, [
          el("td", {}, duel),
          el("td", {}, String(p.meetings)),
          el("td", { style: aBest ? "font-weight:900; border-bottom-color: rgba(82,232,232,.35)" : "" }, String(p.aAhead)),
          el("td", { style: bBest ? "font-weight:900; border-bottom-color: rgba(82,232,232,.35)" : "" }, String(p.bAhead)),
          el("td", {}, String(p.ties)),
          el("td", {}, String(p.unknown)),
        ]);
      }))
    ]));
  }

  function renderAll(){
    renderDataPicker();

    const chosen = selected.slice(0,count).filter(Boolean);
    const rows = getFilteredRows();
    const idx = buildIndexes(rows);

    renderMainTable(chosen, rows, idx);

    if(chosen.length >= 2){
      renderPairwise(pairwiseStats(chosen, idx));
    } else {
      clear(pairWrap);
    }
  }

  // Build top layout
  clear(topRow);
  topRow.appendChild(competitionSel.el);
  topRow.appendChild(countSel.el);
  topRow.appendChild(el("div", {}));
  topRow.appendChild(el("div", {}));

  renderDistanceButtons();
  renderSelectors();
  renderAll();

  root.appendChild(sectionCard({
    title:"Head-to-Head",
    subtitle:"Vergelijk rijders in één oogopslag (met filters op toernooi en afstand).",
    children:[
      topRow,
      el("div", { style:"height:8px" }),
      distanceRow,
      el("div", { class:"hr" }),
      selectorsWrap,
      el("div", { class:"hr" }),
      dataWrap,
      el("div", { class:"hr" }),
      tableWrap,
      el("div", { class:"hr" }),
      pairWrap
    ]
  }));
}
