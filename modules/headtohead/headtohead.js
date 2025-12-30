import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { uniq, toNumber } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

/**
 * Head-to-Head (SILO)
 * - Aantal rijders: 2-4 (default 2)
 * - Toernooi: dropdown (typbaar) met ALLE unieke waarden uit kolom F (Wedstrijd)
 * - Afstand: knoppen 500m / 1000m / 1500m + Eindklassement (multi-select)
 *   - Eindklassement wordt herkend uit kolom H (Afstand) als tekst "eindklassement" of "overall".
 *
 * Vergelijken "tegen elkaar":
 * - Omdat heats/rit-informatie ontbreekt, vergelijken we op "zelfde uitslag":
 *   - dezelfde wedstrijd + locatie + afstand + datum + race + sekse + seizoen
 *   - vervolgens vergelijken we de posities (Ranking). Lagere ranking = betere positie.
 *   - A wint als A een lagere ranking heeft dan B in diezelfde uitslag.
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
    if(s.includes("eindklassement") || s.includes("overall")) return "Eindklassement";
    if(s.includes("500")) return "500m";
    if(s.includes("1000")) return "1000m";
    if(s.includes("1500")) return "1500m";
    return null;
  }

  // Toernooi options: ALL unique values from column F / Wedstrijd
  const competitions = uniq(rowsAll.map(r => norm(r[col.competition])).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));

  // Riders list (global)
  const riders = uniq(rowsAll.map(r => norm(r[col.rider])).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));
  const riderOptions = riders.map(r => ({ value:r, label:r }));

  // State
  const MAX = 4;
  let count = 2;
  const selected = new Array(MAX).fill("");

  const ALLOWED_DISTANCES = ["500m","1000m","1500m","Eindklassement"];

  const state = {
    competition: "",
    distances: new Set() // empty => all allowed
  };

  const competitionSel = createSearchableSelect({
    label:"Toernooi",
    placeholder:"Alle toernooien (typ om te zoeken…)",
    options:[{ value:"", label:"Alle toernooien" }, ...competitions.map(v => ({ value:v, label:v }))],
    value:"",
    onChange:(v)=>{ state.competition = v || ""; renderAll(); }
  });

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

  const topRow = el("div", { class:"grid grid--4" });
  const distanceRow = el("div", {});
  const selectorsWrap = el("div", { class:"grid grid--4" });
  const dataWrap = el("div", {});
  const tableWrap = el("div", {});
  const pairWrap = el("div", {});

  function getFilteredRows(){
    return rowsAll.filter(r => {
      if(state.competition && norm(r[col.competition]) !== state.competition) return false;

      const dk = distanceKey(r[col.distance]);
      if(!dk) return false;

      if(state.distances.size && !state.distances.has(dk)) return false;

      return true;
    });
  }

  function buildIndexes(rows){
    const eventToRiders = new Map();
    const riderToEvents = new Map();
    const eventToRankByRider = new Map();

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
        const m = eventToRankByRider.get(k);
        const prev = m.get(name);
        if(prev == null || rk < prev) m.set(name, rk);
      }
    }

    return { eventToRiders, riderToEvents, eventToRankByRider };
  }

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

    const endWins = rRows
      .filter(r => distanceKey(r[col.distance]) === "Eindklassement")
      .map(r => toNumber(r[col.ranking]))
      .filter(n => n === 1).length;

    return { starts, gold, silver, bronze, podiums, avg, best, wkMedals, osMedals, endWins };
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
    const pairs = [];
    for(let i=0;i<chosen.length;i++){
      for(let j=i+1;j<chosen.length;j++){
        const a = chosen[i], b = chosen[j];
        let meetings = 0, aWins = 0, bWins = 0, ties = 0, unknown = 0;

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

          if(ra < rb) aWins += 1;
          else if(rb < ra) bWins += 1;
          else ties += 1;
        }

        pairs.push({ a, b, meetings, aWins, bWins, ties, unknown });
      }
    }
    return pairs.sort((x,y)=>y.meetings - x.meetings);
  }

  function renderDistanceButtons(){
    clear(distanceRow);

    const label = el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, "Afstanden");
    const row = el("div", { class:"row", style:"gap:10px; flex-wrap:wrap; align-items:flex-end;" });

    const visible = ALLOWED_DISTANCES;
    const allActive = (state.distances.size === 0) || visible.every(k => state.distances.has(k));

    const btnAll = el("button", { class:"btn", type:"button", style:"padding:8px 10px; border-radius:14px; font-weight:800;" }, "All");
    btnAll.classList.toggle("btn--primary", allActive);
    btnAll.addEventListener("click", ()=>{
      // Toggle between "all implied" (empty) and "explicit all"
      if(state.distances.size === 0) state.distances = new Set(visible);
      else state.distances = new Set();
      renderDistanceButtons();
      renderAll();
    });

    row.appendChild(btnAll);

    visible.forEach(k => {
      const active = (state.distances.size === 0) ? true : state.distances.has(k);
      const b = el("button", { class:"btn", type:"button", style:"padding:8px 10px; border-radius:14px; font-weight:800;" }, k);
      b.classList.toggle("btn--primary", active);
      b.addEventListener("click", ()=>{
        if(state.distances.size === 0){
          state.distances = new Set([k]);
        } else {
          if(state.distances.has(k)) state.distances.delete(k);
          else state.distances.add(k);
          if(state.distances.size === 0){
            // keep empty => all
          }
        }
        renderDistanceButtons();
        renderAll();
      });
      row.appendChild(b);
    });

    distanceRow.appendChild(label);
    distanceRow.appendChild(row);
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

  const METRICS = [
    { key:"gold",     label:"🥇 Goud (pos 1)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"silver",   label:"🥈 Zilver (pos 2)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"bronze",   label:"🥉 Brons (pos 3)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"podiums",  label:"Podiums (≤3)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"wkMedals", label:"WK medailles (≤3)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"osMedals", label:"OS medailles (≤3)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"endWins",  label:"Eindklassement gewonnen (pos 1)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"meetings", label:"Zelfde uitslag (met elkaar)", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"starts",   label:"Starts / rijen", lowerBetter:false, fmt:(v)=> v == null ? "—" : String(v) },
    { key:"avg",      label:"Gem. ranking", lowerBetter:true, fmt:(v)=> v == null ? "—" : Number(v).toFixed(2) },
    { key:"best",     label:"Beste ranking", lowerBetter:true, fmt:(v)=> v == null ? "—" : String(v) },
  ];

  const selectedMetrics = new Set(["gold","podiums","meetings","wkMedals","osMedals","endWins"]);

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

    const ranges = {};
    for(const key of activeMetricKeys){
      const vals = stats.map(s => s[key]).filter(v => v != null);
      ranges[key] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min:null, max:null };
    }

    const defs = activeMetricKeys.map(k => METRICS.find(m => m.key === k)).filter(Boolean);

    const ctxParts = [];
    if(state.competition) ctxParts.push(state.competition);
    const distLabel = (state.distances.size === 0) ? ALLOWED_DISTANCES.join(" / ") : Array.from(state.distances).join(" / ");
    ctxParts.push(distLabel);
    const ctx = ctxParts.join(" | ");
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
      "Duel uitslagen (zelfde uitslag, vergelijken op positie)"
    ));

    pairWrap.appendChild(el("table", { class:"table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Duel"),
        el("th", {}, "Samen in uitslag"),
        el("th", {}, "Winst A"),
        el("th", {}, "Winst B"),
        el("th", {}, "Gelijk"),
        el("th", {}, "Onbekend"),
      ])),
      el("tbody", {}, pairs.map(p => {
        const aBest = p.aWins > p.bWins;
        const bBest = p.bWins > p.aWins;

        const winCell = (name, val, isBest) => el("td", {
          style: isBest ? "font-weight:900; border-bottom-color: rgba(82,232,232,.35)" : ""
        }, [
          el("div", { style:"font-size:14px;" }, String(val)),
          el("div", { class:"muted", style:"font-size:11px; opacity:.8; font-weight:800; margin-top:2px" }, `Winst ${name}`)
        ]);

        return el("tr", {}, [
          el("td", {}, `${p.a} vs ${p.b}`),
          el("td", {}, String(p.meetings)),
          winCell(p.a, p.aWins, aBest),
          winCell(p.b, p.bWins, bBest),
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
