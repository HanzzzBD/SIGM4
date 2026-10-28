// Token warna SIGM4 — nilai FOUNDATIONS.md §1 (DS-01, DS-P-07). Satu-satunya tempat hex
// boleh ditulis. `tokens.css` memuat nilai yang SAMA sebagai CSS custom property; uji
// memastikan keduanya tidak menyimpang dan pasangan kontras di bawah lolos WCAG
// (NFR-AC-01/02, SDD-11 §4.6).

export const WARNA = {
    "teal-50": "#F2F7F8",
    "teal-100": "#E0ECEF",
    "teal-600": "#1F7A8C",
    "teal-700": "#196574",
    "teal-800": "#15525F",
    "neutral-50": "#F9FAFB",
    "neutral-100": "#F3F4F6",
    "neutral-200": "#E5E7EB",
    "neutral-300": "#D1D5DB",
    "neutral-400": "#9CA3AF",
    "neutral-500": "#6B7280",
    "neutral-600": "#4B5563",
    "neutral-700": "#374151",
    "neutral-800": "#1F2937",
    "neutral-900": "#111827",
    white: "#FFFFFF",
    "accent-blue": "#00529C",
    "accent-green": "#028744",
    "accent-yellow": "#FEB003",
    "accent-purple": "#541F7F",
    "accent-gray": "#7B7B7B",
    "accent-red": "#D4160D",
    "success-subtle": "#E6F1ED",
    "success-base": "#067647",
    "success-strong": "#075B38",
    "warning-subtle": "#F8EDE6",
    "warning-base": "#B54708",
    "warning-strong": "#8A3808",
    "error-subtle": "#F8E9E8",
    "error-base": "#B42318",
    "error-strong": "#8A1D14",
    "info-subtle": "#E8EFFB",
    "info-base": "#175CD3",
    "info-strong": "#1448A1",
    "border-strong": "#868E9B",
} as const;

export type NamaWarna = keyof typeof WARNA;

/** Urutan seri data visualisasi yang tetap (FOUNDATIONS §1.2) — grafik yang sama selalu berwarna sama. */
export const SERI_GRAFIK: readonly NamaWarna[] = ["accent-blue", "accent-green", "accent-yellow", "accent-red", "accent-gray", "accent-purple"];

/**
 * Pasangan depan/latar yang DIPAKAI komponen, beserta ambang WCAG 2.1 yang wajib: 4,5 untuk
 * teks biasa, 3 untuk kontrol/ikon/teks besar (SC 1.4.3, 1.4.11). `text.tertiary` sengaja
 * tidak tercantum — hanya placeholder (FOUNDATIONS §1.6).
 */
export const PASANGAN_KONTRAS: readonly { readonly depan: NamaWarna; readonly latar: NamaWarna; readonly min: 4.5 | 3; readonly guna: string }[] = [
    { depan: "neutral-900", latar: "white", min: 4.5, guna: "text.heading" },
    { depan: "neutral-600", latar: "white", min: 4.5, guna: "text.primary" },
    { depan: "neutral-600", latar: "neutral-50", min: 4.5, guna: "text.primary di latar halaman" },
    { depan: "neutral-500", latar: "white", min: 4.5, guna: "text.secondary" },
    { depan: "neutral-500", latar: "neutral-50", min: 4.5, guna: "text.secondary di latar halaman" },
    { depan: "teal-600", latar: "white", min: 4.5, guna: "text.link" },
    { depan: "teal-700", latar: "white", min: 4.5, guna: "text.link.hover" },
    { depan: "teal-800", latar: "teal-50", min: 4.5, guna: "item nav aktif" },
    { depan: "white", latar: "teal-600", min: 4.5, guna: "tombol primary" },
    { depan: "white", latar: "teal-700", min: 4.5, guna: "tombol primary hover" },
    { depan: "white", latar: "error-base", min: 4.5, guna: "tombol danger" },
    { depan: "error-base", latar: "white", min: 4.5, guna: "pesan galat form" },
    { depan: "success-strong", latar: "success-subtle", min: 4.5, guna: "alert/badge sukses" },
    { depan: "warning-strong", latar: "warning-subtle", min: 4.5, guna: "alert/badge peringatan" },
    { depan: "error-strong", latar: "error-subtle", min: 4.5, guna: "alert/badge galat" },
    { depan: "info-strong", latar: "info-subtle", min: 4.5, guna: "alert/badge informasi" },
    { depan: "neutral-700", latar: "neutral-100", min: 4.5, guna: "badge netral" },
    { depan: "border-strong", latar: "white", min: 3, guna: "border kontrol form" },
    { depan: "border-strong", latar: "neutral-50", min: 3, guna: "border kontrol di latar halaman" },
    { depan: "teal-600", latar: "white", min: 3, guna: "ring fokus" },
    { depan: "success-base", latar: "white", min: 3, guna: "ikon sukses" },
    { depan: "warning-base", latar: "white", min: 3, guna: "ikon peringatan" },
    { depan: "info-base", latar: "white", min: 3, guna: "ikon informasi" },
];

/** Rasio kontras WCAG 2.1 (luminans relatif sRGB). */
export function rasioKontras(a: string, b: string): number {
    const lum = (hex: string): number => {
        const kanal = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        const [r, g, bl] = kanal.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (l1 + 0.05) / (l2 + 0.05);
}
