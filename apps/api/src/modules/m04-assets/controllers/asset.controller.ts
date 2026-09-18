// Controller M-04: validasi skema (SDD-API-01), lalu delegasi ke AssetService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { ListRoomAssetsQuerySchema, RoomIdParamSchema } from "../schemas/asset.schema.js";
import type { AssetService } from "../services/asset.service.js";

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
