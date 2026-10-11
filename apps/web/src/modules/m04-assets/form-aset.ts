// Kontrak tulis M-04 di klien web (m04 §7 `POST /assets`, `PUT /assets/{id}`, `/asset-categories`;
// FR-04.1, FR-04.3, FR-04.5; PR-02-46). Galat server yang menunjuk isian (`error.details`) dipetakan ke
// isian itu (UX §7.1 C, SDD-API-14).

import { queryOptions } from "@tanstack/react-query";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ApiError, api } from "../../shared/api";

export const SUMBER = ["PEMBELIAN", "HIBAH", "BANTUAN_PEMERINTAH", "SUMBANGAN", "LAINNYA"] as const;
export type Sumber = (typeof SUMBER)[number];
export const LABEL_SUMBER: Record<Sumber, string> = { PEMBELIAN: "Pembelian", HIBAH: "Hibah", BANTUAN_PEMERINTAH: "Bantuan Pemerintah", SUMBANGAN: "Sumbangan", LAINNYA: "Lainnya" };

/** Galat per isian dari `error.details`; sisanya satu pesan formulir. */
export function galatIsian(g: unknown): { readonly isian: Readonly<Record<string, string>>; readonly umum: string | null } {
    if (!(g instanceof ApiError)) return { isian: {}, umum: g instanceof Error ? g.message : "Data belum tersimpan. Coba lagi." };
    const isian = Object.fromEntries(g.details.map((d) => [d.field, d.message]));
    return { isian, umum: g.details.length === 0 ? g.message : null };
}

const AsetDibuat = z.object({ id: z.string(), kode_barang: z.string(), nama: z.string() });
export type AsetDibuat = z.infer<typeof AsetDibuat>;

export interface BodyAsetBaru {
    readonly nama: string;
    readonly category_id: number;
    readonly merek: string | null;
    readonly model: string | null;
    readonly nomor_seri: string | null;
    readonly tahun_perolehan: number;
    readonly sumber_perolehan: Sumber;
    readonly nilai_perolehan: number | null;
    readonly room_id: number;
    readonly kondisi: string;
    readonly dapat_dipinjam: boolean;
    readonly boleh_dipinjam_siswa: boolean;
    readonly penanggung_jawab_id: number | null;
    readonly jumlah_unit: number;
}

/** FR-04.1 langkah 6: seluruh unit yang terbentuk. */
export async function daftarkanAset(body: BodyAsetBaru): Promise<readonly AsetDibuat[]> {
    return z.object({ data: z.array(AsetDibuat) }).parse((await api.post("/assets", body)).data).data;
}

export interface BodyUbahAset {
    readonly nama: string;
    readonly merek: string | null;
    readonly model: string | null;
    readonly nomor_seri: string | null;
    readonly tahun_perolehan: number;
    readonly dapat_dipinjam: boolean;
    readonly boleh_dipinjam_siswa: boolean;
    readonly penanggung_jawab_id: number | null;
    readonly sumber_perolehan?: Sumber;
    readonly nilai_perolehan?: number | null;
    readonly kondisi?: string;
    readonly alasan?: string;
    readonly referensi_jenis?: string | null;
    readonly referensi_id?: number | null;
}

/** FR-04.3 (keputusan 93e/93f): satu PUT atomik, kondisi opsional beralasan. */
export async function ubahAset(id: string, body: BodyUbahAset): Promise<void> {
    await api.put(`/assets/${id}`, body);
}

const PenggunaSchema = z.object({ data: z.array(z.object({ id: z.string(), nama: z.string() })) });
/** Pemilih penanggung jawab — hanya bagi pemegang `user.view` (m02 §7). */
export const penggunaAktifQuery = queryOptions({
    queryKey: ["users", "aktif"],
    staleTime: 5 * 60_000,
    queryFn: async () => PenggunaSchema.parse((await api.get("/users", { params: { "filter[status]": "AKTIF", per_page: 100 } })).data).data,
});

const Kategori = z.object({
    id: z.string(),
    parent_id: z.nullable(z.string()),
    nama: z.string(),
    kode: z.string(),
    umur_teknis_tahun: z.nullable(z.number()),
    interval_preventif_hari: z.nullable(z.number()),
});
export type KategoriLengkap = z.infer<typeof Kategori>;
export const KUNCI_KATEGORI = ["asset-categories"] as const;
export const kategoriLengkapQuery = queryOptions({
    queryKey: [...KUNCI_KATEGORI, "lengkap"],
    queryFn: async () => z.object({ data: z.array(Kategori) }).parse((await api.get("/asset-categories", { params: { per_page: 100 } })).data).data,
});

export interface BodyKategori {
    readonly nama: string;
    readonly kode: string;
    readonly parent_id: number | null;
    readonly umur_teknis_tahun: number | null;
    readonly interval_preventif_hari: number | null;
}

/** FR-04.5 langkah 2–3, A1–A4. */
export const simpanKategori = async (id: string | null, body: BodyKategori) => (id === null ? api.post("/asset-categories", body) : api.put(`/asset-categories/${id}`, body));
export const hapusKategori = async (id: string) => api.delete(`/asset-categories/${id}`);

/** Angka opsional dari isian teks: kosong → `null`. */
export const angkaAtauNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));
export const teksAtauNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());
