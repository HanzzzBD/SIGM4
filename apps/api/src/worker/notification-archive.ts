// Pekerjaan `notification-archive` (Bab 26, harian 01:30 WIB; FR-17.1 A2, SDD-08 §4.6;
// keputusan 79d): memindahkan notifikasi berusia > 90 hari ke `notifications_archive`
// per batch 5.000 baris, masing-masing transaksinya sendiri. Idempoten (JOB-03): yang
// sudah dipindah tak lagi ada di tabel utama. Pelaku SYSTEM, ringkasan JOB-05.

import type { Kysely } from "kysely";
import { arsipkanNotifikasi } from "../modules/m17-notifications/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import type { Clock } from "../shared/clock/index.js";
import type { Database } from "../shared/db/index.js";
import { Logger } from "../shared/observability/index.js";
import type { RingkasanPekerjaan } from "./system-job.js";
import { jalankanPekerjaanSistem } from "./system-job.js";

export const PEKERJAAN_ARSIP_NOTIFIKASI = "notification-archive";

export async function jalankanArsipNotifikasi(db: Kysely<Database>, clock: Clock, batch?: number): Promise<RingkasanPekerjaan> {
    const audit = new AuditLogger({ clock, logger: new Logger({ clock, modulBawaan: PEKERJAAN_ARSIP_NOTIFIKASI }) });
    return jalankanPekerjaanSistem({ nama: PEKERJAAN_ARSIP_NOTIFIKASI, db, audit, clock }, async (ctx) => {
        const dipindah = await arsipkanNotifikasi(db, ctx, clock, batch);
        return { diproses: dipindah, galat: 0 };
    });
}
