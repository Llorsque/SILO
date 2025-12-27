import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { safeLower, toNumber, uniq } from "../../core/utils.js";

/**
 * Kampioenen module (WK/OS) - filters als toggle buttons:
 * - WK / OS (selecteer/deselecteer)
 * - Jaar 2019-2026 (selecteer/deselecteer) — als OS geselecteerd: alleen jaren met OS-data zichtbaar
 * - Man / Vrouw (selecteer/deselecteer, case-insensitive)
 * - Afstanden 500m / 1000m / 1500m (selecteer/deselecteer)
 * - Medailles: Goud/Zilver/Brons (selecteer/deselecteer)
 */
export function mountChampions(root){
  clear(root);

  const rows = loadDataset();
  if(!rows || rows.length === 0){
    root.appendChild(sectionCard({
      title:"Kampioenen",
      subtitle:"Upload eerst een Excel-bestand in het hoofdmenu.",
      children:[ el("div", { class:"notice" }, "Geen data gevonden. Ga naar Menu → Upload Excel.") ]
    }));
    return;
  }

  const cols = Object.keys(rows[0] || {});
  const map = getMappingWithFallback(cols);

  // Prefer exact headers if present
  const pick = (preferred, fallback) => cols.includes(preferred) ? preferred : fallback;

  const col = {
    competition: pick("Wedstrijd", map.competition),
    date:        pick("Datum", map.date),
    season:      pick("Seizoen", map.season),
    sex:         pick("Sekse", map.sex),
    distance:    pick("Afstand", map.distance),
    ranking:     pick("Ranking", map.ranking),
    winner:      pick("winnaar", map.winner),
    rider:       pick("Naam", map.rider),
    nat:         pick("Nat.", map.nat),
    location:    pick("Locatie", map.location),
  };

  // Small helpers
  const norm = (v) => String(v ?? "").trim();
  const lower = (v) => norm(v).toLowerCase();

  function parseYear(v){
    const s = norm(v);
    if(!s) return null;
    // dd-mm-yyyy or dd/mm/yyyy
    const m = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
    if(m) return Number(m[3]);
    // yyyy-mm-dd
    const m2 = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
    if(m2) return Number(m2[1]);
    const d = new Date(s);
    if(!Number.isNaN(d.getTime())) return d.getFullYear();
    return null;
  }

  function getTypeFromCompetition(v){
    const s = safeLower(v);
    // Olympic / OS
    if(s.includes("olymp") || s.includes("olympic") || s.includes(" os ") || s.startsWith("os ") || s.endsWith(" os")) return "OS";
    // World Champs / WK
    if((s.includes("world") && s.includes("champ")) || s.includes("wk") || s.includes("world championships") || s.includes("world championship")) return "WK";
    return null;
  }

  function getSexValue(v){
    const s = lower(v);
    if(s.includes("vrouw")) return "vrouw";
    if(s.includes("man")) return "man";
    return s; // fallback
  }

  function getDistanceKey(v){
    const s = lower(v);
    if(s.includes("500")) return "500m";
    if(s.includes("1000")) return "1000m";
    if(s.includes("1500")) return "1500m";
    return null;
  }

  function getMedalFromRank(rank){
    const r = toNumber(rank);
    if(r === 1) return "goud";
    if(r === 2) return "zilver";
    if(r === 3) return "brons";
    return null;
  }

  const ALL_YEARS = [2019,2020,2021,2022,2023,2024,2025,2026];

  // Filter state (multi toggles)
  const state = {
    types: new Set(),        // "WK" | "OS" ; empty => both
    years: new Set(),        // numbers; empty => all
    sexes: new Set(),        // "man" | "vrouw" ; empty => all
    distances: new Set(),    // "500m"|"1000m"|"1500m" ; empty => all
    medals: new Set(),       // "goud"|"zilver"|"brons" ; empty => all (1/2/3)
  };

  // UI
  const out = el("div", {});
  const pill = el("div", { class:"pill" }, "—");

  // Button factory (toggle)
  function toggleBtn(label, isActiveFn, onToggle){
    const b = el("button", {
      class: "btn",
      type:"button",
      style:"padding:8px 10px; border-radius:14px; font-weight:800;"
    }, label);

    function sync(){
      b.classList.toggle("btn--primary", !!isActiveFn());
    }
    b.addEventListener("click", () => { onToggle(); sync(); refresh(); });
    sync();
    return { el: b, sync };
  }

  // Groups (containers)
  const gType = el("div", {});
  const gYear = el("div", {});
  const gSex = el("div", {});
  const gDist = el("div", {});
  const gMedal = el("div", {});

  function group(label, bodyEl){
    return el("div", {}, [
      el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, label),
      bodyEl
    ]);
  }

  function renderTypeButtons(){
    clear(gType);
    const row = el("div", { class:"row" });
    const wk = toggleBtn("WK", () => state.types.has("WK"), () => {
      if(state.types.has("WK")) state.types.delete("WK"); else state.types.add("WK");
    });
    const os = toggleBtn("OS", () => state.types.has("OS"), () => {
      if(state.types.has("OS")) state.types.delete("OS"); else state.types.add("OS");
    });
    row.appendChild(wk.el);
    row.appendChild(os.el);
    gType.appendChild(group("Type", row));
  }

  function computeAvailableYearsForCurrentTypeSelection(){
    // If no type selected => treat both
    const types = state.types.size ? state.types : new Set(["WK","OS"]);
    const years = new Set();
    rows.forEach(r => {
      const t = getTypeFromCompetition(r[col.competition]);
      if(!t || !types.has(t)) return;
      const y = parseYear(r[col.date]);
      if(y != null) years.add(y);
    });
    return years;
  }

  // Rule: if OS selected, only show years where data is known (visible)
  function shouldUseAvailableYearsOnly(){
    return state.types.has("OS"); // as requested
  }

  function renderYearButtons(){
    clear(gYear);
    const row = el("div", { class:"row" });

    const available = computeAvailableYearsForCurrentTypeSelection();
    const useAvailableOnly = shouldUseAvailableYearsOnly();

    ALL_YEARS.forEach(y => {
      const visible = !useAvailableOnly || available.has(y);
      if(!visible) return;

      const btn = toggleBtn(String(y), () => state.years.has(y), () => {
        if(state.years.has(y)) state.years.delete(y); else state.years.add(y);
      });
      row.appendChild(btn.el);
    });

    gYear.appendChild(group("Jaar", row));
  }

  function renderSexButtons(){
    clear(gSex);
    const row = el("div", { class:"row" });

    const man = toggleBtn("Man", () => state.sexes.has("man"), () => {
      if(state.sexes.has("man")) state.sexes.delete("man"); else state.sexes.add("man");
    });
    const vrouw = toggleBtn("Vrouw", () => state.sexes.has("vrouw"), () => {
      if(state.sexes.has("vrouw")) state.sexes.delete("vrouw"); else state.sexes.add("vrouw");
    });

    row.appendChild(man.el);
    row.appendChild(vrouw.el);
    gSex.appendChild(group("Sekse", row));
  }

  function renderDistanceButtons(){
    clear(gDist);
    const row = el("div", { class:"row" });

    const d500 = toggleBtn("500m", () => state.distances.has("500m"), () => {
      if(state.distances.has("500m")) state.distances.delete("500m"); else state.distances.add("500m");
    });
    const d1000 = toggleBtn("1000m", () => state.distances.has("1000m"), () => {
      if(state.distances.has("1000m")) state.distances.delete("1000m"); else state.distances.add("1000m");
    });
    const d1500 = toggleBtn("1500m", () => state.distances.has("1500m"), () => {
      if(state.distances.has("1500m")) state.distances.delete("1500m"); else state.distances.add("1500m");
    });

    row.appendChild(d500.el);
    row.appendChild(d1000.el);
    row.appendChild(d1500.el);

    gDist.appendChild(group("Afstand", row));
  }

  function renderMedalButtons(){
    clear(gMedal);
    const row = el("div", { class:"row" });

    const g = toggleBtn("Goud", () => state.medals.has("goud"), () => {
      if(state.medals.has("goud")) state.medals.delete("goud"); else state.medals.add("goud");
    });
    const z = toggleBtn("Zilver", () => state.medals.has("zilver"), () => {
      if(state.medals.has("zilver")) state.medals.delete("zilver"); else state.medals.add("zilver");
    });
    const b = toggleBtn("Brons", () => state.medals.has("brons"), () => {
      if(state.medals.has("brons")) state.medals.delete("brons"); else state.medals.add("brons");
    });

    row.appendChild(g.el);
    row.appendChild(z.el);
    row.appendChild(b.el);

    gMedal.appendChild(group("Medailles", row));
  }

  function applyFilters(){
    const types = state.types.size ? state.types : new Set(["WK","OS"]);
    const medals = state.medals.size ? state.medals : new Set(["goud","zilver","brons"]);

    return rows.filter(r => {
      const t = getTypeFromCompetition(r[col.competition]);
      if(!t || !types.has(t)) return false;

      const y = parseYear(r[col.date]);
      if(state.years.size && !state.years.has(y)) return false;

      const sx = getSexValue(r[col.sex]);
      if(state.sexes.size && !state.sexes.has(sx)) return false;

      const dist = getDistanceKey(r[col.distance]);
      if(state.distances.size && !state.distances.has(dist)) return false;

      const medal = getMedalFromRank(r[col.ranking]);
      if(!medal || !medals.has(medal)) return false;

      return true;
    });
  }

  function renderTable(list){
    clear(out);

    if(list.length === 0){
      out.appendChild(el("div", { class:"notice" }, "Geen resultaten met deze selectie."));
      return;
    }

    // Sort: type, year desc, distance, sex, medal
    const orderMedal = { goud:1, zilver:2, brons:3 };
    const sorted = list.slice().sort((a,b) => {
      const ta = getTypeFromCompetition(a[col.competition]) || "";
      const tb = getTypeFromCompetition(b[col.competition]) || "";
      if(ta !== tb) return ta.localeCompare(tb, "nl");
      const ya = parseYear(a[col.date]) || 0;
      const yb = parseYear(b[col.date]) || 0;
      if(ya !== yb) return yb - ya;
      const da = getDistanceKey(a[col.distance]) || "";
      const db = getDistanceKey(b[col.distance]) || "";
      if(da !== db) return da.localeCompare(db, "nl");
      const sa = getSexValue(a[col.sex]) || "";
      const sb = getSexValue(b[col.sex]) || "";
      if(sa !== sb) return sa.localeCompare(sb, "nl");
      const ma = getMedalFromRank(a[col.ranking]) || "";
      const mb = getMedalFromRank(b[col.ranking]) || "";
      return (orderMedal[ma]||9) - (orderMedal[mb]||9);
    });

    const items = sorted.slice(0, 500).map(r => {
      const type = getTypeFromCompetition(r[col.competition]) || "";
      const year = parseYear(r[col.date]) || "";
      const medal = getMedalFromRank(r[col.ranking]) || "";
      const dist = getDistanceKey(r[col.distance]) || norm(r[col.distance]);
      const sex = getSexValue(r[col.sex]) || "";
      const name = norm(r[col.winner]) || norm(r[col.rider]);
      const nat = norm(r[col.nat]);
      const loc = norm(r[col.location]);
      const date = norm(r[col.date]);

      return { type, year, sex, dist, medal, name, nat, loc, date };
    });

    out.appendChild(el("table", { class:"table" }, [
      el("thead", {}, el("tr", {}, ["Type","Jaar","Sekse","Afstand","Medaille","Rijder","Nat.","Locatie","Datum"].map(h => el("th", {}, h)))),
      el("tbody", {}, items.map(it => el("tr", {}, [
        el("td", {}, it.type),
        el("td", {}, String(it.year)),
        el("td", {}, it.sex),
        el("td", {}, it.dist),
        el("td", {}, it.medal),
        el("td", {}, it.name),
        el("td", {}, it.nat),
        el("td", {}, it.loc),
        el("td", {}, it.date),
      ])))
    ]));
  }

  function refresh(){
    // Year visibility can change when OS is toggled
    renderYearButtons();

    const filtered = applyFilters();
    pill.textContent = `${filtered.length.toLocaleString("nl-NL")} resultaten`;

    // Helpful hint if no WK/OS matches in data
    if((state.types.size ? state.types : new Set(["WK","OS"])).size && filtered.length === 0){
      // Do not override table message; handled in renderTable
    }

    renderTable(filtered);
  }

  function reset(){
    state.types.clear();
    state.years.clear();
    state.sexes.clear();
    state.distances.clear();
    state.medals.clear();
    mountChampions(root);
  }

  // Initial render of filter groups
  renderTypeButtons();
  renderYearButtons();
  renderSexButtons();
  renderDistanceButtons();
  renderMedalButtons();

  const btnReset = el("button", { class:"btn", type:"button" }, "Reset");
  btnReset.addEventListener("click", reset);

  const filtersCard = sectionCard({
    title:"Kampioenen",
    subtitle:"Selecteer WK/OS, jaren, sekse, afstanden en medailles.",
    children:[
      el("div", { class:"row" }, [pill, el("div", { class:"spacer" }), btnReset]),
      el("div", { class:"hr" }),
      gType,
      el("div", { style:"height:10px" }),
      gYear,
      el("div", { style:"height:10px" }),
      gSex,
      el("div", { style:"height:10px" }),
      gDist,
      el("div", { style:"height:10px" }),
      gMedal,
      el("div", { class:"hr" }),
      out
    ]
  });

  root.appendChild(filtersCard);
  refresh();
}
