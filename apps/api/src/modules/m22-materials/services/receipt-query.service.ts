import { sql } from "kysely";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { urlUnduhBerkas } from "../../m06-documents/index.js";
export async function materialReceiptHistory(scope: TransactionScope, id: string, page: number, perPage: number, clock: Clock, storage: PenyimpananObjek) {
    if (!scope.ctx.can("material.view")) throw new ForbiddenError();
    if (!await scope.tx.selectFrom("materials").select("id").where("id", "=", id).executeTakeFirst()) throw new NotFoundError();
    const query = scope.tx.selectFrom("material_receipts as r").innerJoin("rooms as l", "l.id", "r.room_id").innerJoin("users as u", "u.id", "r.created_by").where("r.material_id", "=", id);
    const count = await query.select(e => e.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
    const rows = await query.selectAll("r").select(["l.nama as lokasi", "u.nama as pelaksana", sql<string>`to_char(r.tanggal_terima,'YYYY-MM-DD')`.as("tanggal_terima")]).orderBy("r.id", "desc").limit(perPage).offset((page - 1) * perPage).execute();
    const data = await Promise.all(rows.map(async r => {
        const files = await scope.tx.selectFrom("material_receipt_files as f").innerJoin("stored_files as s", "s.id", "f.file_id").select(["f.file_id", "f.nama_berkas", "s.object_key", "s.scan_status"]).where("f.receipt_id", "=", r.id).orderBy("f.file_id").execute();
        return { ...r, created_at: r.created_at.toISOString(), dokumen: await Promise.all(files.map(async f => ({ file_id: f.file_id, nama_berkas: f.nama_berkas, status: f.scan_status, url: f.scan_status === "CLEAN" ? (await urlUnduhBerkas(storage, clock, f)).url : null }))) };
    }));
    return { data, meta: { page, per_page: perPage, total: Number(count.n), total_pages: Math.max(1, Math.ceil(Number(count.n) / perPage)) } };
}
