// Pekerjaan `orphan-file-cleanup` (SDD-FS-09, SDD-09 §4.6; PR-03-07): berkas yatim > 24 jam
// dibersihkan beserta objek & turunannya, berpelaku SYSTEM (AL-06). Ringkasannya satu entri
// `SCHEDULED_JOB_EXECUTED` (JOB-05). Idempoten (JOB-03): baris yang sudah terhapus tak terpilih lagi.

import type { Kysely } from "kysely";
import { FileLifecycleService, PEKERJAAN_BERSIH_YATIM } from "../modules/m06-documents/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import type { Clock } from "../shared/clock/index.js";
import type { Database } from "../shared/db/index.js";
import { Logger } from "../shared/observability/index.js";
import type { PenyimpananObjek } from "../shared/storage/index.js";
import type { RingkasanPekerjaan } from "./system-job.js";
import { jalankanPekerjaanSistem } from "./system-job.js";

export { PEKERJAAN_BERSIH_YATIM };

export async function jalankanBersihYatim(db: Kysely<Database>, penyimpanan: PenyimpananObjek, clock: Clock): Promise<RingkasanPekerjaan> {
    const logger = new Logger({ clock, modulBawaan: PEKERJAAN_BERSIH_YATIM });
    const audit = new AuditLogger({ clock, logger });
    return jalankanPekerjaanSistem({ nama: PEKERJAAN_BERSIH_YATIM, db, audit, clock }, async (ctx) => {
        const hasil = await new FileLifecycleService(db, penyimpanan, logger, clock).bersihkanYatim(ctx);
        return { diproses: hasil.diproses, galat: hasil.galat };
    });
}
