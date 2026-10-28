import { z } from "zod";

/** Metadata publik; URL hanya tersedia untuk berkas terkonfirmasi CLEAN. */
export const AssetPhotoSchema = z.object({
    id: z.string(), file_id: z.string(), urutan: z.number().int().nonnegative(), is_primary: z.boolean(),
    status: z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]),
    url: z.url().nullable(), thumbnail_url: z.url().nullable(), expires_at: z.iso.datetime().nullable(),
}).superRefine((photo, context) => {
    if (photo.status !== "CLEAN" && (photo.url !== null || photo.thumbnail_url !== null)) context.addIssue({ code: "custom", message: "URL foto memerlukan CLEAN." });
});
export type AssetPhoto = z.infer<typeof AssetPhotoSchema>;
export const AssetPhotosResponseSchema = z.object({ success: z.literal(true), data: z.array(AssetPhotoSchema), meta: z.object({ page: z.number().int(), per_page: z.number().int(), total: z.number().int(), total_pages: z.number().int() }) });
