export function el(tag, attrs = {}, children = []){
  const n = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs || {})){
    if(k === "class") n.className = v;
    else if(k === "html") n.innerHTML = v;
    else if(k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if(v === true) n.setAttribute(k, "");
    else if(v !== false && v != null) n.setAttribute(k, String(v));
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if(c == null) return;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return n;
}
export function clear(node){ while(node.firstChild) node.removeChild(node.firstChild); }
