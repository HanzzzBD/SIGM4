// Registri layar & Menu mobile (MS-31; UXD-20, MOB-SCP-01…03). Struktur Menu ditetapkan PENUH di sini —
// cermin NAVIGASI web (UX §5.3, UXD-01) dengan ID layar mobile. Entri hanya dirender bila layarnya TERDAFTAR
// di build ini dan permission-nya dipegang menurut `/me` (UXP-02); paket paritas berikutnya cukup mendaftarkan ID.
import type { DomainGroup } from "../../shared/ui/model";
import type { IconName } from "../../shared/ui/Icon";

/** Layar mobile yang route-nya ada di build ini: ID UX §6.11 → path. */
export const REGISTERED_SCREENS: Readonly<Record<string, string>> = {
    "MS-05": "/", "MS-06": "/tugas", "MS-07": "/scan", "MS-15": "/kerusakan/lapor", "MS-16": "/work-order", "MS-18": "/opname", "MS-20": "/persetujuan", "MS-21": "/chat",
    "MS-29": "/notifikasi", "MS-30": "/profil", "MS-31": "/menu",
};

export interface MenuEntry {
    readonly id: string;
    readonly label: string;
    readonly icon: IconName;
    /** Salah satu cukup. */
    readonly permission: readonly string[];
    /** Tujuan cadangan berurutan bila layar utama belum terdaftar atau izinnya tidak dipegang. */
    readonly alternatives?: readonly { readonly id: string; readonly permission: readonly string[] }[];
    /** Entri pengecualian MOB-SCP-02: selalu ditampilkan (MOB-SCP-03) dan diarahkan ke path web ini. */
    readonly web?: { readonly path: string; readonly reason: string };
}
export interface MenuGroup { readonly group: DomainGroup; readonly label: string; readonly entries: readonly MenuEntry[] }

const e = (id: string, label: string, icon: IconName, ...permission: string[]): MenuEntry => ({ id, label, icon, permission });

/** UX §5.3 — urutan tetap untuk semua role; ikon modul FOUNDATIONS §8 (DSD-12). */
export const MENU: readonly MenuGroup[] = [
    { group: "ASET_BAHAN", label: "Aset & Bahan", entries: [
        e("MS-33", "Inventaris Aset", "package", "asset.view"), e("MS-36", "Kategori Aset", "tags", "category.manage"), e("MS-40", "Bahan", "boxes", "material.view"),
        e("MS-43", "Kategori Bahan", "folderTree", "material.manage"), e("MS-37", "Lokasi", "mapPin", "location.view"),
        { ...e("P-24", "Label QR", "qrCode", "asset.qr_print"), web: { path: "/label-qr", reason: "Cetak label QR memerlukan printer, sehingga hanya tersedia di web sekolah." } },
        e("MS-39", "Dokumen Aset", "fileText", "asset_document.view"), e("MS-07", "Scan QR", "scanLine", "asset.view", "material.view"),
    ] },
    { group: "PEMANFAATAN", label: "Pemanfaatan", entries: [
        e("MS-44", "Kalender Ruangan", "calendarDays", "reservation.view"), e("MS-45", "Katalog Aset", "layoutGrid", "reservation.view"), e("MS-47", "Reservasi", "calendarCheck", "reservation.view"),
        e("MS-49", "Peminjaman", "handHelping", "loan.view"), e("MS-50", "Antrean Serah Terima", "handshake", "loan.manage"), e("MS-52", "Denda & Kewajiban", "receipt", "fine.view"),
        e("MS-55", "Katalog Bahan", "clipboardList", "material.view"), e("MS-57", "Permintaan Bahan", "clipboardList", "material.view"), e("MS-20", "Persetujuan Saya", "badgeCheck", "approval.decide"),
    ] },
    { group: "PERAWATAN", label: "Perawatan", entries: [
        e("MS-59", "Laporan Kerusakan", "hammer", "damage.view"),
        { ...e("MS-61", "Work Order", "wrench", "workorder.view"), alternatives: [{ id: "MS-16", permission: ["workorder.execute"] }] },
        e("MS-63", "Jadwal Pemeliharaan", "calendarClock", "maintenance.manage"),
    ] },
    { group: "PENGAWASAN", label: "Pengawasan", entries: [
        { ...e("MS-65", "Stock Opname", "clipboardCheck", "audit.manage"), alternatives: [{ id: "MS-18", permission: ["audit.execute"] }] },
        e("MS-67", "Pengadaan", "shoppingCart", "procurement.view"), e("MS-71", "Penghapusan Aset", "archiveX", "disposal.view"), e("MS-74", "Statistik & Analitik", "chartColumn", "report.view"),
    ] },
    { group: "SISTEM", label: "Sistem", entries: [
        { ...e("MS-76", "Pengguna & Role", "users", "user.view"), alternatives: [{ id: "MS-80", permission: ["role.view"] }] },
        e("MS-82", "Permintaan Reset Password", "keyRound", "user.reset_password"), e("MS-83", "Approval Rules", "workflow", "approval_rule.view"),
        e("MS-85", "Parameter Sistem", "settings", "setting.view", "setting.manage"), e("MS-88", "Activity Log", "history", "activity_log.view"), e("MS-90", "Monitoring Chatbot", "bot", "chat.monitor"),
    ] },
];

export type VisibleEntry = MenuEntry & { readonly path: string };
/** Grup berisi entri yang boleh dirender; grup kosong ikut hilang (UXD-01). */
export function visibleMenu(permissions: Readonly<Record<string, string>>, registered: Readonly<Record<string, string>> = REGISTERED_SCREENS): readonly (Omit<MenuGroup, "entries"> & { entries: readonly VisibleEntry[] })[] {
    const can = (list: readonly string[]) => list.some((permission) => Object.hasOwn(permissions, permission));
    const pick = (entry: MenuEntry): VisibleEntry | null => {
        if (entry.web) return can(entry.permission) ? { ...entry, path: entry.web.path } : null;
        const target = [{ id: entry.id, permission: entry.permission }, ...(entry.alternatives ?? [])].find((option) => registered[option.id] !== undefined && can(option.permission));
        return target ? { ...entry, id: target.id, permission: target.permission, path: registered[target.id]! } : null;
    };
    return MENU.map((group) => ({ ...group, entries: group.entries.map(pick).filter((entry): entry is VisibleEntry => entry !== null) })).filter((group) => group.entries.length > 0);
}

/** Pencarian modul: cocok pada label entri atau nama grupnya, tanpa membedakan huruf. */
export function searchMenu<T extends { label: string; entries: readonly { label: string }[] }>(groups: readonly T[], query: string): readonly T[] {
    const q = query.trim().toLocaleLowerCase("id-ID");
    if (q === "") return groups;
    return groups.map((group) => group.label.toLocaleLowerCase("id-ID").includes(q) ? group : { ...group, entries: group.entries.filter((entry) => entry.label.toLocaleLowerCase("id-ID").includes(q)) }).filter((group) => group.entries.length > 0);
}

/** Tautan web hanya ke origin HTTPS sekolah yang dikonfigurasi (MOB-SCP-03). */
export function webUrl(origin: string, path: string): string | null {
    if (!path.startsWith("/") || path.startsWith("//")) return null;
    try { const base = new URL(origin); if (base.protocol !== "https:" || base.username || base.password) return null; return new URL(path, base.origin).toString(); } catch { return null; }
}
