import type { RequestHandler } from "express";
import { ImportAssetsBodySchema } from "@sigm4/schemas";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { AssetIdParamSchema } from "../schemas/asset.schema.js";
import type { AssetImportService } from "../services/asset-import.service.js";

function present(job: ReturnType<AssetImportService["report"]>) {
    return { id: job.id, nama_berkas: job.nama_berkas, status: job.status, total: job.total_baris, terproses: job.baris_terproses, sukses: job.sukses, gagal: job.gagal, unit_dibuat: job.unit_dibuat, laporan_gagal: job.laporan_gagal, pesan_galat: job.pesan_galat, selesai_pada: job.selesai_pada?.toISOString() ?? null, dibuat_pada: job.created_at.toISOString(), report_expires_at: job.report_expires_at, report_expired: job.report_expired };
}
export function importAssetsHandler(service: AssetImportService): RequestHandler {
    return async (req, res) => {
        const input = ImportAssetsBodySchema.parse(req.body);
        const { job, replay } = await service.submit(requireAuthContext(res), { filename: input.filename, contentBase64: input.content_base64 });
        res.setHeader("Cache-Control", "private, no-store");
        res.status(job.status === "SELESAI" || job.status === "GAGAL" ? 200 : 202).json({ success: true, data: present(service.report(job)), meta: { idempotent_replay: replay } });
    };
}
export function getAssetImportHandler(service: AssetImportService): RequestHandler {
    return async (req, res) => {
        const { id } = AssetIdParamSchema.parse(req.params);
        res.setHeader("Cache-Control", "private, no-store");
        res.json({ success: true, data: present(service.report(await service.get(requireAuthContext(res), id))), meta: null });
    };
}
export function assetImportTemplateHandler(service: AssetImportService): RequestHandler {
    return async (_req, res) => {
        const content = await service.template(requireAuthContext(res));
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="template_aset.xlsx"');
        res.send(content);
    };
}
