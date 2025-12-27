import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { toNumber } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

/**
 * Kampioenen (exact op Excel-kolommen)
 * - Filters: WK/OS, Jaar, Sekse, Afstand, Medaille, Rijder (dropdown met typen)
 * - Filters compact naast elkaar (met | tussen groepen)
 * - Tabel output: Toernooi, Jaar, Afstand, Pos., Medaille(icoon), Rijder, Nat, Locatie, Datum
 * - Compact: geselecteerde filters worden boven de tabel getoond als titel
 *   bijv. "Olympische Spelen 2022 - 500m | mannen | HWANG Daeheon"
 *
 * Jaar-knoppen:
 * - Voor Olympische Spelen: alle jaren vanaf 1992 (ook als er nog geen data is ingeladen).
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
    race:        pick("Race",      map.race),
    competition: pick("Wedstrijd", map.competition),
    season:      pick("Seizoen",   map.season),
    distance:    pick("Afstand",   map.distance),
    ranking:     pick("Ranking",   map.ranking),
    rider:       pick("Naam",      map.rider),
    sex:         pick("Sekse",     map.sex),
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

  function excelSerialToDate(serial){
    const n = Number(serial);
    if(!Number.isFinite(n)) return null;
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + n * 86400000);
  }
  function excelSerialToYear(serial){
    const d = excelSerialToDate(serial);
    return d ? d.getUTCFullYear() : null;
  }
  function excelSerialToISO(serial){
    const d = excelSerialToDate(serial);
    if(!d) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth()+1).padStart(2,"0");
    const da = String(d.getUTCDate()).padStart(2,"0");
    return `${da}-${m}-${y}`;
  }

  function getSeasonValue(v){
    if(v == null || v === "") return null;

    if(v instanceof Date && !Number.isNaN(v.getTime())) return v.getFullYear();

    if(typeof v === "number"){
      if(v >= 1900 && v <= 2100) return v;
      if(v >= 20000 && v <= 60000) return excelSerialToYear(v);
      const n = Number(String(v).replace(/[^0-9]/g,""));
      return Number.isFinite(n) ? n : null;
    }

    const s = norm(v);
    const d = new Date(s);
    if(!Number.isNaN(d.getTime())){
      const y = d.getFullYear();
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

  function racePriority(v){
    const s = lower(v);
    if(s === "final a" || s.includes("final a")) return 0;
    if(s === "final") return 1;
    return 9;
  }
  function isMedalRace(v){ return racePriority(v) <= 1; }

  // Jaar knoppen:
  const DEFAULT_YEAR_START = 2019;
  const OS_YEAR_START = 1992;
  const YEAR_END = 2026;

  const state = {
    types: new Set(),
    years: new Set(),
    sexes: new Set(),
    distances: new Set(),
    medals: new Set(),
    rider: "", // empty = alle rijders
  };

  const pill = el("div", { class:"pill" }, "—");
  const out = el("div", {});

  function toggleBtn(label, isActiveFn, onToggle){
    const b = el("button", { class:"btn", type:"button", style:"padding:8px 10px; border-radius:14px; font-weight:800;" }, label);
    function sync(){ b.classList.toggle("btn--primary", !!isActiveFn()); }
    b.addEventListener("click", () => { onToggle(); sync(); refresh(); });
    sync();
    return { el:b };
  }

  function group(label, bodyEl, minWidth=140){
    return el("div", { style:`min-width:${minWidth}px;` }, [
      el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, label),
      bodyEl
    ]);
  }

  const gType = el("div", {});
  const gYear = el("div", {});
  const gDist = el("div", {});
  const gSex = el("div", {});
  const gRider = el("div", {});
  const gMedal = el("div", {});

  // Rijder dropdown options (uit kolom C / Naam)
  const riderValues = Array.from(new Set(rows.map(r => norm(r[col.rider])).filter(Boolean)))
    .sort((a,b)=>a.localeCompare(b, "nl", { sensitivity:"base" }));

  const riderOptions = [{ value:"", label:"Alle rijders" }].concat(
    riderValues.map(v => ({ value:v, label:v }))
  );

  const riderSelect = createSearchableSelect({
    label: null,
    placeholder: "Alle rijders (typ om te zoeken…)",
    options: riderOptions,
    value: "",
    onChange: (v) => { state.rider = v ?? ""; refresh(); }
  });

  function renderTypeButtons(){
    clear(gType);
    const row = el("div", { class:"row", style:"gap:10px;" });
    row.appendChild(toggleBtn("WK", () => state.types.has("WK"), () => {
      if(state.types.has("WK")) state.types.delete("WK"); else state.types.add("WK");
    }).el);
    row.appendChild(toggleBtn("OS", () => state.types.has("OS"), () => {
      if(state.types.has("OS")) state.types.delete("OS"); else state.types.add("OS");
    }).el);
    gType.appendChild(group("Toernooi", row));
  }

  function yearButtonsRange(){
    const start = state.types.has("OS") ? OS_YEAR_START : DEFAULT_YEAR_START;
    const years = [];
    for(let y = start; y <= YEAR_END; y++) years.push(y);
    return years;
  }

  function renderYearButtons(){
    clear(gYear);
    const row = el("div", { class:"row", style:"gap:10px;" });

    yearButtonsRange().forEach(y => {
      row.appendChild(toggleBtn(String(y), () => state.years.has(y), () => {
        if(state.years.has(y)) state.years.delete(y); else state.years.add(y);
      }).el);
    });

    gYear.appendChild(group("Jaar", row));
  }

  function renderDistanceButtons(){
    clear(gDist);
    const row = el("div", { class:"row", style:"gap:10px;" });
    ["500m","1000m","1500m"].forEach(d => {
      row.appendChild(toggleBtn(d, () => state.distances.has(d), () => {
        if(state.distances.has(d)) state.distances.delete(d); else state.distances.add(d);
      }).el);
    });
    gDist.appendChild(group("Afstand", row));
  }

  function renderSexButtons(){
    clear(gSex);
    const row = el("div", { class:"row", style:"gap:10px;" });
    row.appendChild(toggleBtn("Man", () => state.sexes.has("man"), () => {
      if(state.sexes.has("man")) state.sexes.delete("man"); else state.sexes.add("man");
    }).el);
    row.appendChild(toggleBtn("Vrouw", () => state.sexes.has("vrouw"), () => {
      if(state.sexes.has("vrouw")) state.sexes.delete("vrouw"); else state.sexes.add("vrouw");
    }).el);
    gSex.appendChild(group("Sekse", row));
  }

  function renderRiderDropdown(){
    clear(gRider);
    gRider.appendChild(group("Rijder", riderSelect.el, 240));
  }

  function renderMedalButtons(){
    clear(gMedal);
    const row = el("div", { class:"row", style:"gap:10px;" });
    [["goud","🥇"],["zilver","🥈"],["brons","🥉"]].forEach(([m, icon]) => {
      row.appendChild(toggleBtn(`${icon} ${m.charAt(0).toUpperCase()+m.slice(1)}`, () => state.medals.has(m), () => {
        if(state.medals.has(m)) state.medals.delete(m); else state.medals.add(m);
      }).el);
    });
    gMedal.appendChild(group("Medailles", row));
  }

  function applyFiltersRaw(){
    const types = state.types.size ? state.types : new Set(["WK","OS"]);
    const medals = state.medals.size ? state.medals : new Set(["goud","zilver","brons"]);
    const riderNeedle = lower(state.rider);

    return rows.filter(r => {
      if(!isMedalRace(r[col.race])) return false;

      const t = getTypeFromWedstrijd(r[col.competition]);
      if(!t || !types.has(t)) return false;

      const y = getSeasonValue(r[col.season]);
      if(state.years.size && !state.years.has(y)) return false;

      const dist = getDistanceKey(r[col.distance]);
      if(state.distances.size && !state.distances.has(dist)) return false;

      const sx = getSexValue(r[col.sex]);
      if(state.sexes.size && !state.sexes.has(sx)) return false;

      if(riderNeedle){
        if(lower(r[col.rider]) !== riderNeedle) return false;
      }

      const medal = getMedalFromRanking(r[col.ranking]);
      if(!medal || !medals.has(medal)) return false;

      return true;
    });
  }

  function dedupeToUniqueMedals(list){
    const bestByKey = new Map();

    function keyOf(r){
      const t = getTypeFromWedstrijd(r[col.competition]) || "";
      const y = getSeasonValue(r[col.season]) ?? "";
      const dist = getDistanceKey(r[col.distance]) || "";
      const sx = getSexValue(r[col.sex]) || "";
      const medal = getMedalFromRanking(r[col.ranking]) || "";
      const rider = state.rider ? lower(r[col.rider]) : ""; // rider is already filtered, but keep key stable
      return `${t}__${y}__${dist}__${sx}__${medal}__${rider}`;
    }

    function score(r){
      const rp = racePriority(r[col.race]);
      const rank = toNumber(r[col.ranking]) ?? 99;
      return rp * 100 + rank;
    }

    list.forEach(r => {
      const k = keyOf(r);
      const cur = bestByKey.get(k);
      if(!cur || score(r) < score(cur)) bestByKey.set(k, r);
    });

    return Array.from(bestByKey.values());
  }

  function medalIcon(m){
    if(m === "goud") return "🥇";
    if(m === "zilver") return "🥈";
    if(m === "brons") return "🥉";
    return "•";
  }

  function tournamentLabel(){
    if(state.types.size === 1 && state.types.has("OS")) return "Olympische Spelen";
    if(state.types.size === 1 && state.types.has("WK")) return "Wereldkampioenschap";
    if(state.types.size === 2) return "OS & WK";
    return "Alle toernooien";
  }

  function yearLabel(){
    if(state.years.size === 1) return String(Array.from(state.years)[0]);
    if(state.years.size > 1){
      const arr = Array.from(state.years).slice().sort((a,b)=>a-b);
      const contiguous = arr.every((v,i)=> i===0 || v === arr[i-1]+1);
      if(contiguous) return `${arr[0]}–${arr[arr.length-1]}`;
      return arr.join(", ");
    }
    return "";
  }

  function distanceLabel(){
    if(state.distances.size === 1) return Array.from(state.distances)[0];
    if(state.distances.size > 1) return Array.from(state.distances).join("/");
    return "";
  }

  function sexLabel(){
    if(state.sexes.size === 1){
      const v = Array.from(state.sexes)[0];
      return v === "man" ? "mannen" : (v === "vrouw" ? "vrouwen" : v);
    }
    if(state.sexes.size === 2) return "mannen & vrouwen";
    return "";
  }

  function riderLabel(){
    return state.rider ? state.rider : "";
  }

  function selectionTitle(){
    const t = tournamentLabel();
    const y = yearLabel();
    let left = t;
    if(y) left = `${left} ${y}`;

    const rightParts = [];
    const d = distanceLabel();
    const s = sexLabel();
    const r = riderLabel();

    if(d) rightParts.push(d);
    if(s) rightParts.push(s);
    if(r) rightParts.push(r);

    if(rightParts.length) return `${left} - ${rightParts.join(" | ")}`;
    return left;
  }

  function renderTable(list){
    clear(out);

    out.appendChild(el("div", {
      style: "font-weight:900; font-size:14px; margin: 0 0 10px; opacity: .95;"
    }, selectionTitle()));

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

      const ma = getMedalFromRanking(a[col.ranking]) || "";
      const mb = getMedalFromRanking(b[col.ranking]) || "";
      return (medalOrder[ma]||9) - (medalOrder[mb]||9);
    });

    const items = sorted.map(r => {
      const tournament = getTypeFromWedstrijd(r[col.competition]) || "";
      const year = getSeasonValue(r[col.season]) ?? "";
      const dist = getDistanceKey(r[col.distance]) || norm(r[col.distance]);
      const medal = getMedalFromRanking(r[col.ranking]) || "";
      const pos = norm(r[col.ranking]);
      const rider = norm(r[col.rider]);
      const nat = norm(r[col.nat]);
      const loc = norm(r[col.location]);

      const rawDate = r[col.date];
      let date = norm(rawDate);
      if(typeof rawDate === "number" && rawDate >= 20000 && rawDate <= 60000){
        date = excelSerialToISO(rawDate) || date;
      }

      return { tournament, year, dist, pos, medal, rider, nat, loc, date };
    });

    out.appendChild(el("table", { class:"table championsTable" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Toernooi"),
        el("th", {}, "Jaar"),
        el("th", {}, "Afstand"),
        el("th", {}, "Pos."),
        el("th", { class:"championsTable__medalTh" }, "Medaille"),
        el("th", {}, "Rijder"),
        el("th", {}, "Nat"),
        el("th", {}, "Locatie"),
        el("th", {}, "Datum"),
      ])),
      el("tbody", {}, items.map(it => el("tr", {}, [
        el("td", {}, it.tournament),
        el("td", {}, String(it.year)),
        el("td", {}, it.dist),
        el("td", {}, it.pos),
        el("td", { class:"championsTable__medalTd" }, el("span", { class:"medalIcon", title: it.medal }, medalIcon(it.medal))),
        el("td", {}, it.rider),
        el("td", {}, it.nat),
        el("td", {}, it.loc),
        el("td", {}, it.date),
      ])))
    ]));
  }

  function refresh(){
    renderYearButtons();
    const filtered = dedupeToUniqueMedals(applyFiltersRaw());
    pill.textContent = `${filtered.length.toLocaleString("nl-NL")} resultaten`;
    renderTable(filtered);
  }

  function reset(){
    state.types.clear();
    state.years.clear();
    state.sexes.clear();
    state.distances.clear();
    state.medals.clear();
    state.rider = "";
    mountChampions(root);
  }

  renderTypeButtons();
  renderYearButtons();
  renderDistanceButtons();
  renderSexButtons();
  renderRiderDropdown();
  renderMedalButtons();

  const divider = () => el("div", { class:"muted", style:"opacity:.55; align-self:center; padding: 0 2px;" }, "|");
  const filtersInline = el("div", {
    style:"display:flex; flex-wrap:wrap; gap:14px; align-items:flex-end; padding: 2px 0 6px;"
  }, [
    gType, divider(),
    gYear, divider(),
    gDist, divider(),
    gSex, divider(),
    gRider, divider(),
    gMedal
  ]);

  const btnReset = el("button", { class:"btn", type:"button" }, "Reset");
  btnReset.addEventListener("click", reset);

  const card = sectionCard({
    title:"Kampioenen",
    subtitle:"Toont einduitslagen (Final A/Final) en 1 unieke medaille per categorie.",
    children:[
      el("div", { class:"row" }, [pill, el("div", { class:"spacer" }), btnReset]),
      el("div", { class:"hr" }),
      filtersInline,
      el("div", { class:"hr" }),
      out
    ]
  });

  root.appendChild(card);
  refresh();
}
