import type { DashboardCard } from "@sigm4/schemas";
import { approvalScreensReady } from "../../shared/capabilities";
import { LABEL_JENIS_PENGAJUAN, LABEL_KONDISI_ASET, LABEL_STATUS_ASET, LABEL_STATUS_INSTANCE_APPROVAL, labelEnum } from "@sigm4/schemas";
type Permissions = Readonly<Record<string, string>>;
export function quickActions(permissions: Permissions) {
    const actions = [
        { permission: "asset.view", label: "Scan aset", path: "/scan" },
        { permission: "approval.decide", label: "Persetujuan saya", path: approvalScreensReady ? "/persetujuan" : null },
        { permission: "reservation.create", label: "Ajukan reservasi", path: null },
        { permission: "damage.create", label: "Lapor kerusakan", path: null },
        { permission: "chatbot.use", label: "Chatbot", path: null },
    ];
    return actions.filter((action) => Object.hasOwn(permissions, action.permission));
}
export function visibleCards(cards: readonly DashboardCard[], permissions: Permissions) {
    return cards.filter((card) => card.id !== "ringkasan-aset" || Object.hasOwn(permissions, "asset.view_financial"));
}
export function cardLines(id: string, value: unknown): readonly string[] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return ["Data kartu belum dapat ditampilkan."];
    const data = value as Record<string, unknown>;
    const n = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("id-ID").format(value) : "—";
    const map = (key: string, labels: Readonly<Record<string, string>>) => typeof data[key] === "object" && data[key] !== null ? Object.entries(data[key] as Record<string, unknown>).map(([code, value]) => `${labelEnum(labels, code)}: ${n(value)}`) : [];
    switch (id) {
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
