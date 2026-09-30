// Permukaan publik m15-dashboard web (SDD-11 §4.1a). Halaman Dashboard dimuat MALAS
// (SDD-11 §4.7: code splitting per route, grafik tidak ikut bundel awal) — index hanya
// mengekspor yang ringan dan pemuatnya.
export { LABEL_RENTANG, RENTANG } from "./rentang";
export type { Rentang } from "./rentang";
export type { DataKartu, KartuManifes, Manifes } from "./api";
export const muatDashboardPage = () => import("./DashboardPage");
