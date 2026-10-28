// Kontrak M-02 di klien web (m02 §7; FR-02.1, SL-02, FR-01.3 A5, FR-01.5 A3/A7; PR-01-19). Respons diurai
// skema `zod/mini` sebelum dipakai (SDD-FE-05); master data M-20 dibaca hanya bila izinnya dipegang (§1a rencana).

import { queryOptions } from "@tanstack/react-query";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ApiError, api } from "../../shared/api";

export const STATUS_PENGGUNA = ["AKTIF", "NONAKTIF"] as const;
export type StatusPengguna = (typeof STATUS_PENGGUNA)[number];
/** Bab 11.3 "Status Pengguna". */
export const LABEL_STATUS: Record<StatusPengguna, string> = { AKTIF: "Aktif", NONAKTIF: "Nonaktif" };

export const METODE_VERIFIKASI = ["KARTU_IDENTITAS_TATAP_MUKA", "KONFIRMASI_ATASAN_ATAU_WALI_KELAS"] as const;
export type MetodeVerifikasi = (typeof METODE_VERIFIKASI)[number];
/** Bab 11.3 "Metode Verifikasi Identitas". */
export const LABEL_METODE: Record<MetodeVerifikasi, string> = { KARTU_IDENTITAS_TATAP_MUKA: "Kartu Identitas Tatap Muka", KONFIRMASI_ATASAN_ATAU_WALI_KELAS: "Konfirmasi Atasan atau Wali Kelas" };

/** Role Siswa (R-07): consent wali wajib (DP-02) dan sasaran kenaikan kelas (SL-02). */
export const KODE_ROLE_SISWA = "R-07";

const Pengguna = z.object({
    id: z.string(),
    nama: z.string(),
    email: z.string(),
    nip_nis: z.nullable(z.string()),
    deactivated_at: z.optional(z.nullable(z.string())),
    pseudonymized_at: z.optional(z.nullable(z.string())),
    role_id: z.string(),
    work_unit_id: z.nullable(z.string()),
    telepon: z.nullable(z.string()),
    status: z.enum(STATUS_PENGGUNA),
    must_change_password: z.boolean(),
    login_terakhir_pada: z.nullable(z.string()),
    consent_guardian_at: z.nullable(z.string()),
    created_at: z.string(),
    updated_at: z.string(),
});
export type Pengguna = z.infer<typeof Pengguna>;

const Meta = z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() });
const Daftar = z.object({ data: z.array(Pengguna), meta: Meta });
const Satu = <T extends z.ZodMiniType>(s: T) => z.object({ data: s });

export interface SaringanPengguna {
    readonly role?: string | undefined;
    readonly status?: StatusPengguna | undefined;
    readonly unit?: string | undefined;
    readonly page?: number | undefined;
}

/** Saringan dikirim sebagai `filter[kunci]` (Bab 17.1; controller membacanya mentah). */
export const daftarPenggunaQuery = (s: SaringanPengguna, perPage = 25) =>
    queryOptions({
        queryKey: ["users", "daftar", s, perPage],
        queryFn: async () => {
            const params: Record<string, string | number> = { page: s.page ?? 1, per_page: perPage };
            if (s.role !== undefined) params["filter[role_id]"] = s.role;
            if (s.status !== undefined) params["filter[status]"] = s.status;
            if (s.unit !== undefined) params["filter[work_unit_id]"] = s.unit;
            return Daftar.parse((await api.get("/users", { params })).data);
        },
    });

const bukanUlang = (e: unknown) => e instanceof ApiError && (e.status === 403 || e.status === 404);

export const penggunaQuery = (id: string) =>
    queryOptions({
        queryKey: ["users", id],
        queryFn: async () => Satu(Pengguna).parse((await api.get(`/users/${id}`)).data).data,
        retry: (n, e) => !bukanUlang(e) && n < 2,
    });

const Role = z.object({ id: z.string(), kode: z.string(), nama: z.string() });
export type RingkasRole = z.infer<typeof Role>;
/** `GET /roles` — hanya bagi pemegang `role.view`. */
export const roleQuery = queryOptions({
    queryKey: ["roles", "ringkas"],
    staleTime: 5 * 60_000,
    queryFn: async () => z.object({ data: z.array(Role) }).parse((await api.get("/roles")).data).data,
});

const Unit = z.object({ id: z.string(), nama: z.string(), kode: z.string(), jenis: z.string(), status: z.string() });
export type Unit = z.infer<typeof Unit>;
const HalamanUnit = z.object({ data: z.array(Unit), meta: Meta });

/** Seluruh halaman (per_page maksimum 100, Bab 17.1): pilihan tidak terpotong di halaman pertama. */
async function semuaHalaman<T>(ambil: (page: number) => Promise<{ readonly data: readonly T[]; readonly meta: { readonly total_pages: number } }>): Promise<T[]> {
    const hasil: T[] = [];
    for (let page = 1; ; page++) {
        const h = await ambil(page);
        hasil.push(...h.data);
        if (page >= h.meta.total_pages) return hasil;
    }
}

/**
 * `GET /work-units` — hanya bagi pemegang `setting.view`; `jenis=KELAS` untuk pilihan kelas (SL-02). Termasuk unit
 * NONAKTIF: penugasan lama ke unit nonaktif tetap sah (WU-02) dan namanya harus tetap terbaca; pilihan baru
 * disaring ke yang AKTIF oleh pemakainya.
 */
export const unitQuery = (jenis?: string) =>
    queryOptions({
        queryKey: ["work-units", jenis ?? "semua"],
        staleTime: 5 * 60_000,
        queryFn: () =>
            semuaHalaman(async (page) => {
                const params: Record<string, string | number> = { page, per_page: 100 };
                if (jenis !== undefined) params["filter[jenis]"] = jenis;
                return HalamanUnit.parse((await api.get("/work-units", { params })).data);
            }),
    });
export const aktif = (u: Unit) => u.status === "AKTIF";

const Tahun = z.object({ id: z.string(), nama: z.string(), is_active: z.boolean() });
/** `GET /academic-years` — hanya bagi pemegang `setting.view`. */
export const tahunAjaranQuery = queryOptions({
    queryKey: ["academic-years", "ringkas"],
    staleTime: 5 * 60_000,
    queryFn: () => semuaHalaman(async (page) => z.object({ data: z.array(Tahun), meta: Meta }).parse((await api.get("/academic-years", { params: { page, per_page: 100 } })).data)),
});

export interface IsianPengguna {
    readonly nama: string;
    readonly email: string;
    readonly nip_nis: string;
    readonly role_id: number;
    readonly work_unit_id?: number | null;
    readonly telepon?: string | null;
    readonly consent_wali?: boolean;
}

export async function buatPengguna(body: IsianPengguna) {
    return Satu(z.extend(Pengguna, { password_sementara: z.string() })).parse((await api.post("/users", body)).data).data;
}

export async function ubahPengguna(id: string, body: IsianPengguna) {
    return Satu(Pengguna).parse((await api.put(`/users/${id}`, body)).data).data;
}

export async function ubahStatus(id: string, status: StatusPengguna, alasan?: string) {
    return Satu(Pengguna).parse((await api.patch(`/users/${id}/status`, alasan === undefined ? { status } : { status, alasan })).data).data;
}

/** Hasil aksi beridentitas P-63: rahasia sekali tampil (null bila tidak diterbitkan). */
export interface HasilRahasia {
    readonly rahasia: string | null;
    readonly berlakuSampai: string | null;
    readonly sesiDicabut: number | null;
}

const Rahasia = z.object({ user_id: z.string(), berlaku_sampai: z.nullable(z.string()) });

/** FR-01.3 A5: password sementara tampil sekali. */
export async function resetPassword(id: string, metode: MetodeVerifikasi): Promise<HasilRahasia> {
    const r = Satu(z.extend(Rahasia, { password_sementara: z.string() })).parse((await api.post(`/users/${id}/reset-password`, { metode_verifikasi: metode })).data).data;
    return { rahasia: r.password_sementara, berlakuSampai: r.berlaku_sampai, sesiDicabut: null };
}

/** FR-01.5 A3: kode aktivasi baru hanya bagi role wajib 2FA (null bagi yang lain). */
export async function resetDuaFaktor(id: string, metode: MetodeVerifikasi): Promise<HasilRahasia> {
    const r = Satu(z.extend(Rahasia, { kode_aktivasi: z.nullable(z.string()), sesi_dicabut: z.number() })).parse((await api.post(`/users/${id}/reset-2fa`, { metode_verifikasi: metode })).data).data;
    return { rahasia: r.kode_aktivasi, berlakuSampai: r.berlaku_sampai, sesiDicabut: r.sesi_dicabut };
}

/** FR-01.5 A7: kode aktivasi 2FA tampil sekali. */
export async function terbitkanKodeAktivasi(id: string, metode: MetodeVerifikasi): Promise<HasilRahasia> {
    const r = Satu(z.extend(Rahasia, { kode_aktivasi: z.string() })).parse((await api.post(`/users/${id}/2fa-activation-code`, { metode_verifikasi: metode })).data).data;
    return { rahasia: r.kode_aktivasi, berlakuSampai: r.berlaku_sampai, sesiDicabut: null };
}

const Impor = z.object({
    report_expires_at: z.optional(z.nullable(z.string())),
    report_expired: z.optional(z.boolean()),
    id: z.string(),
    status: z.enum(["MENUNGGU", "BERJALAN", "SELESAI", "GAGAL"]),
    nama_berkas: z.string(),
    total: z.number(),
    terproses: z.number(),
    sukses: z.number(),
    gagal: z.number(),
    laporan_gagal: z.array(z.object({ baris: z.number(), email: z.nullable(z.string()), pesan: z.string() })),
    pesan_galat: z.nullable(z.string()),
});
export type PekerjaanImpor = z.infer<typeof Impor>;
const HasilImpor = z.object({ data: Impor, meta: z.nullable(z.object({ idempotent_replay: z.boolean() })) });

export const berjalan = (j: PekerjaanImpor | undefined) => j !== undefined && (j.status === "MENUNGGU" || j.status === "BERJALAN");
export const kunciImpor = (id: number) => ["users", "import", id] as const;

/** IMPT-04: pekerjaan asinkron di-poll sampai berakhir. */
export const imporQuery = (id: number | null) =>
    queryOptions({
        queryKey: kunciImpor(id ?? 0),
        enabled: id !== null,
        queryFn: async () => HasilImpor.parse((await api.get(`/users/import/${String(id)}`)).data).data,
        refetchInterval: (q) => (berjalan(q.state.data) ? 2000 : false),
    });

async function base64(berkas: File): Promise<string> {
    const bytes = new Uint8Array(await berkas.arrayBuffer());
    let biner = "";
    for (let i = 0; i < bytes.length; i += 0x8000) biner += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(biner);
}

export async function unggahImpor(berkas: File) {
    return HasilImpor.parse((await api.post("/users/import", { filename: berkas.name, content_base64: await base64(berkas) })).data);
}

export function simpanUnduhan(blob: Blob, nama: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nama;
    a.click();
    // Memberi peramban kesempatan memulai unduhan sebelum URL dilepas.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** IMPT-05: template E.5.2 dari server. */
export async function unduhTemplat(): Promise<void> {
    simpanUnduhan((await api.get<Blob>("/users/import/template", { responseType: "blob" })).data, "template_pengguna.xlsx");
}

function selCsv(v: string | number): string {
    const t = String(v);
    // Mencegah formula spreadsheet dari isian pengguna pada laporan unduhan.
    const aman = /^\s*[=+@-]/.test(t) ? `'${t}` : t;
    return `"${aman.replaceAll('"', '""')}"`;
}

/** Laporan per baris (IMPT-02) sebagai CSV ber-BOM agar terbaca Excel. */
export function laporanCsv(j: PekerjaanImpor): string {
    const baris = [["baris", "email", "pesan_galat"], ...j.laporan_gagal.map((f) => [f.baris, f.email ?? "", f.pesan]), ["Ringkasan", `${String(j.sukses)} berhasil; ${String(j.gagal)} gagal`, j.pesan_galat ?? ""]];
    return "﻿" + baris.map((b) => b.map(selCsv).join(",")).join("\r\n");
}

const Hasil = z.object({
    total: z.number(),
    sukses: z.number(),
    gagal: z.number(),
    baris: z.array(z.object({ user_id: z.number(), tindakan: z.enum(["NAIK", "LULUS"]), status: z.enum(["SUKSES", "GAGAL"]), pesan: z.nullable(z.string()), kewajiban: z.array(z.object({ jenis: z.string(), keterangan: z.string() })) })),
});
export type HasilKenaikan = z.infer<typeof Hasil>;
export type ItemKenaikan = { readonly user_id: number; readonly tindakan: "NAIK"; readonly kelas_id: number } | { readonly user_id: number; readonly tindakan: "LULUS" };
/** SL-02: batas server per permintaan (`BATAS_ITEM_KENAIKAN`). */
export const BATAS_KENAIKAN = 200;

export async function prosesKenaikan(academicYearId: number, items: readonly ItemKenaikan[]) {
    return Satu(Hasil).parse((await api.post("/class-promotions", { academic_year_id: academicYearId, items })).data).data;
}

/** Galat server per isian (`error.details`) → peta isian + pesan umum. */
export function galatIsian(g: unknown): { readonly isian: Readonly<Record<string, string>>; readonly umum: string | null } {
    if (!(g instanceof ApiError)) return { isian: {}, umum: g instanceof Error ? g.message : "Data belum tersimpan. Coba lagi." };
    return { isian: Object.fromEntries(g.details.map((d) => [d.field, d.message])), umum: g.details.length === 0 ? g.message : null };
}

const WAKTU = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
export const waktuWib = (iso: string) => `${WAKTU.format(new Date(iso))} WIB`;
