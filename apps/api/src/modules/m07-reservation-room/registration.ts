// Pendaftaran M-07 ke titik ekstensi proses (SDD-APR-17, SDD-08 §4.2a; keputusan 75 log phase-02):
// penangan hasil approval & penyedia rincian notifikasi `RESERVASI_RUANGAN`, dan konsumen event
// `TentativeSlotExpired` (BR-023b, PR-02-37). API dan worker masing-masing memanggilnya saat menyala.

import type { ApprovalService } from "../m10-approval/index.js";
import { penanganHasil, penyediaRincian } from "../m10-approval/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { AuthContext } from "../../shared/auth/index.js";
import { EVENT_SLOT_TENTATIF_KEDALUWARSA } from "../../shared/booking/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import type { EventHandlerRegistry } from "../../shared/events/index.js";
import type { Kysely } from "kysely";
import { kedaluwarsakanReservasi, penangananReservasiRuangan, rincianReservasiRuangan } from "./services/approval-outcome.js";

/**
 * Sekali per proses: registri m10 menolak pendaftaran ganda, sedangkan perakit API dapat dipanggil
 * berulang (uji). Pendaftaran pertama berlaku — jam & logger proses yang sama.
 */
export function daftarkanReservasiRuangan(clock: Clock, audit: AuditLogger): void {
    if (penanganHasil.cari("RESERVASI_RUANGAN") === undefined) penanganHasil.daftar(penangananReservasiRuangan(clock, audit));
    if (penyediaRincian.cari("RESERVASI_RUANGAN") === undefined) penyediaRincian.daftar(rincianReservasiRuangan);
}

export interface KonsumenReservasiDeps {
    /** Dibaca saat event diproses, bukan saat dipasang. */
    readonly db: () => Kysely<Database>;
    readonly clock: Clock;
    /** Pelaku SYSTEM — dibentuk worker (SDD-03 §6, AL-06). */
    readonly ctx: () => AuthContext;
    readonly audit: AuditLogger;
    readonly approval: () => ApprovalService;
}

/** BR-023b: slot reservasi yang habis TTL → pengajuannya `KEDALUWARSA` (pemilik: M-07, keputusan 88d). */
export function pasangKonsumenReservasi(registry: EventHandlerRegistry, deps: KonsumenReservasiDeps): void {
    registry.on(EVENT_SLOT_TENTATIF_KEDALUWARSA, async (e) => {
        const p = (e.payload ?? {}) as Readonly<Record<string, unknown>>;
        // Slot pinjaman aset (`loan_id`) milik M-08/M-09; hanya reservasi ruangan di sini.
        if (p["reservation_id"] === null || p["reservation_id"] === undefined || p["resource_type"] !== "room") return;
        await withTransaction(deps.ctx(), (scope) => kedaluwarsakanReservasi(scope, { clock: deps.clock, audit: deps.audit, approval: deps.approval() }, Number(p["reservation_id"])), deps.db());
    });
}
