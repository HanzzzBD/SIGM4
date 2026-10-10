// Pembacaan daftar & detail reservasi (m07 §7, UX P-30/P-31; PR-03-27, keputusan 17 log phase-03).
// PRIVAT terhadap modul (SDD-SYS-03). Scope `restricted` dipaksakan DI SINI — pemanggil tak dapat
// lupa menyaringnya (SDD-AUTH-02, keputusan 17b: Siswa/OSIS hanya miliknya sendiri).

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { KondisiRuanganPasca, QueryExecutor, StatusReservasi } from "../../../shared/db/index.js";

export interface SaringanDaftar {
    readonly q?: string | undefined;
    readonly jenis?: "RUANGAN" | "ASET" | undefined;
    readonly status?: StatusReservasi | undefined;
    readonly pemohonId?: number | undefined;
    /** Rentang waktu kegiatan `[dari, sampai)` — sudah diterjemahkan ke instan WIB oleh layanan. */
    readonly dari?: Date | undefined;
    readonly sampai?: Date | undefined;
    readonly urut: "diajukan" | "mulai";
    readonly page: number;
    readonly perPage: number;
}

export interface BarisDaftar {
    readonly id: string;
    readonly nomor: string;
    readonly jenis: "RUANGAN" | "ASET";
    readonly status: StatusReservasi;
    readonly nama_kegiatan: string | null;
    readonly room_id: string | null;
    readonly ruangan: string | null;
    readonly pemohon_id: string;
    readonly pemohon: string;
    readonly waktu_mulai: Date;
    readonly waktu_selesai: Date;
    readonly created_at: Date;
    readonly jumlah_tanggal: string;
}

export interface BarisDetail extends Omit<BarisDaftar, "jumlah_tanggal"> {
    readonly parent_id: string | null;
    readonly gedung: string | null;
    readonly jenis_kegiatan: string | null;
    readonly jumlah_peserta: number | null;
    readonly keperluan: string | null;
    readonly kebutuhan_tambahan: string | null;
    readonly keterangan: string | null;
    readonly kondisi_ruangan: KondisiRuanganPasca | null;
    readonly catatan_penggunaan: string | null;
    readonly dicatat_oleh: string | null;
    readonly penggunaan_dicatat_pada: Date | null;
}

export interface BarisKelompok {
    readonly id: string;
    readonly nomor: string;
    readonly parent_id: string | null;
    readonly pemohon_id: string;
    readonly status: StatusReservasi;
    readonly waktu_mulai: Date;
    readonly waktu_selesai: Date;
}

/** Scope `restricted` = milik pemanggil saja (keputusan 17b); `all` tanpa saringan pemohon. */
const terbatas = (ctx: AuthContext) => ctx.scopeOf("reservation.view") === "restricted";

/** `%`, `_`, dan `\` pada kata kunci dicari harfiah, bukan sebagai pola. */
const pola = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export class ReservationQueryRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async daftar(ctx: AuthContext, s: SaringanDaftar): Promise<{ readonly baris: readonly BarisDaftar[]; readonly total: number }> {
        let dasar = this.query(ctx)
            .selectFrom("reservations as v")
            .where("v.parent_id", "is", null)
            .$if(terbatas(ctx), (q) => q.where("v.pemohon_id", "=", String(ctx.userId)));
        if (s.q !== undefined && s.q !== "") {
            const p = pola(s.q);
            dasar = dasar.where((eb) => eb.or([eb("v.nomor", "ilike", p), eb("v.nama_kegiatan", "ilike", p)]));
        }
        if (s.jenis !== undefined) dasar = dasar.where("v.jenis", "=", s.jenis);
        if (s.status !== undefined) dasar = dasar.where("v.status", "=", s.status);
        if (s.pemohonId !== undefined) dasar = dasar.where("v.pemohon_id", "=", String(s.pemohonId));
        // Beririsan dengan rentang: induk berulang membawa rentang pola keseluruhannya (keputusan 11).
        if (s.dari !== undefined) dasar = dasar.where("v.waktu_selesai", ">", s.dari);
        if (s.sampai !== undefined) dasar = dasar.where("v.waktu_mulai", "<", s.sampai);

        const total = await dasar.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
        const baris = await dasar
            .innerJoin("users as u", "u.id", "v.pemohon_id")
            .leftJoin("rooms as r", "r.id", "v.room_id")
            .select([
                "v.id",
                "v.nomor",
                "v.jenis",
                "v.status",
                "v.nama_kegiatan",
                "v.room_id",
                "r.nama as ruangan",
                "v.pemohon_id",
                "u.nama as pemohon",
                "v.waktu_mulai",
                "v.waktu_selesai",
                "v.created_at",
                (eb) => eb.selectFrom("reservations as t").select((e) => e.fn.countAll<string>().as("n")).whereRef("t.parent_id", "=", "v.id").as("jumlah_tanggal"),
            ])
            .$call((q) => (s.urut === "mulai" ? q.orderBy("v.waktu_mulai", "desc") : q.orderBy("v.created_at", "desc")))
            .orderBy("v.id", "desc")
            .limit(s.perPage)
            .offset((s.page - 1) * s.perPage)
            .execute();
        return { baris: baris.map((b) => ({ ...b, jumlah_tanggal: b.jumlah_tanggal ?? "0" })), total: Number(total.n) };
    }

    /** Satu baris dalam scope pemanggil; di luar scope = tidak ada (SDD-AUTH-08). */
    async detail(ctx: AuthContext, id: number): Promise<BarisDetail | undefined> {
        return this.query(ctx)
            .selectFrom("reservations as v")
            .$if(terbatas(ctx), (q) => q.where("v.pemohon_id", "=", String(ctx.userId)))
            .innerJoin("users as u", "u.id", "v.pemohon_id")
            .leftJoin("users as c", "c.id", "v.penggunaan_dicatat_oleh")
            .leftJoin("rooms as r", "r.id", "v.room_id")
            .leftJoin("areas as a", "a.id", "r.area_id")
            .leftJoin("buildings as g", "g.id", "a.building_id")
            .select([
                "v.id",
                "v.nomor",
                "v.jenis",
                "v.status",
                "v.parent_id",
                "v.nama_kegiatan",
                "v.jenis_kegiatan",
                "v.jumlah_peserta",
                "v.keperluan",
                "v.kebutuhan_tambahan",
                "v.keterangan",
                "v.room_id",
                "r.nama as ruangan",
                "g.nama as gedung",
                "v.pemohon_id",
                "u.nama as pemohon",
                "v.waktu_mulai",
                "v.waktu_selesai",
                "v.created_at",
                "v.kondisi_ruangan",
                "v.catatan_penggunaan",
                "c.nama as dicatat_oleh",
                "v.penggunaan_dicatat_pada",
            ])
            .where("v.id", "=", String(id))
            .executeTakeFirst();
    }

    /** Akar + turunannya tanpa kunci — bahan aturan aksi (keputusan 15c/16b) dan daftar tanggal. */
    async kelompok(ctx: AuthContext, akarId: number): Promise<readonly BarisKelompok[]> {
        return this.query(ctx)
            .selectFrom("reservations")
            .select(["id", "nomor", "parent_id", "pemohon_id", "status", "waktu_mulai", "waktu_selesai"])
            .where((eb) => eb.or([eb("id", "=", String(akarId)), eb("parent_id", "=", String(akarId))]))
            .orderBy("id")
            .execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createReservationQueryRepository(executor: QueryExecutor): ReservationQueryRepository {
    return defineRepository(new ReservationQueryRepository(executor));
}
