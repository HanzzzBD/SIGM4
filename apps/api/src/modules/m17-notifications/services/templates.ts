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
    readonly judulSaat?: (p:Readonly<Record<string,unknown>>)=>string;
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
    "NT-42": { jenis: "AKUN_SISTEM", wajib: false, push: true, judul: "Ekspor siap diunduh", render: p => `Laporan ${teks(p["jenis"])} siap diunduh. File berlaku 24 jam.` },
    "NT-49": { jenis: "OPNAME_PENGADAAN", wajib: true, push: true, judul: "Stok bahan menipis", render: p => `Stok ${teks(p["bahan"])} tersisa ${teks(p["saldo"])} ${teks(p["satuan"])}, minimum ${teks(p["ambang"])}.` },
    "NT-50": { jenis: "OPNAME_PENGADAAN", wajib: false, push: true, judul: "Permintaan bahan disetujui", render: p => `Permintaan ${teks(p["nomor"])} siap diambil di ${teks(p["lokasi"])}. Saldo diperiksa saat penyerahan.` },
    "NT-51": { jenis: "OPNAME_PENGADAAN", wajib: false, push: false, judul: "Bahan diserahkan", render: p => `${teks(p["ringkasan"])} telah diserahkan pada ${teks(p["tanggal"])} untuk permintaan ${teks(p["nomor"])}.` },
    "NT-43": { jenis: "OPNAME_PENGADAAN", wajib: true, push: true, judul: "Usulan penghapusan menunggu persetujuan", render: p => `Usulan penghapusan ${teks(p["nomor"])} atas ${teks(p["n"])} unit aset menunggu persetujuan Anda.` },
    "NT-44": { jenis: "OPNAME_PENGADAAN", wajib: true, push: true, judul: "Keputusan penghapusan aset", render: p => `Usulan penghapusan ${teks(p["nomor"])} ${teks(p["status"])}.` },
    "NT-45": { jenis: "OPNAME_PENGADAAN", wajib: false, push: false, judul: "Penghapusan aset selesai", render: p => `${teks(p["n"])} unit aset telah dihapuskan. Berita acara ${teks(p["nomor"])} tersedia.` },
    "NT-34":{jenis:"OPNAME_PENGADAAN",wajib:true,push:true,judul:"Usulan pengadaan menunggu persetujuan",render:p=>`Usulan pengadaan ${teks(p["nomor"])} senilai Rp${teks(p["total"])} menunggu persetujuan Anda.`},
    "NT-35":{jenis:"OPNAME_PENGADAAN",wajib:true,push:true,judul:"Status usulan pengadaan berubah",render:p=>`Usulan ${teks(p["nomor"])} ${teks(p["status"])}.${p["catatan"]?` Catatan: ${teks(p["catatan"])}`:""}`},
    "NT-36":{jenis:"OPNAME_PENGADAAN",wajib:false,push:false,judul:"Penerimaan barang tercatat",render:p=>`${teks(p["jumlah"])} barang diterima pada usulan ${teks(p["nomor"])}; ${teks(p["jumlah_ditolak"] ?? 0)} ditolak.${p["bahan"]?` Stok bahan: ${teks(p["bahan"])}.`:""}`},
    "NT-10": { jenis: "RESERVASI_PEMINJAMAN", wajib: false, push: true, judul: "Serah terima tercatat", render: (p) => `${teks(p["jumlah"])} unit telah diserahkan atas ${teks(p["nomor"])}. Kembalikan sebelum ${waktuWib(p["tanggal"])}.` },
    "NT-14": { jenis: "RESERVASI_PEMINJAMAN", wajib: false, push: true, judul: "Pengembalian tercatat", render: (p) => `Pengembalian ${teks(p["jumlah"])} unit atas ${teks(p["nomor"])} tercatat pada ${waktuWib(p["tanggal"])}.` },
    "NT-15": { jenis: "DENDA_KEWAJIBAN", wajib: true, push: true, judul: "Kewajiban peminjaman terbit", render: (p) => p["menunggu_penetapan"] === true ? `Kewajiban ganti rugi atas ${teks(p["nomor"])} menunggu penetapan nilai.` : `${p["jenis"] === "GANTI_RUGI" ? "Ganti rugi" : "Denda keterlambatan"} Rp${teks(p["jumlah"])} terbit atas peminjaman ${teks(p["nomor"])}.` },
    // M-10 (m10-approval.md §9)
    "NT-01": {
        jenis: "PERSETUJUAN",
        wajib: true,
        push: true,
        judul: "Pengajuan reservasi baru",
        render: (p) => `Pengajuan ${pengajuan(p)} dari ${teks(p["pemohon"])} menunggu persetujuan Anda.`,
        isiPush: "Ada pengajuan reservasi baru yang menunggu persetujuan Anda.",
    },
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
    "NT-56": {
        jenis: "AKUN_SISTEM", wajib: true, push: true,
        judul: "Hasil impor jadwal tetap",
        render: (p) => `Impor jadwal tetap ${teks(p["status"])}: ${teks(p["sukses"])} berhasil, ${teks(p["gagal"])} gagal dari ${teks(p["total"])} baris.`,
    },
    "NT-55": {
        jenis: "AKUN_SISTEM", wajib: true, push: true,
        judul: "Hasil impor aset",
        render: (p) => `Impor aset ${teks(p["status"])}: ${teks(p["sukses"])} berhasil, ${teks(p["gagal"])} gagal dari ${teks(p["total"])} baris; ${teks(p["unit"])} unit dibuat.`,
    },
    // M-07 (m07-reservation-room.md §9; PR-03-10, PR-03-11)
    "NT-08": {
        jenis: "RESERVASI_PEMINJAMAN",
        wajib: true,
        push: true,
        judul: "Reservasi dibatalkan",
        render: (p) => `Reservasi ${teks(p["nomor"])} dibatalkan oleh ${teks(p["pelaku"])}. Alasan: ${teks(p["alasan"])}.`,
    },
    // M-11 (m11-damage-reports.md §9; PR-03-14)
    "NT-19": {
        jenis: "KERUSAKAN_PERAWATAN",
        wajib: true,
        push: true,
        judul: "Laporan kerusakan baru",
        render: (p) => `Laporan kerusakan ${teks(p["nomor"])} atas ${teks(p["objek"])} dari ${teks(p["pelapor"])}.`,
        isiPush: "Ada laporan kerusakan baru yang perlu diverifikasi.",
    },
    "NT-20": {
        jenis: "KERUSAKAN_PERAWATAN",
        wajib: true,
        push: true,
        judul: "Kerusakan kritis",
        render: (p) => `KRITIS: ${teks(p["objek"])} di ${teks(p["lokasi"])} dilaporkan rusak berat.`,
    },
    /** FR-11.2 langkah 5 (PR-03-15): `{hasil}` dirender konsumen dari status tiket. */
    "NT-21": {
        jenis: "KERUSAKAN_PERAWATAN",
        wajib: false,
        push: true,
        judul: "Hasil verifikasi laporan kerusakan",
        render: (p) => `Laporan ${teks(p["nomor"])} telah ${teks(p["hasil"])}.${teks(p["catatan"]) === "" ? "" : ` ${teks(p["catatan"])}`}`,
    },
    "NT-22": { jenis: "KERUSAKAN_PERAWATAN", wajib: true, push: true, judul: "Work order ditugaskan", render: p => `Work order ${teks(p["nomor"])} ditugaskan kepada Anda. Prioritas: ${teks(p["prioritas"])}.` },
    "NT-28": { jenis: "KERUSAKAN_PERAWATAN", wajib: false, push: true, judul: "Pemeliharaan preventif", render: p => `Pemeliharaan preventif ${teks(p["aset"])} dijadwalkan ${teks(p["tanggal"])}.` },
    "NT-30": { jenis: "OPNAME_PENGADAAN", wajib: false, push: true, judul: "Sesi opname dimulai", render: p => `Sesi opname ${teks(p["nama"])} dimulai. Target ${teks(p["n"])} ${p["domain"]==="BAHAN"?"pasangan bahan/lokasi":"unit aset"}.` },
    "NT-31": { jenis: "OPNAME_PENGADAAN", wajib: true, push: true, judul: "Rekonsiliasi menunggu persetujuan", render: p => `Laporan rekonsiliasi opname ${teks(p["nama"])} menunggu persetujuan Anda.` },
    "NT-32": { jenis: "OPNAME_PENGADAAN", wajib: false, push: true, judul: "Keputusan opname", render: p => `Laporan opname ${teks(p["nama"])} telah ${p["keputusan"] === "SETUJU" ? "disetujui" : "ditolak"}. ${teks(p["catatan"])}` },
    "NT-33": { jenis: "OPNAME_PENGADAAN", wajib: true, push: true, judul: "Aset dinyatakan hilang", render: p => `${teks(p["aset"])} dinyatakan hilang berdasarkan ${teks(p["referensi"])}.` },
    "NT-27": { jenis: "KERUSAKAN_PERAWATAN", wajib: true, push: true, judul: "Reservasi dibatalkan karena perbaikan", render: p => `Reservasi ${teks(p["nomor"])} dibatalkan karena ${teks(p["aset"])} sedang diperbaiki.` },
    "NT-24": {jenis:"KERUSAKAN_PERAWATAN",wajib:false,push:true,judul:"Work order memerlukan tindakan",judulSaat:p=>p["kejadian"]==="WorkOrderPaused"?"Work order tertunda":p["kejadian"]==="WorkOrderEstimateRequested"?"Persetujuan estimasi work order":"Work order menunggu verifikasi",render:p=>p["kejadian"]==="WorkOrderPaused"?`Work order ${teks(p["nomor"])} tertunda. Alasan: ${teks(p["alasan"])}`:p["kejadian"]==="WorkOrderEstimateRequested"?`Revisi estimasi work order ${teks(p["nomor"])} memerlukan persetujuan Anda.`:`Work order ${teks(p["nomor"])} selesai dikerjakan dan menunggu verifikasi.`},
    "NT-25": {jenis:"KERUSAKAN_PERAWATAN",wajib:true,push:true,judul:"Work order dikembalikan",render:p=>`Work order ${teks(p["nomor"])} dikembalikan. Catatan: ${teks(p["catatan"])}`},
    "NT-26": {jenis:"KERUSAKAN_PERAWATAN",wajib:false,push:true,judul:"Perbaikan diverifikasi",render:p=>`Perbaikan ${teks(p["aset"])} telah selesai dan diverifikasi.`},
    "NT-11": { jenis: "RESERVASI_PEMINJAMAN", wajib: true, push: true, judul: "Pengembalian jatuh tempo besok", render: (p) => `Pengembalian ${teks(p["nomor"])} jatuh tempo besok, ${teks(p["tanggal"])}.` },
    "NT-12": { jenis: "RESERVASI_PEMINJAMAN", wajib: true, push: true, judul: "Peminjaman terlambat", render: (p) => `${teks(p["nomor"])} terlambat ${teks(p["hari"])} hari. Estimasi denda berjalan Rp${teks(p["jumlah"])}.` },
    "NT-13": { jenis: "RESERVASI_PEMINJAMAN", wajib: false, push: false, judul: "Rekap keterlambatan", render: (p) => `${teks(p["jumlah"])} peminjaman terlambat perlu ditindaklanjuti.` },
    "NT-16": { jenis: "DENDA_KEWAJIBAN", wajib: false, push: false, judul: "Kewajiban lunas", render: (p) => `Kewajiban Rp${teks(p["jumlah"])} telah dinyatakan lunas.` },
    "NT-17": { jenis: "DENDA_KEWAJIBAN", wajib: false, push: false, judul: "Kewajiban dibebaskan", render: (p) => `Kewajiban Rp${teks(p["jumlah_dibebaskan"])} dibebaskan. Sisa tagihan Rp${teks(p["sisa"])}. Alasan: ${teks(p["alasan"])}.` },
    "NT-18": { jenis: "DENDA_KEWAJIBAN", wajib: true, push: true, judul: "Pengajuan diblokir", render: () => "Anda tidak dapat mengajukan reservasi/peminjaman baru hingga kewajiban diselesaikan." },
    "NT-09": {
        jenis: "RESERVASI_PEMINJAMAN", wajib: false, push: false, judul: "Reservasi kedaluwarsa",
        render: (p) => `Reservasi ${teks(p["nomor"])} kedaluwarsa karena tidak diambil dalam 1×24 jam.`,
    },
    "NT-46": {
        jenis: "RESERVASI_PEMINJAMAN",
        wajib: true,
        push: true,
        judul: "Pengajuan kedaluwarsa",
        render: (p) => `Pengajuan ${teks(p["nomor"])} kedaluwarsa karena belum diputuskan hingga batas waktu.`,
    },
};

/** SDD-08 §5: kode tanpa templat gagal saat worker menyala, bukan saat notifikasi pertama. */
export function templatUntuk(kode: string): Templat {
    const t = TEMPLAT[kode];
    if (t === undefined) throw new Error(`Templat notifikasi ${kode} tidak ada (SDD-NTF-04).`);
    return t;
}
