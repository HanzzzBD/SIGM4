// Controller M-04: validasi skema (SDD-API-01), lalu delegasi ke AssetService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import {
    AssetIdParamSchema,
    CreateAssetBodySchema,
    ListAssetsQuerySchema,
    ListRoomAssetsQuerySchema,
    MoveAssetsBodySchema,
    RoomIdParamSchema,
    UpdateAssetConditionBodySchema,
} from "../schemas/asset.schema.js";
import type { AssetService } from "../services/asset.service.js";

export function createAssetHandler(service: AssetService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = CreateAssetBodySchema.parse(req.body);
        const dibuat = await service.daftarkan(ctx, {
            nama: body.nama,
            categoryId: body.category_id,
            merek: body.merek ?? null,
            model: body.model ?? null,
            nomorSeri: body.nomor_seri ?? null,
            tahunPerolehan: body.tahun_perolehan,
            sumberPerolehan: body.sumber_perolehan,
            nilaiPerolehan: body.nilai_perolehan ?? null,
            roomId: body.room_id,
            kondisi: body.kondisi,
            dapatDipinjam: body.dapat_dipinjam,
            bolehDipinjamSiswa: body.boleh_dipinjam_siswa,
            penanggungJawabId: body.penanggung_jawab_id ?? null,
            procurementId: body.procurement_id ?? null,
            jumlahUnit: body.jumlah_unit,
        });
        res.status(201).json({
            success: true,
            data: dibuat,
            meta: { jumlah_unit: dibuat.length },
        });
    };
}

export function listRoomAssetsHandler(service: AssetService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = RoomIdParamSchema.parse(req.params);
        const query = ListRoomAssetsQuerySchema.parse({
            page: req.query["page"],
            per_page: req.query["per_page"],
            kategori_id: req.query["filter[kategori_id]"],
            kondisi: req.query["filter[kondisi]"],
            status: req.query["filter[status]"],
        });
        const hasil = await service.listByRoom(ctx, id, {
            page: query.page,
            perPage: query.per_page,
            ...(query.kategori_id === undefined ? {} : { kategoriId: query.kategori_id }),
            ...(query.kondisi === undefined ? {} : { kondisi: query.kondisi }),
            ...(query.status === undefined ? {} : { status: query.status }),
        });
        res.status(200).json({
            success: true,
            data: {
                room_id: hasil.roomId,
                assets: hasil.assets,
                ringkasan: {
                    total: hasil.ringkasan.total,
                    per_kondisi: hasil.ringkasan.perKondisi,
                    jumlah_dipinjam: hasil.ringkasan.jumlahDipinjam,
                    jumlah_dalam_perbaikan: hasil.ringkasan.jumlahDalamPerbaikan,
                },
            },
            meta: {
                page: hasil.page,
                per_page: hasil.perPage,
                total: hasil.total,
                total_pages: hasil.totalPages,
            },
        });
    };
}

/** `GET /assets` (FR-04.2): pencarian, filter, dan paginasi katalog aset. */
export function listAssetsHandler(service: AssetService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const query = ListAssetsQuerySchema.parse({
            page: req.query["page"],
            per_page: req.query["per_page"],
            q: req.query["q"],
            sort: req.query["sort"],
            kategori_id: req.query["filter[kategori_id]"],
            lokasi_id: req.query["filter[lokasi_id]"],
            kondisi: req.query["filter[kondisi]"],
            status: req.query["filter[status]"],
            tahun_perolehan: req.query["filter[tahun_perolehan]"],
            dapat_dipinjam: req.query["filter[dapat_dipinjam]"],
        });
        const hasil = await service.list(ctx, {
            page: query.page,
            perPage: query.per_page,
            sort: query.sort,
            ...(query.q === undefined ? {} : { q: query.q }),
            ...(query.kategori_id === undefined ? {} : { categoryId: query.kategori_id }),
            ...(query.lokasi_id === undefined ? {} : { roomId: query.lokasi_id }),
            ...(query.kondisi === undefined ? {} : { kondisi: query.kondisi }),
            ...(query.status === undefined ? {} : { status: query.status }),
            ...(query.tahun_perolehan === undefined ? {} : { tahunPerolehan: query.tahun_perolehan }),
            ...(query.dapat_dipinjam === undefined ? {} : { dapatDipinjam: query.dapat_dipinjam }),
        });
        res.status(200).json({
            success: true,
            data: hasil.rows,
            meta: {
                page: hasil.page,
                per_page: hasil.perPage,
                total: hasil.total,
                total_pages: hasil.totalPages,
            },
        });
    };
}

/** `PATCH /assets/{id}/condition` (FR-04.3): ubah kondisi + alasan, riwayat kondisi. */
export function updateAssetConditionHandler(service: AssetService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = AssetIdParamSchema.parse(req.params);
        const body = UpdateAssetConditionBodySchema.parse(req.body);
        const diperbarui = await service.ubahKondisi(ctx, id, {
            kondisi: body.kondisi,
            alasan: body.alasan,
            referensiJenis: body.referensi_jenis ?? null,
            referensiId: body.referensi_id ?? null,
        });
        res.status(200).json({ success: true, data: diperbarui, meta: null });
    };
}

/** `POST /assets/move` (FR-04.4): mutasi lokasi 1..50 aset ke satu ruangan tujuan, atomik. */
export function moveAssetsHandler(service: AssetService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = MoveAssetsBodySchema.parse(req.body);
        const dipindah = await service.mutasiLokasi(ctx, {
            assetIds: body.asset_ids,
            roomTujuanId: body.room_tujuan_id,
            tanggal: body.tanggal_mutasi,
            alasan: body.alasan,
            penanggungJawabBaruId: body.penanggung_jawab_baru_id ?? null,
        });
        res.status(200).json({ success: true, data: dipindah, meta: { jumlah_aset: dipindah.length } });
    };
}
