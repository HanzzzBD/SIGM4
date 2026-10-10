// Registri kartu dashboard + templat per role (FR-15.1, Bab 19, UX §8.3; SDD-14 §4.3a,
// keputusan 82). Setiap kartu MENDEKLARASIKAN permission yang diwajibkannya; server tidak
// mengirim kartu yang permission-nya tidak dipegang (PM-03, BR-073). Kartu Bab 19 lainnya
// didaftarkan PR modul pemilik datanya.

import type { Kysely } from "kysely";
import { permintaanResetMenunggu } from "../../m01-auth/index.js";
import { penggunaAktifPerRole } from "../../m02-users/index.js";
import { ringkasanAset } from "../../m04-assets/index.js";
import { pengajuanSayaPerStatus, ringkasanAturan } from "../../m10-approval/index.js";
import { aktivitasPerHari, aktivitasTerbaru, catatAksesLogDashboard, ringkasanLogin } from "../../m18-activity-log/index.js";
import { kelengkapanKonfigurasi } from "../../m20-settings/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { ringkasanDeadLetter } from "../../../shared/events/index.js";
import type { CheckResult } from "../../../shared/observability/index.js";

export type JenisKartu = "KPI" | "AKSI" | "PERINGATAN" | "STATUS" | "GRAFIK_GARIS" | "GRAFIK_DONAT" | "GRAFIK_BATANG" | "TABEL";

export interface RentangTerhitung {
    readonly jenis: "7_hari" | "30_hari" | "semester" | "tahun_ajaran";
    readonly mulai: Date;
    /** Eksklusif. */
    readonly akhir: Date;
}

export interface LayananKartu {
    readonly db: Kysely<Database>;
    readonly audit: AuditLogger;
    /** Hasil pemeriksaan integrasi (`fcm`, kelak `llm`) — OBS-06. */
    readonly integrasi: () => Promise<Partial<Record<string, CheckResult>>>;
    /** Kotak masuk persetujuan pemanggil: jumlah + `batas` teratas (`GET /approvals/pending`). */
    readonly menungguSaya: (ctx: AuthContext, batas: number) => Promise<{ total: number; rows: readonly unknown[] }>;
}

export interface KonteksKartu {
    readonly ctx: AuthContext;
    readonly sekarang: Date;
    readonly rentang: RentangTerhitung | null;
    readonly layanan: LayananKartu;
}

export interface DefinisiKartu {
    readonly id: string;
    readonly judul: string;
    /** UX §8.2: 1 Tindakan · 2 Keadaan · 3 Kecenderungan · 4 Aksi Cepat. */
    readonly zona: 1 | 2 | 3 | 4;
    readonly jenis: JenisKartu;
    /** Seluruhnya wajib dipegang (PM-03). */
    readonly permissions: readonly string[];
    /** `GLOBAL`: isi sama bagi semua yang berhak (cache bersama); `PENGGUNA`: isi milik pemanggil. */
    readonly lingkup: "GLOBAL" | "PENGGUNA";
    /** Memakai rentang terpilih (keputusan 82h); selainnya keadaan kini / "hari ini". */
    readonly berperiode: boolean;
    /** Sasaran drill-down UX §8.3 (FR-15.1 AC 2). */
    readonly drilldown: string | null;
    muat(k: KonteksKartu): Promise<unknown>;
    /** Dijalankan SETIAP penyajian, termasuk dari cache (keputusan 82f). */
    catatAkses?(scope: TransactionScope, audit: AuditLogger, isi: unknown): Promise<void>;
}

const baca = <T>(k: KonteksKartu, f: (s: TransactionScope) => Promise<T>): Promise<T> => withTransaction(k.ctx, f, k.layanan.db);
const JAM = 3_600_000;
const aset = (k: KonteksKartu) => baca(k, ringkasanAset);
const menunggu = async (k: KonteksKartu) => {
    const h = await k.layanan.menungguSaya(k.ctx, 5);
    return { jumlah: h.total, daftar: h.rows };
};

const DAFTAR: readonly DefinisiKartu[] = [
    // --- 19.2 Administrator
    {
        id: "permintaan-reset-password", judul: "Permintaan Reset Password", zona: 1, jenis: "AKSI", permissions: ["user.reset_password"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-67",
        muat: (k) => baca(k, (s) => permintaanResetMenunggu(s, 5)),
    },
    {
        id: "status-konfigurasi", judul: "Status Konfigurasi", zona: 1, jenis: "STATUS", permissions: ["approval_rule.view", "setting.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-68 · P-70",
        muat: (k) =>
            baca(k, async (s) => {
                const aturan = await ringkasanAturan(s);
                const dasar = await kelengkapanKonfigurasi(s);
                // Keputusan 82g: kelengkapan dasar, bukan "masih bernilai bawaan".
                const kekurangan = [
                    ...(dasar.tahunAjaranAktif ? [] : [{ kode: "TAHUN_AJARAN_AKTIF_BELUM_ADA", pesan: "Belum ada tahun ajaran aktif." }]),
                    ...(dasar.hariKerjaAktif > 0 ? [] : [{ kode: "HARI_KERJA_BELUM_ADA", pesan: "Belum ada hari kerja aktif." }]),
                    ...dasar.teksKosong.map((key) => ({ kode: "PARAMETER_KOSONG", pesan: `Parameter ${key} belum diisi.` })),
                ];
                return { aturan_aktif: aturan.aktif, jenis_tanpa_aturan: aturan.tanpa_aturan, kekurangan };
            }),
    },
    {
        id: "kesehatan-integrasi", judul: "Kesehatan Integrasi", zona: 1, jenis: "STATUS", permissions: ["setting.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-70",
        muat: async (k) => ({ fcm: (await k.layanan.integrasi())["fcm"] ?? null }),
    },
    {
        id: "efek-tertunda-gagal", judul: "Efek Tertunda Gagal", zona: 1, jenis: "PERINGATAN", permissions: ["setting.manage"],
        lingkup: "GLOBAL", berperiode: false, drilldown: null,
        muat: (k) => baca(k, (s) => ringkasanDeadLetter(s, 5)),
    },
    {
        id: "pengguna-aktif", judul: "Total Pengguna Aktif", zona: 2, jenis: "KPI", permissions: ["user.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-60?filter[status]=AKTIF",
        muat: async (k) => {
            const per = await baca(k, penggunaAktifPerRole);
            return { total: per.reduce((n, r) => n + r.jumlah, 0), per_role: per };
        },
    },
    {
        id: "login-hari-ini", judul: "Login Hari Ini", zona: 2, jenis: "KPI", permissions: ["activity_log.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-73?filter[aksi]=LOGIN_SUCCESS,LOGIN_FAILED",
        muat: (k) => baca(k, (s) => ringkasanLogin(s, new Date(k.sekarang.getTime() - 24 * JAM))),
    },
    {
        id: "distribusi-role", judul: "Distribusi Role", zona: 3, jenis: "GRAFIK_DONAT", permissions: ["user.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-60",
        muat: async (k) => ({ per_role: await baca(k, penggunaAktifPerRole) }),
    },
    {
        id: "aktivitas-sistem", judul: "Aktivitas Sistem", zona: 3, jenis: "GRAFIK_GARIS", permissions: ["activity_log.view"],
        lingkup: "GLOBAL", berperiode: true, drilldown: "P-73",
        muat: async (k) => ({ per_hari: await baca(k, (s) => aktivitasPerHari(s, k.rentang!.mulai, k.rentang!.akhir)) }),
    },
    {
        id: "aktivitas-terbaru", judul: "Aktivitas Terbaru", zona: 3, jenis: "TABEL", permissions: ["activity_log.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-74",
        muat: async (k) => ({ entri: await baca(k, (s) => aktivitasTerbaru(s, 10)) }),
        catatAkses: (s, audit, isi) => catatAksesLogDashboard(s, audit, "aktivitas-terbaru", (isi as { entri: readonly unknown[] }).entri.length),
    },
    // --- 19.3 Petugas Sarana Prasarana
    {
        id: "pengajuan-menunggu", judul: "Pengajuan Menunggu Persetujuan", zona: 1, jenis: "AKSI", permissions: ["approval.decide"],
        lingkup: "PENGGUNA", berperiode: false, drilldown: "P-37", muat: menunggu,
    },
    {
        id: "aset-belum-berlabel-qr", judul: "Aset Belum Berlabel QR", zona: 1, jenis: "PERINGATAN", permissions: ["asset.qr_print"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-24?filter[qr_terpasang]=false",
        muat: async (k) => ({ jumlah: (await aset(k)).belum_berlabel_qr }),
    },
    {
        id: "total-aset", judul: "Total Aset", zona: 2, jenis: "KPI", permissions: ["asset.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-15", muat: async (k) => ({ total: (await aset(k)).total }),
    },
    {
        id: "komposisi-kondisi-aset", judul: "Komposisi Kondisi Aset", zona: 3, jenis: "GRAFIK_DONAT", permissions: ["asset.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-15", muat: async (k) => ({ kondisi: (await aset(k)).kondisi }),
    },
    {
        id: "status-aset", judul: "Status Aset", zona: 3, jenis: "GRAFIK_BATANG", permissions: ["asset.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-15", muat: async (k) => ({ status: (await aset(k)).status }),
    },
    // --- 19.4 Pimpinan Sekolah
    {
        id: "menunggu-persetujuan-saya", judul: "Menunggu Persetujuan Saya", zona: 1, jenis: "AKSI", permissions: ["approval.decide"],
        lingkup: "PENGGUNA", berperiode: false, drilldown: "P-37", muat: menunggu,
    },
    {
        // Memuat total nilai perolehan → kartu finansial (BR-073).
        id: "ringkasan-aset", judul: "Ringkasan Aset", zona: 2, jenis: "KPI", permissions: ["asset.view", "asset.view_financial"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-15",
        muat: async (k) => {
            const a = await aset(k);
            return { total: a.total, total_nilai: a.total_nilai };
        },
    },
    {
        id: "kondisi-aset", judul: "Kondisi Aset", zona: 3, jenis: "GRAFIK_DONAT", permissions: ["asset.view"],
        lingkup: "GLOBAL", berperiode: false, drilldown: "P-15", muat: async (k) => ({ kondisi: (await aset(k)).kondisi }),
    },
    // --- 19.6 Guru & Staf/TU · 19.7 Siswa/OSIS
    {
        id: "pengajuan-saya", judul: "Pengajuan Saya", zona: 2, jenis: "KPI", permissions: ["approval.view"],
        lingkup: "PENGGUNA", berperiode: true, drilldown: "P-30?saya=true", // UX §8.3 "P-30 scope own" (PR-03-27)
        muat: async (k) => ({ per_status: await baca(k, (s) => pengajuanSayaPerStatus(s, k.rentang!.mulai, k.rentang!.akhir)) }),
    },
];

export const KARTU: ReadonlyMap<string, DefinisiKartu> = new Map(DAFTAR.map((d) => [d.id, d]));

/**
 * Templat tata letak per kode role (Bab 19.2–19.7, urutan UX §8.3). Role tanpa templat —
 * role kustom, atau Teknisi yang kartunya bersumber work order (M-13) — mendapat manifes
 * kosong (keputusan 82e).
 */
export const TEMPLAT: Readonly<Record<string, readonly string[]>> = {
    "R-01": [
        "permintaan-reset-password", "status-konfigurasi", "kesehatan-integrasi", "efek-tertunda-gagal",
        "pengguna-aktif", "login-hari-ini", "distribusi-role", "aktivitas-sistem", "aktivitas-terbaru",
    ],
    "R-02": ["pengajuan-menunggu", "aset-belum-berlabel-qr", "total-aset", "komposisi-kondisi-aset", "status-aset"],
    "R-03": ["menunggu-persetujuan-saya", "ringkasan-aset", "kondisi-aset"],
    "R-04": [],
    "R-05": ["pengajuan-saya"],
    "R-06": ["pengajuan-saya"],
    "R-07": ["pengajuan-saya"],
};
