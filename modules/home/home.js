import { el, clear } from "../../core/dom.js";
import { router } from "../../core/router.js";
import { importExcelFile } from "../../core/excel.js";
import { clearDataset, hasDataset, loadDataset, loadMeta } from "../../core/storage.js";

export function mountHome(root){
  clear(root);

  const dataset = loadDataset();
  const meta = loadMeta();
  const info = dataset
    ? `${dataset.length.toLocaleString("nl-NL")} rijen geladen`
    : (meta?.rowCount ? `${Number(meta.rowCount).toLocaleString("nl-NL")} rijen geladen` : "Geen dataset geladen");

  const uploadInput = el("input", { type:"file", accept:".xlsx,.xls", class:"input" });
  const btnUpload = el("button", { class:"btn btn--primary", type:"button" }, "Upload Excel");
  const btnClear = el("button", { class:"btn btn--danger", type:"button" }, "Ontkoppel / verwijder dataset");

  btnUpload.addEventListener("click", () => uploadInput.click());
  uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files?.[0];
    if(!file) return;

    btnUpload.disabled = true;
    btnUpload.textContent = "Bezig met importeren…";

    try{
      await importExcelFile(file);
      router.go("home");
    }catch(err){
      const msg = err?.message || String(err);
      alert("Import mislukt: " + msg);
    }finally{
      btnUpload.disabled = false;
      btnUpload.textContent = "Upload Excel";
      uploadInput.value = "";
    }
  });

  btnClear.addEventListener("click", async () => {
    if(!hasDataset()){
      alert("Er is geen dataset om te verwijderen.");
      return;
    }
    if(!confirm("Dataset ontkoppelen/verwijderen? (Dit verwijdert de lokale data in je browser.)")) return;
    await clearDataset();
    router.go("home");
  });

  const menuBtn = (title, kicker, route) => el("button", {
    class:"btn btn--xl",
    type:"button",
    onclick: () => router.go(route)
  }, [el("div", { class:"btn__kicker" }, kicker), el("div", { class:"btn__label" }, title)]);

  root.appendChild(el("section", { class:"card" }, [
    el("div", { class:"card__hd" }, [
      el("h2", { class:"card__title" }, "Hoofdmenu"),
      el("p", { class:"card__sub" }, "6 modules • Upload je Excel op dit scherm.")
    ]),
    el("div", { class:"card__bd" }, [
      el("div", { class:"row" }, [
        el("span", { class:"pill" }, info),
        el("div", { class:"spacer" }),
        uploadInput, btnUpload, btnClear
      ]),
      el("div", { class:"hr" }),
      el("div", { class:"menuGrid" }, [
        menuBtn("Dashboard", "Rijder → tiles", "dashboard"),
        menuBtn("Filters & Parameters", "Combineer filters", "filters"),
        menuBtn("Head-to-Head", "Vergelijk rijders", "headtohead"),
        menuBtn("Kampioenen", "WK / OS", "champions"),
        menuBtn("Overzicht", "Dataset samenvatting", "overview"),
        menuBtn("Instellingen", "Mapping & beheer", "settings"),
      ])
    ])
  ]));
}
