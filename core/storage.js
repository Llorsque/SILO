const DATA_KEY = "silo_dataset";
const MAP_KEY = "silo_mapping";

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

export function loadDataset(){
  const raw = localStorage.getItem(DATA_KEY);
  if(!raw) return null;
  try{ return JSON.parse(raw); } catch { return null; }
}
export function saveDataset(rows){ localStorage.setItem(DATA_KEY, JSON.stringify(rows)); }
export function clearDataset(){ localStorage.removeItem(DATA_KEY); }
export function hasDataset(){ return !!localStorage.getItem(DATA_KEY); }

export function loadMapping(){
  const raw = localStorage.getItem(MAP_KEY);
  if(!raw) return null;
  try{ return JSON.parse(raw); } catch { return null; }
}
export function saveMapping(map){ localStorage.setItem(MAP_KEY, JSON.stringify(map)); }

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
