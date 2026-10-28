// Pesan galat halaman alur masuk (P-02, P-03, P-05). Pesan pengguna berasal dari server
// bila bermakna (422/423), selebihnya kalimat umum per keadaan (UX §7.3).

import { ApiError, GalatJaringan } from "../../shared/api";

export const PESAN_UMUM = "Terjadi gangguan pada sistem. Coba lagi beberapa saat lagi.";

/** Jaringan, batas laju (NFR-S-07), atau gangguan — keadaan yang sama di ketiga halaman. */
export function pesanUmum(g: unknown): string {
    if (g instanceof GalatJaringan) return g.message;
    if (g instanceof ApiError && g.status === 429) return `Terlalu banyak percobaan. Coba lagi dalam ${String(g.tungguDetik ?? 60)} detik.`;
    return PESAN_UMUM;
}

/** Pesan 422 per isian (SDD-API-14); beberapa pelanggaran pada isian yang sama digabung. */
export function galatIsian(g: unknown, field: string): string | undefined {
    if (!(g instanceof ApiError) || g.kode !== "VALIDATION_ERROR") return undefined;
    const pesan = g.details.filter((d) => d.field === field).map((d) => d.message);
    return pesan.length > 0 ? pesan.join(" ") : undefined;
}
