import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { loadDataset, getMappingWithFallback } from "../../core/storage.js";
import { uniq, toNumber } from "../../core/utils.js";
import { createSearchableSelect } from "../../core/components/searchableSelect.js";

export function mountHeadToHead(root){
  clear(root);

  const rows = loadDataset();
  if(!rows || rows.length === 0){
    root.appendChild(sectionCard({ title:"Head-to-Head", subtitle:"Upload eerst een Excel-bestand in het hoofdmenu.", children:[
      el("div", { class:"notice" }, "Geen data gevonden. Ga naar Menu → Upload Excel.")
    ]}));
    return;
  }

  const cols = Object.keys(rows[0] || {});
  const map = getMappingWithFallback(cols);

  const riders = uniq(rows.map(r => r[map.rider])).sort((a,b)=>String(a).localeCompare(String(b), "nl"));
  const riderOptions = riders.map(r => ({ value:r, label:r }));

  let count = 2;
  const countSel = createSearchableSelect({
    label:"Aantal rijders",
    options:[2,3,4,5,6].map(n => ({ value:String(n), label:`${n} rijders` })),
    value:String(count),
    onChange:(v)=>{ count = Number(v)||2; renderSelectors(); renderTable(); }
  });

  const selectorsWrap = el("div", { class:"grid grid--3" });
  const tableWrap = el("div", {});
  const selected = new Array(6).fill("");

  function kpis(name){
    const rRows = rows.filter(r => r[map.rider] === name);
    const rk = rRows.map(r => toNumber(r[map.ranking])).filter(n => n != null);
    const starts = rRows.length;
    const wins = rk.filter(n => n === 1).length;
    const podiums = rk.filter(n => n <= 3).length;
    const avg = rk.length ? rk.reduce((a,b)=>a+b,0)/rk.length : null;
    const best = rk.length ? Math.min(...rk) : null;
    return { starts, wins, podiums, avg, best };
  }

  function renderSelectors(){
    clear(selectorsWrap);
    for(let i=0;i<count;i++){
      const sel = createSearchableSelect({
        label:`Rijder ${i+1}`,
        options:riderOptions,
        value:selected[i] || "",
        onChange:(v)=>{ selected[i]=v; renderTable(); }
      });
      selectorsWrap.appendChild(sel.el);
    }
  }

  function renderTable(){
    clear(tableWrap);
    const chosen = selected.slice(0,count).filter(Boolean);
    if(chosen.length === 0){
      tableWrap.appendChild(el("div", { class:"notice" }, "Selecteer één of meer rijders om te vergelijken."));
      return;
    }
    const stats = chosen.map(n => ({ name:n, ...kpis(n) }));
    const keys = ["starts","wins","podiums","avg","best"];
    const ranges = {};
    for(const k of keys){
      const vals = stats.map(s => s[k]).filter(v => v != null);
      ranges[k] = { min: Math.min(...vals), max: Math.max(...vals) };
    }

    const rowsDef = [
      ["Starts","starts", false],
      ["Wins","wins", false],
      ["Podiums","podiums", false],
      ["Gem. ranking","avg", true],
      ["Beste ranking","best", true],
    ];

    tableWrap.appendChild(el("div", { class:"notice" }, "Beste waarde per rij is vet (wins/podiums/starts = hoger beter; ranking = lager beter)."));

    tableWrap.appendChild(el("div", { style:"height:10px" }));

    tableWrap.appendChild(el("table", { class:"table" }, [
      el("thead", {}, el("tr", {}, ["Metric", ...chosen].map(h => el("th", {}, h)))),
      el("tbody", {}, rowsDef.map(([label, key, lowerBetter]) => {
        const bestVal = lowerBetter ? ranges[key].min : ranges[key].max;
        return el("tr", {}, [
          el("td", {}, label),
          ...stats.map(s => {
            const v = s[key];
            const isBest = v != null && v === bestVal;
            const txt = v == null ? "—" : (key === "avg" ? v.toFixed(2) : String(v));
            return el("td", { style: isBest ? "font-weight:900; border-bottom-color: rgba(82,232,232,.35)" : "" }, txt);
          })
        ]);
      }))
    ]));
  }

  renderSelectors();
  renderTable();

  root.appendChild(sectionCard({ title:"Head-to-Head", subtitle:"Vergelijk rijders in één oogopslag.", children:[
    el("div", { class:"row" }, [countSel.el]),
    el("div", { class:"hr" }),
    selectorsWrap,
    el("div", { class:"hr" }),
    tableWrap
  ]}));
}
