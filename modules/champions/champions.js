import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { groupBy, safeLower, toNumber, uniq } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

export function mountChampions(root){
  clear(root);

  const rows = loadDataset();
  if(!rows || rows.length === 0){
    root.appendChild(sectionCard({ title:"Kampioenen (WK/OS)", subtitle:"Upload eerst een Excel-bestand in het hoofdmenu.", children:[
      el("div", { class:"notice" }, "Geen data gevonden. Ga naar Menu → Upload Excel.")
    ]}));
    return;
  }

  const cols = Object.keys(rows[0] || {});
  const map = getMappingWithFallback(cols);

  const compCol = map.competition;
  const rankingCol = map.ranking;
  const winnerCol = map.winner;
  const riderCol = map.rider;
  const seasonCol = map.season;
  const distanceCol = map.distance;

  const compVals = uniq(rows.map(r => r[compCol])).sort((a,b)=>String(a).localeCompare(String(b),"nl"));
  const options = [{ value:"auto", label:"Auto: WK/OS (text match)" }, ...compVals.map(v => ({ value:v, label:v }))];

  let choice = "auto";
  const sel = createSearchableSelect({
    label:"Wedstrijd",
    options,
    value:choice,
    onChange:(v)=>{ choice=v; render(); }
  });

  const out = el("div", {});

  function isLikeChampionship(x){
    const s = safeLower(x);
    return (s.includes("world") && s.includes("champ")) || s.includes("olymp") || (s.includes("europe") && s.includes("champ"));
  }

  function render(){
    clear(out);
    let filtered = rows.slice();
    if(choice === "auto") filtered = filtered.filter(r => isLikeChampionship(r[compCol]));
    else filtered = filtered.filter(r => r[compCol] === choice);

    const champs = filtered.filter(r => toNumber(r[rankingCol]) === 1);
    if(champs.length === 0){
      out.appendChild(el("div", { class:"notice" }, "Geen kampioenen gevonden voor deze selectie. Kies een andere 'Wedstrijd' waarde als jouw dataset andere benamingen gebruikt."));
      return;
    }
    const groups = groupBy(champs, r => `${r[compCol]}|${r[seasonCol]}|${r[distanceCol]}`);
    const items = Array.from(groups.entries()).map(([k, list]) => {
      const [comp, season, dist] = k.split("|");
      const winner = list[0][winnerCol] || list[0][riderCol];
      return { comp, season, dist, winner };
    });

    out.appendChild(el("div", { class:"pill" }, `${items.length.toLocaleString("nl-NL")} kampioen-records`));
    out.appendChild(el("div", { style:"height:10px" }));

    out.appendChild(el("table", { class:"table" }, [
      el("thead", {}, el("tr", {}, ["Wedstrijd","Seizoen","Afstand","Kampioen"].map(h => el("th", {}, h)))),
      el("tbody", {}, items.slice(0, 300).map(it => el("tr", {}, [
        el("td", {}, String(it.comp ?? "")),
        el("td", {}, String(it.season ?? "")),
        el("td", {}, String(it.dist ?? "")),
        el("td", {}, String(it.winner ?? "")),
      ])))
    ]));
  }

  render();

  root.appendChild(sectionCard({ title:"Kampioenen (WK/OS)", subtitle:"Lijst van kampioenen (heuristiek, later exact maken op basis van jouw 'Wedstrijd' waarden).", children:[
    el("div", { class:"row" }, [sel.el]),
    el("div", { class:"hr" }),
    out
  ]}));
}
