import { idbGet, idbSet, idbDel } from "./idb.js";

const DATA_IDB_KEY = "dataset";
const META_KEY = "silo_meta";
const MAP_KEY = "silo_mapping";

let datasetCache = null;

export const DEFAULT_MAPPING = {
  rider: "Naam",
  ranking: "Ranking",
  race: "Race",
  nat: "Nat.",
  note: "Opmerking",
  competition: "Wedstrijd",
  location: "Locatie",
  distance: "Afstand",
  date: "Datum",
  season: "Seizoen",
  sex: "Sekse",
  winner: "winnaar",
};

export async function initDataset(){
  // Load once on app start so the rest of the app can stay synchronous.
  try{
    datasetCache = await idbGet(DATA_IDB_KEY);
  }catch{
    datasetCache = null;
  }
  // If cache exists, ensure meta is present (best effort)
  if(Array.isArray(datasetCache)){
    const meta = loadMeta() || {};
    if(!meta.rowCount){
      saveMeta({ ...meta, rowCount: datasetCache.length, updatedAt: new Date().toISOString() });
    }
  }
}

export function loadDataset(){
  return Array.isArray(datasetCache) ? datasetCache : null;
}

export async function saveDataset(rows){
  datasetCache = rows;
  await idbSet(DATA_IDB_KEY, rows);
  saveMeta({ rowCount: Array.isArray(rows) ? rows.length : 0, updatedAt: new Date().toISOString() });
}

export async function clearDataset(){
  datasetCache = null;
  await idbDel(DATA_IDB_KEY);
  localStorage.removeItem(META_KEY);
}

export function hasDataset(){
  const meta = loadMeta();
  return !!(meta && meta.rowCount && meta.rowCount > 0);
}

export function loadMeta(){
  const raw = localStorage.getItem(META_KEY);
  if(!raw) return null;
  try{ return JSON.parse(raw); } catch { return null; }
}
export function saveMeta(meta){
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function loadMapping(){
  const raw = localStorage.getItem(MAP_KEY);
  if(!raw) return null;
  try{ return JSON.parse(raw); } catch { return null; }
}
export function saveMapping(map){
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
}

export function getMappingWithFallback(columns){
  const stored = loadMapping() || {};
  const map = { ...DEFAULT_MAPPING, ...stored };
  if(Array.isArray(columns) && columns.length){
    for(const k of Object.keys(map)){
      if(!columns.includes(map[k])){
        const found = columns.find(c => c.toLowerCase() === String(map[k]).toLowerCase());
        if(found) map[k] = found;
      }
    }
  }
  return map;
}
