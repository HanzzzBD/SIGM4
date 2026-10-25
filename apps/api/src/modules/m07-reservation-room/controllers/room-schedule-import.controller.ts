import type { RequestHandler } from "express";
import { ImportRoomScheduleBodySchema, BlockIdParamSchema } from "@sigm4/schemas";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { RoomScheduleImportService } from "../services/room-schedule-import.service.js";

function present(j: ReturnType<RoomScheduleImportService["report"]>) {
    return { id: j.id, nama_berkas: j.nama_berkas, status: j.status, total: j.total_baris, terproses: j.baris_terproses, sukses: j.sukses, gagal: j.gagal, laporan_gagal: j.laporan_gagal, pesan_galat: j.pesan_galat,
        selesai_pada: j.selesai_pada?.toISOString() ?? null, dibuat_pada: j.created_at.toISOString(), report_expires_at: j.report_expires_at, report_expired: j.report_expired };
}
export function importRoomSchedulesHandler(service: RoomScheduleImportService): RequestHandler {
    return async (req, res) => {
        const v = ImportRoomScheduleBodySchema.parse(req.body);
        const { job, replay } = await service.submit(requireAuthContext(res), { filename: v.filename, contentBase64: v.content_base64 });
        res.setHeader("Cache-Control", "private, no-store");
        res.status(job.status === "SELESAI" || job.status === "GAGAL" ? 200 : 202).json({ success: true, data: present(service.report(job)), meta: { idempotent_replay: replay } });
    };
}
export function getRoomScheduleImportHandler(service: RoomScheduleImportService): RequestHandler {
    return async (req, res) => {
        const { id } = BlockIdParamSchema.parse(req.params);
        res.setHeader("Cache-Control", "private, no-store");
        res.json({ success: true, data: present(service.report(await service.get(requireAuthContext(res), id))), meta: null });
    };
}
export function roomScheduleTemplateHandler(service: RoomScheduleImportService): RequestHandler {
    return async (_req, res) => {
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="template_jadwal_tetap.csv"');
        res.send(await service.template(requireAuthContext(res)));
    };
}
