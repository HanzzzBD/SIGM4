// Skema Zod M-18 (SDD-API-01, SDD-API-11): validasi masukan/keluaran
// penelusuran activity log (FR-18.2).

import { z } from "zod";

/**
 * Query daftar (Bab 17.1): `page`/`per_page` datar, filter berbentuk
 * `filter[kunci]` — controller membaca kuncinya langsung dari `req.query`
 * (parser `simple` Express 5 tidak menguraikan tanda kurung menjadi objek).
 */
export const ListActivityLogsQuerySchema = z
    .object({
        page: z.coerce.number().int().positive().default(1),
        per_page: z.coerce.number().int().positive().max(100).default(25),
        dari: z.coerce.date().optional(),
        sampai: z.coerce.date().optional(),
        user_id: z.coerce.number().int().positive().optional(),
        role: z.string().trim().min(1).max(50).optional(),
        modul: z.string().trim().min(1).max(100).optional(),
        aksi: z.string().trim().min(1).max(100).optional(),
        entitas: z.string().trim().min(1).max(100).optional(),
        entitas_id: z.coerce.number().int().positive().optional(),
    })
    .superRefine((val, ctx) => {
        if (val.dari !== undefined && val.sampai !== undefined && val.dari > val.sampai) {
            ctx.addIssue({
                code: "custom",
                message: "Tanggal mulai harus sebelum atau sama dengan tanggal selesai.",
                path: ["sampai"],
            });
        }
    });

const ActivityLogSchema = z.object({
    id: z.string(),
    waktu: z.string(),
    user_id: z.string().nullable(),
    user_nama: z.string().nullable(),
    role: z.string().nullable(),
    ip: z.string().nullable(),
    user_agent: z.string().nullable(),
    modul: z.string(),
    aksi: z.string(),
    entitas: z.string().nullable(),
    entitas_id: z.string().nullable(),
    // FR-18.2 langkah 4: perbandingan sebelum/sesudah — tabel/penyorotan adalah
    // urusan klien (bukan JSON mentah DI TAMPILAN), API tetap mengirim objek
    // terstruktur apa adanya, bukan string JSON.
    nilai_sebelum: z.unknown().nullable(),
    nilai_sesudah: z.unknown().nullable(),
    keterangan: z.string().nullable(),
    hasil: z.enum(["SUKSES", "GAGAL"]),
    request_id: z.string().nullable(),
});

const PaginationMetaSchema = z.object({
    page: z.number(),
    per_page: z.number(),
    total: z.number(),
    total_pages: z.number(),
});

export const ListActivityLogsResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(ActivityLogSchema),
    meta: PaginationMetaSchema,
});
