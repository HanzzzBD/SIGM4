// Skema Zod endpoint dashboard (FR-15.1; SDD-14 §4.3a, keputusan 82; SDD-API-01).

import { z } from "zod";

const JENIS = ["KPI", "AKSI", "PERINGATAN", "STATUS", "GRAFIK_GARIS", "GRAFIK_DONAT", "GRAFIK_BATANG", "TABEL"] as const;
const RENTANG = ["7_hari", "30_hari", "semester", "tahun_ajaran"] as const;

export const CardIdParamSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/) });

/** 19.1: rentang bawaan 30 hari; `segarkan=true` = tombol muat ulang (melewati cache). */
export const CardQuerySchema = z.strictObject({
    rentang: z.enum(RENTANG).default("30_hari"),
    segarkan: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export const ManifestResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        templat: z.string().nullable(),
        kartu: z.array(z.object({ id: z.string(), judul: z.string(), zona: z.number(), jenis: z.enum(JENIS), berperiode: z.boolean(), drilldown: z.string().nullable() })),
    }),
    meta: z.null(),
});

export const CardResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        id: z.string(),
        rentang: z.object({ jenis: z.enum(RENTANG), mulai: z.string(), akhir: z.string() }).nullable(),
        diperbarui_pada: z.string(),
        /** Bentuk isi per kartu — SDD-14 §4.3a / Bab 19. */
        isi: z.unknown(),
    }),
    meta: z.null(),
});
