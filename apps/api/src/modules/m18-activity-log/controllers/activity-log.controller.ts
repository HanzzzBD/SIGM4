// Controller M-18: validasi skema (SDD-API-01), lalu delegasi ke ActivityLogService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { ListActivityLogsQuerySchema } from "../schemas/activity-log.schema.js";
import type { ActivityLogRow } from "../repositories/activity-log.repository.js";
import type { ActivityLogService } from "../services/activity-log.service.js";

function keLog(l: ActivityLogRow) {
    return {
        id: l.id,
        waktu: l.waktu,
        user_id: l.user_id,
        user_nama: l.user_nama,
        role: l.role,
        ip: l.ip,
        user_agent: l.user_agent,
        modul: l.modul,
        aksi: l.aksi,
        entitas: l.entitas,
        entitas_id: l.entitas_id,
        nilai_sebelum: l.nilai_sebelum,
        nilai_sesudah: l.nilai_sesudah,
        keterangan: l.keterangan,
        hasil: l.hasil,
        request_id: l.request_id,
    };
}

export function listActivityLogsHandler(service: ActivityLogService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const query = ListActivityLogsQuerySchema.parse({
            page: req.query["page"],
            per_page: req.query["per_page"],
            dari: req.query["filter[dari]"],
            sampai: req.query["filter[sampai]"],
            user_id: req.query["filter[user_id]"],
            role: req.query["filter[role]"],
            modul: req.query["filter[modul]"],
            aksi: req.query["filter[aksi]"],
            entitas: req.query["filter[entitas]"],
            entitas_id: req.query["filter[entitas_id]"],
        });
        const hasil = await service.list(ctx, {
            page: query.page,
            perPage: query.per_page,
            ...(query.dari === undefined ? {} : { dari: query.dari }),
            ...(query.sampai === undefined ? {} : { sampai: query.sampai }),
            ...(query.user_id === undefined ? {} : { userId: query.user_id }),
            ...(query.role === undefined ? {} : { role: query.role }),
            ...(query.modul === undefined ? {} : { modul: query.modul }),
            ...(query.aksi === undefined ? {} : { aksi: query.aksi }),
            ...(query.entitas === undefined ? {} : { entitas: query.entitas }),
            ...(query.entitas_id === undefined ? {} : { entitasId: query.entitas_id }),
        });
        res.status(200).json({
            success: true,
            data: hasil.rows.map(keLog),
            meta: {
                page: hasil.page,
                per_page: hasil.perPage,
                total: hasil.total,
                total_pages: hasil.totalPages,
            },
        });
    };
}
