// Registri halaman & navigasi (UX §5.3, §6; UXD-01, UXD-16; keputusan 83). Struktur sidebar
// ditetapkan PENUH di sini; sebuah entri — dan tautan drill-down kartu dashboard — hanya
// dirender bila halamannya TERDAFTAR di build ini (`HALAMAN_TERDAFTAR`) dan permission-nya
// dipegang menurut `/me` (PM-04, UXP-02). PR halaman berikutnya cukup mendaftarkan ID-nya.

import type { NamaIkon } from "../ui/icon";

/** Halaman yang route-nya ada di build ini: ID UX §6 → path. Dijaga sama dengan router (diuji). */
export const HALAMAN_TERDAFTAR: Readonly<Record<string, string>> = {
    "P-01": "/login",
    "P-02": "/login/2fa",
    "P-03": "/login/2fa/aktivasi",
    "P-05": "/ganti-password",
    "P-08": "/tidak-punya-akses",
    "P-09": "/data-tidak-tersedia",
    "P-10": "/gangguan",
    "P-11": "/tidak-ditemukan",
    "P-12": "/",
    "P-17": "/aset/impor",
    "P-20": "/aset/mutasi",
    "P-27": "/kalender-ruangan",
    "P-29": "/reservasi/baru",
    "P-30": "/reservasi",
    "P-31": "/reservasi/$id",
    "P-68": "/approval-rules",
    "P-69": "/approval-rules/$id",
};

export interface EntriNav {
    readonly label: string;
    readonly halaman: string;
    /** Salah satu cukup (mis. Parameter Sistem: lihat ATAU kelola). */
    readonly permission: readonly string[];
    readonly ikon: NamaIkon;
}

export interface GrupNav {
    readonly label: string;
    /** Penanda 3px grup domain (DSD-03); Beranda tanpa penanda. */
    readonly accent: "accent-blue" | "accent-green" | "accent-yellow" | "accent-purple" | "accent-gray" | null;
    readonly entri: readonly EntriNav[];
}

const e = (label: string, halaman: string, ikon: NamaIkon, ...permission: string[]): EntriNav => ({ label, halaman, ikon, permission });

/** UX §5.3 — urutan tetap untuk semua role; grup Sistem selalu terakhir. */
export const NAVIGASI: readonly GrupNav[] = [
    { label: "Beranda", accent: null, entri: [e("Dashboard", "P-12", "dashboard", "dashboard.view"), e("Notifikasi", "P-13", "notifikasi", "notification.manage_own")] },
    {
        label: "Aset & Bahan",
        accent: "accent-blue",
        entri: [
            e("Inventaris Aset", "P-15", "aset", "asset.view"),
            e("Kategori Aset", "P-21", "kategori", "category.manage"),
            e("Bahan", "P-80", "bahan", "material.view"),
            e("Kategori Bahan", "P-83", "kategori", "material.manage"),
            e("Lokasi", "P-22", "lokasi", "location.view"),
            e("Label QR", "P-24", "qr", "asset.qr_print"),
            e("Dokumen Aset", "P-26", "dokumen", "asset_document.view"),
            e("Scan QR", "P-25", "pindai", "asset.view"),
        ],
    },
    {
        label: "Pemanfaatan",
        accent: "accent-green",
        entri: [
            e("Kalender Ruangan", "P-27", "kalender", "reservation.view"),
            e("Katalog Aset", "P-28", "katalog", "reservation.view"),
            e("Reservasi", "P-30", "reservasi", "reservation.view"),
            e("Peminjaman", "P-32", "peminjaman", "loan.view"),
            e("Denda & Kewajiban", "P-35", "denda", "fine.view"),
            e("Katalog Bahan", "P-84", "katalog", "material.view"),
            e("Permintaan Bahan", "P-86", "permintaan", "material.view"),
            e("Persetujuan Saya", "P-37", "persetujuan", "approval.decide"),
        ],
    },
    {
        label: "Perawatan",
        accent: "accent-yellow",
        entri: [
            e("Laporan Kerusakan", "P-39", "kerusakan", "damage.view"),
            e("Work Order", "P-42", "workOrder", "workorder.view"),
            e("Jadwal Pemeliharaan", "P-45", "jadwal", "maintenance.view_cost", "maintenance.manage"),
        ],
    },
    {
        label: "Pengawasan",
        accent: "accent-purple",
        entri: [
            e("Stock Opname", "P-47", "opname", "audit.view"),
            e("Pengadaan", "P-51", "pengadaan", "procurement.view"),
            e("Penghapusan Aset", "P-55", "penghapusan", "disposal.view"),
            e("Statistik & Analitik", "P-58", "analitik", "report.view"),
        ],
    },
    {
        label: "Sistem",
        accent: "accent-gray",
        entri: [
            e("Pengguna & Role", "P-60", "pengguna", "user.view"),
            e("Permintaan Reset Password", "P-67", "kunci", "user.reset_password"),
            e("Approval Rules", "P-68", "aturan", "approval_rule.view"),
            e("Parameter Sistem", "P-70", "pengaturan", "setting.view", "setting.manage"),
            e("Activity Log", "P-73", "log", "activity_log.view"),
            e("Monitoring Chatbot", "P-75", "chatbot", "chat.monitor"),
        ],
    },
];

/** Grup berisi entri yang boleh dirender; grup kosong ikut hilang (UXD-01). */
export function navigasiTerlihat(can: (permission: string) => boolean): readonly GrupNav[] {
    return NAVIGASI.map((g) => ({ ...g, entri: g.entri.filter((x) => HALAMAN_TERDAFTAR[x.halaman] !== undefined && x.permission.some(can)) })).filter((g) => g.entri.length > 0);
}

/**
 * Sasaran drill-down UX §8.3 (mis. `P-60?filter[status]=AKTIF`, `P-68 · P-70`) → path bila
 * halaman pertamanya terdaftar; `null` bila belum — kartu tetap tampil tanpa tautan.
 */
export function jalurDrilldown(sasaran: string | null): string | null {
    if (sasaran === null) return null;
    const cocok = /^(P-\d+)(\?.*)?/.exec(sasaran.split(" · ")[0] ?? "");
    const path = cocok?.[1] === undefined ? undefined : HALAMAN_TERDAFTAR[cocok[1]];
    return path === undefined ? null : `${path}${cocok?.[2] ?? ""}`;
}
