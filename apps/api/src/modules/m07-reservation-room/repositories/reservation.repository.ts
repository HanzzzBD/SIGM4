// Repository reservasi (m07 §8, SDD-AUTH-05; PR-03-08, PR-03-10). PRIVAT terhadap modul (SDD-SYS-03).
// Slot reservasi TIDAK ditulis di sini — satu-satunya penulis booking_slots adalah SlotService
// (SDD-SYS-10).

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor, StatusReservasi } from "../../../shared/db/index.js";

export interface ReservasiRuanganBaru {
    readonly nomor: string;
    readonly roomId: number;
    /** BR-024a: tanggal turunan menunjuk induknya. */
    readonly parentId?: string | undefined;
    readonly namaKegiatan: string;
    readonly jenisKegiatan: string;
    readonly mulai: Date;
    readonly selesai: Date;
    readonly jumlahPeserta: number;
    readonly keperluan: string | null;
    readonly kebutuhanTambahan: string | null;
    readonly keterangan: string | null;
}

/** Parameter pengajuan (system_settings kelompok RESERVASI; 0015, 0044, 0045). */
export interface PengaturanPengajuan {
    readonly ttlJam: number;
    readonly horizonHari: number;
    readonly kuotaGuruStaf: number;
    readonly kuotaSiswa: number;
    readonly jarakMinimumHari: number;
    readonly granularitasMenit: number;
}

const KUNCI_PENGATURAN = {
    ttlJam: "reservasi.ttl_tentative_jam",
    horizonHari: "reservasi.horizon_hari",
    kuotaGuruStaf: "reservasi.kuota_tertunda_guru_staf",
    kuotaSiswa: "reservasi.kuota_tertunda_siswa_osis",
    jarakMinimumHari: "reservasi.jarak_minimum_hari",
    granularitasMenit: "reservasi.granularitas_menit",
} as const satisfies Record<keyof PengaturanPengajuan, string>;

/** Satu baris kelompok pengajuan (induk + turunan, atau reservasi tunggal). */
export interface BarisPengajuan {
    readonly id: string;
    readonly nomor: string;
    readonly parent_id: string | null;
    readonly pemohon_id: string;
    readonly status: StatusReservasi;
    /** FR-07.3: pembatalan hanya sebelum kegiatan dimulai (A1). */
    readonly waktu_mulai: Date;
}

export interface RincianReservasi {
    readonly id: string;
    readonly nomor: string;
    readonly ruangan: string | null;
    readonly waktu_mulai: Date;
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
                parent_id: r.parentId ?? null,
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

    /** Seed 0015/0044/0045 wajib ada; ketiadaan atau bentuk salah adalah galat konfigurasi. */
    async pengaturan(ctx: AuthContext): Promise<PengaturanPengajuan> {
        const baris = await this.query(ctx).selectFrom("system_settings").select(["key", "value"]).where("key", "in", Object.values(KUNCI_PENGATURAN)).execute();
        const peta = new Map(baris.map((b) => [b.key, b.value]));
        const angka = (key: string): number => {
            const v = peta.get(key);
            if (typeof v !== "number") throw new Error(`Pengaturan ${key} hilang atau bukan angka.`);
            return v;
        };
        return {
            ttlJam: angka(KUNCI_PENGATURAN.ttlJam),
            horizonHari: angka(KUNCI_PENGATURAN.horizonHari),
            kuotaGuruStaf: angka(KUNCI_PENGATURAN.kuotaGuruStaf),
            kuotaSiswa: angka(KUNCI_PENGATURAN.kuotaSiswa),
            jarakMinimumHari: angka(KUNCI_PENGATURAN.jarakMinimumHari),
            granularitasMenit: angka(KUNCI_PENGATURAN.granularitasMenit),
        };
    }

    /**
     * Serialisasi pengajuan SATU pemohon sampai commit — kuota BR-023a dihitung lalu dipakai tanpa
     * celah balapan. Kunci advisory transaksional per pemohon: pemohon lain tak ikut menunggu.
     */
    async kunciPemohon(ctx: AuthContext, pemohonId: number): Promise<void> {
        await sql`SELECT pg_advisory_xact_lock(hashtext('reservasi-pemohon'), ${pemohonId}::int)`.execute(this.query(ctx));
    }

    /** BR-023a: PENGAJUAN (induk/tunggal, bukan tanggal turunan) yang masih menunggu persetujuan. */
    async jumlahMenunggu(ctx: AuthContext, pemohonId: number): Promise<number> {
        const b = await this.query(ctx)
            .selectFrom("reservations")
            .select((eb) => eb.fn.countAll<string>().as("n"))
            .where("pemohon_id", "=", String(pemohonId))
            .where("parent_id", "is", null)
            .where("status", "=", "MENUNGGU_PERSETUJUAN")
            .executeTakeFirstOrThrow();
        return Number(b.n);
    }

    /** Akar kelompok sebuah reservasi: dirinya bila tunggal/induk, induknya bila tanggal turunan. */
    async akarDari(ctx: AuthContext, reservationId: number): Promise<number | undefined> {
        const b = await this.query(ctx).selectFrom("reservations").select(["id", "parent_id"]).where("id", "=", String(reservationId)).executeTakeFirst();
        return b === undefined ? undefined : Number(b.parent_id ?? b.id);
    }

    /** Akar + seluruh turunannya, dikunci `FOR UPDATE` terurut id (transisi status berpenjaga). */
    async kunciKelompok(ctx: AuthContext, akarId: number): Promise<readonly BarisPengajuan[]> {
        return this.query(ctx)
            .selectFrom("reservations")
            .select(["id", "nomor", "parent_id", "pemohon_id", "status", "waktu_mulai"])
            .where((eb) => eb.or([eb("id", "=", String(akarId)), eb("parent_id", "=", String(akarId))]))
            .orderBy("id")
            .forUpdate()
            .execute();
    }

    /** Transisi berpenjaga status asal; mengembalikan id yang benar-benar berubah. */
    async ubahStatus(ctx: AuthContext, ids: readonly string[], dari: StatusReservasi, ke: StatusReservasi): Promise<readonly string[]> {
        if (ids.length === 0) return [];
        const baris = await this.query(ctx)
            .updateTable("reservations")
            .set({ status: ke, updated_by: pelakuId(ctx) })
            .where("id", "in", [...ids])
            .where("status", "=", dari)
            .returning("id")
            .execute();
        return baris.map((b) => b.id);
    }

    /** `{nomor}`/`{objek}`/`{tanggal}` notifikasi approval (SDD-08 §4.2a). */
    async rincian(ctx: AuthContext, id: number): Promise<RincianReservasi | undefined> {
        return this.query(ctx)
            .selectFrom("reservations as v")
            .leftJoin("rooms as r", "r.id", "v.room_id")
            .select(["v.id", "v.nomor", "r.nama as ruangan", "v.waktu_mulai"])
            .where("v.id", "=", String(id))
            .executeTakeFirst();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createReservationRepository(executor: QueryExecutor): ReservationRepository {
    return defineRepository(new ReservationRepository(executor));
}
