// Controller M-18: validasi skema (SDD-API-01), lalu delegasi ke ActivityLogService.

import type { Request, RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import {
    ExportActivityLogsQuerySchema,
    ListActivityLogsQuerySchema,
} from "../schemas/activity-log.schema.js";
import type {
    ActivityLogFilter,
    ActivityLogRow,
} from "../repositories/activity-log.repository.js";
import type { ActivityLogService } from "../services/activity-log.service.js";

/** Filter `filter[kunci]` (Bab 17.1) — parser `simple` Express 5 tidak menguraikan tanda kurung. */
function bacaFilterMentah(req: Request) {
    return {
        dari: req.query["filter[dari]"],
        sampai: req.query["filter[sampai]"],
        user_id: req.query["filter[user_id]"],
        role: req.query["filter[role]"],
        modul: req.query["filter[modul]"],
        aksi: req.query["filter[aksi]"],
        entitas: req.query["filter[entitas]"],
        entitas_id: req.query["filter[entitas_id]"],
    };
}

function keFilterRepo(query: {
    readonly dari?: Date | undefined;
    readonly sampai?: Date | undefined;
    readonly user_id?: number | undefined;
    readonly role?: string | undefined;
    readonly modul?: string | undefined;
    readonly aksi?: string | undefined;
    readonly entitas?: string | undefined;
    readonly entitas_id?: number | undefined;
}): ActivityLogFilter {
    return {
        ...(query.dari === undefined ? {} : { dari: query.dari }),
        ...(query.sampai === undefined ? {} : { sampai: query.sampai }),
        ...(query.user_id === undefined ? {} : { userId: query.user_id }),
        ...(query.role === undefined ? {} : { role: query.role }),
        ...(query.modul === undefined ? {} : { modul: query.modul }),
        ...(query.aksi === undefined ? {} : { aksi: query.aksi }),
        ...(query.entitas === undefined ? {} : { entitas: query.entitas }),
        ...(query.entitas_id === undefined ? {} : { entitasId: query.entitas_id }),
    };
}

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
            ...bacaFilterMentah(req),
        });
        const hasil = await service.list(ctx, {
            page: query.page,
            perPage: query.per_page,
            ...keFilterRepo(query),
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

/** `GET /activity-logs/export` (FR-18.2 langkah 5). Respons biner, bukan JSON. */
export function exportActivityLogsHandler(service: ActivityLogService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const query = ExportActivityLogsQuerySchema.parse(bacaFilterMentah(req));
        const hasil = await service.export(ctx, keFilterRepo(query));

        res.status(200)
            .setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            .setHeader("Content-Disposition", 'attachment; filename="activity-logs.xlsx"')
            .send(hasil.buffer);
    };
}
