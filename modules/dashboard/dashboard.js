import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { uniq, toNumber } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

export function mountDashboard(root){
  clear(root);

  const rows = loadDataset();
  if(!rows || rows.length === 0){
    root.appendChild(sectionCard({ title:"Dashboard", subtitle:"Upload eerst een Excel-bestand in het hoofdmenu.", children:[
      el("div", { class:"notice" }, "Geen data gevonden. Ga naar Menu → Upload Excel.")
    ]}));
    return;
  }

  const cols = Object.keys(rows[0] || {});
  const map = getMappingWithFallback(cols);

  const riders = uniq(rows.map(r => r[map.rider])).sort((a,b)=>String(a).localeCompare(String(b), "nl"));
  const options = riders.map(r => ({ value:r, label:r }));
  let selected = riders[0] || "";

  const select = createSearchableSelect({
    label:"Rijder",
    options,
    value:selected,
    onChange:(v)=>{ selected=v; renderKPIs(); }
  });

  const kpis = el("div", { class:"kpiGrid" });

  function tile(val, lbl){
    return el("div", { class:"kpi" }, [
      el("div", { class:"kpi__val" }, String(val)),
      el("div", { class:"kpi__lbl" }, lbl),
    ]);
  }

  function renderKPIs(){
    clear(kpis);
    if(!selected){
      kpis.appendChild(el("div", { class:"notice" }, "Selecteer een rijder."));
      return;
    }
    const rRows = rows.filter(r => r[map.rider] === selected);
    const rankings = rRows.map(r => toNumber(r[map.ranking])).filter(n => n != null);
    const wins = rankings.filter(n => n === 1).length;
    const podiums = rankings.filter(n => n <= 3).length;
    const best = rankings.length ? Math.min(...rankings) : "—";

    kpis.appendChild(tile(rRows.length, "Starts / rijen"));
    kpis.appendChild(tile(wins, "Overwinningen (ranking=1)"));
    kpis.appendChild(tile(podiums, "Podiums (≤3)"));
    kpis.appendChild(tile(best, "Beste ranking"));
  }

  renderKPIs();

  root.appendChild(sectionCard({ title:"Dashboard", subtitle:"Selecteer een rijder en bekijk kerncijfers.", children:[
    el("div", { class:"row" }, [select.el]),
    el("div", { class:"hr" }),
    kpis
  ]}));
}
