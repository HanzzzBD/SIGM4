import type { ReservationListQuerySchema } from "@sigm4/schemas";
import type { z } from "zod";
import type { TransactionScope } from "../../../shared/db/index.js";
import { createReservationQueryRepository } from "../repositories/reservation-query.repository.js";
import { tambahHari, tengahMalamWib } from "./schedule.js";
/** Same query/filter/order as P-30. One SQL rowset, including a sentinel row for overflow. */
export async function reservationExportRows(scope: TransactionScope, q: z.output<typeof ReservationListQuerySchema>, limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000) throw new Error("Batas ekspor tidak sah.");
    const { baris } = await createReservationQueryRepository(scope.tx).daftar(scope.ctx, { q: q.q, jenis: q.jenis, status: q.status,
        pemohonId: q.pemohon === "saya" ? scope.ctx.userId : q.pemohon,
        dari: q.dari === undefined ? undefined : tengahMalamWib(q.dari), sampai: q.sampai === undefined ? undefined : tengahMalamWib(tambahHari(q.sampai, 1)),
        urut: q.urut, page: 1, perPage: limit + 1 }, true);
    return baris;
}
