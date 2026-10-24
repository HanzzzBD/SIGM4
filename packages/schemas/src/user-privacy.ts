import { z } from "zod";
export const PseudonymizeUserBodySchema = z.strictObject({
    alasan: z.string().trim().min(3).max(500),
    referensi_permintaan: z.string().trim().min(3).max(200),
    metode_verifikasi: z.enum(["KARTU_IDENTITAS_TATAP_MUKA", "KONFIRMASI_ATASAN_ATAU_WALI_KELAS"]),
});
export const PseudonymizedUserResponseSchema = z.object({ success: z.literal(true), data: z.object({ id: z.string(), pseudonymized_at: z.iso.datetime() }), meta: z.null() });
export type PseudonymizeUserBody = z.infer<typeof PseudonymizeUserBodySchema>;
