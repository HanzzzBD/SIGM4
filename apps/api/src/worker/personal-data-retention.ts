import type { Kysely } from "kysely";
import type { Database } from "../shared/db/index.js";
import { withTransaction } from "../shared/db/index.js";
import type { Clock } from "../shared/clock/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import { PseudonymizationService, purgeUserImportReports } from "../modules/m02-users/index.js";
import { purgeRoomScheduleImportReports } from "../modules/m07-reservation-room/index.js";
import { purgeAssetImportReports } from "../modules/m04-assets/index.js";
import { jalankanPekerjaanSistem } from "./system-job.js";

export const PERSONAL_DATA_RETENTION_JOB = "personal-data-retention";
export function runPersonalDataRetention(db: Kysely<Database>, clock: Clock) {
    const audit = new AuditLogger({ clock });
    return jalankanPekerjaanSistem({ nama: PERSONAL_DATA_RETENTION_JOB, db, clock, audit }, async ctx => {
        const users = await new PseudonymizationService(db, clock, audit).automatic(ctx);
        let userReports = 0, assetReports = 0, scheduleReports = 0;
        for (;;) {
            const batch = await withTransaction(ctx, async scope => ({ users: await purgeUserImportReports(scope, clock, audit), assets: await purgeAssetImportReports(scope, clock, audit), schedules: await purgeRoomScheduleImportReports(scope, clock, audit) }), db);
            userReports += batch.users; assetReports += batch.assets; scheduleReports += batch.schedules;
            if (batch.users < 200 && batch.assets < 200 && batch.schedules < 200) break;
        }
        return { diproses: users.diproses + userReports + assetReports + scheduleReports, galat: 0,
            rincian: { dipseudonimkan: users.dipseudonimkan, terblokir: users.terblokir, laporan_pengguna: userReports, laporan_aset: assetReports, laporan_jadwal: scheduleReports } };
    });
}
