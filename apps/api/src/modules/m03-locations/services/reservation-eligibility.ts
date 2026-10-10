// Kelayakan ruangan untuk reservasi (BR-016, BR-022; FR-07.2 Preconditions). Dibaca M-07 lewat
// `index.ts` (SDD-SYS-03) — atribut ruangan milik modul ini, keputusannya pun di sini, di
// transaksi pemanggil.

import type { TransactionScope } from "../../../shared/db/index.js";
import type { RoomType } from "../repositories/location.repository.js";
import { createLocationRepository } from "../repositories/location.repository.js";

export interface RuanganReservasi {
    readonly id: number;
    readonly nama: string;
    readonly kode: string;
    readonly jenis: RoomType;
    readonly kapasitas: number | null;
}

/**
 * Ruangan yang boleh diajukan pemanggil: ada, `AKTIF` beserta gedungnya, `dapat_direservasi`
 * (BR-016), dan — bagi Siswa/OSIS — `boleh_direservasi_siswa` (BR-022). Ruangan yang tidak
 * memenuhi dijawab `undefined`, sama dengan yang tidak ada (tanpa mengonfirmasi keberadaan, SDD-AUTH-08).
 */
export async function ruanganUntukReservasi(scope: TransactionScope, roomId: number, untukSiswa: boolean): Promise<RuanganReservasi | undefined> {
    const r = await createLocationRepository(scope.tx).findRoomForReservation(scope.ctx, roomId);
    if (r === undefined || r.status !== "AKTIF" || r.status_gedung !== "AKTIF" || !r.dapat_direservasi) return undefined;
    if (untukSiswa && !r.boleh_direservasi_siswa) return undefined;
    return { id: Number(r.id), nama: r.nama, kode: r.kode, jenis: r.jenis, kapasitas: r.kapasitas };
}
