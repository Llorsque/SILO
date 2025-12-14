import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, clearDataset, loadMapping, saveMapping, DEFAULT_MAPPING } from "../../core/storage.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

export function mountSettings(root){
  clear(root);

  const rows = loadDataset();
  const cols = rows?.length ? Object.keys(rows[0] || {}) : [];
  const colOptions = cols.map(c => ({ value:c, label:c }));

  const current = { ...DEFAULT_MAPPING, ...(loadMapping() || {}) };

  const fields = [
    ["rider","Rijder (Naam)"],
    ["ranking","Ranking"],
    ["race","Race"],
    ["nat","Nat."],
    ["note","Opmerking"],
    ["competition","Wedstrijd"],
    ["location","Locatie"],
    ["distance","Afstand"],
    ["date","Datum"],
    ["season","Seizoen"],
    ["sex","Sekse"],
    ["winner","winnaar"],
  ];

  const mappingWrap = el("div", { class:"grid grid--2" });

  function renderMapping(){
    while(mappingWrap.firstChild) mappingWrap.removeChild(mappingWrap.firstChild);
    if(!rows || rows.length === 0){
      mappingWrap.appendChild(el("div", { class:"notice" }, "Upload eerst een dataset om mapping te kunnen instellen."));
      return;
    }
    fields.forEach(([key, label]) => {
      const sel = createSearchableSelect({
        label,
        options: colOptions,
        value: cols.includes(current[key]) ? current[key] : "",
        onChange:(v)=>{ current[key]=v; }
      });
      mappingWrap.appendChild(sel.el);
    });
  }

  const btnSave = el("button", { class:"btn btn--primary", type:"button" }, "Mapping opslaan");
  btnSave.addEventListener("click", ()=>{ saveMapping(current); alert("Mapping opgeslagen."); });

  const btnReset = el("button", { class:"btn", type:"button" }, "Reset mapping (default)");
  btnReset.addEventListener("click", ()=>{ Object.assign(current, DEFAULT_MAPPING); renderMapping(); });

  const btnClear = el("button", { class:"btn btn--danger", type:"button" }, "Ontkoppel / verwijder dataset");
  btnClear.addEventListener("click", async ()=>{
    if(!rows || rows.length === 0){ alert("Geen dataset om te verwijderen."); return; }
    if(!confirm("Dataset verwijderen? (Alleen lokaal in je browser.)")) return;
    await clearDataset();
    mountSettings(root);
  });

  renderMapping();

  root.appendChild(sectionCard({ title:"Instellingen", subtitle:"Beheer dataset en mapping van kolommen.", children:[
    el("div", { class:"row" }, [btnSave, btnReset, el("div", { class:"spacer" }), btnClear]),
    el("div", { class:"hr" }),
    mappingWrap
  ]}));
}
