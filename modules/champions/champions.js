import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { toNumber } from "../../core/utils.js";

/**
 * Kampioenen (exact op Excel-kolommen)
 * - Type (WK/OS) gebaseerd op kolom F: 'Wedstrijd'
 *    - OS: bevat 'Olympische Spelen'
 *    - WK: bevat 'Wereldkampioenschap'
 * - Jaar/Seizoen gebaseerd op kolom J: 'Seizoen' (2019-2026 knoppen)
 *   Let op: Excel kan datums als seriële getallen opslaan (bv. 44608). We converteren dit naar jaartal.
 * - Afstand gebaseerd op kolom H: 'Afstand' (500m/1000m/1500m)
 * - Uitslag/medaille gebaseerd op kolom B: 'Ranking' (1 goud, 2 zilver, 3 brons)
 * - Rijdernaam gebaseerd op kolom C: 'Naam'
 * - Sekse gebaseerd op kolom K: 'Sekse' (Man/Vrouw, case-insensitive)
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

  const pick = (preferred, fallback) => cols.includes(preferred) ? preferred : fallback;

  const col = {
    competition: pick("Wedstrijd", map.competition), // F
    season:      pick("Seizoen",   map.season),      // J (jaar/seizoen)
    distance:    pick("Afstand",   map.distance),    // H
    ranking:     pick("Ranking",   map.ranking),     // B
    rider:       pick("Naam",      map.rider),       // C
    sex:         pick("Sekse",     map.sex),         // K
    nat:         pick("Nat.",      map.nat),
    location:    pick("Locatie",   map.location),
    date:        pick("Datum",     map.date),
  };

  const missing = Object.entries(col).filter(([_, v]) => !v || !cols.includes(v)).map(([k]) => k);
  if(missing.length){
    root.appendChild(sectionCard({
      title:"Kampioenen",
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

  function getTypeFromWedstrijd(v){
    const s = lower(v);
    if(s.includes("olympische spelen")) return "OS";
    if(s.includes("wereldkampioenschap")) return "WK";
    return null;
  }

  // Excel date serial conversion (1900 date system, with Excel's 1900 leap-year bug handled by using 1899-12-30 base)
  function excelSerialToYear(serial){
    const n = Number(serial);
    if(!Number.isFinite(n)) return null;
    const base = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30
    const ms = base.getTime() + n * 86400000;
    const d = new Date(ms);
    return d.getUTCFullYear();
  }

  function getSeasonValue(v){
    if(v == null || v === "") return null;

    // If already a Date object (depends on XLSX settings)
    if(v instanceof Date && !Number.isNaN(v.getTime())){
      return v.getFullYear();
    }

    // If it's a number:
    // - normal seasons are 2019..2026
    // - Excel date serials are typically 40k+ (e.g., 44608)
    if(typeof v === "number"){
      if(v >= 1900 && v <= 2100) return v;            // plain year
      if(v >= 20000 && v <= 60000) return excelSerialToYear(v); // Excel serial date -> year
      // fallback: try digits
      const n = Number(String(v).replace(/[^0-9]/g,""));
      return Number.isFinite(n) ? n : null;
    }

    // If string: extract digits
    const s = norm(v);
    // If the string looks like a date, try Date parse first
    const d = new Date(s);
    if(!Number.isNaN(d.getTime())){
      const y = d.getFullYear();
      // guard for weird parses (like '2020' parsed as 2020-01-01)
      if(y >= 1900 && y <= 2100) return y;
    }

    const n = Number(s.replace(/[^0-9]/g,""));
    if(Number.isFinite(n)){
      if(n >= 1900 && n <= 2100) return n;
      if(n >= 20000 && n <= 60000) return excelSerialToYear(n);
    }
    return null;
  }

  function getSexValue(v){
    const s = lower(v);
    if(s.includes("vrouw")) return "vrouw";
    if(s.includes("man")) return "man";
    return s;
  }

  function getDistanceKey(v){
    const s = lower(v);
    if(s.includes("500")) return "500m";
    if(s.includes("1000")) return "1000m";
    if(s.includes("1500")) return "1500m";
    return null;
  }

  function getMedalFromRanking(v){
    const r = toNumber(v);
    if(r === 1) return "goud";
    if(r === 2) return "zilver";
    if(r === 3) return "brons";
    return null;
  }

  const ALL_YEARS = [2019,2020,2021,2022,2023,2024,2025,2026];

  const state = {
    types: new Set(),        // WK/OS
    years: new Set(),        // season/year
    sexes: new Set(),        // man/vrouw lowercase
    distances: new Set(),    // 500m/1000m/1500m
    medals: new Set(),       // goud/zilver/brons
  };

  const pill = el("div", { class:"pill" }, "—");
  const out = el("div", {});

  function toggleBtn(label, isActiveFn, onToggle){
    const b = el("button", { class:"btn", type:"button", style:"padding:8px 10px; border-radius:14px; font-weight:800;" }, label);
    function sync(){ b.classList.toggle("btn--primary", !!isActiveFn()); }
    b.addEventListener("click", () => { onToggle(); sync(); refresh(); });
    sync();
    return { el:b, sync };
  }

  function group(label, bodyEl){
    return el("div", {}, [
      el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, label),
      bodyEl
    ]);
  }

  const gType = el("div", {});
  const gYear = el("div", {});
  const gSex = el("div", {});
  const gDist = el("div", {});
  const gMedal = el("div", {});

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

    gType.appendChild(group("Type (kolom F)", row));
  }

  function availableYearsForTypes(typesSet){
    const years = new Set();
    rows.forEach(r => {
      const t = getTypeFromWedstrijd(r[col.competition]);
      if(!t || !typesSet.has(t)) return;
      const y = getSeasonValue(r[col.season]);
      if(y != null) years.add(y);
    });
    return years;
  }

  function renderYearButtons(){
    clear(gYear);
    const row = el("div", { class:"row" });

    const activeTypes = state.types.size ? state.types : new Set(["WK","OS"]);
    const available = availableYearsForTypes(activeTypes);

    // If user explicitly selects types (OS only, WK only, or both) => only show years that exist for those types
    const filterYearsByAvailability = state.types.size > 0;

    ALL_YEARS.forEach(y => {
      if(filterYearsByAvailability && !available.has(y)) return;

      const btn = toggleBtn(String(y), () => state.years.has(y), () => {
        if(state.years.has(y)) state.years.delete(y); else state.years.add(y);
      });
      row.appendChild(btn.el);
    });

    gYear.appendChild(group("Jaar/Seizoen (kolom J)", row));
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

    gSex.appendChild(group("Sekse (kolom K)", row));
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

    gDist.appendChild(group("Afstand (kolom H)", row));
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

    gMedal.appendChild(group("Medailles (kolom B)", row));
  }

  function applyFilters(){
    const types = state.types.size ? state.types : new Set(["WK","OS"]);
    const medals = state.medals.size ? state.medals : new Set(["goud","zilver","brons"]);

    return rows.filter(r => {
      const t = getTypeFromWedstrijd(r[col.competition]);
      if(!t || !types.has(t)) return false;

      const y = getSeasonValue(r[col.season]);
      if(state.years.size && !state.years.has(y)) return false;

      const sx = getSexValue(r[col.sex]);
      if(state.sexes.size && !state.sexes.has(sx)) return false;

      const dist = getDistanceKey(r[col.distance]);
      if(state.distances.size && !state.distances.has(dist)) return false;

      const medal = getMedalFromRanking(r[col.ranking]);
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

    const medalOrder = { goud:1, zilver:2, brons:3 };
    const distOrder = { "500m":1, "1000m":2, "1500m":3 };

    const sorted = list.slice().sort((a,b) => {
      const ta = getTypeFromWedstrijd(a[col.competition]) || "";
      const tb = getTypeFromWedstrijd(b[col.competition]) || "";
      if(ta !== tb) return ta.localeCompare(tb, "nl");
      const ya = getSeasonValue(a[col.season]) || 0;
      const yb = getSeasonValue(b[col.season]) || 0;
      if(ya !== yb) return yb - ya;
      const da = getDistanceKey(a[col.distance]) || "";
      const db = getDistanceKey(b[col.distance]) || "";
      if(da !== db) return (distOrder[da]||9) - (distOrder[db]||9);
      const sa = getSexValue(a[col.sex]) || "";
      const sb = getSexValue(b[col.sex]) || "";
      if(sa !== sb) return sa.localeCompare(sb, "nl");
      const ma = getMedalFromRanking(a[col.ranking]) || "";
      const mb = getMedalFromRanking(b[col.ranking]) || "";
      return (medalOrder[ma]||9) - (medalOrder[mb]||9);
    });

    const items = sorted.slice(0, 800).map(r => {
      const type = getTypeFromWedstrijd(r[col.competition]) || "";
      const season = getSeasonValue(r[col.season]) ?? "";
      const sex = getSexValue(r[col.sex]) || "";
      const dist = getDistanceKey(r[col.distance]) || norm(r[col.distance]);
      const medal = getMedalFromRanking(r[col.ranking]) || "";
      const rider = norm(r[col.rider]);
      const nat = norm(r[col.nat]);
      const loc = norm(r[col.location]);
      const date = norm(r[col.date]);
      const rank = norm(r[col.ranking]);

      return { type, season, sex, dist, medal, rank, rider, nat, loc, date };
    });

    out.appendChild(el("table", { class:"table" }, [
      el("thead", {}, el("tr", {}, ["Type","Jaar","Sekse","Afstand","Medaille","Pos.","Rijder","Nat.","Locatie","Datum"].map(h => el("th", {}, h)))),
      el("tbody", {}, items.map(it => el("tr", {}, [
        el("td", {}, it.type),
        el("td", {}, String(it.season)),
        el("td", {}, it.sex),
        el("td", {}, it.dist),
        el("td", {}, it.medal),
        el("td", {}, it.rank),
        el("td", {}, it.rider),
        el("td", {}, it.nat),
        el("td", {}, it.loc),
        el("td", {}, it.date),
      ])))
    ]));
  }

  function refresh(){
    renderYearButtons();
    const filtered = applyFilters();
    pill.textContent = `${filtered.length.toLocaleString("nl-NL")} resultaten`;
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

  // Render
  renderTypeButtons();
  renderYearButtons();
  renderSexButtons();
  renderDistanceButtons();
  renderMedalButtons();

  const btnReset = el("button", { class:"btn", type:"button" }, "Reset");
  btnReset.addEventListener("click", reset);

  const card = sectionCard({
    title:"Kampioenen",
    subtitle:"Excel-datums in 'Seizoen' worden automatisch omgezet naar jaartal.",
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

  root.appendChild(card);
  refresh();
}
