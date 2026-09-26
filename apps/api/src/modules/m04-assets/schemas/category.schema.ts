// Skema Zod kategori aset (FR-04.5, SDD-API-01). Panjang `nama`/`kode` sama
// dengan skema lokasi (m03). Umur teknis dan interval preventif wajib POSITIF di
// sini: CHECK basis data (0026) yang melanggar akan menjadi 23514, yang
// ErrorMapper petakan ke INSUFFICIENT_BALANCE — salah konteks untuk kategori.

import { z } from "zod";

export const CategoryIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const ListCategoriesQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
});

/** `POST`/`PUT /asset-categories` (FR-04.5 langkah 2). PUT = penggantian utuh. */
export const CategoryBodySchema = z.object({
    nama: z.string().trim().min(1).max(150),
    kode: z.string().trim().min(1).max(50),
    parent_id: z.coerce.number().int().positive().nullable().optional(),
    umur_teknis_tahun: z.coerce.number().int().positive().nullable().optional(),
    interval_preventif_hari: z.coerce
        .number()
        .int()
        .positive()
        .nullable()
        .optional(),
});

const CategorySchema = z.object({
    id: z.string(),
    parent_id: z.string().nullable(),
    nama: z.string(),
    kode: z.string(),
    umur_teknis_tahun: z.number().nullable(),
    interval_preventif_hari: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const CategoryResponseSchema = z.object({
    success: z.literal(true),
    data: CategorySchema,
    meta: z.null(),
});

export const ListCategoriesResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(CategorySchema),
    meta: z.object({
        page: z.number(),
        per_page: z.number(),
        total: z.number(),
        total_pages: z.number(),
    }),
});

/** `DELETE` — pola `DELETE /holidays/{id}` (M-20): `200`, `data: null`. */
export const DeleteCategoryResponseSchema = z.object({
    success: z.literal(true),
    data: z.null(),
    meta: z.null(),
});
