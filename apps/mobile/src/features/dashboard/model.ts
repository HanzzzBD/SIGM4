import type { DashboardCard } from "@sigm4/schemas";
import { approvalScreensReady } from "../../shared/capabilities";
import { REGISTERED_SCREENS } from "../../shared/screens";
import type { DomainGroup } from "../../shared/ui/model";
import type { IconName } from "../../shared/ui/Icon";
import { LABEL_JENIS_PENGAJUAN, LABEL_KONDISI_ASET, LABEL_STATUS_ASET, LABEL_STATUS_INSTANCE_APPROVAL, labelEnum } from "@sigm4/schemas";
type Permissions = Readonly<Record<string, string>>;
/**
 * Aksi Cepat sebagai Tile Modul C-31 (DSD-12). Hanya aksi bergrup domain yang layarnya terdaftar (keputusan
 * paket 1 log phase-07): Chatbot sudah ada di tab dan C-38, Ajukan Reservasi menunggu MS-46.
 */
export function quickActions(permissions: Permissions, registered: Readonly<Record<string, string>> = REGISTERED_SCREENS) {
    const actions: { permission: string; label: string; screen: string; group: DomainGroup; icon: IconName }[] = [
        { permission: Object.hasOwn(permissions,"asset.view")?"asset.view":"material.view", label: Object.hasOwn(permissions,"material.view")?"Scan aset atau bahan":"Scan aset", screen: "MS-07", group: "ASET_BAHAN", icon: "scanLine" },
        { permission: "approval.decide", label: "Persetujuan saya", screen: approvalScreensReady ? "MS-20" : "", group: "PEMANFAATAN", icon: "badgeCheck" },
        { permission: "reservation.create", label: "Ajukan reservasi", screen: "MS-46", group: "PEMANFAATAN", icon: "calendarCheck" },
        { permission: "damage.create", label: "Lapor kerusakan", screen: "MS-15", group: "PERAWATAN", icon: "hammer" },
    ];
    return actions.flatMap((action) => { const path = registered[action.screen]; return path !== undefined && Object.hasOwn(permissions, action.permission) ? [{ ...action, path }] : []; });
}
export function visibleCards(cards: readonly DashboardCard[], permissions: Permissions) {
    return cards.filter((card) => card.id !== "ringkasan-aset" || Object.hasOwn(permissions, "asset.view_financial"));
}
/** Kartu sebaran (kondisi, status, per role, per hari) → seri Grafik Mini C-33; `null` bila kartu bukan sebaran. */
export function cardSeries(id: string, value: unknown): readonly { label: string; value: number }[] | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;
    const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : 0;
    const map = (key: string, labels: Readonly<Record<string, string>>) => typeof data[key] === "object" && data[key] !== null && !Array.isArray(data[key]) ? Object.entries(data[key] as Record<string, unknown>).map(([code, v]) => ({ label: labelEnum(labels, code), value: num(v) })) : null;
    const rows = (key: string, label: string) => Array.isArray(data[key]) ? (data[key] as Record<string, unknown>[]).map((row) => ({ label: String(row[label]), value: num(row.jumlah) })) : null;
    switch (id) {
        case "pengajuan-saya": return map("per_status", LABEL_STATUS_INSTANCE_APPROVAL);
        case "komposisi-kondisi-aset": case "kondisi-aset": return map("kondisi", LABEL_KONDISI_ASET);
        case "status-aset": return map("status", LABEL_STATUS_ASET);
        case "distribusi-role": return rows("per_role", "nama");
        case "aktivitas-sistem": return rows("per_hari", "tanggal");
        default: return null;
    }
}
export function cardLines(id: string, value: unknown): readonly string[] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return ["Data kartu belum dapat ditampilkan."];
    const data = value as Record<string, unknown>;
    const n = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("id-ID").format(value) : "—";
    const map = (key: string, labels: Readonly<Record<string, string>>) => typeof data[key] === "object" && data[key] !== null ? Object.entries(data[key] as Record<string, unknown>).map(([code, value]) => `${labelEnum(labels, code)}: ${n(value)}`) : [];
    switch (id) {
        case "pekerjaan-teknisi": return [`${n(data.aktif)} pekerjaan aktif`,`${n(data.terlambat)} melewati target selesai`,...Array.isArray(data.berikutnya)?data.berikutnya.map(row=>{const w=row as Record<string,unknown>;return `${String(w.nomor)} · ${String(w.deskripsi)} · Target ${new Date(String(w.target_selesai)+"T00:00:00Z").toLocaleDateString("id-ID",{timeZone:"UTC"})}`;}):[]];
        case "total-aset": return [`${n(data.total)} unit aset aktif`];
        case "ringkasan-aset": return [`${n(data.total)} unit aset aktif`, `Nilai perolehan: ${typeof data.total_nilai === "number" || typeof data.total_nilai === "string" ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(Number(data.total_nilai)) : "—"}`];
        case "aset-belum-berlabel-qr": return [`${n(data.jumlah)} aset belum berlabel QR`];
        case "pengajuan-menunggu": case "menunggu-persetujuan-saya": return [`${n(data.jumlah)} pengajuan menunggu keputusan Anda`];
        case "pengajuan-saya": return map("per_status", LABEL_STATUS_INSTANCE_APPROVAL);
        case "komposisi-kondisi-aset": case "kondisi-aset": return map("kondisi", LABEL_KONDISI_ASET);
        case "status-aset": return map("status", LABEL_STATUS_ASET);
        case "pengguna-aktif": return [`${n(data.total)} akun aktif`, ...Array.isArray(data.per_role) ? data.per_role.map((row) => { const item = row as Record<string, unknown>; return `${String(item.nama)}: ${n(item.jumlah)}`; }) : []];
        case "login-hari-ini": return [`Berhasil: ${n(data.sukses)}`, `Gagal: ${n(data.gagal)}`];
        case "permintaan-reset-password": case "efek-tertunda-gagal": return [`${n(data.jumlah)} menunggu tindak lanjut`];
        case "status-konfigurasi": {
            const missing = Array.isArray(data.kekurangan) ? data.kekurangan : [];
            return missing.length ? missing.map((row) => String((row as Record<string, unknown>).pesan)) : ["Konfigurasi dasar lengkap."];
        }
        case "kesehatan-integrasi": { const fcm = data.fcm as { status?: string } | undefined; return [`Notifikasi push: ${fcm?.status === "up" ? "Tersedia" : fcm?.status === "down" ? "Gangguan" : "Terbatas atau belum dikonfigurasi"}`]; }
        case "distribusi-role": return Array.isArray(data.per_role) ? data.per_role.map((row) => { const item = row as Record<string, unknown>; return `${String(item.nama)}: ${n(item.jumlah)}`; }) : [];
        case "aktivitas-sistem": return Array.isArray(data.per_hari) ? data.per_hari.map((row) => { const item = row as Record<string, unknown>; return `${String(item.tanggal)}: ${n(item.jumlah)} aktivitas`; }) : [];
        case "aktivitas-terbaru": return Array.isArray(data.entri) ? data.entri.map((row) => { const item = row as Record<string, unknown>; return `${String(item.aksi)} · ${String(item.user_nama ?? "Sistem")}`; }) : [];
        default: return [`Data ${labelEnum(LABEL_JENIS_PENGAJUAN, id)} belum didukung di aplikasi.`];
    }
}
