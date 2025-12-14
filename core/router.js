const ROUTE_KEY = "silo_route";

function getRoute(){
  const h = (location.hash || "").replace("#","").trim();
  return h || localStorage.getItem(ROUTE_KEY) || "home";
}
function setRoute(route){
  localStorage.setItem(ROUTE_KEY, route);
  location.hash = route;
}
class Router{
  constructor(){
    this.handlers = new Map();
    window.addEventListener("hashchange", () => this.render());
  }
  register(route, fn){ this.handlers.set(route, fn); }
  go(route){ setRoute(route); }
  start(){
    if(!location.hash) setRoute(getRoute());
    this.render();
  }
  render(){
    const route = getRoute();
    localStorage.setItem(ROUTE_KEY, route);
    (this.handlers.get(route) || this.handlers.get("home"))?.();
  }
}
export const router = new Router();
