import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import { AssetExportHttpQuerySchema, AssetExportQuerySchema } from "../schemas/asset.schema.js";
import { exportAssets } from "../services/asset-export.service.js";
export function exportAssetsHandler(db: Kysely<Database>, audit: AuditLogger, clock: Clock, pdf: PembangkitPdf): RequestHandler {
    return async (req, res) => {
        const q = AssetExportHttpQuerySchema.parse(req.query);
        const filter = AssetExportQuerySchema.parse({ format: q.format, q: q.q, sort: q.sort, import_job_id: q["filter[import_job_id]"], kategori_id: q["filter[kategori_id]"], lokasi_id: q["filter[lokasi_id]"], kondisi: q["filter[kondisi]"], status: q["filter[status]"], tahun_perolehan: q["filter[tahun_perolehan]"], dapat_dipinjam: q["filter[dapat_dipinjam]"], qr_terpasang: q["filter[qr_terpasang]"] });
        const bytes = await exportAssets(db, audit, clock, pdf, requireAuthContext(res), filter);
        res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Disposition", `attachment; filename="inventaris-aset.${filter.format}"`);
        res.type(filter.format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf"); res.status(200).send(bytes);
    };
}
