import { el, clear } from "../dom.js";

export function createSearchableMultiSelect({
  label,
  searchPlaceholder = "Typ om te zoeken…",
  options = [],            // [{value,label}]
  values = [],             // array of selected values (strings)
  onChange = () => {},     // (newValuesArray)=>void
  allLabel = "Alle"
}){
  const wrap = el("div", { class:"ms searchable" });

  const lbl = label
    ? el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, label)
    : null;

  const chips = el("div", { class:"ms__chips" });
  const btnClear = el("button", { class:"btn btn--ghost ms__clear", type:"button", title:"Leegmaken" }, "✕");

  const head = el("button", { class:"ms__head", type:"button", title:"Open filter" }, [
    chips,
    btnClear
  ]);

  const panel = el("div", { class:"searchable__panel ms__panel", style:"display:none" });
  const search = el("input", { class:"input ms__search", type:"text", placeholder: searchPlaceholder, value:"" });
  const list = el("div", { class:"ms__list" });

  panel.appendChild(search);
  panel.appendChild(list);

  let selected = new Set((values || []).map(v => String(v)));
  let filtered = options.slice();
  let active = -1;
  let open = false;

  function emit(){
    onChange(Array.from(selected));
  }

  function renderChips(){
    clear(chips);

    if(selected.size === 0){
      chips.appendChild(el("span", { class:"chip chip--muted" }, allLabel));
      btnClear.disabled = true;
      return;
    }
    btnClear.disabled = false;

    const vals = Array.from(selected);
    vals.slice(0, 2).forEach(v => {
      const opt = options.find(o => String(o.value) === v);
      const labelTxt = opt ? (opt.label ?? v) : v;
      chips.appendChild(el("span", { class:"chip" }, labelTxt));
    });
    if(vals.length > 2){
      chips.appendChild(el("span", { class:"chip chip--muted" }, `+${vals.length - 2}`));
    }
  }

  function renderList(){
    clear(list);

    if(filtered.length === 0){
      list.appendChild(el("div", { class:"searchable__empty" }, "Geen resultaten"));
      return;
    }

    filtered.forEach((opt, idx) => {
      const v = String(opt.value ?? "");
      const checked = selected.has(v);
      const row = el("div", {
        class: "searchable__item" + (idx === active ? " searchable__item--active" : "")
      }, [
        el("span", { class:"ms__check", "aria-hidden":"true" }, checked ? "☑" : "☐"),
        el("span", {}, opt.label ?? v),
      ]);
      row.addEventListener("click", () => {
        if(checked) selected.delete(v);
        else selected.add(v);
        renderChips();
        renderList();
        emit();
      });
      list.appendChild(row);
    });
  }

  function filter(q){
    const s = String(q ?? "").toLowerCase().trim();
    filtered = options.filter(o => (o.label ?? String(o.value ?? "")).toLowerCase().includes(s));
    active = filtered.length ? 0 : -1;
  }

  function show(){
    open = true;
    panel.style.display = "block";
    filter(search.value);
    renderList();
    setTimeout(() => search.focus(), 0);
  }
  function hide(){
    open = false;
    panel.style.display = "none";
    active = -1;
    search.value = "";
  }
  function toggle(){
    if(open) hide();
    else show();
  }

  head.addEventListener("click", (e) => {
    if(e.target === btnClear) return;
    toggle();
  });

  btnClear.addEventListener("click", (e) => {
    e.stopPropagation();
    selected = new Set();
    renderChips();
    emit();
    if(open){
      filter(search.value);
      renderList();
    }
  });

  search.addEventListener("input", () => {
    filter(search.value);
    renderList();
  });

  search.addEventListener("keydown", (e) => {
    if(!open) return;
    if(e.key === "Escape"){ hide(); e.preventDefault(); return; }
    if(e.key === "ArrowDown"){ if(filtered.length) active = Math.min(active+1, filtered.length-1); renderList(); e.preventDefault(); return; }
    if(e.key === "ArrowUp"){ if(filtered.length) active = Math.max(active-1, 0); renderList(); e.preventDefault(); return; }
    if(e.key === "Enter"){
      if(active >= 0 && filtered[active]){
        const v = String(filtered[active].value ?? "");
        if(selected.has(v)) selected.delete(v); else selected.add(v);
        renderChips(); renderList(); emit();
      }
      e.preventDefault(); return;
    }
  });

  document.addEventListener("click", (e) => {
    if(!wrap.contains(e.target)) hide();
  });

  renderChips();
  wrap.appendChild(el("div", {}, [lbl, head, panel].filter(Boolean)));

  return {
    el: wrap,
    setOptions(newOptions){
      options = newOptions || [];
      filter(search.value);
      renderChips();
      if(open) renderList();
    },
    setValues(newValues){
      selected = new Set((newValues || []).map(v => String(v)));
      renderChips();
      if(open) renderList();
    },
    getValues(){ return Array.from(selected); }
  };
}
