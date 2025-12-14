import { saveDataset } from "./storage.js";
export async function importExcelFile(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type:"array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval:"" });
  saveDataset(rows);
  return rows;
}
