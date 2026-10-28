// Kelengkapan konfigurasi & periode akademik untuk dashboard (19.1 rentang, 19.2 Status
// Konfigurasi; SDD-14 §4.3a, keputusan 82). PRIVAT — dibuka lewat `services/dashboard-source.ts`.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface Periode {
    readonly nama: string;
    /** Tanggal kalender `YYYY-MM-DD`, keduanya inklusif (Lampiran E.2). */
    readonly mulai: string;
    readonly akhir: string;
}

const tgl = (kolom: string) => sql<string>`to_char(${sql.ref(kolom)}, 'YYYY-MM-DD')`;

export class DashboardSettingRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async kelengkapan(ctx: AuthContext): Promise<{ tahunAjaranAktif: boolean; hariKerjaAktif: number; teksKosong: readonly string[] }> {
        const q = this.query(ctx);
        const [tahun, hari, teks] = await Promise.all([
            q.selectFrom("academic_years").select("id").where("is_active", "=", true).limit(1).execute(),
            q.selectFrom("work_days").select(sql<string>`count(*)`.as("n")).where("aktif", "=", true).execute(),
            q.selectFrom("system_settings").select("key").where("tipe", "=", "TEKS").where(sql<boolean>`btrim(value #>> '{}') = ''`).orderBy("key").execute(),
        ]);
        return { tahunAjaranAktif: tahun.length > 0, hariKerjaAktif: Number(hari[0]?.n ?? 0), teksKosong: teks.map((t) => t.key) };
    }

    /** Tahun ajaran aktif dan semesternya yang memuat `hariIni` (WIB). */
    async periodeAktif(ctx: AuthContext, hariIni: string): Promise<{ tahunAjaran: Periode | null; semester: Periode | null }> {
        const q = this.query(ctx);
        const tahun = await q
            .selectFrom("academic_years")
            .select(["id", "nama", tgl("tanggal_mulai").as("mulai"), tgl("tanggal_selesai").as("akhir")])
            .where("is_active", "=", true)
            .executeTakeFirst();
        if (tahun === undefined) return { tahunAjaran: null, semester: null };
        const semester = await q
            .selectFrom("academic_terms")
            .select(["nama", tgl("tanggal_mulai").as("mulai"), tgl("tanggal_selesai").as("akhir")])
            .where("academic_year_id", "=", tahun.id)
            .where("tanggal_mulai", "<=", hariIni)
            .where("tanggal_selesai", ">=", hariIni)
            .executeTakeFirst();
        return { tahunAjaran: { nama: tahun.nama, mulai: tahun.mulai, akhir: tahun.akhir }, semester: semester ?? null };
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createDashboardSettingRepository(executor: QueryExecutor): DashboardSettingRepository {
    return defineRepository(new DashboardSettingRepository(executor));
}
