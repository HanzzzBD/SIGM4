// Skema Zod dokumen aset (SDD-API-01, FR-06.1; PR-03-06).

import { z } from "zod";
import { DaftarDokumenLintasAsetResponseSchema, JenisDokumenAsetSchema } from "@sigm4/schemas";
export { DaftarDokumenLintasAsetResponseSchema };
export { DaftarDokumenAsetResponseSchema as ListDocumentsResponseSchema, DokumenAsetResponseSchema as DocumentResponseSchema } from "@sigm4/schemas";

/** Bab 11.3 "Jenis Dokumen Aset" (FR-06.1 langkah 2). */
const JenisDokumenSchema = JenisDokumenAsetSchema;
const Id = z.coerce.number().int().positive();
export const ListAllDocumentsQuerySchema = z.object({
    q: z.string().trim().max(200).optional(), jenis: JenisDokumenSchema.optional(),
    kategori_id: Id.optional(), garansi: z.enum(["AKTIF", "BERAKHIR_30_HARI", "BERAKHIR"]).optional(),
    sort: z.enum(["-diunggah_pada", "garansi_selesai"]).default("-diunggah_pada"),
    page: z.coerce.number().int().positive().default(1), per_page: z.coerce.number().pipe(z.union([z.literal(25), z.literal(50), z.literal(100)])).default(25),
});
const Tanggal = z.iso.date();
/** Nama query publik diturunkan dari field validator yang sama untuk OpenAPI. */
export const ListAllDocumentsHttpQuerySchema = z.object({
    q: ListAllDocumentsQuerySchema.shape.q, "filter[jenis]": ListAllDocumentsQuerySchema.shape.jenis,
    "filter[kategori_id]": ListAllDocumentsQuerySchema.shape.kategori_id, "filter[garansi]": ListAllDocumentsQuerySchema.shape.garansi,
    sort: ListAllDocumentsQuerySchema.shape.sort, page: ListAllDocumentsQuerySchema.shape.page, per_page: ListAllDocumentsQuerySchema.shape.per_page,
});

export const AssetIdParamSchema = z.object({ id: Id });
export const DocumentParamSchema = z.object({ id: Id, docId: Id });

export const CreateDocumentBodySchema = z
    .strictObject({
        file_id: Id,
        jenis: JenisDokumenSchema,
        nama_berkas: z.string().trim().min(1).max(255),
        keterangan: z.string().trim().max(1000).nullable().optional(),
        garansi_mulai: Tanggal.nullable().optional(),
        garansi_selesai: Tanggal.nullable().optional(),
        // FR-06.1 A3 — batas sama dengan operasi massal aset lain (200).
        asset_ids_tambahan: z.array(Id).max(200).optional(),
    })
    // FR-06.1 langkah 3: garansi wajib bagi GARANSI, dilarang bagi jenis lain (CHECK 0039).
    .superRefine((b, ctx) => {
        const garansi = b.jenis === "GARANSI";
        for (const f of ["garansi_mulai", "garansi_selesai"] as const) {
            const ada = b[f] !== undefined && b[f] !== null;
            if (garansi && !ada) ctx.addIssue({ code: "custom", path: [f], message: "Wajib diisi untuk dokumen garansi." });
            if (!garansi && ada) ctx.addIssue({ code: "custom", path: [f], message: "Hanya untuk dokumen garansi." });
        }
        if (garansi && b.garansi_mulai && b.garansi_selesai && b.garansi_selesai < b.garansi_mulai) {
            ctx.addIssue({ code: "custom", path: ["garansi_selesai"], message: "Tanggal berakhir garansi tidak boleh sebelum tanggal mulai." });
        }
    });

export const DeleteDocumentResponseSchema = z.object({ success: z.literal(true), data: z.object({ dokumen_dihapus: z.boolean() }), meta: z.null() });
export const DownloadResponseSchema = z.object({ success: z.literal(true), data: z.object({ url: z.string(), expires_at: z.string() }), meta: z.null() });
