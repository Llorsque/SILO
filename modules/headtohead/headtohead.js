import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { uniq, toNumber } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

export function mountHeadToHead(root){
  clear(root);

  const rows = loadDataset();
  if(!rows || rows.length === 0){
    root.appendChild(sectionCard({
      title:"Head-to-Head",
      subtitle:"Upload eerst een Excel-bestand in het hoofdmenu.",
      children:[ el("div", { class:"notice" }, "Geen data gevonden. Ga naar Menu → Upload Excel.") ]
    }));
    return;
  }

  const cols = Object.keys(rows[0] || {});
  const map = getMappingWithFallback(cols);

  const norm = (v) => String(v ?? "").trim();
  const lower = (v) => norm(v).toLowerCase();

  // Riders
  const riders = uniq(rows.map(r => norm(r[map.rider])).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));

  const riderOptions = riders.map(r => ({ value:r, label:r }));

  // Count selector (max 4, default 2)
  let count = 2;
  const MAX = 4;
  const selected = new Array(MAX).fill("");

  const countSel = createSearchableSelect({
    label:"Aantal rijders",
    options:[2,3,4].map(n => ({ value:String(n), label:`${n} rijders` })),
    value:String(count),
    onChange:(v)=>{
      count = Math.min(MAX, Math.max(2, Number(v)||2));
      // Keep only first N selections visible; others remain stored but ignored
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

  // Default: 2 metrics requested (wins + meetings)
  const selectedMetrics = new Set(["wins","meetings"]);

  // Pre-index events so we can compute "tegen elkaar gereden" from uploaded data
  // An "event" here is a unique race instance: competition+location+distance+date+race+sex+season
  const eventToRiders = new Map();      // eventKey -> Set(riderName)
  const riderToEvents = new Map();      // riderName -> Set(eventKey)

  function eventKey(r){
    return [
      lower(r[map.competition]),
      lower(r[map.location]),
      lower(r[map.distance]),
      lower(r[map.date]),
      lower(r[map.race]),
      lower(r[map.sex]),
      lower(r[map.season]),
    ].join("||");
  }

  for(const r of rows){
    const name = norm(r[map.rider]);
    if(!name) continue;
    const k = eventKey(r);

    if(!eventToRiders.has(k)) eventToRiders.set(k, new Set());
    eventToRiders.get(k).add(name);

    if(!riderToEvents.has(name)) riderToEvents.set(name, new Set());
    riderToEvents.get(name).add(k);
  }

  function kpisFor(name){
    const rRows = rows.filter(r => norm(r[map.rider]) === name);
    const rk = rRows.map(r => toNumber(r[map.ranking])).filter(n => n != null);

    const starts = rRows.length;
    const wins = rk.filter(n => n === 1).length;
    const podiums = rk.filter(n => n <= 3).length;
    const avg = rk.length ? rk.reduce((a,b)=>a+b,0) / rk.length : null;
    const best = rk.length ? Math.min(...rk) : null;

    return { starts, wins, podiums, avg, best };
  }

  function meetingsFor(name, chosen){
    // Count distinct events where name participated AND at least 1 other chosen rider also participated
    if(!name) return 0;
    if(!chosen || chosen.length < 2) return 0;

    const others = new Set(chosen.filter(n => n && n !== name));
    if(others.size === 0) return 0;

    const events = riderToEvents.get(name);
    if(!events) return 0;

    let c = 0;
    for(const k of events){
      const set = eventToRiders.get(k);
      if(!set) continue;
      // intersection with others
      let hit = false;
      for(const o of others){
        if(set.has(o)){ hit = true; break; }
      }
      if(hit) c += 1;
    }
    return c;
  }

  // UI: selectors
  const selectorsWrap = el("div", { class:"grid grid--4" });
  const dataWrap = el("div", {});
  const tableWrap = el("div", {});

  function renderSelectors(){
    clear(selectorsWrap);

    for(let i=0;i<count;i++){
      const sel = createSearchableSelect({
        label:`Rijder ${i+1}`,
        placeholder:"Typ om te zoeken…",
        options:[{ value:"", label:"— kies rijder —" }, ...riderOptions],
        value:selected[i] || "",
        onChange:(v)=>{
          selected[i] = v || "";
          renderAll();
        }
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

    // Visual state
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

    const stats = chosen.map(n => {
      const base = kpisFor(n);
      const meetings = meetingsFor(n, chosen);
      return { name:n, meetings, ...base };
    });

    // Ranges for highlighting
    const ranges = {};
    for(const key of activeMetricKeys){
      const vals = stats.map(s => s[key]).filter(v => v != null);
      ranges[key] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min:null, max:null };
    }

    const defs = activeMetricKeys.map(k => METRICS.find(m => m.key === k)).filter(Boolean);

    tableWrap.appendChild(el("div", { class:"notice" },
      "Tip: hoogste is ‘beste’ bij wins/podiums/starts/tegen elkaar gereden. Bij ranking is lager beter."
    ));
    tableWrap.appendChild(el("div", { style:"height:10px" }));

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

  renderSelectors();
  renderAll();

  root.appendChild(sectionCard({
    title:"Head-to-Head",
    subtitle:"Vergelijk rijders in één oogopslag.",
    children:[
      el("div", { class:"row" }, [countSel.el]),
      el("div", { class:"hr" }),
      selectorsWrap,
      el("div", { class:"hr" }),
      dataWrap,
      el("div", { class:"hr" }),
      tableWrap
    ]
  }));
}
