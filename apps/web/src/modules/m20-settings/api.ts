// Kontrak M-20 di klien web (m20 §7; FR-20.1, Lampiran E.2/E.3; PR-01-24). Respons diurai skema `zod/mini`
// (SDD-FE-05). Kunci kueri `['academic-years', …]` dan `['work-units', …]` dipakai bersama pemilih M-02 (P-60,
// P-61, P-64): setiap mutasi di sini menginvalidasi SELURUH prefiksnya, bukan hanya kueri halaman ini.

import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ApiError, api } from "../../shared/api";

/** Urutan tab P-70 = urutan enum `KelompokSchema` (m20 §7). */
export const KELOMPOK = ["IDENTITAS_SEKOLAH", "KODE_ASET", "PEMINJAMAN", "DENDA", "RESERVASI", "MAINTENANCE", "BAHAN", "NOTIFIKASI", "KEAMANAN", "CHATBOT_AI"] as const;
export type Kelompok = (typeof KELOMPOK)[number];
/** Bab 11.3 "Kelompok Parameter Sistem". */
export const LABEL_KELOMPOK: Record<Kelompok, string> = {
    IDENTITAS_SEKOLAH: "Identitas Sekolah",
    KODE_ASET: "Kode Aset",
    PEMINJAMAN: "Peminjaman",
    DENDA: "Denda",
    RESERVASI: "Reservasi",
    MAINTENANCE: "Maintenance",
    BAHAN: "Bahan",
    NOTIFIKASI: "Notifikasi",
    KEAMANAN: "Keamanan",
    CHATBOT_AI: "Chatbot AI",
};
/** FR-20.1 A2/A3: perubahan yang tidak berlaku surut — diperingatkan sebelum disimpan. */
export const PERINGATAN_DAMPAK: Partial<Record<Kelompok, string>> = {
    KODE_ASET: "Format kode baru hanya berlaku untuk aset yang didaftarkan sesudah perubahan; kode aset yang sudah ada tidak berubah.",
    DENDA: "Tarif dan batas baru berlaku untuk peminjaman yang diserahterimakan sesudah perubahan. Kebijakan peminjaman yang sudah berjalan dan denda yang sudah terbit tetap memakai nilai tersimpan.",
};

const Meta = z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() });

/** Seluruh halaman (per_page maksimum 100, Bab 17.1). */
async function semuaHalaman<T>(ambil: (page: number) => Promise<{ readonly data: readonly T[]; readonly meta: { readonly total_pages: number } }>): Promise<T[]> {
    const hasil: T[] = [];
    for (let page = 1; ; page++) {
        const h = await ambil(page);
        hasil.push(...h.data);
        if (page >= h.meta.total_pages) return hasil;
    }
}

const Parameter = z.object({
    key: z.string(),
    kelompok: z.enum(KELOMPOK),
    tipe: z.enum(["BILANGAN_BULAT", "DESIMAL", "BOOLEAN", "TEKS"]),
    value: z.unknown(),
    nilai_bawaan: z.unknown(),
    nilai_min: z.nullable(z.number()),
    nilai_maks: z.nullable(z.number()),
    deskripsi: z.string(),
    updated_at: z.string(),
    updated_by: z.nullable(z.string()),
});
export type Parameter = z.infer<typeof Parameter>;

export const parameterQuery = (kelompok: Kelompok) =>
    queryOptions({
        queryKey: ["settings", kelompok],
        queryFn: () => semuaHalaman(async (page) => z.object({ data: z.array(Parameter), meta: Meta }).parse((await api.get("/settings", { params: { page, per_page: 100, "filter[kelompok]": kelompok } })).data)),
    });

/** `PUT /settings` — hanya kunci yang berubah (FR-20.1 langkah 3). */
export async function simpanParameter(settings: Readonly<Record<string, unknown>>) {
    return z.object({ data: z.array(Parameter) }).parse((await api.put("/settings", { settings })).data).data;
}

const Semester = z.object({ id: z.string(), nama: z.enum(["GANJIL", "GENAP"]), tanggal_mulai: z.string(), tanggal_selesai: z.string() });
const Tahun = z.object({ id: z.string(), nama: z.string(), tanggal_mulai: z.string(), tanggal_selesai: z.string(), is_active: z.boolean(), semester: z.array(Semester) });
export type TahunAjaran = z.infer<typeof Tahun>;
/** Bab 11.3 "Nama Semester". */
export const LABEL_SEMESTER = { GANJIL: "Ganjil", GENAP: "Genap" } as const;

export const tahunQuery = queryOptions({
    queryKey: ["academic-years", "lengkap"],
    queryFn: () => semuaHalaman(async (page) => z.object({ data: z.array(Tahun), meta: Meta }).parse((await api.get("/academic-years", { params: { page, per_page: 100 } })).data)),
});

export interface IsianTahun {
    readonly nama: string;
    readonly tanggal_mulai: string;
    readonly tanggal_selesai: string;
    readonly semester: readonly { readonly nama: "GANJIL" | "GENAP"; readonly tanggal_mulai: string; readonly tanggal_selesai: string }[];
}

export async function buatTahun(body: IsianTahun) {
    return z.object({ data: Tahun }).parse((await api.post("/academic-years", body)).data).data;
}
export async function ubahTahun(id: string, body: IsianTahun) {
    return z.object({ data: Tahun }).parse((await api.put(`/academic-years/${id}`, body)).data).data;
}
/** AC-YR-02: tepat satu tahun ajaran aktif. */
export async function aktifkanTahun(id: string) {
    return z.object({ data: Tahun }).parse((await api.patch(`/academic-years/${id}/activate`)).data).data;
}

export const JENIS_LIBUR = ["NASIONAL", "SEKOLAH", "CUTI_BERSAMA"] as const;
export type JenisLibur = (typeof JENIS_LIBUR)[number];
export const LABEL_JENIS_LIBUR: Record<JenisLibur, string> = { NASIONAL: "Nasional", SEKOLAH: "Sekolah", CUTI_BERSAMA: "Cuti Bersama" };
const Libur = z.object({ id: z.string(), tanggal: z.string(), nama: z.string(), jenis: z.enum(JENIS_LIBUR), academic_year_id: z.nullable(z.string()) });
export type Libur = z.infer<typeof Libur>;

/**
 * SELURUH hari libur, tanpa `filter[academic_year_id]`: hari libur berlaku umum (`academic_year_id` null,
 * SDD-05 §4.7b) dipakai perhitungan hari kerja tetapi tidak cocok dengan saringan per tahun — tanpa ini ia
 * tak terlihat dan tak dapat diubah. Penyaringan per tahun dilakukan di klien.
 */
export const liburQuery = queryOptions({
    queryKey: ["holidays", "semua"],
    queryFn: () => semuaHalaman(async (page) => z.object({ data: z.array(Libur), meta: Meta }).parse((await api.get("/holidays", { params: { page, per_page: 100 } })).data)),
});

export interface IsianLibur {
    readonly tanggal: string;
    readonly nama: string;
    readonly jenis: JenisLibur;
    /** null = berlaku umum (lintas tahun ajaran); dipertahankan saat diubah. */
    readonly academic_year_id: number | null;
}
export async function buatLibur(body: IsianLibur) {
    return z.object({ data: Libur }).parse((await api.post("/holidays", body)).data).data;
}
export async function ubahLibur(id: string, body: IsianLibur) {
    return z.object({ data: Libur }).parse((await api.put(`/holidays/${id}`, body)).data).data;
}
export async function hapusLibur(id: string): Promise<void> {
    await api.delete(`/holidays/${id}`);
}

/** ISO-8601: 1 = Senin … 7 = Minggu (`work_days.hari`). */
export const NAMA_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] as const;
const HariKerja = z.object({ hari: z.number(), aktif: z.boolean() });
export const hariKerjaQuery = queryOptions({
    queryKey: ["work-days"],
    queryFn: async () => z.object({ data: z.array(HariKerja) }).parse((await api.get("/work-days")).data).data,
});
export async function simpanHariKerja(hari_kerja: readonly { readonly hari: number; readonly aktif: boolean }[]) {
    return z.object({ data: z.array(HariKerja) }).parse((await api.put("/work-days", { hari_kerja })).data).data;
}

export const JENIS_UNIT = ["MANAJEMEN", "MATA_PELAJARAN", "TATA_USAHA", "EKSTRAKURIKULER", "KELAS"] as const;
export type JenisUnit = (typeof JENIS_UNIT)[number];
/** Lampiran E.3 jenis unit kerja. */
export const LABEL_JENIS_UNIT: Record<JenisUnit, string> = { MANAJEMEN: "Manajemen", MATA_PELAJARAN: "Mata Pelajaran", TATA_USAHA: "Tata Usaha", EKSTRAKURIKULER: "Ekstrakurikuler", KELAS: "Kelas" };
export const STATUS_UNIT = ["AKTIF", "NONAKTIF"] as const;
export type StatusUnit = (typeof STATUS_UNIT)[number];
export const LABEL_STATUS_UNIT: Record<StatusUnit, string> = { AKTIF: "Aktif", NONAKTIF: "Nonaktif" };
const Unit = z.object({ id: z.string(), nama: z.string(), kode: z.string(), jenis: z.enum(JENIS_UNIT), kepala_unit_id: z.nullable(z.string()), status: z.enum(STATUS_UNIT) });
export type Unit = z.infer<typeof Unit>;

export interface SaringanUnit {
    readonly jenis?: JenisUnit | undefined;
    readonly status?: StatusUnit | undefined;
    readonly page?: number | undefined;
}
export const daftarUnitQuery = (s: SaringanUnit) =>
    queryOptions({
        queryKey: ["work-units", "daftar", s],
        queryFn: async () => {
            const params: Record<string, string | number> = { page: s.page ?? 1, per_page: 25 };
            if (s.jenis !== undefined) params["filter[jenis]"] = s.jenis;
            if (s.status !== undefined) params["filter[status]"] = s.status;
            return z.object({ data: z.array(Unit), meta: Meta }).parse((await api.get("/work-units", { params })).data);
        },
    });

export interface IsianUnit {
    readonly nama: string;
    readonly kode: string;
    readonly jenis: JenisUnit;
    /** PUT pengganti penuh: kepala unit yang sudah ada WAJIB dikirim ulang, kalau tidak terhapus. */
    readonly kepala_unit_id?: number | null;
}
export async function buatUnit(body: IsianUnit) {
    return z.object({ data: Unit }).parse((await api.post("/work-units", body)).data).data;
}
export async function ubahUnit(id: string, body: IsianUnit) {
    return z.object({ data: Unit }).parse((await api.put(`/work-units/${id}`, body)).data).data;
}
export async function ubahStatusUnit(id: string, status: StatusUnit) {
    return z.object({ data: Unit }).parse((await api.patch(`/work-units/${id}/status`, { status })).data).data;
}

/** Invalidasi prefiks bersama (pemilih M-02 ikut segar); di-`await` sebelum serah-terima ke P-64. */
export const segarkanTahun = (qc: QueryClient) => Promise.all([qc.invalidateQueries({ queryKey: ["academic-years"] }), qc.invalidateQueries({ queryKey: ["holidays"] })]);
export const segarkanUnit = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["work-units"] });

/** Galat server → per isian + pesan umum (`error.details`). */
export function galatIsian(g: unknown): { readonly isian: Readonly<Record<string, string>>; readonly umum: string | null } {
    if (!(g instanceof ApiError)) return { isian: {}, umum: g instanceof Error ? g.message : "Perubahan belum tersimpan. Coba lagi." };
    return { isian: Object.fromEntries(g.details.map((d) => [d.field, d.message])), umum: g.details.length === 0 ? g.message : null };
}
export const pesanGalat = (g: unknown): string => {
    const r = galatIsian(g);
    return r.umum ?? Object.values(r.isian).join(" ");
};

const TANGGAL = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium" });
const WAKTU = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
/** Tanggal kalender (YYYY-MM-DD) — dibaca sebagai tanggal WIB, bukan instan UTC. */
export const tanggalId = (ymd: string) => TANGGAL.format(new Date(`${ymd.slice(0, 10)}T00:00:00+07:00`));
export const waktuWib = (iso: string) => `${WAKTU.format(new Date(iso))} WIB`;
