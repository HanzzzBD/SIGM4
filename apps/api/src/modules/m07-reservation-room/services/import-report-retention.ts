import { sql } from "kysely";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { IMPORT_REPORT_RETENTION_MS } from "../../../shared/import/index.js";

export async function purgeRoomScheduleImportReports(scope: TransactionScope, clock: Clock, audit: AuditLogger) {
    if (!isSystemAuthContext(scope.ctx)) throw new ForbiddenError();
    const rows = await sql<{ id: string }>`with due as (select id from room_schedule_import_jobs where status in ('SELESAI','GAGAL')
        and selesai_pada <= ${new Date(clock.now().getTime() - IMPORT_REPORT_RETENTION_MS)} and report_purged_at is null
        order by selesai_pada,id limit 200 for update skip locked)
        update room_schedule_import_jobs j set laporan_gagal='[]'::jsonb,berkas=null,pesan_galat=null,nama_berkas='impor-'||j.id,
        report_purged_at=${clock.now()},updated_by=null from due where j.id=due.id returning j.id`.execute(scope.tx);
    if (rows.rows.length) await audit.write(scope, { modul: "m07-reservation-room", aksi: "ROOM_SCHEDULE_IMPORT_REPORT_PURGED", entitas: "room_schedule_import_jobs",
        nilaiSesudah: { ids: rows.rows.map(r => r.id), jumlah: rows.rows.length }, keterangan: "Retensi laporan impor 30 hari berakhir." });
    return rows.rows.length;
}
