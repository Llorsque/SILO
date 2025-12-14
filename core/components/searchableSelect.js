import { el, clear } from "../dom.js";

export function createSearchableSelect({ label, placeholder="Typ om te zoeken…", options=[], value="", onChange=()=>{} }){
  const wrap = el("div", { class:"searchable" });
  const lbl = label ? el("div", { class:"muted", style:"font-size:12px; margin:0 0 6px 2px; font-weight:800" }, label) : null;

  const input = el("input", { class:"input", type:"text", placeholder, value: labelFor(options, value) || "" });
  const panel = el("div", { class:"searchable__panel", style:"display:none" });

  let filtered = options.slice();
  let active = -1;
  let open = false;

  function render(){
    clear(panel);
    if(filtered.length === 0){
      panel.appendChild(el("div", { class:"searchable__empty" }, "Geen resultaten"));
      return;
    }
    filtered.forEach((opt, idx) => {
      panel.appendChild(el("div", {
        class: "searchable__item" + (idx === active ? " searchable__item--active" : ""),
        onclick: () => setValue(opt.value)
      }, opt.label ?? String(opt.value ?? "")));
    });
  }
  function show(){ open = true; panel.style.display = "block"; render(); }
  function hide(){ open = false; panel.style.display = "none"; active = -1; }
  function filter(q){
    const s = String(q ?? "").toLowerCase().trim();
    filtered = options.filter(o => (o.label ?? String(o.value ?? "")).toLowerCase().includes(s));
    active = filtered.length ? 0 : -1;
    render();
  }
  function setValue(v){
    input.value = labelFor(options, v) || "";
    onChange(v);
    hide();
  }

  input.addEventListener("focus", () => { filter(input.value); show(); });
  input.addEventListener("input", () => { filter(input.value); show(); });

  input.addEventListener("keydown", (e) => {
    if(!open && (e.key === "ArrowDown" || e.key === "Enter")){
      filter(input.value); show(); e.preventDefault(); return;
    }
    if(!open) return;
    if(e.key === "Escape"){ hide(); e.preventDefault(); return; }
    if(e.key === "ArrowDown"){ if(filtered.length) active = Math.min(active+1, filtered.length-1); render(); e.preventDefault(); return; }
    if(e.key === "ArrowUp"){ if(filtered.length) active = Math.max(active-1, 0); render(); e.preventDefault(); return; }
    if(e.key === "Enter"){
      if(active >= 0 && filtered[active]) setValue(filtered[active].value);
      else if(filtered[0]) setValue(filtered[0].value);
      e.preventDefault(); return;
    }
  });

  document.addEventListener("click", (e) => { if(!wrap.contains(e.target)) hide(); });

  wrap.appendChild(el("div", {}, [lbl, input, panel].filter(Boolean)));
  return { el: wrap };
}

function labelFor(options, value){
  const opt = options.find(o => o.value === value);
  return opt ? (opt.label ?? String(opt.value ?? "")) : "";
}
