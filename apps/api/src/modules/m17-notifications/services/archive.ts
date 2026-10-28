// Pengarsipan notifikasi (FR-17.1 A2, SDD-08 §4.6; keputusan 79d). Dipanggil job worker
// `notification-archive` berpelaku SYSTEM.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { createNotificationRepository } from "../repositories/notification.repository.js";

/** FR-17.1 A2: notifikasi "lebih dari 90 hari" diarsipkan. */
export const UMUR_ARSIP_HARI = 90;
export const BATCH_ARSIP = 5_000;
const HARI_MS = 86_400_000;

/** Memindahkan per batch sampai habis; mengembalikan jumlah baris yang dipindah. */
export async function arsipkanNotifikasi(db: Kysely<Database>, ctx: AuthContext, clock: Clock, batch: number = BATCH_ARSIP): Promise<number> {
    const sebelum = new Date(clock.now().getTime() - UMUR_ARSIP_HARI * HARI_MS);
    let total = 0;
    for (;;) {
        const n = await withTransaction(ctx, (scope) => createNotificationRepository(scope.tx).arsipkanBatch(scope.ctx, sebelum, batch), db);
        total += n;
        if (n < batch) return total;
    }
}
