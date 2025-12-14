import { el } from "./dom.js";
export function sectionCard({ title, subtitle, children }){
  return el("section", { class:"card" }, [
    el("div", { class:"card__hd" }, [
      el("h3", { class:"card__title" }, title),
      subtitle ? el("p", { class:"card__sub" }, subtitle) : null
    ].filter(Boolean)),
    el("div", { class:"card__bd" }, children)
  ]);
}
