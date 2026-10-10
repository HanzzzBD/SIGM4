// Bacaan kalender ketersediaan ruangan (FR-07.1, AV-01; PR-03-09). PRIVAT terhadap modul
// (SDD-SYS-03). Slot dibaca lewat `daftarSlotTerpakai` shared/booking, bukan dari sini.

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface FilterRuangan {
    readonly gedungId?: number | undefined;
    readonly jenis?: string | undefined;
    readonly kapasitasMin?: number | undefined;
}

export interface RuanganRow {
    readonly id: string;
    readonly kode: string;
    readonly nama: string;
    readonly jenis: string;
    readonly kapasitas: number | null;
    readonly gedung_id: string;
    readonly gedung_nama: string;
}

export interface ReservasiRingkasRow {
    readonly id: string;
    readonly nomor: string;
    readonly nama_kegiatan: string | null;
    readonly pemohon: string;
}

export class AvailabilityRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * Ruangan kalender: aktif, gedungnya aktif, dan `dapat_direservasi` (BR-016). Scope
     * `restricted` (Siswa/OSIS) hanya `boleh_direservasi_siswa` (BR-022, FR-07.1 A1).
     */
    async daftarRuangan(ctx: AuthContext, f: FilterRuangan): Promise<readonly RuanganRow[]> {
        let q = this.query(ctx)
            .selectFrom("rooms as r")
            .innerJoin("areas as a", "a.id", "r.area_id")
            .innerJoin("buildings as g", "g.id", "a.building_id")
            .select(["r.id", "r.kode", "r.nama", "r.jenis", "r.kapasitas", "g.id as gedung_id", "g.nama as gedung_nama"])
            .where("r.dapat_direservasi", "=", true)
            .where("r.status", "=", "AKTIF")
            .where("g.status", "=", "AKTIF");
        if (ctx.scopeOf("reservation.view") === "restricted") q = q.where("r.boleh_direservasi_siswa", "=", true);
        if (f.gedungId !== undefined) q = q.where("g.id", "=", String(f.gedungId));
        if (f.jenis !== undefined) q = q.where("r.jenis", "=", f.jenis as never);
        if (f.kapasitasMin !== undefined) q = q.where("r.kapasitas", ">=", f.kapasitasMin);
        return q.orderBy("g.nama").orderBy("r.nama").orderBy("r.id").execute();
    }

    /**
     * Nama kegiatan + pemohon untuk slot reservasi (FR-07.1 langkah 4). `pemohonId` = hanya milik pemohon
     * itu — scope `restricted` tak pernah membaca rincian pihak lain (A1, keputusan 17b).
     */
    async ringkasReservasi(ctx: AuthContext, ids: readonly string[], pemohonId?: number): Promise<readonly ReservasiRingkasRow[]> {
        if (ids.length === 0) return [];
        return this.query(ctx)
            .selectFrom("reservations as v")
            .innerJoin("users as u", "u.id", "v.pemohon_id")
            .select(["v.id", "v.nomor", "v.nama_kegiatan", "u.nama as pemohon"])
            .where("v.id", "in", [...new Set(ids)])
            .$if(pemohonId !== undefined, (q) => q.where("v.pemohon_id", "=", String(pemohonId)))
            .execute();
    }

    /** CAL-UI-02 (0044). Nilai di luar 15/30/60 ditolak validator m20, jadi bentuk lain = seed rusak. */
    async granularitasMenit(ctx: AuthContext): Promise<15 | 30 | 60> {
        const baris = await this.query(ctx).selectFrom("system_settings").select("value").where("key", "=", "reservasi.granularitas_menit").executeTakeFirst();
        const nilai = baris?.value;
        if (nilai !== 15 && nilai !== 30 && nilai !== 60) throw new Error("Pengaturan reservasi.granularitas_menit hilang atau berbentuk salah (migration 0044).");
        return nilai;
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createAvailabilityRepository(executor: QueryExecutor): AvailabilityRepository {
    return defineRepository(new AvailabilityRepository(executor));
}
