import { createHash } from "node:crypto";
import type { TransactionScope } from "../../../shared/db/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
export async function registerReportExportFile(scope: TransactionScope, input: { id: string; ownerId: number; key: string; bytes: Buffer; format: "PDF" | "XLSX"; now: Date }) {
    if (!isSystemAuthContext(scope.ctx)) throw new ForbiddenError();
    if (input.format === "PDF" && input.bytes.subarray(0, 8).toString("ascii") !== "%PDF-1.7" || input.format === "XLSX" && input.bytes.subarray(0, 2).toString("ascii") !== "PK") throw new Error("Format keluaran laporan tidak sah.");
    return (await scope.tx.insertInto("stored_files").values({ object_key: input.key, mime: input.format === "PDF" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ukuran: input.bytes.length,
        checksum: createHash("sha256").update(input.bytes).digest("hex"), scan_status: "CLEAN", scanned_at: input.now, owner_type: "REPORT_EXPORT", owner_id: input.id, uploaded_by: input.ownerId, created_at: input.now }).returning("id").executeTakeFirstOrThrow()).id;
}
export async function detachReportExportFile(scope: TransactionScope, id: string) {
    if (!isSystemAuthContext(scope.ctx)) throw new ForbiddenError();
    await scope.tx.updateTable("stored_files").set({ owner_id: null }).where("id", "=", id).where("owner_type", "=", "REPORT_EXPORT").execute();
}
