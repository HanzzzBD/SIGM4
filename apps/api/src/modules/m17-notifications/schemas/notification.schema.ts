// Skema Zod endpoint notifikasi (FR-17.1, SDD-NTF-10; SDD-API-01).

import { z } from "zod";

const KELOMPOK = ["PERSETUJUAN", "RESERVASI_PEMINJAMAN", "DENDA_KEWAJIBAN", "KERUSAKAN_PERAWATAN", "OPNAME_PENGADAAN", "AKUN_SISTEM"] as const;

const Boolean = z.enum(["true", "false"]).transform((v) => v === "true");

/** FR-17.1 A2 (arsip) & A3 (filter jenis + status baca). */
export const ListNotificationsQuerySchema = z.object({
    jenis: z.enum(KELOMPOK).optional(),
    belum_dibaca: Boolean.optional(),
    arsip: Boolean.default(false),
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
});

export const NotificationIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

const Notifikasi = z.object({
    id: z.number(),
    kode: z.string(),
    jenis: z.enum(KELOMPOK),
    judul: z.string(),
    isi: z.string(),
    referensi_jenis: z.string().nullable(),
    referensi_id: z.number().nullable(),
    deep_link: z.string().nullable(),
    wajib: z.boolean(),
    dibaca_pada: z.string().nullable(),
    created_at: z.string(),
});

export const ListNotificationsResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(Notifikasi),
    meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number(), unread_count: z.number() }),
});

export const MarkReadResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ id: z.number(), dibaca_pada: z.string(), unread_count: z.number() }),
    meta: z.null(),
});

export const MarkAllReadResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ ditandai: z.number(), unread_count: z.number() }),
    meta: z.null(),
});

/** `text/event-stream` — badan bukan JSON; skema ini mendokumentasikan isi tiap `data:` (SDD-08 §4.3a). */
export const StreamEventSchema = z.union([
    z.object({ jenis: z.literal("notifikasi"), notifikasi: z.object({ id: z.number(), kode: z.string(), judul: z.string(), isi: z.string(), deep_link: z.string().nullable(), created_at: z.string() }), unread_count: z.number() }),
    z.object({ jenis: z.literal("hitungan"), unread_count: z.number() }),
]);
