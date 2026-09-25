// Controller M-04: validasi skema (SDD-API-01), lalu delegasi ke AssetService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { CreateAssetBodySchema, ListRoomAssetsQuerySchema, RoomIdParamSchema } from "../schemas/asset.schema.js";
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
