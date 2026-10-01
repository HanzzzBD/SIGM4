// Pekerjaan slot (Bab 26 "Pekerjaan tambahan", SDD-01 §4.6; PR-02-37, keputusan 88d):
//   * `tentative-slot-expiry` (tiap 15 menit, BR-023b) — slot TENTATIVE yang melewati TTL
//     dilepas lewat SlotService; `TentativeSlotExpired` terbit per slot bagi modul pengaju.
//   * `slot-activation` (tiap 5 menit, BR-005b, CI-05) — `assets.status` DIRESERVASI
//     mengikuti slot CONFIRMED yang mencakup waktu kini, lewat fungsi milik M-04.
// Keduanya idempoten (JOB-03), berpelaku SYSTEM (AL-06), dan meninggalkan ringkasan JOB-05.

import type { Kysely } from "kysely";
import { sinkronkanStatusDireservasi } from "../modules/m04-assets/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import { BATCH_KEDALUWARSA, SlotService } from "../shared/booking/index.js";
import type { Clock } from "../shared/clock/index.js";
import type { Database } from "../shared/db/index.js";
import { withTransaction } from "../shared/db/index.js";
import { Logger } from "../shared/observability/index.js";
import type { RingkasanPekerjaan } from "./system-job.js";
import { jalankanPekerjaanSistem } from "./system-job.js";

export const PEKERJAAN_KEDALUWARSA_SLOT = "tentative-slot-expiry";
export const PEKERJAAN_AKTIVASI_SLOT = "slot-activation";
/** Interval menit sama di UTC dan WIB (JOB-04). */
export const CRON_KEDALUWARSA_SLOT = "*/15 * * * *";
export const CRON_AKTIVASI_SLOT = "*/5 * * * *";

const auditUntuk = (clock: Clock, nama: string) => new AuditLogger({ clock, logger: new Logger({ clock, modulBawaan: nama }) });

/** Per batch, masing-masing transaksinya sendiri, sampai tak ada lagi slot kedaluwarsa. */
export async function jalankanKedaluwarsaSlot(db: Kysely<Database>, clock: Clock, batas = BATCH_KEDALUWARSA): Promise<RingkasanPekerjaan> {
    const slot = new SlotService(clock);
    return jalankanPekerjaanSistem({ nama: PEKERJAAN_KEDALUWARSA_SLOT, db, audit: auditUntuk(clock, PEKERJAAN_KEDALUWARSA_SLOT), clock }, async (ctx) => {
        let total = 0;
        for (;;) {
            const dilepas = await withTransaction(ctx, (scope) => slot.lepasTentatifKedaluwarsa(scope, batas), db);
            total += dilepas.length;
            if (dilepas.length < batas) break;
        }
        return { diproses: total, galat: 0 };
    });
}

export async function jalankanAktivasiSlot(db: Kysely<Database>, clock: Clock): Promise<RingkasanPekerjaan> {
    const audit = auditUntuk(clock, PEKERJAAN_AKTIVASI_SLOT);
    return jalankanPekerjaanSistem({ nama: PEKERJAAN_AKTIVASI_SLOT, db, audit, clock }, async (ctx) => {
        const { ditetapkan, dikembalikan } = await withTransaction(ctx, (scope) => sinkronkanStatusDireservasi(scope, audit, clock.now()), db);
        return { diproses: ditetapkan.length + dikembalikan.length, galat: 0, rincian: { ditetapkan: ditetapkan.length, dikembalikan: dikembalikan.length } };
    });
}
