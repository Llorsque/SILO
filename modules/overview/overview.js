import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { uniq } from "../../core/utils.js";

export function mountOverview(root){
  clear(root);

  const rows = loadDataset();
  if(!rows || rows.length === 0){
    root.appendChild(sectionCard({ title:"Biografie", subtitle:"Upload eerst een Excel-bestand in het hoofdmenu.", children:[
      el("div", { class:"notice" }, "Geen data gevonden. Ga naar Menu → Upload Excel.")
    ]}));
    return;
  }

  const cols = Object.keys(rows[0] || {});
  const map = getMappingWithFallback(cols);

  const stat = (val, lbl) => el("div", { class:"kpi" }, [
    el("div", { class:"kpi__val" }, String(val)),
    el("div", { class:"kpi__lbl" }, lbl),
  ]);

  root.appendChild(sectionCard({ 
    title:"Biografie", 
    subtitle:"(v0) Tijdelijk: dataset-samenvatting. Later: rijderprofiel + achtergrond.",
    children:[
      el("div", { class:"kpiGrid" }, [
        stat(rows.length.toLocaleString("nl-NL"), "Rijen"),
        stat(uniq(rows.map(r => r[map.rider])).length.toLocaleString("nl-NL"), "Unieke rijders"),
        stat(uniq(rows.map(r => r[map.season])).length.toLocaleString("nl-NL"), "Seizoenen"),
        stat(uniq(rows.map(r => r[map.distance])).length.toLocaleString("nl-NL"), "Afstanden"),
      ]),
      el("div", { class:"hr" }),
      el("div", { class:"muted", style:"font-size:12px; font-weight:800; margin:0 0 8px 2px" }, "Kolommen"),
      el("table", { class:"table" }, [
        el("thead", {}, el("tr", {}, [el("th", {}, "Kolom")])),
        el("tbody", {}, cols.map(c => el("tr", {}, [el("td", {}, c)])))
      ])
    ]
  }));
}
