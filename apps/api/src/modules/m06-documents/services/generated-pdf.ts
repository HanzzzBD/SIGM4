import { createHash } from "node:crypto";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { createStoredFileRepository } from "../repositories/stored-file.repository.js";

/** Permukaan khusus keluaran renderer terpercaya; tidak menerima input HTTP. */
export async function registerMovementPdf(scope: TransactionScope, audit: AuditLogger, clock: Clock,
    input: { readonly objectKey: string; readonly bytes: Buffer; readonly ownerId: string; readonly creatorId: string }): Promise<string> {
    if (!isSystemAuthContext(scope.ctx)) throw new ForbiddenError();
    if (input.bytes.subarray(0, 8).toString("ascii") !== "%PDF-1.7") throw new Error("Renderer harus menghasilkan PDF 1.7.");
    const checksum = createHash("sha256").update(input.bytes).digest("hex");
    const id = await createStoredFileRepository(scope.tx).registerMovementPdf(scope.ctx, { ...input, checksum, size: input.bytes.length, now: clock.now() });
    await audit.write(scope, { modul: "m06-documents", aksi: "FILE_GENERATED", entitas: "stored_files", entitasId: id,
        nilaiSesudah: { file_id: id, owner_id: input.ownerId, mime: "application/pdf", ukuran: input.bytes.length, checksum } });
    return id;
}
export async function registerStocktakePdf(scope: TransactionScope, audit: AuditLogger, clock: Clock, input: { objectKey: string; bytes: Buffer; ownerId: string; creatorId: string }) {
    if (!isSystemAuthContext(scope.ctx)) throw new ForbiddenError();
    if (input.bytes.subarray(0, 8).toString("ascii") !== "%PDF-1.7") throw new Error("Renderer harus menghasilkan PDF 1.7.");
    const checksum = createHash("sha256").update(input.bytes).digest("hex");
    const row = await createStoredFileRepository(scope.tx).registerStocktakePdf(scope.ctx, { ...input, checksum, size: input.bytes.length, now: clock.now() });
    await audit.write(scope, { modul: "m06-documents", aksi: "FILE_GENERATED", entitas: "stored_files", entitasId: row.id, nilaiSesudah: { owner_id: input.ownerId, owner_type: "STOCKTAKE_REPORT", checksum } });
    return row.id;
}
