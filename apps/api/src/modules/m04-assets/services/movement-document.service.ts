import { z } from "zod";
import type { Kysely } from "kysely";
import { AssetMovementDocumentSchema, AssetMovementSnapshotSchema } from "@sigm4/schemas";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import type { AuthContext, SystemAuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { registerMovementPdf, urlUnduhBerkas } from "../../m06-documents/index.js";
import { movementDocumentRepository } from "../repositories/movement-document.repository.js";
import { movementDocumentHtml } from "./movement-pdf.js";

export const EVENT_MOVEMENT_DOCUMENT_REQUESTED = "AssetMovementDocumentRequested";
export const MOVEMENT_DOCUMENT_JOB_NAME = "asset-movement-document";
export const movementDocumentQueueId = (id: string) => `movement-document-${id}`;
const JobPayload = z.object({ document_id: z.coerce.number().int().positive().safe().transform(String) }).strict();
const MODUL = "m04-assets";

export class MovementDocumentService {
    constructor(private readonly db: Kysely<Database>, private readonly audit: AuditLogger,
        private readonly clock: Clock, private readonly storage: PenyimpananObjek) {}

    private async readable(ctx: AuthContext, id: string) {
        if (!ctx.can("asset_movement_document.view")) throw new ForbiddenError();
        const row = await movementDocumentRepository(this.db).get(ctx, id, "asset_movement_document.view");
        if (row === undefined) throw new NotFoundError();
        return row;
    }
    async status(ctx: AuthContext, id: string) {
        const row = await this.readable(ctx, id);
        return AssetMovementDocumentSchema.parse({ id: row.id, status: row.status, snapshot: row.snapshot,
            pesan_galat: row.pesan_galat, selesai_pada: row.selesai_pada?.toISOString() ?? null });
    }
    async download(ctx: AuthContext, id: string) {
        const row = await this.readable(ctx, id);
        if (row.status !== "SIAP" || row.file_id === null) throw new DomainError("FILE_NOT_SCANNED", "Berita acara belum siap diunduh. Mutasi yang tersimpan tetap berlaku.");
        const file = await movementDocumentRepository(this.db).file(ctx, row.file_id);
        const signed = await urlUnduhBerkas(this.storage, this.clock, file);
        await withTransaction(ctx, async (scope) => {
            await this.audit.write(scope, { modul: MODUL, aksi: "ASSET_MOVEMENT_DOCUMENT_DOWNLOADED",
                entitas: "asset_movement_documents", entitasId: id, nilaiSesudah: { file_id: row.file_id, expires_at: signed.expiresAt.toISOString() } });
        }, this.db);
        return { url: signed.url, expires_at: signed.expiresAt.toISOString(), nama_berkas: `berita-acara-mutasi-${id}.pdf` };
    }

    async run(ctx: SystemAuthContext, payload: unknown, pdf: PembangkitPdf, lastAttempt: boolean): Promise<void> {
        if (!isSystemAuthContext(ctx)) throw new ForbiddenError();
        const { document_id: id } = JobPayload.parse(payload);
        // Session lock bebas transaksi selama I/O. Satu koneksi menjamin unlock di sesi yang sama.
        await this.db.connection().execute(async (connection) => {
            const repo = movementDocumentRepository(connection);
            await repo.lockWorker(ctx, id);
            try {
                const row = await repo.get(ctx, id);
                if (row === undefined || row.status === "SIAP" || row.status === "GAGAL") return;
                await withTransaction(ctx, async (scope) => {
                    if (await movementDocumentRepository(scope.tx).start(ctx, id)) {
                        await this.audit.write(scope, { modul: MODUL, aksi: "ASSET_MOVEMENT_DOCUMENT_STARTED", entitas: "asset_movement_documents", entitasId: id });
                    }
                }, connection);
                let uploaded = false;
                try {
                    const snapshot = AssetMovementSnapshotSchema.parse(row.snapshot);
                    const bytes = await pdf.render(movementDocumentHtml(id, snapshot));
                    if (bytes.subarray(0, 8).toString("ascii") !== "%PDF-1.7") throw new Error("PDF tidak sesuai versi 1.7.");
                    // Tandai sebelum PUT: kegagalan jaringan dapat terjadi sesudah objek tersimpan.
                    uploaded = true;
                    await this.storage.simpan(row.object_key, bytes, "application/pdf");
                    await withTransaction(ctx, async (scope) => {
                        const fileId = await registerMovementPdf(scope, this.audit, this.clock,
                            { objectKey: row.object_key, bytes, ownerId: id, creatorId: String(row.created_by) });
                        await movementDocumentRepository(scope.tx).finish(ctx, id, this.clock.now(), { fileId });
                        await this.audit.write(scope, { modul: MODUL, aksi: "ASSET_MOVEMENT_DOCUMENT_READY", entitas: "asset_movement_documents", entitasId: id, nilaiSesudah: { file_id: fileId } });
                    }, connection);
                } catch (error) {
                    // Bila kompensasi storage gagal, kunci tetap tersimpan pada operasi untuk diagnosis.
                    let compensationError: unknown;
                    if (uploaded) try { await this.storage.hapus(row.object_key); } catch (failure) { compensationError = failure; }
                    if (lastAttempt) await withTransaction(ctx, async (scope) => {
                        await movementDocumentRepository(scope.tx).finish(ctx, id, this.clock.now(), { error: "Berita acara gagal dibuat. Mutasi telah tersimpan; hubungi Administrator." });
                        await this.audit.write(scope, { modul: MODUL, aksi: "ASSET_MOVEMENT_DOCUMENT_FAILED", entitas: "asset_movement_documents", entitasId: id });
                    }, connection);
                    if (compensationError !== undefined) throw new AggregateError([error, compensationError], "Pembuatan PDF dan pembersihan objek gagal.", { cause: error });
                    throw error;
                }
            } finally { await repo.unlockWorker(ctx, id); }
        });
    }
}
