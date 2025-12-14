import { router } from "./router.js";
import { mountHome } from "../modules/home/home.js";
import { mountDashboard } from "../modules/dashboard/dashboard.js";
import { mountFilters } from "../modules/filters/filters.js";
import { mountHeadToHead } from "../modules/headtohead/headtohead.js";
import { mountChampions } from "../modules/champions/champions.js";
import { mountOverview } from "../modules/overview/overview.js";
import { mountSettings } from "../modules/settings/settings.js";

const root = document.getElementById("appRoot");
document.getElementById("btnGoHome").addEventListener("click", () => router.go("home"));

router.register("home", () => mountHome(root));
router.register("dashboard", () => mountDashboard(root));
router.register("filters", () => mountFilters(root));
router.register("headtohead", () => mountHeadToHead(root));
router.register("champions", () => mountChampions(root));
router.register("overview", () => mountOverview(root));
router.register("settings", () => mountSettings(root));

router.start();
