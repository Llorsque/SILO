import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { uniq, toNumber } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

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

  // Prioriteit: exact gelijknamige kolommen uit Excel.
  // Fallback: mapping (voor het geval kolomnamen afwijken).
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

  // ---------- Helpers ----------
  const norm = (v) => String(v ?? "").trim(); // belangrijk: trims zodat filters écht matchen
  const eq = (a, b) => norm(a) === norm(b);

  function parseYear(v){
    // expected: dd-mm-yyyy (e.g. 02-11-2019)
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

  const uniqSorted = (values) =>
    uniq(values.map(norm)).sort((a,b) => a.localeCompare(b, "nl"));

  const withAll = (arr, allLabel) => [{ value:"ALL", label: allLabel }, ...arr.map(v => ({ value:v, label:v }))];

  // ---------- Filter state ----------
  const state = {
    year: "ALL",
    competition: "ALL",
    location: "ALL",
    distance: "ALL",
    sex: "ALL",
    season: "ALL",
    winner: "ALL",
    nat: "ALL",
    rider: "ALL",
  };

  // ---------- Build option lists from dataset (on purpose: from Excel columns) ----------
  const years = uniq(allRows.map(r => parseYear(r[col.date])).filter(y => y != null))
    .map(String)
    .sort((a,b) => a.localeCompare(b, "nl"));

  const competitions = uniqSorted(allRows.map(r => r[col.competition]));
  const locations    = uniqSorted(allRows.map(r => r[col.location]));
  const distances    = uniqSorted(allRows.map(r => r[col.distance]));
  const sexes        = uniqSorted(allRows.map(r => r[col.sex]));
  const seasons      = uniqSorted(allRows.map(r => r[col.season]));
  const winners      = uniqSorted(allRows.map(r => r[col.winner]));
  const nats         = uniqSorted(allRows.map(r => r[col.nat]));

  // ---------- UI ----------
  const infoPill = el("div", { class:"pill" }, "—");
  const kpiWrap = el("div", { class:"kpiGrid" });
  const riderHost = el("div", { id:"siloRiderHost", style:"min-width:320px; flex:1" });

  const yearSel = createSearchableSelect({
    label: "Jaartal (op basis van Datum)",
    options: withAll(years, "Alle jaren"),
    value: state.year,
    onChange: (v) => { state.year = v; refresh(); }
  });
  const compSel = createSearchableSelect({
    label: "Wedstrijd",
    options: withAll(competitions, "Alle wedstrijden"),
    value: state.competition,
    onChange: (v) => { state.competition = v; refresh(); }
  });
  const locSel = createSearchableSelect({
    label: "Locatie",
    options: withAll(locations, "Alle locaties"),
    value: state.location,
    onChange: (v) => { state.location = v; refresh(); }
  });
  const distSel = createSearchableSelect({
    label: "Afstand",
    options: withAll(distances, "Alle afstanden"),
    value: state.distance,
    onChange: (v) => { state.distance = v; refresh(); }
  });
  const sexSel = createSearchableSelect({
    label: "Sekse",
    options: withAll(sexes, "Alle"),
    value: state.sex,
    onChange: (v) => { state.sex = v; refresh(); }
  });
  const seasonSel = createSearchableSelect({
    label: "Seizoen",
    options: withAll(seasons, "Alle seizoenen"),
    value: state.season,
    onChange: (v) => { state.season = v; refresh(); }
  });
  const winnerSel = createSearchableSelect({
    label: "Winnaar",
    options: withAll(winners, "Alle winnaars"),
    value: state.winner,
    onChange: (v) => { state.winner = v; refresh(); }
  });
  const natSel = createSearchableSelect({
    label: "Nationaliteit",
    options: withAll(nats, "Alle nationaliteiten"),
    value: state.nat,
    onChange: (v) => { state.nat = v; refresh(); }
  });

  const filtersGrid = el("div", { class:"grid grid--3" }, [
    yearSel.el,
    compSel.el,
    locSel.el,
    distSel.el,
    sexSel.el,
    seasonSel.el,
    winnerSel.el,
    natSel.el,
  ]);

  // ---------- Filtering ----------
  function applyFilters(){
    return allRows.filter(r => {
      if(state.year !== "ALL"){
        const y = parseYear(r[col.date]);
        if(String(y ?? "") !== String(state.year)) return false;
      }
      if(state.competition !== "ALL" && !eq(r[col.competition], state.competition)) return false;
      if(state.location    !== "ALL" && !eq(r[col.location], state.location)) return false;
      if(state.distance    !== "ALL" && !eq(r[col.distance], state.distance)) return false;
      if(state.sex         !== "ALL" && !eq(r[col.sex], state.sex)) return false;
      if(state.season      !== "ALL" && !eq(r[col.season], state.season)) return false;
      if(state.winner      !== "ALL" && !eq(r[col.winner], state.winner)) return false;
      if(state.nat         !== "ALL" && !eq(r[col.nat], state.nat)) return false;
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
      rows = filteredRows.filter(r => eq(r[col.rider], state.rider));
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

  function buildRiderSelect(filteredRows){
    const riders = uniqSorted(filteredRows.map(r => r[col.rider]));
    if(state.rider !== "ALL" && !riders.includes(norm(state.rider))){
      state.rider = "ALL";
    }
    const opts = [{ value:"ALL", label:"Alle rijders (samengevoegd)" }, ...riders.map(r => ({ value:r, label:r }))];
    const sel = createSearchableSelect({
      label: "Rijder",
      options: opts,
      value: state.rider,
      onChange: (v) => { state.rider = v; refreshKPIsOnly(); }
    });
    return sel.el;
  }

  function refreshKPIsOnly(){
    const filtered = applyFilters();
    infoPill.textContent = `${filtered.length.toLocaleString("nl-NL")} rijen (van ${allRows.length.toLocaleString("nl-NL")})`;
    renderKPIs(filtered);
  }

  function refresh(){
    const filtered = applyFilters();
    infoPill.textContent = `${filtered.length.toLocaleString("nl-NL")} rijen (van ${allRows.length.toLocaleString("nl-NL")})`;

    clear(riderHost);
    riderHost.appendChild(buildRiderSelect(filtered));

    renderKPIs(filtered);
  }

  const btnReset = el("button", { class:"btn", type:"button" }, "Reset filters");
  btnReset.addEventListener("click", () => {
    state.year = "ALL";
    state.competition = "ALL";
    state.location = "ALL";
    state.distance = "ALL";
    state.sex = "ALL";
    state.season = "ALL";
    state.winner = "ALL";
    state.nat = "ALL";
    state.rider = "ALL";
    // remount = ook alle select inputs resetten
    mountDashboard(root);
  });

  // initial render
  refresh();

  root.appendChild(sectionCard({
    title: "Dashboard",
    subtitle: "Filters toepassen en daarna een rijder kiezen voor de tiles.",
    children: [
      el("div", { class:"row" }, [
        el("div", { style:"min-width:240px" }, btnReset),
        el("div", { class:"spacer" }),
        infoPill
      ]),
      el("div", { class:"hr" }),
      el("div", { class:"muted", style:"font-size:12px; font-weight:800; margin:0 0 8px 2px" }, "Filters"),
      filtersGrid,
      el("div", { class:"hr" }),
      el("div", { class:"row" }, [riderHost]),
      el("div", { class:"hr" }),
      kpiWrap
    ]
  }));
}
