// Templat notifikasi berkunci kode NT (SDD-NTF-04, SDD-08 §4.2a/§4.5): konstanta kode,
// bukan baris basis data — isi mengikuti Bab 20 (notifications-index) dan perubahannya
// melewati review. `jenis` = kelompok preferensi (UXD-05); seluruh kode di sini wajib.

import type { KelompokNotifikasi } from "../../../shared/db/index.js";

export interface Templat {
    readonly jenis: KelompokNotifikasi;
    readonly wajib: boolean;
    /** Kolom **Kanal** katalog: `true` = "In-app + Push"; "In-app" tak pernah dipush (keputusan 87b). */
    readonly push: boolean;
    readonly judul: string;
    render(p: Readonly<Record<string, unknown>>): string;
    /** Isi push bila isi in-app menyebut identitas pengguna lain — aman di layar terkunci (SDD-08 §4.2, keputusan 87c). */
    readonly isiPush?: string;
}

const teks = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");
/** `{waktu}` — PATTERNS §5.3: "12 Agustus 2026 08.00 WIB"; parameter disimpan ISO, dirender saat terbit. */
export function waktuWib(iso: unknown): string {
    const d = new Date(teks(iso));
    if (Number.isNaN(d.getTime())) return "";
    const bagian = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...o }).format(d);
    return `${bagian({ day: "numeric", month: "long", year: "numeric" })} ${bagian({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(":", ".")} WIB`;
}

const PLATFORM: Readonly<Record<string, string>> = { WEB: "Web", ANDROID: "Android", IOS: "iOS" };

/** `{nomor}` pengajuan — `label` dari penyedia rincian atau render generik (keputusan 78). */
const pengajuan = (p: Readonly<Record<string, unknown>>) => teks(p["label"]);

export const TEMPLAT: Readonly<Record<string, Templat>> = {
    // M-10 (m10-approval.md §9)
    "NT-02": {
        jenis: "PERSETUJUAN",
        wajib: true,
        push: true,
        judul: "Pengajuan disetujui",
        render: (p) => `${pengajuan(p)}${p["objek"] ? ` untuk ${teks(p["objek"])}` : ""}${p["tanggal"] ? ` pada ${teks(p["tanggal"])}` : ""} telah disetujui.`,
    },
    "NT-03": { jenis: "PERSETUJUAN", wajib: true, push: true, judul: "Pengajuan ditolak", render: (p) => `${pengajuan(p)} ditolak. Alasan: ${teks(p["alasan"])}.` },
    "NT-04": { jenis: "PERSETUJUAN", wajib: true, push: true, judul: "Pengajuan perlu revisi", render: (p) => `${pengajuan(p)} perlu direvisi. Catatan: ${teks(p["catatan"])}.` },
    "NT-05": { jenis: "PERSETUJUAN", wajib: true, push: true, judul: "Menunggu persetujuan Anda", render: (p) => `${pengajuan(p)} menunggu persetujuan Anda.` },
    "NT-06": { jenis: "PERSETUJUAN", wajib: true, push: true, judul: "SLA persetujuan terlampaui", render: (p) => `${pengajuan(p)} melewati batas waktu persetujuan.` },
    "NT-07": { jenis: "PERSETUJUAN", wajib: true, push: true, judul: "Pengajuan dieskalasi", render: (p) => `${pengajuan(p)} dieskalasikan kepada Anda.` },
    "NT-47": {
        jenis: "PERSETUJUAN",
        wajib: true,
        push: true,
        judul: "Persetujuan memerlukan tindakan manual",
        render: (p) => `${pengajuan(p)} tidak diputuskan hingga eskalasi terakhir dan memerlukan tindakan manual.`,
    },
    // M-01 (m01-auth.md §9; PR-02-35, keputusan 87)
    "NT-37": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        push: true,
        judul: "Permintaan reset password",
        render: (p) => `${teks(p["pengguna"])} mengajukan reset password.`,
        isiPush: "Ada permintaan reset password baru.",
    },
    "NT-38": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        push: false,
        judul: "Password sementara diterbitkan",
        render: (p) => `Password sementara untuk ${teks(p["pengguna"])} diterbitkan ${waktuWib(p["waktu"])}. Serahkan langsung kepada yang bersangkutan.`,
    },
    "NT-38a": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        push: true,
        judul: "Password diperbarui",
        render: (p) => `Password Anda berhasil diperbarui pada ${waktuWib(p["waktu"])}. Bila ini bukan Anda, segera hubungi Administrator.`,
    },
    "NT-39": { jenis: "AKUN_SISTEM", wajib: true, push: false, judul: "Akun terkunci sementara", render: (p) => `Akun ${teks(p["pengguna"])} terkunci sementara akibat 5 percobaan login gagal.` },
    "NT-39a": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        push: false,
        judul: "2FA diaktifkan",
        render: (p) =>
            `${teks(p["pengguna"])} mengaktifkan 2FA pada ${waktuWib(p["waktu"])}${PLATFORM[teks(p["platform"])] === undefined ? "" : ` dari ${PLATFORM[teks(p["platform"])] ?? ""}`}. Bila pengguna tidak mengenalinya, reset 2FA dari detail pengguna.`,
    },
    "NT-53": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        push: true,
        judul: "Pemulihan darurat Administrator",
        render: (p) => `Pemulihan darurat dijalankan untuk akun Administrator ${teks(p["email"])} pada ${waktuWib(p["waktu"])}. Seluruh sesi di sistem telah dikeluarkan; pastikan ini sah.`,
        isiPush: "Pemulihan darurat Administrator dijalankan — periksa segera.",
    },
    "NT-54": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        push: true,
        judul: "Pemakaian ulang token sesi",
        render: (p) => `Pemakaian ulang token sesi terdeteksi pada akun ${teks(p["pengguna"])} pada ${waktuWib(p["waktu"])}. Seluruh sesi turunannya telah dicabut; bila berulang, periksa akun ini.`,
        isiPush: "Pemakaian ulang token sesi terdeteksi — periksa segera.",
    },
    // M-02 (m02-users.md §9)
    "NT-40": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        push: false,
        judul: "Akun Anda diubah",
        render: (p) => (p["role"] ? `Role akun Anda diubah menjadi ${teks(p["role"])}.` : `Status akun Anda diubah menjadi ${teks(p["status"])}.`),
    },
    "NT-48": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        push: false,
        judul: "Persetujuan wali belum terekam",
        render: (p) => `Akun siswa ${teks(p["nama"])} tidak dapat diaktifkan: persetujuan wali belum terekam (DP-02).`,
    },
    "NT-52": {
        jenis: "AKUN_SISTEM",
        wajib: true,
        push: false,
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
