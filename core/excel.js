import { saveDataset, saveMeta } from "./storage.js";

function findSheetName(wb, preferred){
  const names = wb.SheetNames || [];
  if(!names.length) return null;

  const exact = names.find(n => n === preferred);
  if(exact) return exact;

  const lower = preferred.toLowerCase();
  const ci = names.find(n => String(n).toLowerCase() === lower);
  if(ci) return ci;

  const ciTrim = names.find(n => String(n).trim().toLowerCase() === lower);
  if(ciTrim) return ciTrim;

  return null;
}

export async function importExcelFile(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type:"array" });

  // Use sheet 'results' if present
  const sheetName = findSheetName(wb, "results") || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if(!ws) throw new Error("Geen tabblad gevonden om te importeren (verwacht: 'results').");

  const rows = XLSX.utils.sheet_to_json(ws, { defval:"" });


  // --- Data controle meta (voor debugging / kolommapping) ---
  const columns = rows && rows.length ? Object.keys(rows[0] || {}) : [];
  const expected = ["Race","Ranking","Naam","Nat.","Opmerking","Wedstrijd","Locatie","Afstand","Datum","Seizoen","Sekse","winnaar"];
  const missingColumns = expected.filter(c => !columns.includes(c));

  try{
    saveMeta({
      sheetName,
      rowCount: rows.length,
      columns,
      missingColumns,
      importedAt: new Date().toISOString()
    });
  }catch(e){
    // meta is best-effort; import must still succeed
  }


  await saveDataset(rows);
  return rows;
}
