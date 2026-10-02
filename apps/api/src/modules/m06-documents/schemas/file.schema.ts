// Skema Zod unggah berkas (SDD-API-01, SDD-09 §4.2, PR-03-25).

import { z } from "zod";

/** Bab 11.3 "Jenis Pemilik Berkas" — jenis ditetapkan sejak presign (SDD-09 §4.3). */
const JenisBerkasSchema = z.enum(["ASSET_DOCUMENT", "ASSET_PHOTO", "USER_PHOTO", "HANDOVER_PHOTO", "DAMAGE_PHOTO", "WORK_ORDER_PHOTO", "STOCKTAKE_PHOTO"]);

/** Bab 11.3 "Status Pemindaian Berkas". */
export const ScanStatusSchema = z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]);

export const PresignBodySchema = z.object({
    jenis: JenisBerkasSchema,
    mime: z.string().trim().toLowerCase().min(1).max(200),
    ukuran: z.number().int().positive(),
});

export const PresignResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ upload_url: z.string(), object_key: z.string(), file_id: z.string(), expires_in: z.number() }),
    meta: z.null(),
});

export const ConfirmBodySchema = z.object({
    file_id: z.coerce.number().int().positive(),
    // SHA-256 heksadesimal — sama dengan CHECK `stored_files.checksum`.
    checksum: z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/, "Checksum harus SHA-256 heksadesimal."),
});

export const ConfirmResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ file_id: z.string(), scan_status: ScanStatusSchema }),
    meta: z.null(),
});
