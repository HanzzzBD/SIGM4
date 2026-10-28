// Skema Zod unit kerja M-20 (SDD-API-01, SDD-API-11; Lampiran E.3).

import { z } from "zod";

const JenisUnitSchema = z.enum(["MANAJEMEN", "MATA_PELAJARAN", "TATA_USAHA", "EKSTRAKURIKULER", "KELAS"]);
const StatusUnitSchema = z.enum(["AKTIF", "NONAKTIF"]);

export const WorkUnitBodySchema = z.object({
    nama: z.string().trim().min(1).max(150),
    kode: z.string().trim().min(1).max(100),
    jenis: JenisUnitSchema,
    kepala_unit_id: z.number().int().positive().nullable().optional(),
});

export const UpdateWorkUnitStatusBodySchema = z.object({ status: StatusUnitSchema });

/** `filter[jenis]` dan `filter[status]` dibaca controller dari `req.query` (parser `simple` Express 5). */
export const ListWorkUnitsQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
    jenis: JenisUnitSchema.optional(),
    status: StatusUnitSchema.optional(),
});

const WorkUnitSchema = z.object({
    id: z.string(),
    nama: z.string(),
    kode: z.string(),
    jenis: JenisUnitSchema,
    kepala_unit_id: z.string().nullable(),
    status: StatusUnitSchema,
});

export const ListWorkUnitsResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(WorkUnitSchema),
    meta: z.object({
        page: z.number(),
        per_page: z.number(),
        total: z.number(),
        total_pages: z.number(),
    }),
});

export const SingleWorkUnitResponseSchema = z.object({
    success: z.literal(true),
    data: WorkUnitSchema,
    meta: z.null(),
});
