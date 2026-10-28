// TourService — progres tur produk milik sendiri (keputusan pemilik produk 26 Oktober 2026).
// Katalog tur hidup di klien; server hanya menyimpan tur mana yang sudah selesai/dilewati
// beserta versinya, agar tur otomatis cukup diputar sekali per akun di semua perangkat.

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database } from "../../../shared/db/index.js";
import { createTourRepository } from "../repositories/tour.repository.js";
import type { StatusTur, TurRow } from "../repositories/tour.repository.js";

const MODUL = "m01-auth";

const AKSI: Readonly<Record<StatusTur, string>> = {
    SELESAI: "PRODUCT_TOUR_COMPLETED",
    DILEWATI: "PRODUCT_TOUR_SKIPPED",
};

export class TourService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
    ) {}

    /** `GET /me/tours`. */
    async daftar(ctx: AuthContext): Promise<readonly TurRow[]> {
        return createTourRepository(this.db).milik(ctx);
    }

    /** `PUT /me/tours/{kunci}` — dipanggil saat tur selesai atau dilewati, bukan per langkah. */
    async simpan(ctx: AuthContext, kunci: string, status: StatusTur, versi: number): Promise<TurRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createTourRepository(scope.tx);
                const sebelum = await repo.ambil(ctx, kunci);
                const sesudah = await repo.simpan(ctx, kunci, status, versi, this.clock.now());
                // AL-01: dalam transaksi yang sama dengan penyimpanannya.
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: AKSI[status],
                    entitas: "product_tour_progress",
                    // `entitas_id` bigint: baris dikunci (user_id, kunci_tur), sehingga kuncinya ikut di nilai.
                    entitasId: ctx.userId,
                    nilaiSebelum: sebelum === undefined ? null : { kunci_tur: kunci, status: sebelum.status, versi: sebelum.versi },
                    nilaiSesudah: { kunci_tur: kunci, status: sesudah.status, versi: sesudah.versi },
                });
                return sesudah;
            },
            this.db,
        );
    }
}
