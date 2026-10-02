// Route M-06 (SDD-AUTH-01, PM-01) + perakit router modul. Katalog: m06-documents.md §7.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { confirmHandler, presignHandler } from "./controllers/file.controller.js";
import { ConfirmBodySchema, ConfirmResponseSchema, PresignBodySchema, PresignResponseSchema } from "./schemas/file.schema.js";
import { FileService } from "./services/file.service.js";

/** Pemilik katalog endpoint M-06 (m06-documents.md §7). */
const MODUL = "m06-documents";

/** Bab 17.5 poin 6, SDD-FS-01: Bearer — otorisasi jenis berkas terjadi saat penautan ke entitas. */
export const presignRoute = defineRoute({
    method: "POST",
    path: "/files/presign",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Minta URL unggah bertanda tangan (300 detik); MIME & ukuran diperiksa per jenis (SDD-09 §4.3)",
    body: PresignBodySchema,
    response: PresignResponseSchema,
    successStatus: 201,
});

/** SDD-09 §4.2 langkah 3: objek & ukuran diverifikasi, `FILE_UPLOADED` dicatat, `FileUploaded` terbit. */
export const confirmRoute = defineRoute({
    method: "POST",
    path: "/files/confirm",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftarkan berkas terunggah & antrekan pemindaian AV",
    body: ConfirmBodySchema,
    response: ConfirmResponseSchema,
    successStatus: 200,
});

export interface FilesModuleDeps {
    readonly db: Kysely<Database>;
    readonly penyimpanan: PenyimpananObjek;
    readonly auditLogger: AuditLogger;
    readonly clock: Clock;
}

/** Router M-06. `batasi`/`terautentikasi` datang dari perakit `api/index.ts`. */
export function filesRouter(deps: FilesModuleDeps, batasi: (route: RouteDefinition) => RequestHandler, terautentikasi: () => RequestHandler): Router {
    const service = new FileService(deps.db, deps.penyimpanan, deps.auditLogger, deps.clock);
    const router = express.Router();
    router.post(presignRoute.path, batasi(presignRoute), terautentikasi(), presignHandler(service));
    router.post(confirmRoute.path, batasi(confirmRoute), terautentikasi(), confirmHandler(service));
    return router;
}
