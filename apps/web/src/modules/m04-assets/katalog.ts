// Kontrak katalog & detail aset di klien web (m04 §7 `GET /assets`, `GET /assets/{id}`, `/timeline`,
// `GET /asset-categories`; m03 `GET /locations/tree`; FR-04.2, PR-02-45). Detail & linimasa memakai
// skema bersama (SDD-FE-05); item katalog dicerminkan di sini karena skemanya milik `apps/api`.

import { queryOptions } from "@tanstack/react-query";
import { AssetDetailResponseSchema, AssetTimelineResponseSchema } from "@sigm4/schemas";
import type { Semantik } from "../../shared/ui/primitives";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ApiError, api } from "../../shared/api";

export const KONDISI = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"] as const;
export const STATUS = ["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"] as const;
export type Kondisi = (typeof KONDISI)[number];
export type StatusAset = (typeof STATUS)[number];

/** DESIGN-SYSTEM §6.3 (tabel pemetaan status → semantic). */
export const VARIAN_KONDISI: Record<Kondisi, Semantik> = { BAIK: "success", RUSAK_RINGAN: "warning", RUSAK_BERAT: "error", HILANG: "error" };
export const VARIAN_STATUS: Record<StatusAset, Semantik> = { TERSEDIA: "success", DIRESERVASI: "warning", DIPINJAM: "info", DALAM_PERBAIKAN: "info", TIDAK_TERSEDIA: "error" };

const ItemKatalog = z.object({
    id: z.string(),
    kode_barang: z.string(),
    nama: z.string(),
    merek: z.nullable(z.string()),
    nomor_seri: z.nullable(z.string()),
    tahun_perolehan: z.number(),
    kondisi: z.enum(KONDISI),
    status: z.enum(STATUS),
    dapat_dipinjam: z.boolean(),
    kategori_nama: z.string(),
    lokasi: z.object({ ruang: z.string(), gedung: z.string() }),
});
export type ItemKatalog = z.infer<typeof ItemKatalog>;
const KatalogSchema = z.object({ data: z.array(ItemKatalog), meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() }) });

/** `sort` allow-list API (SDD-API-06): awalan `-` = menurun. */
export const URUTAN = ["kode_barang", "-kode_barang", "nama", "-nama", "tahun_perolehan", "-tahun_perolehan"] as const;
export type Urutan = (typeof URUTAN)[number];

export interface SaringanKatalog {
    readonly q?: string | undefined;
    readonly kategori?: string | undefined;
    readonly lokasi?: string | undefined;
    readonly kondisi?: Kondisi | undefined;
    readonly status?: StatusAset | undefined;
    readonly tahun?: number | undefined;
    readonly pinjam?: boolean | undefined;
    /** Hasil impor P-17 (`filter[import_job_id]`, PR-02-38). */
    readonly impor?: number | undefined;
    readonly urut?: Urutan | undefined;
    readonly page?: number | undefined;
    /** Bawaan 25 (C-15) — hanya ukuran lain yang tercatat di URL. */
    readonly per?: 50 | 100 | undefined;
}

/** FR-04.2 langkah 2–4: saringan dikirim sebagai `filter[...]` (SDD-API §4.5). */
export const katalogQuery = (s: SaringanKatalog) =>
    queryOptions({
        queryKey: ["assets", "katalog", s],
        queryFn: async () =>
            KatalogSchema.parse(
                (
                    await api.get("/assets", {
                        params: {
                            q: s.q,
                            sort: s.urut ?? "kode_barang",
                            page: s.page ?? 1,
                            per_page: s.per ?? 25,
                            "filter[kategori_id]": s.kategori,
                            "filter[lokasi_id]": s.lokasi,
                            "filter[kondisi]": s.kondisi,
                            "filter[status]": s.status,
                            "filter[tahun_perolehan]": s.tahun,
                            "filter[dapat_dipinjam]": s.pinjam,
                            "filter[import_job_id]": s.impor,
                        },
                    })
                ).data,
            ),
    });

const KategoriSchema = z.object({ data: z.array(z.object({ id: z.string(), parent_id: z.nullable(z.string()), nama: z.string() })) });
export const kategoriQuery = queryOptions({
    queryKey: ["asset-categories", "semua"],
    staleTime: 5 * 60_000,
    queryFn: async () => KategoriSchema.parse((await api.get("/asset-categories", { params: { per_page: 100 } })).data).data,
});

const PohonSchema = z.object({ data: z.array(z.object({ nama: z.string(), areas: z.array(z.object({ rooms: z.array(z.object({ id: z.string(), nama: z.string() })) })) })) });
/** Pilihan saringan lokasi — hanya bagi pemegang `location.view` (m03 §7). */
export const ruanganQuery = queryOptions({
    queryKey: ["locations", "tree", "ruangan"],
    staleTime: 5 * 60_000,
    queryFn: async () => PohonSchema.parse((await api.get("/locations/tree")).data).data.flatMap((g) => g.areas.flatMap((a) => a.rooms.map((r) => ({ id: r.id, nama: `${r.nama} · ${g.nama}` })))),
});

const jawaban = (e: unknown) => e instanceof ApiError && (e.status === 403 || e.status === 404);

/** FR-04.2 langkah 5 (PR-03-24). 404 = tak ada atau di luar scope (SDD-AUTH-08) — tidak diulang. */
export const detailAsetQuery = (id: string) =>
    queryOptions({
        queryKey: ["assets", id, "detail"],
        queryFn: async () => AssetDetailResponseSchema.parse((await api.get(`/assets/${id}`)).data).data,
        retry: (n, e) => !jawaban(e) && n < 2,
    });

export const linimasaAsetQuery = (id: string, page: number) =>
    queryOptions({
        queryKey: ["assets", id, "timeline", page],
        queryFn: async () => AssetTimelineResponseSchema.parse((await api.get(`/assets/${id}/timeline`, { params: { page, per_page: 25 } })).data),
        retry: (n, e) => !jawaban(e) && n < 2,
    });

const RUPIAH = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
/** Angka uang diformat rupiah saat tampil (UX §7.1 C). */
export const rupiah = (nilai: string) => RUPIAH.format(Number(nilai));
