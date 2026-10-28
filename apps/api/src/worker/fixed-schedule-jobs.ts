// Job `fixed-schedule-materialize` (FR-07.5 langkah 4, A4; PR-03-13, keputusan 19e log phase-03):
// setiap hari 00:30 WIB memperpanjang horizon bergulir slot jadwal tetap aktif dan melepas
// kemunculan mendatang yang kini jatuh pada hari libur. Satu transaksi per aturan — satu aturan
// yang gagal tak menghentikan yang lain (JOB-05). Idempoten (JOB-03), berpelaku SYSTEM (AL-06).

import type { Kysely } from "kysely";
import { BlockService, CancellationService } from "../modules/m07-reservation-room/index.js";
import { ApprovalService } from "../modules/m10-approval/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import { BusinessCalendarService } from "../shared/calendar/index.js";
import type { Clock } from "../shared/clock/index.js";
import type { Database } from "../shared/db/index.js";
import { withTransaction } from "../shared/db/index.js";
import { Logger } from "../shared/observability/index.js";
import type { RingkasanPekerjaan } from "./system-job.js";
import { jalankanPekerjaanSistem } from "./system-job.js";

export const PEKERJAAN_MATERIALISASI_JADWAL_TETAP = "fixed-schedule-materialize";

export async function jalankanMaterialisasiJadwalTetap(db: Kysely<Database>, clock: Clock): Promise<RingkasanPekerjaan> {
    const audit = new AuditLogger({ clock, logger: new Logger({ clock, modulBawaan: PEKERJAAN_MATERIALISASI_JADWAL_TETAP }) });
    const kalender = new BusinessCalendarService();
    const approval = new ApprovalService(db, audit, clock, kalender);
    const blokade = new BlockService(db, clock, kalender, audit, new CancellationService(db, clock, audit, approval));
    return jalankanPekerjaanSistem({ nama: PEKERJAAN_MATERIALISASI_JADWAL_TETAP, db, audit, clock }, async (ctx) => {
        const { ids, bersama } = await withTransaction(ctx, async (scope) => ({ ids: await blokade.idAturanAktif(scope), bersama: await blokade.siapkanSinkron(scope) }), db);
        let dibuat = 0;
        let dilepas = 0;
        let bentrok = 0;
        let galat = 0;
        for (const id of ids) {
            try {
                const h = await withTransaction(ctx, (scope) => blokade.sinkronAturan(scope, id, bersama), db);
                dibuat += h.dibuat;
                dilepas += h.dilepas;
                bentrok += h.bentrok;
            } catch {
                // Mis. 23P01 karena reservasi baru masuk di antara pemeriksaan & sisipan — dicoba lagi besok.
                galat += 1;
            }
        }
        return { diproses: ids.length, galat, rincian: { aturan: ids.length, slot_dibuat: dibuat, slot_dilepas_libur: dilepas, kemunculan_bentrok: bentrok } };
    });
}
