// Logika murni komponen visual-first C-30…C-38 (DSD-11) — terpisah dari JSX agar dapat diuji tanpa runtime native.
import { tokens as t } from "./tokens";

/** Lima grup domain UXD-01 → accent DSD-03. */
export type DomainGroup = "ASET_BAHAN" | "PEMANFAATAN" | "PERAWATAN" | "PENGAWASAN" | "SISTEM";
export const GROUP_ACCENT: Readonly<Record<DomainGroup, string>> = { ASET_BAHAN: t.color.accent.blue, PEMANFAATAN: t.color.accent.green, PERAWATAN: t.color.accent.yellow, PENGAWASAN: t.color.accent.purple, SISTEM: t.color.accent.gray };
/** Ikon di atas kotak accent: putih, kecuali di atas kuning (kontras 1,84) — DSD-12, C-31. */
export function tileIconColor(group: DomainGroup): string { return group === "PERAWATAN" ? t.color.iconDefault : t.color.iconInverse; }

/** Badge angka C-30: kosong bila 0, maks "99+". */
export function countBadge(count: number): string | null {
    if (!Number.isFinite(count) || count <= 0) return null;
    return count > 99 ? "99+" : String(Math.floor(count));
}
/** Jumlah belum dibaca ikut dibacakan pada label lonceng (C-30). */
export function bellLabel(count: number): string {
    const badge = countBadge(count);
    return badge === null ? "Notifikasi" : `Notifikasi, ${badge} belum dibaca`;
}

/** C-32: paling banyak dua butir meta dan dua badge status. */
export function cardMeta(meta: readonly (string | null | undefined)[]): string {
    return meta.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 2).join(" · ");
}
export function initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

/** C-34: isi tengah persen atau "x/y"; jalur berwarna status hanya bila maknanya status. */
export function ringProgress(value: number, max: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
    return Math.min(1, Math.max(0, value / max));
}
export function ringText(value: number, max: number, format: "percent" | "fraction"): string {
    return format === "fraction" ? `${Math.max(0, Math.floor(value))}/${Math.max(0, Math.floor(max))}` : `${Math.round(ringProgress(value, max) * 100)}%`;
}
export function ringColor(tone: "default" | "warning" | "error"): string {
    return tone === "warning" ? t.color.warning : tone === "error" ? t.color.error : t.color.primary;
}

/** Urutan seri data visualisasi FOUNDATIONS §1.2; C-33 maks 6 seri. */
export const SERIES = [t.color.accent.blue, t.color.accent.green, t.color.accent.yellow, t.color.accent.red, t.color.accent.gray, t.color.accent.purple] as const;
export function chartSeries(values: readonly number[]): { value: number; color: string }[] {
    return values.slice(0, SERIES.length).map((value, index) => ({ value: Number.isFinite(value) && value > 0 ? value : 0, color: SERIES[index]! }));
}

/** C-35: hanya label langkah aktif yang tampil di ponsel; seluruh label di tablet. */
export function stepLabels(steps: readonly string[], active: number, wide: boolean): (string | null)[] {
    return steps.map((label, index) => wide || index === active ? label : null);
}

/** C-38 disembunyikan pada pemindai (C-25), di dalam chatbot sendiri, dan tanpa `chat.use` (UXD-22). */
export function chatFabVisible(pathname: string, permissions: Readonly<Record<string, string>>): boolean {
    if (!Object.hasOwn(permissions, "chat.use")) return false;
    if (pathname === "/scan" || pathname.startsWith("/chat")) return false;
    return !/^\/opname\/[^/]+$/.test(pathname);
}

/** C-30 menyusut ke judul saja setelah konten digulir melewati tinggi header. */
export function headerCollapsed(offsetY: number): boolean { return offsetY > t.size.topbar; }
