// Skema Zod dokumen aset (SDD-API-01, FR-06.1; PR-03-06).

import { z } from "zod";
import { ScanStatusSchema } from "./file.schema.js";

/** Bab 11.3 "Jenis Dokumen Aset" (FR-06.1 langkah 2). */
const JenisDokumenSchema = z.enum(["FAKTUR", "GARANSI", "SERTIFIKAT", "MANUAL", "BERITA_ACARA", "LAINNYA"]);
const Tanggal = z.iso.date();
const Id = z.coerce.number().int().positive();

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

const DokumenSchema = z.object({
    id: z.string(),
    jenis: JenisDokumenSchema,
    nama_berkas: z.string(),
    keterangan: z.string().nullable(),
    garansi_mulai: z.string().nullable(),
    garansi_selesai: z.string().nullable(),
    mime: z.string(),
    ukuran: z.number(),
    // SDD-09 §5: UI menampilkan "sedang diperiksa" selama PENDING; unduh hanya CLEAN.
    scan_status: ScanStatusSchema,
    diunggah_oleh: z.string().nullable(),
    diunggah_pada: z.string(),
    jumlah_aset: z.number(),
});

export const ListDocumentsResponseSchema = z.object({ success: z.literal(true), data: z.array(DokumenSchema), meta: z.null() });
export const DocumentResponseSchema = z.object({ success: z.literal(true), data: DokumenSchema, meta: z.null() });
export const DeleteDocumentResponseSchema = z.object({ success: z.literal(true), data: z.object({ dokumen_dihapus: z.boolean() }), meta: z.null() });
export const DownloadResponseSchema = z.object({ success: z.literal(true), data: z.object({ url: z.string(), expires_at: z.string() }), meta: z.null() });
