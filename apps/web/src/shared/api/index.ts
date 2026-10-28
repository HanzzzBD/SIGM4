// Permukaan publik klien HTTP (SDD-11 §4.4). Satu instans per aplikasi: mutex refresh
// (SDD-FE-07) hanya bermakna bila seluruh permintaan melewati instans yang sama.

import { buatKlien } from "./client";

let penanganSesiBerakhir: () => void = () => undefined;
let penanganSesiDisegarkan: () => void = () => undefined;

/** Dipasang aplikasi saat bootstrap: sesi tak dapat dipulihkan → Login (F-01); disegarkan → muat ulang `/me`. */
export function aturPenangan(p: { sesiBerakhir: () => void; sesiDisegarkan: () => void }): void {
    penanganSesiBerakhir = p.sesiBerakhir;
    penanganSesiDisegarkan = p.sesiDisegarkan;
}

export const api = buatKlien({ onSesiBerakhir: () => penanganSesiBerakhir(), onSesiDisegarkan: () => penanganSesiDisegarkan() });

export { BASE_API, ambilData, buatKlien } from "./client";
export type { OpsiKlien } from "./client";
export { ApiError, GalatJaringan } from "./errors";
export type { DetailGalat } from "./errors";
