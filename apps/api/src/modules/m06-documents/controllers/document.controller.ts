// Controller dokumen aset (FR-06.1): validasi skema (SDD-API-01), lalu delegasi ke DocumentService.
// Permission per route (`asset_document.view`/`.manage`) diperiksa sebelum handler ini (PM-02).

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { DokumenRow } from "../repositories/asset-document.repository.js";
import { AssetIdParamSchema, CreateDocumentBodySchema, DocumentParamSchema, ListAllDocumentsQuerySchema } from "../schemas/document.schema.js";
import type { DocumentService } from "../services/document.service.js";

function tampilkan(d: DokumenRow) {
    return {
        id: d.id,
        jenis: d.jenis,
        nama_berkas: d.nama_berkas,
        keterangan: d.keterangan,
        garansi_mulai: d.garansi_mulai,
        garansi_selesai: d.garansi_selesai,
        mime: d.mime,
        ukuran: Number(d.ukuran),
        scan_status: d.scan_status,
        diunggah_oleh: d.diunggah_oleh,
        diunggah_pada: d.created_at.toISOString(),
        jumlah_aset: d.jumlah_aset,
    };
}

export function listDocumentsHandler(service: DocumentService): RequestHandler {
    return async (req, res) => {
        const { id } = AssetIdParamSchema.parse(req.params);
        const daftar = await service.daftar(requireAuthContext(res), id);
        res.status(200).json({ success: true, data: daftar.map(tampilkan), meta: null });
    };
}

export function listAllDocumentsHandler(service: DocumentService): RequestHandler {
    return async (req, res) => {
        const q = ListAllDocumentsQuerySchema.parse({ q: req.query["q"], jenis: req.query["filter[jenis]"], kategori_id: req.query["filter[kategori_id]"], garansi: req.query["filter[garansi]"], sort: req.query["sort"], page: req.query["page"], per_page: req.query["per_page"] });
        const result = await service.daftarSemua(requireAuthContext(res), {
            ...(q.q === undefined ? {} : { q: q.q }), ...(q.jenis === undefined ? {} : { jenis: q.jenis }),
            ...(q.kategori_id === undefined ? {} : { kategoriId: q.kategori_id }), ...(q.garansi === undefined ? {} : { garansi: q.garansi }),
            sort: q.sort, page: q.page, perPage: q.per_page,
        });
        res.status(200).json({ success: true, data: result.rows.map((r) => ({ ...tampilkan(r), aset: { id: r.asset_id, kode_barang: r.kode_barang, nama: r.asset_nama } })), meta: { page: q.page, per_page: q.per_page, total: result.total, total_pages: Math.ceil(result.total / q.per_page) } });
    };
}

export function createDocumentHandler(service: DocumentService): RequestHandler {
    return async (req, res) => {
        const { id } = AssetIdParamSchema.parse(req.params);
        const b = CreateDocumentBodySchema.parse(req.body);
        const dok = await service.unggah(requireAuthContext(res), id, {
            fileId: b.file_id,
            jenis: b.jenis,
            namaBerkas: b.nama_berkas,
            keterangan: b.keterangan ?? null,
            garansiMulai: b.garansi_mulai ?? null,
            garansiSelesai: b.garansi_selesai ?? null,
            assetIdsTambahan: b.asset_ids_tambahan ?? [],
        });
        res.status(201).json({ success: true, data: tampilkan(dok), meta: null });
    };
}

export function deleteDocumentHandler(service: DocumentService): RequestHandler {
    return async (req, res) => {
        const { id, docId } = DocumentParamSchema.parse(req.params);
        const hasil = await service.hapus(requireAuthContext(res), id, docId);
        res.status(200).json({ success: true, data: { dokumen_dihapus: hasil.dokumenDihapus }, meta: null });
    };
}

/** Respons berupa URL, bukan redirect (SDD-09 §4.4); tidak di-cache karena bertanda tangan. */
export function downloadDocumentHandler(service: DocumentService): RequestHandler {
    return async (req, res) => {
        const { id, docId } = DocumentParamSchema.parse(req.params);
        const hasil = await service.unduh(requireAuthContext(res), id, docId);
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { url: hasil.url, expires_at: hasil.expiresAt.toISOString() }, meta: null });
    };
}
