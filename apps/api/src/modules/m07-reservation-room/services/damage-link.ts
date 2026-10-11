// Penaut laporan kerusakan → reservasi ruangan (FR-07.4 A2; PR-03-31, keputusan 25c log phase-03). M-11
// memanggilnya lewat `index.ts` di transaksi pelaporannya (SDD-SYS-03) — M-07 tetap pemilik `reservations`.

import type { TransactionScope } from "../../../shared/db/index.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";

export interface ReservasiLaporan {
    readonly id: string;
    readonly nomor: string;
    readonly jenis: "RUANGAN" | "ASET";
    readonly roomId: string | null;
    readonly status: string;
}

export async function reservasiUntukLaporan(scope: TransactionScope, id: number): Promise<ReservasiLaporan | undefined> {
    const r = await createReservationRepository(scope.tx).untukLaporanKerusakan(scope.ctx, id);
    return r === undefined ? undefined : { id: r.id, nomor: r.nomor, jenis: r.jenis, roomId: r.room_id, status: r.status };
}
