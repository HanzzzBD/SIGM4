import type { DokumenAset } from "@sigm4/schemas";

/** Tanggal kalender WIB (UTC+7) — dasar hitung masa garansi dan saran NT-29. */
export const hariIniWib = (now = new Date()) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);

export function penandaGaransi(d: DokumenAset, now = new Date()) {
    if (d.jenis !== "GARANSI" || !d.garansi_mulai || !d.garansi_selesai) return null;
    const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    if (today < d.garansi_mulai) return { label: "Garansi belum dimulai", varian: "neutral" as const };
    if (today > d.garansi_selesai) return { label: "Garansi berakhir", varian: "neutral" as const };
    const days = Math.round((Date.parse(d.garansi_selesai) - Date.parse(today)) / 86400000);
    return days <= 30 ? { label: days === 0 ? "Garansi berakhir hari ini" : `Garansi berakhir dalam ${days} hari`, varian: "warning" as const } : { label: "Garansi aktif", varian: "success" as const };
}
