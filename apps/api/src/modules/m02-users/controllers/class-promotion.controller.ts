// Controller kenaikan kelas massal (SL-02). Validasi skema (SDD-API-01), lalu
// delegasi ke ClassPromotionService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { ClassPromotionBodySchema } from "../schemas/class-promotion.schema.js";
import type { ClassPromotionService, PromotionItem } from "../services/class-promotion.service.js";

export function classPromotionHandler(service: ClassPromotionService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = ClassPromotionBodySchema.parse(req.body);
        const items: PromotionItem[] = body.items.map((i) =>
            i.tindakan === "NAIK"
                ? { userId: i.user_id, tindakan: "NAIK", kelasId: i.kelas_id }
                : { userId: i.user_id, tindakan: "LULUS" },
        );
        const hasil = await service.promote(ctx, body.academic_year_id, items);
        res.status(200).json({
            success: true,
            data: {
                total: hasil.total,
                sukses: hasil.sukses,
                gagal: hasil.gagal,
                baris: hasil.baris.map((b) => ({
                    user_id: b.userId,
                    tindakan: b.tindakan,
                    status: b.status,
                    pesan: b.pesan,
                    kewajiban: b.kewajiban,
                })),
            },
            meta: null,
        });
    };
}
