// Pekerjaan `student-graduation` (Bab 12.4, SL-03, DP-10, SDD-05 §4.7d): menonaktifkan
// lulusan setelah tahun ajarannya berakhir, berpelaku SYSTEM (AL-06) — tanpa
// permintaan HTTP. Idempoten (JOB-03): lulusan yang sudah nonaktif tidak dipilih lagi.

import type { Kysely } from "kysely";
import { GraduationService, tanggalWib } from "../modules/m02-users/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import type { Clock } from "../shared/clock/index.js";
import type { Database } from "../shared/db/index.js";
import { Logger } from "../shared/observability/index.js";
import type { RingkasanPekerjaan } from "./system-job.js";
import { jalankanPekerjaanSistem } from "./system-job.js";

export const PEKERJAAN_KELULUSAN = "student-graduation";

export async function jalankanKelulusan(db: Kysely<Database>, clock: Clock): Promise<RingkasanPekerjaan> {
    const audit = new AuditLogger({ clock, logger: new Logger({ clock, modulBawaan: PEKERJAAN_KELULUSAN }) });
    return jalankanPekerjaanSistem({ nama: PEKERJAAN_KELULUSAN, db, audit, clock }, async (ctx) => {
        // Hari WIB (CAL-03): tahun ajaran berakhir bila tanggal_selesai < hari ini.
        const hasil = await new GraduationService(db, audit).deactivateDueGraduates(ctx, tanggalWib(clock.now()));
        // SL-04: lulusan berkewajiban bukan galat — tetap AKTIF dan dilaporkan jumlahnya.
        return { diproses: hasil.diproses, galat: 0, rincian: { dinonaktifkan: hasil.dinonaktifkan, terblokir: hasil.terblokir.length } };
    });
}
