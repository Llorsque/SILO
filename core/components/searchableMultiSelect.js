import { el, clear } from "../dom.js";

export function createSearchableMultiSelect({
  label,
  placeholder = "Typ om te zoeken…",
  options = [],            // [{value,label}]
  values = [],             // array of selected values (strings)
  onChange = () => {},     // (newValuesArray)=>void
  allLabel = "Alle"
}){
  const wrap = el("div", { class:"ms" });
  const lbl = label ? el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, label) : null;

  const chips = el("div", { class:"ms__chips" });
  const input = el("input", { class:"input ms__input", type:"text", placeholder, value:"" });
  const panel = el("div", { class:"searchable__panel", style:"display:none" });

  const btnClear = el("button", { class:"btn btn--ghost ms__clear", type:"button", title:"Leegmaken" }, "✕");

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

    Array.from(selected).slice(0, 50).forEach(v => {
      const opt = options.find(o => String(o.value) === v);
      const labelTxt = opt ? (opt.label ?? v) : v;
      const x = el("button", { class:"chip chip--btn", type:"button", title:"Verwijder" }, ["×", " ", labelTxt]);
      x.addEventListener("click", () => {
        selected.delete(v);
        renderChips();
        emit();
      });
      chips.appendChild(x);
    });
    if(selected.size > 50){
      chips.appendChild(el("span", { class:"chip chip--muted" }, `+${selected.size - 50} meer`));
    }
  }

  function renderPanel(){
    clear(panel);
    if(filtered.length === 0){
      panel.appendChild(el("div", { class:"searchable__empty" }, "Geen resultaten"));
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
        renderPanel(); // keep open
        emit();
      });
      panel.appendChild(row);
    });
  }

  function show(){ open = true; panel.style.display = "block"; renderPanel(); }
  function hide(){ open = false; panel.style.display = "none"; active = -1; }

  function filter(q){
    const s = String(q ?? "").toLowerCase().trim();
    filtered = options.filter(o => (o.label ?? String(o.value ?? "")).toLowerCase().includes(s));
    active = filtered.length ? 0 : -1;
    renderPanel();
  }

  input.addEventListener("focus", () => { filter(input.value); show(); });
  input.addEventListener("input", () => { filter(input.value); show(); });

  input.addEventListener("keydown", (e) => {
    if(!open && (e.key === "ArrowDown" || e.key === "Enter")){
      filter(input.value); show(); e.preventDefault(); return;
    }
    if(!open) return;
    if(e.key === "Escape"){ hide(); e.preventDefault(); return; }
    if(e.key === "ArrowDown"){ if(filtered.length) active = Math.min(active+1, filtered.length-1); renderPanel(); e.preventDefault(); return; }
    if(e.key === "ArrowUp"){ if(filtered.length) active = Math.max(active-1, 0); renderPanel(); e.preventDefault(); return; }
    if(e.key === "Enter"){
      if(active >= 0 && filtered[active]){
        const v = String(filtered[active].value ?? "");
        if(selected.has(v)) selected.delete(v); else selected.add(v);
        renderChips(); renderPanel(); emit();
      }
      e.preventDefault(); return;
    }
  });

  btnClear.addEventListener("click", () => {
    selected = new Set();
    input.value = "";
    renderChips();
    filter("");
    emit();
  });

  document.addEventListener("click", (e) => { if(!wrap.contains(e.target)) hide(); });

  renderChips();

  wrap.appendChild(el("div", {}, [lbl,
    el("div", { class:"ms__head" }, [chips, btnClear]),
    input,
    panel
  ].filter(Boolean)));

  return {
    el: wrap,
    setOptions(newOptions){
      options = newOptions || [];
      filter(input.value);
      renderChips();
    },
    setValues(newValues){
      selected = new Set((newValues || []).map(v => String(v)));
      renderChips();
      renderPanel();
    },
    getValues(){ return Array.from(selected); }
  };
}
