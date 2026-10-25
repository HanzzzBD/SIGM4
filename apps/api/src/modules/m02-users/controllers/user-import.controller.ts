// Controller impor massal pengguna (FR-02.1 A4). Validasi skema (SDD-API-01),
// lalu delegasi ke UserImportService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { ImportJobRow } from "../repositories/user-import.repository.js";
import {
    ImportJobIdParamSchema,
    ImportUsersBodySchema,
} from "../schemas/user-import.schema.js";
import type { UserImportService } from "../services/user-import.service.js";
import { userImportTemplate } from "../services/user-import-template.js";

function keJob(job: ReturnType<UserImportService["report"]>): Record<string, unknown> {
    return {
        id: job.id,
        status: job.status,
        nama_berkas: job.nama_berkas,
        total: job.total_baris,
        terproses: job.baris_terproses,
        sukses: job.sukses,
        gagal: job.gagal,
        laporan_gagal: job.laporan_gagal,
        pesan_galat: job.pesan_galat,
        selesai_pada: job.selesai_pada?.toISOString() ?? null,
        dibuat_pada: job.created_at.toISOString(),
        report_expires_at: job.report_expires_at,
        report_expired: job.report_expired,
    };
}

/** 200 bila pekerjaan sudah berakhir; 202 bila masih di worker (IMPT-04). */
function kodeStatus(job: ImportJobRow): 200 | 202 {
    return job.status === "SELESAI" || job.status === "GAGAL" ? 200 : 202;
}

export function importUsersHandler(service: UserImportService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = ImportUsersBodySchema.parse(req.body);
        const { job, replay } = await service.submit(ctx, {
            filename: body.filename,
            contentBase64: body.content_base64,
        });
        res.status(kodeStatus(job)).json({
            success: true,
            data: keJob(service.report(job)),
            meta: { idempotent_replay: replay },
        });
    };
}

export function getUserImportHandler(service: UserImportService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = ImportJobIdParamSchema.parse(req.params);
        const job = await service.get(ctx, id);
        res.setHeader("Cache-Control", "private, no-store");
        res.status(200).json({ success: true, data: keJob(service.report(job)), meta: null });
    };
}

/** IMPT-05 (P-62): template XLSX E.5.2; izin `user.create` ditegakkan middleware route. */
export function userImportTemplateHandler(): RequestHandler {
    return async (_req, res) => {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="template_pengguna.xlsx"');
        res.send(await userImportTemplate());
    };
}
