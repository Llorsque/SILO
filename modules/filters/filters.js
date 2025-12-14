import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset } from "../../core/storage.js";
import { safeLower } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

export function mountFilters(root){
  clear(root);

  const rows = loadDataset();
  if(!rows || rows.length === 0){
    root.appendChild(sectionCard({ title:"Filters & Parameters", subtitle:"Upload eerst een Excel-bestand in het hoofdmenu.", children:[
      el("div", { class:"notice" }, "Geen data gevonden. Ga naar Menu → Upload Excel.")
    ]}));
    return;
  }

  const columns = Object.keys(rows[0] || {});
  const colOptions = columns.map(c => ({ value:c, label:c }));

  const rulesWrap = el("div", { class:"grid", style:"gap:10px" });
  const resultInfo = el("div", { class:"pill" }, "—");
  const tableWrap = el("div", {});

  function createRule(){
    const state = { col: columns[0], query:"" };

    const colSel = createSearchableSelect({
      label:"Kolom",
      options: colOptions,
      value: state.col,
      onChange: (v)=>{ state.col=v; apply(); }
    });
    const q = el("input", { class:"input", placeholder:"Waarde bevat… (typ)", value:"" });
    q.addEventListener("input", ()=>{ state.query=q.value; apply(); });

    const del = el("button", { class:"btn btn--danger", type:"button" }, "Verwijder");
    const card = el("div", { class:"card", style:"padding:12px" }, [
      el("div", { class:"row" }, [
        el("div", { style:"min-width:260px; flex:1" }, colSel.el),
        el("div", { style:"min-width:260px; flex:2" }, [
          el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, "Zoek"),
          q
        ]),
        del
      ])
    ]);
    del.addEventListener("click", ()=>{ rulesWrap.removeChild(card); apply(); });

    card.__getRule = () => ({...state});
    return card;
  }

  const btnAdd = el("button", { class:"btn btn--primary", type:"button" }, "+ Filter toevoegen");
  btnAdd.addEventListener("click", ()=>{ rulesWrap.appendChild(createRule()); apply(); });

  function apply(){
    const rules = Array.from(rulesWrap.children).map(ch => ch.__getRule?.()).filter(Boolean);
    let filtered = rows.slice();
    for(const r of rules){
      const q = safeLower(r.query).trim();
      if(!q) continue;
      filtered = filtered.filter(row => safeLower(row[r.col]).includes(q));
    }
    resultInfo.textContent = `${filtered.length.toLocaleString("nl-NL")} rijen (van ${rows.length.toLocaleString("nl-NL")})`;

    // preview
    clear(tableWrap);
    const preview = filtered.slice(0, 25);
    const ths = columns.slice(0, 8);
    tableWrap.appendChild(el("table", { class:"table" }, [
      el("thead", {}, el("tr", {}, ths.map(h => el("th", {}, h)))),
      el("tbody", {}, preview.map(row => el("tr", {}, ths.map(h => el("td", {}, String(row[h] ?? ""))))))
    ]));
  }

  rulesWrap.appendChild(createRule());
  apply();

  root.appendChild(sectionCard({ title:"Filters & Parameters", subtitle:"Bouw combinaties om specifieke data te vinden.", children:[
    el("div", { class:"row" }, [btnAdd, el("div", { class:"spacer" }), resultInfo]),
    el("div", { class:"hr" }),
    rulesWrap,
    el("div", { class:"hr" }),
    tableWrap
  ]}));
}
