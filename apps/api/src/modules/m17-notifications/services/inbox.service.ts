// Kotak notifikasi milik pemanggil (FR-17.1 langkah 2–5, A2, A3; NTF-05, SDD-NTF-10;
// keputusan 79). Tandai baca/baca-semua menyiarkan ulang hitungan belum-dibaca ke seluruh
// koneksi pengguna itu SETELAH commit — penghitung web & mobile tetap tersinkron.
// M-17 §11: tidak ada aksi activity log khusus modul ini.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import type { FilterNotifikasi, NotifikasiTampil } from "../repositories/notification.repository.js";
import { createNotificationRepository } from "../repositories/notification.repository.js";
import type { PenyiarNotifikasi } from "./fanout.js";

export class InboxService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly penyiar: () => PenyiarNotifikasi | undefined,
    ) {}

    async daftar(ctx: AuthContext, f: FilterNotifikasi): Promise<{ rows: readonly NotifikasiTampil[]; total: number; unread_count: number }> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createNotificationRepository(scope.tx);
                const { rows, total } = await repo.daftar(scope.ctx, f);
                return { rows, total, unread_count: await repo.belumDibaca(scope.ctx, ctx.userId) };
            },
            this.db,
        );
    }

    async hitungBelumDibaca(ctx: AuthContext): Promise<number> {
        return withTransaction(ctx, (scope) => createNotificationRepository(scope.tx).belumDibaca(scope.ctx, ctx.userId), this.db);
    }

    /** FR-17.1 langkah 4. Milik orang lain / tak ada → 404 yang sama (tak membocorkan keberadaan). */
    async tandaiBaca(ctx: AuthContext, id: number): Promise<{ id: number; dibaca_pada: Date; unread_count: number }> {
        const hasil = await withTransaction(
            ctx,
            async (scope) => {
                const repo = createNotificationRepository(scope.tx);
                const r = await repo.tandaiBaca(scope.ctx, id, this.clock.now());
                if (r === undefined) throw new NotFoundError("Notifikasi tidak ditemukan.");
                return { id, dibaca_pada: r.dibaca_pada, unread_count: await repo.belumDibaca(scope.ctx, ctx.userId) };
            },
            this.db,
        );
        await this.penyiar()?.siarkan(ctx.userId, { jenis: "hitungan", unread_count: hasil.unread_count });
        return hasil;
    }

    /** FR-17.1 langkah 5. */
    async tandaiSemua(ctx: AuthContext): Promise<{ ditandai: number; unread_count: number }> {
        const hasil = await withTransaction(
            ctx,
            async (scope) => {
                const repo = createNotificationRepository(scope.tx);
                const ditandai = await repo.tandaiSemua(scope.ctx, this.clock.now());
                return { ditandai, unread_count: await repo.belumDibaca(scope.ctx, ctx.userId) };
            },
            this.db,
        );
        await this.penyiar()?.siarkan(ctx.userId, { jenis: "hitungan", unread_count: hasil.unread_count });
        return hasil;
    }
}
