// SessionService — logout, logout semua perangkat, daftar perangkat, dan cabut satu perangkat
// (FR-01.2, SDD-04 §4.6, SDD-SESS-04). Semua operasinya milik pemanggil sendiri (scope `own`).
//
// Pencabutan sebuah keluarga refresh token sekaligus mematikan access token-nya: `authenticate`
// memeriksa `sid` terhadap keluarga yang belum dicabut pada setiap permintaan
// (`shared/auth/session-store.ts`), jadi tidak ada jendela sampai `exp` (acceptance `PR-02-04`).

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { publishAll } from "../../../shared/events/index.js";
import type { DomainEvent } from "../../../shared/events/index.js";
import { createSessionRepository } from "../repositories/session.repository.js";
import type { SesiDicabut, SesiRow } from "../repositories/session.repository.js";
import { jejakKlien } from "./klien.js";
import type { KlienPermintaan } from "./klien.js";

const MODUL = "m01-auth";

/** Event outbox pencabutan sesi (SDD-07 §4.3); konsumennya — nonaktifkan token FCM (`MOB-SEC-05`) — dipasang `PR-02-25`. */
export const EVENT_SESI_DICABUT = "SessionRevoked";
const AGREGAT_PENGGUNA = "user";

/** Nilai `refresh_tokens.revoke_reason` (SDD-04 §4.6). */
const ALASAN_LOGOUT = "logout";
const ALASAN_LOGOUT_SEMUA = "logout_all";
const ALASAN_PERANGKAT = "device_revoked";

export interface SesiTampil extends SesiRow {
    /** Sesi yang membawa permintaan ini — UI menandainya dan tidak menawarkan "cabut" biasa. */
    readonly saat_ini: boolean;
}

function eventDicabut(ctx: AuthContext, sesi: SesiDicabut, alasan: string): DomainEvent {
    return {
        name: EVENT_SESI_DICABUT,
        aggregateType: AGREGAT_PENGGUNA,
        aggregateId: ctx.userId,
        payload: { user_id: String(ctx.userId), family_id: sesi.familyId, platform: sesi.platform, alasan },
    };
}

export class SessionService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
    ) {}

    /** Sesi aktif milik pengguna (FR-01.2 A1, UX P-79). */
    async daftar(ctx: AuthContext, sesiSaatIni: string): Promise<readonly SesiTampil[]> {
        const baris = await createSessionRepository(this.db).daftarAktif(ctx, this.clock.now());
        return baris.map((b) => ({ ...b, saat_ini: b.id === sesiSaatIni }));
    }

    /** `POST /auth/logout`: mencabut sesi yang membawa permintaan ini (FR-01.2 langkah 2, 4). */
    async logout(ctx: AuthContext, sesiSaatIni: string, klien: KlienPermintaan): Promise<void> {
        await withTransaction(
            ctx,
            (scope) => this.cabutSatu(scope, sesiSaatIni, ALASAN_LOGOUT, klien),
            this.db,
        );
    }

    /**
     * `DELETE /auth/sessions/{id}`: mencabut satu sesi milik pengguna sendiri. Sesi milik orang lain
     * dan sesi yang tidak ada dijawab SAMA (`403`, SDD-AUTH-08) — id sesi bukan rahasia yang boleh
     * diuji keberadaannya. Sesi milik sendiri yang sudah tercabut: idempotent, tanpa entri baru.
     * Mengembalikan `true` bila yang dicabut adalah sesi permintaan ini (klien membuang cookie).
     */
    async cabutPerangkat(ctx: AuthContext, sesiId: string, sesiSaatIni: string, klien: KlienPermintaan): Promise<boolean> {
        await withTransaction(
            ctx,
            async (scope) => {
                if (!(await createSessionRepository(scope.tx).adaMilik(ctx, sesiId))) {
                    throw new ForbiddenError("FORBIDDEN");
                }
                await this.cabutSatu(scope, sesiId, sesiId === sesiSaatIni ? ALASAN_LOGOUT : ALASAN_PERANGKAT, klien);
            },
            this.db,
        );
        return sesiId === sesiSaatIni;
    }

    /** `POST /auth/logout-all`: mencabut seluruh sesi pengguna (FR-01.2 A1, `LOGOUT_ALL_DEVICES`). */
    async logoutSemua(ctx: AuthContext, klien: KlienPermintaan): Promise<number> {
        return withTransaction(
            ctx,
            async (scope) => {
                const dicabut = await createSessionRepository(scope.tx).cabutSemua(ctx, this.clock.now(), ALASAN_LOGOUT_SEMUA);
                // AL-01: dalam transaksi yang sama dengan pencabutannya.
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "LOGOUT_ALL_DEVICES",
                    entitas: "users",
                    entitasId: ctx.userId,
                    nilaiSesudah: { jumlah_sesi: dicabut.length },
                    ...jejakKlien(klien),
                });
                // SDD-EVT-04: terbit di dalam transaksi; satu event per sesi agar konsumen FCM tetap sederhana.
                await publishAll(scope, dicabut.map((s) => eventDicabut(ctx, s, ALASAN_LOGOUT_SEMUA)));
                return dicabut.length;
            },
            this.db,
        );
    }

    private async cabutSatu(scope: TransactionScope, sesiId: string, alasan: string, klien: KlienPermintaan): Promise<void> {
        const { ctx, tx } = scope;
        const dicabut = await createSessionRepository(tx).cabutKeluarga(ctx, sesiId, this.clock.now(), alasan);
        // Sudah tercabut lebih dulu (mis. dua logout serentak): tidak ada yang berubah, tidak ada yang dicatat.
        if (dicabut === undefined) return;
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "LOGOUT",
            entitas: "users",
            entitasId: ctx.userId,
            nilaiSesudah: { family_id: dicabut.familyId, platform: dicabut.platform, alasan },
            ...jejakKlien(klien),
        });
        await publishAll(scope, [eventDicabut(ctx, dicabut, alasan)]);
    }
}
