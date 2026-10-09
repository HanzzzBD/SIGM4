// Repository reservasi (m07 §8, SDD-AUTH-05; PR-03-08). PRIVAT terhadap modul (SDD-SYS-03).
// Slot reservasi TIDAK ditulis di sini — satu-satunya penulis booking_slots adalah SlotService
// (SDD-SYS-10).

import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface ReservasiRuanganBaru {
    readonly nomor: string;
    readonly roomId: number;
    readonly namaKegiatan: string;
    readonly jenisKegiatan: string;
    readonly mulai: Date;
    readonly selesai: Date;
    readonly jumlahPeserta: number;
    readonly keperluan: string | null;
    readonly kebutuhanTambahan: string | null;
    readonly keterangan: string | null;
}

export class ReservationRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Pemohon = pemanggil; status awal `MENUNGGU_PERSETUJUAN` (FR-07.2 langkah 5). */
    async buatRuangan(ctx: AuthContext, r: ReservasiRuanganBaru): Promise<string> {
        const pelaku = pelakuId(ctx);
        const baris = await this.query(ctx)
            .insertInto("reservations")
            .values({
                nomor: r.nomor,
                jenis: "RUANGAN",
                pemohon_id: ctx.userId,
                room_id: r.roomId,
                nama_kegiatan: r.namaKegiatan,
                jenis_kegiatan: r.jenisKegiatan,
                waktu_mulai: r.mulai,
                waktu_selesai: r.selesai,
                jumlah_peserta: r.jumlahPeserta,
                keperluan: r.keperluan,
                kebutuhan_tambahan: r.kebutuhanTambahan,
                keterangan: r.keterangan,
                created_by: pelaku,
                updated_by: pelaku,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        return baris.id;
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createReservationRepository(executor: QueryExecutor): ReservationRepository {
    return defineRepository(new ReservationRepository(executor));
}
