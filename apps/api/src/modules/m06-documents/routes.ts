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
import { createDocumentHandler, deleteDocumentHandler, downloadDocumentHandler, listDocumentsHandler } from "./controllers/document.controller.js";
import { confirmHandler, presignHandler } from "./controllers/file.controller.js";
import { AssetIdParamSchema, CreateDocumentBodySchema, DeleteDocumentResponseSchema, DocumentParamSchema, DocumentResponseSchema, DownloadResponseSchema, ListDocumentsResponseSchema } from "./schemas/document.schema.js";
import { DocumentService } from "./services/document.service.js";
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

/** FR-06.1 langkah 1 — tab Dokumen pada detail aset (keputusan 9a). */
export const listDocumentsRoute = defineRoute({
    method: "GET",
    path: "/assets/:id/documents",
    permission: "asset_document.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar dokumen aset beserta status pemindaian (FR-06.1)",
    params: AssetIdParamSchema,
    response: ListDocumentsResponseSchema,
});

/** SDD-09 §4.2 langkah 5: tautkan berkas terdaftar; A3 — satu dokumen untuk banyak aset. */
export const createDocumentRoute = defineRoute({
    method: "POST",
    path: "/assets/:id/documents",
    permission: "asset_document.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Tautkan dokumen aset dari berkas terdaftar (FR-06.1 langkah 2–5, A3)",
    params: AssetIdParamSchema,
    body: CreateDocumentBodySchema,
    response: DocumentResponseSchema,
    successStatus: 201,
});

/** FR-06.1 A2 (keputusan 9a/9b): lepas dari aset ini; tautan terakhir → dokumen dihapus (soft). */
export const deleteDocumentRoute = defineRoute({
    method: "DELETE",
    path: "/assets/:id/documents/:docId",
    permission: "asset_document.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Hapus dokumen dari aset (FR-06.1 A2)",
    params: DocumentParamSchema,
    response: DeleteDocumentResponseSchema,
});

/** SDD-09 §4.4: URL 15 menit, hanya berkas CLEAN (409 FILE_NOT_SCANNED); unduhan tercatat. */
export const downloadDocumentRoute = defineRoute({
    method: "GET",
    path: "/assets/:id/documents/:docId/download",
    permission: "asset_document.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "URL unduhan dokumen bertanda tangan 15 menit (FR-06.1)",
    params: DocumentParamSchema,
    response: DownloadResponseSchema,
});

export interface FilesModuleDeps {
    readonly db: Kysely<Database>;
    readonly penyimpanan: PenyimpananObjek;
    readonly auditLogger: AuditLogger;
    readonly clock: Clock;
}

/** Router M-06. `batasi`/`terautentikasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function filesRouter(
    deps: FilesModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    terautentikasi: () => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new FileService(deps.db, deps.penyimpanan, deps.auditLogger, deps.clock);
    const dokumen = new DocumentService(deps.db, deps.penyimpanan, deps.auditLogger, deps.clock);
    const router = express.Router();
    router.get(listDocumentsRoute.path, batasi(listDocumentsRoute), otorisasi(listDocumentsRoute.permission), listDocumentsHandler(dokumen));
    router.post(createDocumentRoute.path, batasi(createDocumentRoute), otorisasi(createDocumentRoute.permission), createDocumentHandler(dokumen));
    router.delete(deleteDocumentRoute.path, batasi(deleteDocumentRoute), otorisasi(deleteDocumentRoute.permission), deleteDocumentHandler(dokumen));
    router.get(downloadDocumentRoute.path, batasi(downloadDocumentRoute), otorisasi(downloadDocumentRoute.permission), downloadDocumentHandler(dokumen));
    router.post(presignRoute.path, batasi(presignRoute), terautentikasi(), presignHandler(service));
    router.post(confirmRoute.path, batasi(confirmRoute), terautentikasi(), confirmHandler(service));
    return router;
}
