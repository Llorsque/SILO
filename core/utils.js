export function uniq(arr){
  return Array.from(new Set(arr.filter(v => v !== "" && v != null)));
}
export function toNumber(x){
  const n = Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function safeLower(x){ return String(x ?? "").toLowerCase(); }
export function groupBy(arr, keyFn){
  const m = new Map();
  for(const it of arr){
    const k = keyFn(it);
    const list = m.get(k) || [];
    list.push(it);
    m.set(k, list);
  }
  return m;
}
