import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { uniq, toNumber } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";
import { createSearchableMultiSelect } from "../../core/components/searchableMultiSelect.js";

export function mountDashboard(root){
  clear(root);

  const allRows = loadDataset();
  if(!allRows || allRows.length === 0){
    root.appendChild(sectionCard({
      title: "Dashboard",
      subtitle: "Upload eerst een Excel-bestand in het hoofdmenu.",
      children: [el("div", { class:"notice" }, "Geen data gevonden. Ga naar Menu → Upload Excel.")]
    }));
    return;
  }

  const columns = Object.keys(allRows[0] || {});
  const map = getMappingWithFallback(columns);

  // Exacte Excel-kolommen als prioriteit
  const pick = (preferred, fallback) => columns.includes(preferred) ? preferred : fallback;

  const col = {
    rider:   pick("Naam",      map.rider),
    ranking: pick("Ranking",   map.ranking),
    nat:     pick("Nat.",      map.nat),
    competition: pick("Wedstrijd", map.competition),
    location:    pick("Locatie",   map.location),
    distance:    pick("Afstand",   map.distance),
    date:        pick("Datum",     map.date),
    season:      pick("Seizoen",   map.season),
    sex:         pick("Sekse",     map.sex),
    winner:      pick("winnaar",   map.winner),
  };

  const missing = Object.entries(col).filter(([_, v]) => !v || !columns.includes(v)).map(([k]) => k);
  if(missing.length){
    root.appendChild(sectionCard({
      title: "Dashboard",
      subtitle: "Kolommen ontbreken of zijn niet herkend.",
      children: [
        el("div", { class:"notice" },
          "Ik kan deze kolommen niet vinden: " + missing.join(", ") +
          ". Controleer de kolomkoppen in Excel of stel de mapping in via het tandwiel (Instellingen).")
      ]
    }));
    return;
  }

  const norm = (v) => String(v ?? "").trim();

  function parseYear(v){
    const s = norm(v);
    if(!s) return null;
    const m = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
    if(m) return Number(m[3]);
    const m2 = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
    if(m2) return Number(m2[1]);
    const d = new Date(s);
    if(!Number.isNaN(d.getTime())) return d.getFullYear();
    return null;
  }

  const uniqSorted = (values) => uniq(values.map(norm).filter(Boolean)).sort((a,b)=>a.localeCompare(b,"nl"));

  // Filter state: multi-select => Set. Leeg = "Alles"
  const state = {
    year: new Set(),
    competition: new Set(),
    location: new Set(),
    distance: new Set(),
    sex: new Set(),
    season: new Set(),
    winner: new Set(),
    nat: new Set(),
    rider: "ALL" // tiles-focus
  };

  // Options from column values
  const years = uniq(allRows.map(r => parseYear(r[col.date])).filter(y => y != null)).map(String).sort((a,b)=>a.localeCompare(b,"nl"));
  const competitions = uniqSorted(allRows.map(r => r[col.competition]));
  const locations    = uniqSorted(allRows.map(r => r[col.location]));
  const distances    = uniqSorted(allRows.map(r => r[col.distance]));
  const sexes        = uniqSorted(allRows.map(r => r[col.sex]));
  const seasons      = uniqSorted(allRows.map(r => r[col.season]));
  const winners      = uniqSorted(allRows.map(r => r[col.winner]));
  const nats         = uniqSorted(allRows.map(r => r[col.nat]));

  const infoPill = el("div", { class:"pill" }, "—");
  const kpiWrap = el("div", { class:"kpiGrid" });

  function applyFilters(){
    return allRows.filter(r => {
      if(state.year.size){
        const y = String(parseYear(r[col.date]) ?? "");
        if(!state.year.has(y)) return false;
      }
      if(state.competition.size && !state.competition.has(norm(r[col.competition]))) return false;
      if(state.location.size    && !state.location.has(norm(r[col.location]))) return false;
      if(state.distance.size    && !state.distance.has(norm(r[col.distance]))) return false;
      if(state.sex.size         && !state.sex.has(norm(r[col.sex]))) return false;
      if(state.season.size      && !state.season.has(norm(r[col.season]))) return false;
      if(state.winner.size      && !state.winner.has(norm(r[col.winner]))) return false;
      if(state.nat.size         && !state.nat.has(norm(r[col.nat]))) return false;
      return true;
    });
  }

  function tile(val, lbl){
    return el("div", { class:"kpi" }, [
      el("div", { class:"kpi__val" }, String(val)),
      el("div", { class:"kpi__lbl" }, lbl),
    ]);
  }

  function renderKPIs(filteredRows){
    clear(kpiWrap);

    if(!filteredRows.length){
      kpiWrap.appendChild(el("div", { class:"notice" }, "Geen resultaten met deze filters."));
      return;
    }

    let rows = filteredRows;
    if(state.rider !== "ALL"){
      rows = filteredRows.filter(r => norm(r[col.rider]) === norm(state.rider));
      if(!rows.length){
        kpiWrap.appendChild(el("div", { class:"notice" }, "Geen rijen voor deze rijder binnen de gekozen filters."));
        return;
      }
    }

    const rankings = rows.map(r => toNumber(r[col.ranking])).filter(n => n != null);
    const starts = rows.length;
    const wins = rankings.filter(n => n === 1).length;
    const podiums = rankings.filter(n => n <= 3).length;
    const best = rankings.length ? Math.min(...rankings) : "—";
    const avg = rankings.length ? (rankings.reduce((a,b)=>a+b,0)/rankings.length) : null;

    kpiWrap.appendChild(tile(starts, "Starts / rijen"));
    kpiWrap.appendChild(tile(wins, "Overwinningen (ranking=1)"));
    kpiWrap.appendChild(tile(podiums, "Podiums (≤3)"));
    kpiWrap.appendChild(tile(best, "Beste ranking"));
    kpiWrap.appendChild(tile(avg == null ? "—" : avg.toFixed(2), "Gem. ranking"));
  }

  // Rider select (single) depends on filtered dataset
  const riderHost = el("div", {});
  function rebuildRiderSelect(filteredRows){
    clear(riderHost);
    const riders = uniqSorted(filteredRows.map(r => r[col.rider]));
    if(state.rider !== "ALL" && !riders.includes(norm(state.rider))) state.rider = "ALL";
    const opts = [{ value:"ALL", label:"Alle rijders (samengevoegd)" }, ...riders.map(r => ({ value:r, label:r }))];
    const riderSel = createSearchableSelect({
      label: "Rijder (voor tiles)",
      options: opts,
      value: state.rider,
      onChange: (v) => { state.rider = v; refreshKPIsOnly(); }
    });
    riderHost.appendChild(riderSel.el);
  }

  function refreshKPIsOnly(){
    const filtered = applyFilters();
    infoPill.textContent = `${filtered.length.toLocaleString("nl-NL")} rijen (van ${allRows.length.toLocaleString("nl-NL")})`;
    renderKPIs(filtered);
  }

  function refresh(){
    const filtered = applyFilters();
    infoPill.textContent = `${filtered.length.toLocaleString("nl-NL")} rijen (van ${allRows.length.toLocaleString("nl-NL")})`;
    rebuildRiderSelect(filtered);
    renderKPIs(filtered);
  }

  // Multi-select filters (left sidebar)
  const fYear = createSearchableMultiSelect({
    label:"Jaartal (Datum)",
    options: years.map(v => ({ value:v, label:v })),
    values: [],
    allLabel:"Alle jaren",
    onChange:(vals)=>{ state.year = new Set(vals.map(String)); refresh(); }
  });
  const fComp = createSearchableMultiSelect({
    label:"Wedstrijd",
    options: competitions.map(v => ({ value:v, label:v })),
    values: [],
    allLabel:"Alle wedstrijden",
    onChange:(vals)=>{ state.competition = new Set(vals.map(norm)); refresh(); }
  });
  const fLoc = createSearchableMultiSelect({
    label:"Locatie",
    options: locations.map(v => ({ value:v, label:v })),
    values: [],
    allLabel:"Alle locaties",
    onChange:(vals)=>{ state.location = new Set(vals.map(norm)); refresh(); }
  });
  const fDist = createSearchableMultiSelect({
    label:"Afstand",
    options: distances.map(v => ({ value:v, label:v })),
    values: [],
    allLabel:"Alle afstanden",
    onChange:(vals)=>{ state.distance = new Set(vals.map(norm)); refresh(); }
  });
  const fSex = createSearchableMultiSelect({
    label:"Sekse",
    options: sexes.map(v => ({ value:v, label:v })),
    values: [],
    allLabel:"Alle",
    onChange:(vals)=>{ state.sex = new Set(vals.map(norm)); refresh(); }
  });
  const fSeason = createSearchableMultiSelect({
    label:"Seizoen",
    options: seasons.map(v => ({ value:v, label:v })),
    values: [],
    allLabel:"Alle seizoenen",
    onChange:(vals)=>{ state.season = new Set(vals.map(norm)); refresh(); }
  });
  const fWinner = createSearchableMultiSelect({
    label:"Winnaar",
    options: winners.map(v => ({ value:v, label:v })),
    values: [],
    allLabel:"Alle winnaars",
    onChange:(vals)=>{ state.winner = new Set(vals.map(norm)); refresh(); }
  });
  const fNat = createSearchableMultiSelect({
    label:"Nationaliteit",
    options: nats.map(v => ({ value:v, label:v })),
    values: [],
    allLabel:"Alle nationaliteiten",
    onChange:(vals)=>{ state.nat = new Set(vals.map(norm)); refresh(); }
  });

  const btnReset = el("button", { class:"btn", type:"button" }, "Reset alle filters");
  btnReset.addEventListener("click", () => {
    state.year = new Set();
    state.competition = new Set();
    state.location = new Set();
    state.distance = new Set();
    state.sex = new Set();
    state.season = new Set();
    state.winner = new Set();
    state.nat = new Set();
    state.rider = "ALL";
    mountDashboard(root);
  });

  const layout = el("div", { class:"dashboardLayout" });

  const sidebar = sectionCard({
    title:"Filters",
    subtitle:"Multi-select • Leeg = alles",
    children:[
      el("div", { class:"filtersStack" }, [
        fYear.el,
        fComp.el,
        fLoc.el,
        fDist.el,
        fSex.el,
        fSeason.el,
        fWinner.el,
        fNat.el,
        el("div", { class:"row" }, [btnReset]),
      ])
    ]
  });
  sidebar.classList.add("sidebarCard");

  const main = sectionCard({
    title:"Dashboard",
    subtitle:"Tiles zijn netjes uitgelijnd en volgen je filters.",
    children:[
      el("div", { class:"row" }, [infoPill]),
      el("div", { class:"hr" }),
      riderHost,
      el("div", { class:"hr" }),
      kpiWrap
    ]
  });

  layout.appendChild(sidebar);
  layout.appendChild(main);
  root.appendChild(layout);

  refresh();
}
