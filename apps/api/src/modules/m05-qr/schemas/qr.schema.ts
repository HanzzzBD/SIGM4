// Skema Zod M-05 (SDD-API-01, SDD-API-11; PR-03-01, keputusan 1 log phase-03).

import { z } from "zod";
import { AssetCatalogItemSchema } from "../../m04-assets/index.js";

export const AssetIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** FR-05.1 A2 + UX-04 (UX §7.2 "Regenerasi UUID QR"): alasan wajib. */
export const RegenerateQrBodySchema = z.strictObject({
    alasan: z.string().trim().min(1).max(500),
});

/** FR-05.1 langkah 5: 1–200 aset sekaligus (setara batas cetak massal AC FR-05.1). */
export const QrTerpasangBodySchema = z.strictObject({
    asset_ids: z.array(z.number().int().positive()).min(1).max(200),
    qr_terpasang: z.boolean(),
});

/**
 * FR-05.1 langkah 2–4 (PR-03-02): 1–200 aset (AC FR-05.1 "hingga 200 label"); tiga preset A4 dan
 * elemen opsional (keputusan 2 log phase-03). Urutan `asset_ids` = urutan label di lembar.
 */
export const PrintQrBodySchema = z.strictObject({
    asset_ids: z.array(z.number().int().positive()).min(1).max(200),
    tata_letak: z.enum(["A4_3X8", "A4_4X10", "A4_2X5"]),
    elemen: z.strictObject({ kode_aset: z.boolean(), nama: z.boolean() }),
});

export const PrintQrResponseSchema = z.string().describe("Berkas PDF (biner) label QR siap cetak — lihat header Content-Disposition.");

/**
 * FR-05.2 (PR-03-03): string bebas, BUKAN `z.uuid()` — QR asing/rusak dijawab 404 "tidak dikenali"
 * (A1) oleh layanan, bukan 400, sehingga klien punya satu jalur cadangan (input kode manual).
 */
export const AssetUuidParamSchema = z.object({ uuid: z.string().max(100) });

const LokasiSchema = z.object({ gedung: z.string(), area: z.string(), ruang: z.string() });

/** Item katalog `GET /assets` + nama kategori/lokasi + penanda terhapuskan (A2; keputusan 3a). */
export const AssetByUuidResponseSchema = z.object({
    success: z.literal(true),
    data: AssetCatalogItemSchema.extend({ kategori_nama: z.string(), lokasi: LokasiSchema, dihapuskan: z.boolean() }),
    meta: z.null(),
});

/** FR-05.2 A3, 17.5 butir 2: atribut non-sensitif SAJA — tanpa id internal, nilai, biaya, maupun orang. */
export const PublicAssetResponseSchema = z.object({
    success: z.literal(true),
    data: z.strictObject({
        kode_barang: z.string(),
        nama: z.string(),
        kategori: z.string(),
        lokasi: LokasiSchema,
        kondisi: AssetCatalogItemSchema.shape.kondisi,
        status: AssetCatalogItemSchema.shape.status,
        aktif: z.boolean(),
    }),
    meta: z.null(),
});

export const RegenerateQrResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ id: z.string(), uuid: z.string(), qr_url: z.string() }),
    meta: z.null(),
});

export const QrTerpasangResponseSchema = z.object({
    success: z.literal(true),
    /** Aset yang nilainya BENAR berubah — yang sudah bernilai sama tidak ditulis maupun dicatat. */
    data: z.object({ diubah: z.array(z.string()), qr_terpasang: z.boolean() }),
    meta: z.object({ jumlah_diubah: z.number() }),
});
