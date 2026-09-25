// Repository `holidays` + `work_days` (Lampiran E.2, CAL-01, SDD-AUTH-02).
// PRIVAT terhadap modul (SDD-SYS-03) — hanya services/ modul ini yang memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

/** `date` dibaca sebagai teks `YYYY-MM-DD` (driver `pg` mengembalikan `Date`), seperti `BusinessCalendarService`. */
const KOLOM_LIBUR = ["id", sql<string>`to_char(tanggal, 'YYYY-MM-DD')`.as("tanggal"), "nama", "jenis", "academic_year_id"] as const;

export type JenisLibur = "NASIONAL" | "SEKOLAH" | "CUTI_BERSAMA";

export interface HolidayRow {
    readonly id: string;
    readonly tanggal: string;
    readonly nama: string;
    readonly jenis: JenisLibur;
    readonly academic_year_id: string | null;
}

export interface HolidayData {
    readonly tanggal: string;
    readonly nama: string;
    readonly jenis: JenisLibur;
    readonly academicYearId: number | null;
}

export interface WorkDayRow {
    readonly hari: number;
    readonly aktif: boolean;
}

export class CalendarRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async listHolidays(
        ctx: AuthContext,
        filter: { readonly page: number; readonly perPage: number; readonly academicYearId?: number },
    ): Promise<{ rows: readonly HolidayRow[]; total: number }> {
        const dasar = () => {
            const q = this.query(ctx).selectFrom("holidays");
            return filter.academicYearId === undefined ? q : q.where("academic_year_id", "=", String(filter.academicYearId));
        };
        const [rows, hitung] = await Promise.all([
            dasar()
                .select(KOLOM_LIBUR)
                .orderBy(sql`tanggal`, "asc")
                .limit(filter.perPage)
                .offset((filter.page - 1) * filter.perPage)
                .execute(),
            dasar()
                .select(sql<string>`count(*)`.as("total"))
                .executeTakeFirst(),
        ]);
        return { rows, total: Number(hitung?.total ?? 0) };
    }

    async findHoliday(ctx: AuthContext, id: number): Promise<HolidayRow | undefined> {
        return this.query(ctx).selectFrom("holidays").select(KOLOM_LIBUR).where("id", "=", String(id)).executeTakeFirst();
    }

    async tanggalSudahDipakai(ctx: AuthContext, tanggal: string, kecualiId?: number): Promise<boolean> {
        let q = this.query(ctx).selectFrom("holidays").select("id").where("tanggal", "=", tanggal);
        if (kecualiId !== undefined) q = q.where("id", "!=", String(kecualiId));
        return (await q.executeTakeFirst()) !== undefined;
    }

    /** Membaca `academic_years` LANGSUNG untuk validasi rujukan (pola `roomExists`, keputusan 23). */
    async tahunAjaranAda(ctx: AuthContext, id: number): Promise<boolean> {
        return (await this.query(ctx).selectFrom("academic_years").select("id").where("id", "=", String(id)).executeTakeFirst()) !== undefined;
    }

    async insertHoliday(ctx: AuthContext, data: HolidayData): Promise<HolidayRow> {
        return this.query(ctx)
            .insertInto("holidays")
            .values({ tanggal: data.tanggal, nama: data.nama, jenis: data.jenis, academic_year_id: data.academicYearId })
            .returning(KOLOM_LIBUR)
            .executeTakeFirstOrThrow();
    }

    async updateHoliday(ctx: AuthContext, id: number, data: HolidayData): Promise<HolidayRow> {
        return this.query(ctx)
            .updateTable("holidays")
            .set({ tanggal: data.tanggal, nama: data.nama, jenis: data.jenis, academic_year_id: data.academicYearId })
            .where("id", "=", String(id))
            .returning(KOLOM_LIBUR)
            .executeTakeFirstOrThrow();
    }

    async deleteHoliday(ctx: AuthContext, id: number): Promise<void> {
        await this.query(ctx).deleteFrom("holidays").where("id", "=", String(id)).execute();
    }

    async workDays(ctx: AuthContext): Promise<readonly WorkDayRow[]> {
        return this.query(ctx).selectFrom("work_days").select(["hari", "aktif"]).orderBy("hari", "asc").execute();
    }

    async setWorkDay(ctx: AuthContext, hari: number, aktif: boolean): Promise<void> {
        await this.query(ctx)
            .insertInto("work_days")
            .values({ hari, aktif })
            .onConflict((oc) => oc.column("hari").doUpdateSet({ aktif }))
            .execute();
    }
}

export function createCalendarRepository(executor: QueryExecutor): CalendarRepository {
    return defineRepository(new CalendarRepository(executor));
}
