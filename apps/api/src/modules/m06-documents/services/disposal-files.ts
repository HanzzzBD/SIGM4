import { createHash } from "node:crypto";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { sql } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import { ForbiddenError, DomainError } from "../../../shared/errors/index.js";
export async function claimDisposalFiles(scope: TransactionScope, kind: "DISPOSAL_ATTACHMENT" | "DISPOSAL_EXECUTION_PHOTO", ids: readonly number[], owner: string, clean: boolean) {
    if (!scope.ctx.can(kind === "DISPOSAL_ATTACHMENT" ? "disposal.create" : "disposal.execute")) throw new ForbiddenError();
    if (new Set(ids).size !== ids.length) throw new DomainError("VALIDATION_ERROR", "Berkas tidak boleh berulang.");
    if (!ids.length) return;
    const rows = await scope.tx.selectFrom("stored_files").select(["id", "mime"]).where("id", "in", ids.map(String)).where("owner_type", "=", kind).where("uploaded_by", "=", String(scope.ctx.userId)).where("checksum", "is not", null).where("scan_status", "in", clean ? ["CLEAN"] : ["PENDING", "CLEAN"]).where(e => e.or([e("owner_id", "is", null), e("owner_id", "=", owner)])).orderBy("id").forUpdate().execute();
    if (rows.length !== ids.length || (kind === "DISPOSAL_EXECUTION_PHOTO" && rows.some(r => !["image/jpeg", "image/png"].includes(r.mime)))) throw new DomainError("VALIDATION_ERROR", "Berkas penghapusan tidak sah, bukan milik Anda, telah dipakai, atau belum siap.");
    await scope.tx.updateTable("stored_files").set({ owner_id: owner }).where("id", "in", ids.map(String)).execute();
}
export async function releaseDisposalAttachments(scope: TransactionScope, owner: string, retained: readonly string[]) {
    await scope.tx.updateTable("stored_files").set({ owner_id: null }).where("owner_type", "=", "DISPOSAL_ATTACHMENT").where("owner_id", "=", owner).$if(retained.length > 0, q => q.where("id", "not in", retained)).execute();
}
export async function registerDisposalPdf(scope: TransactionScope, audit: AuditLogger, clock: Clock, input: { objectKey: string; bytes: Buffer; ownerId: string; creatorId: string }) {
    if (!isSystemAuthContext(scope.ctx)) throw new ForbiddenError();
    if (input.bytes.subarray(0, 8).toString() !== "%PDF-1.7") throw new Error("Renderer harus menghasilkan PDF 1.7.");
    const checksum = createHash("sha256").update(input.bytes).digest("hex");
    const row = await scope.tx.insertInto("stored_files").values({ object_key: input.objectKey, mime: "application/pdf", ukuran: input.bytes.length, checksum, scan_status: "CLEAN", scanned_at: clock.now(), owner_type: "DISPOSAL_REPORT", owner_id: input.ownerId, uploaded_by: input.creatorId }).returning("id").executeTakeFirstOrThrow();
    await audit.write(scope, { modul: "m06-documents", aksi: "FILE_GENERATED", entitas: "stored_files", entitasId: row.id, nilaiSesudah: { owner_type: "DISPOSAL_REPORT", owner_id: input.ownerId, checksum } }); return row.id;
}
/** Eligibility must detect warranty even when the proposer cannot open its document. No file URL. */
export async function disposalWarrantyFacts(db: QueryExecutor, ctx: AuthContext, assetId: string, date: string) {
    if (!ctx.can("disposal.create")) throw new ForbiddenError();
    const rows = await db.selectFrom("asset_documents as d").innerJoin("asset_document_links as l", "l.document_id", "d.id").select(["d.id", "d.nama_berkas", sql<string>`to_char(d.garansi_selesai,'YYYY-MM-DD')`.as("garansi_selesai")]).where("l.asset_id", "=", assetId).where("l.aktif", "=", true).where("d.dihapus", "=", false).where("d.jenis", "=", "GARANSI").where("d.garansi_mulai", "<=", date).where("d.garansi_selesai", ">=", date).orderBy("d.id").execute();
    return rows.map(r => ({ ...r, nama_berkas: ctx.can("asset_document.view") ? r.nama_berkas : "Garansi aktif" }));
}
