import { LABEL_KONDISI_ASET, LABEL_STATUS_ASET } from "@sigm4/schemas";
import { jalurDrilldown } from "../../shared/navigasi";
import type { KartuManifes } from "./api";

const IZIN: Readonly<Record<string, readonly string[]>> = {
    "P-42": ["workorder.view"],
    "P-15": ["asset.view"], "P-24": ["asset.qr_print", "asset.view"],
    "P-26": ["asset_document.view"],
    "P-30": ["reservation.view"], "P-37": ["approval.decide"],
    "P-60": ["user.view"], "P-68": ["approval_rule.view"], "P-70": ["setting.view"],
    "P-73": ["activity_log.view"], "P-74": ["activity_log.view"], "P-67": ["user.reset_password"],
};

/** Manifes tetap memakai ID UX; query API diterjemahkan ke kontrak URL halaman web. */
export function tujuanDashboard(kartu: KartuManifes, can: (permission: string) => boolean): string | null {
    for (const target of kartu.drilldown?.split(" · ") ?? []) {
        const page = /^(P-\d+)(?:\?|$)/.exec(target)?.[1];
        if (page === undefined || IZIN[page] === undefined || !IZIN[page]?.every(can)) continue;
        const path = jalurDrilldown(target);
        if (path === null || path.includes("$")) continue;
        if (kartu.id === "pengguna-aktif" || kartu.id === "distribusi-role") return path.split("?")[0] + "?status=AKTIF";
        if (kartu.id === "aset-belum-berlabel-qr") return path.split("?")[0] + "?belum=true";
        return path;
    }
    return null;
}

export interface TautanRincian { readonly label: string; readonly jumlah: number; readonly href: string }
export function rincianDashboard(kartu: KartuManifes, isi: Record<string, unknown>, can: (permission: string) => boolean): readonly TautanRincian[] {
    if (!can("asset.view") || tujuanDashboard(kartu, can) === null) return [];
    const condition = kartu.id === "komposisi-kondisi-aset" || kartu.id === "kondisi-aset";
    if (!condition && kartu.id !== "status-aset") return [];
    const labels = condition ? LABEL_KONDISI_ASET : LABEL_STATUS_ASET;
    const values = isi[condition ? "kondisi" : "status"] as Record<string, number> | undefined;
    return Object.entries(labels).map(([code, label]) => ({ label, jumlah: values?.[code] ?? 0, href: `/aset?${condition ? "kondisi" : "status"}=${encodeURIComponent(code)}` }));
}
