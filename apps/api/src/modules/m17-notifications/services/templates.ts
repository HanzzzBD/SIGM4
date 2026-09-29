// Templat notifikasi berkunci kode NT (SDD-NTF-04, SDD-08 §4.2a/§4.5): konstanta kode,
// bukan baris basis data — isi mengikuti Bab 20 (notifications-index) dan perubahannya
// melewati review. `jenis` = kelompok preferensi (UXD-05); seluruh kode di sini wajib.

import type { KelompokNotifikasi } from "../../../shared/db/index.js";

export interface Templat {
    readonly jenis: KelompokNotifikasi;
    readonly wajib: boolean;
    readonly judul: string;
    render(p: Readonly<Record<string, unknown>>): string;
}

const teks = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");
/** `{nomor}` pengajuan — `label` dari penyedia rincian atau render generik (keputusan 78). */
const pengajuan = (p: Readonly<Record<string, unknown>>) => teks(p["label"]);

export const TEMPLAT: Readonly<Record<string, Templat>> = {
    // M-10 (m10-approval.md §9)
    "NT-02": {
        jenis: "PERSETUJUAN",
        wajib: true,
        judul: "Pengajuan disetujui",
        render: (p) => `${pengajuan(p)}${p["objek"] ? ` untuk ${teks(p["objek"])}` : ""}${p["tanggal"] ? ` pada ${teks(p["tanggal"])}` : ""} telah disetujui.`,
    },
    "NT-03": { jenis: "PERSETUJUAN", wajib: true, judul: "Pengajuan ditolak", render: (p) => `${pengajuan(p)} ditolak. Alasan: ${teks(p["alasan"])}.` },
    "NT-04": { jenis: "PERSETUJUAN", wajib: true, judul: "Pengajuan perlu revisi", render: (p) => `${pengajuan(p)} perlu direvisi. Catatan: ${teks(p["catatan"])}.` },
    "NT-05": { jenis: "PERSETUJUAN", wajib: true, judul: "Menunggu persetujuan Anda", render: (p) => `${pengajuan(p)} menunggu persetujuan Anda.` },
    "NT-06": { jenis: "PERSETUJUAN", wajib: true, judul: "SLA persetujuan terlampaui", render: (p) => `${pengajuan(p)} melewati batas waktu persetujuan.` },
    "NT-07": { jenis: "PERSETUJUAN", wajib: true, judul: "Pengajuan dieskalasi", render: (p) => `${pengajuan(p)} dieskalasikan kepada Anda.` },
    "NT-47": {
        jenis: "PERSETUJUAN",
        wajib: true,
        judul: "Persetujuan memerlukan tindakan manual",
        render: (p) => `${pengajuan(p)} tidak diputuskan hingga eskalasi terakhir dan memerlukan tindakan manual.`,
    },
    // M-02 (m02-users.md §9)
    "NT-40": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        judul: "Akun Anda diubah",
        render: (p) => (p["role"] ? `Role akun Anda diubah menjadi ${teks(p["role"])}.` : `Status akun Anda diubah menjadi ${teks(p["status"])}.`),
    },
    "NT-48": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        judul: "Persetujuan wali belum terekam",
        render: (p) => `Akun siswa ${teks(p["nama"])} tidak dapat diaktifkan: persetujuan wali belum terekam (DP-02).`,
    },
    "NT-52": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        judul: "Impor pengguna selesai",
        render: (p) => `Impor pengguna selesai: ${teks(p["sukses"])} berhasil, ${teks(p["gagal"])} gagal dari ${teks(p["total"])} baris.`,
    },
};

/** SDD-08 §5: kode tanpa templat gagal saat worker menyala, bukan saat notifikasi pertama. */
export function templatUntuk(kode: string): Templat {
    const t = TEMPLAT[kode];
    if (t === undefined) throw new Error(`Templat notifikasi ${kode} tidak ada (SDD-NTF-04).`);
    return t;
}
