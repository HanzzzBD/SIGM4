// Route M-05 (SDD-AUTH-01, PM-01) + perakit router modul. Katalog: m05-qr.md §7.
// `GET /assets/by-uuid/{uuid}`, `GET /public/assets/{uuid}` → PR-03-03; `POST /assets/qr/print` → PR-03-02.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { qrTerpasangHandler, regenerateQrHandler } from "./controllers/qr.controller.js";
import { AssetIdParamSchema, QrTerpasangBodySchema, QrTerpasangResponseSchema, RegenerateQrBodySchema, RegenerateQrResponseSchema } from "./schemas/qr.schema.js";
import { QrService } from "./services/qr.service.js";

/** Pemilik katalog endpoint M-05 (m05-qr.md §7). */
const MODUL = "m05-qr";

/**
 * FR-05.1 A2 — `asset.qr_regenerate` (🔒 inti Administrator). `200`: tidak ada sumber daya baru;
 * UUID aset yang ada diganti.
 */
export const regenerateQrRoute = defineRoute({
    method: "POST",
    path: "/assets/:id/qr/regenerate",
    permission: "asset.qr_regenerate",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Regenerasi UUID QR aset — QR lama tidak berlaku; alasan wajib (FR-05.1 A2)",
    params: AssetIdParamSchema,
    body: RegenerateQrBodySchema,
    response: RegenerateQrResponseSchema,
    successStatus: 200,
});

/** FR-05.1 langkah 5 — `asset.qr_print` (Administrator, Petugas Sarana Prasarana). */
export const qrTerpasangRoute = defineRoute({
    method: "PATCH",
    path: "/assets/qr-terpasang",
    permission: "asset.qr_print",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Tandai label QR terpasang/dilepas untuk 1–200 aset, atomik (FR-05.1 langkah 5)",
    body: QrTerpasangBodySchema,
    response: QrTerpasangResponseSchema,
});

export interface QrModuleDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
    /** `APP_BASE_URL` tervalidasi — dasar payload QR (FR-05.1). */
    readonly appBaseUrl: string;
}

/** Router M-05. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function qrRouter(deps: QrModuleDeps, batasi: (route: RouteDefinition) => RequestHandler, otorisasi: (permission: string) => RequestHandler): Router {
    const service = new QrService(deps.db, deps.auditLogger, deps.appBaseUrl);
    const router = express.Router();
    router.post(regenerateQrRoute.path, batasi(regenerateQrRoute), otorisasi(regenerateQrRoute.permission), regenerateQrHandler(service));
    router.patch(qrTerpasangRoute.path, batasi(qrTerpasangRoute), otorisasi(qrTerpasangRoute.permission), qrTerpasangHandler(service));
    return router;
}
