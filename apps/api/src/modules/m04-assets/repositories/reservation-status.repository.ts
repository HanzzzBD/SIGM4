// `assets.status` DIRESERVASI turunan slot (BR-005b, CI-05, SDD-AVL-11): dipakai job
// `slot-activation` lewat `index.ts` M-04 — M-04 tetap satu-satunya pemilik tabel `assets`.
// Hanya transisi TERSEDIA ↔ DIRESERVASI: status yang ditetapkan penulis lain (DIPINJAM oleh
// LoanService, DALAM_PERBAIKAN/TIDAK_TERSEDIA oleh Maintenance/AssetService) tak pernah ditimpa.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { adaSlotAsetTerkonfirmasi } from "../../../shared/booking/index.js";

const slotTerkonfirmasiMencakup = (waktu: Date) => adaSlotAsetTerkonfirmasi("assets.id", waktu);

export class ReservationStatusRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** TERSEDIA → DIRESERVASI bila slot CONFIRMED-nya mulai berlaku; mengembalikan id yang berubah. */
    async tetapkanDireservasi(ctx: AuthContext, waktu: Date): Promise<readonly number[]> {
        const baris = await this.query(ctx)
            .updateTable("assets")
            .set({ status: "DIRESERVASI" })
            .where("status", "=", "TERSEDIA")
            .where(slotTerkonfirmasiMencakup(waktu))
            .returning("id")
            .execute();
        return baris.map((b) => Number(b.id));
    }

    /** DIRESERVASI → TERSEDIA bila tak ada lagi slot CONFIRMED yang mencakup kini (berakhir tanpa serah terima). */
    async kembalikanTersedia(ctx: AuthContext, waktu: Date): Promise<readonly number[]> {
        const baris = await this.query(ctx)
            .updateTable("assets")
            .set({ status: "TERSEDIA" })
            .where("status", "=", "DIRESERVASI")
            .where(sql<boolean>`NOT ${slotTerkonfirmasiMencakup(waktu)}`)
            .returning("id")
            .execute();
        return baris.map((b) => Number(b.id));
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createReservationStatusRepository(executor: QueryExecutor): ReservationStatusRepository {
    return defineRepository(new ReservationStatusRepository(executor));
}
