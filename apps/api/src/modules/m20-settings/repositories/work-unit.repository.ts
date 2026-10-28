// Repository `work_units` (Lampiran E.3, WU-01, WU-02, SDD-AUTH-02). PRIVAT
// terhadap modul (SDD-SYS-03) — hanya services/ modul ini yang memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

const KOLOM_UNIT = ["id", "nama", "kode", "jenis", "kepala_unit_id", "status"] as const;

export type JenisUnit = "MANAJEMEN" | "MATA_PELAJARAN" | "TATA_USAHA" | "EKSTRAKURIKULER" | "KELAS";
export type StatusUnit = "AKTIF" | "NONAKTIF";

export interface WorkUnitRow {
    readonly id: string;
    readonly nama: string;
    readonly kode: string;
    readonly jenis: JenisUnit;
    readonly kepala_unit_id: string | null;
    readonly status: StatusUnit;
}

export interface WorkUnitData {
    readonly nama: string;
    readonly kode: string;
    readonly jenis: JenisUnit;
    readonly kepalaUnitId: number | null;
}

export interface ListWorkUnitsFilter {
    readonly page: number;
    readonly perPage: number;
    readonly jenis?: JenisUnit;
    readonly status?: StatusUnit;
}

export class WorkUnitRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async list(ctx: AuthContext, filter: ListWorkUnitsFilter): Promise<{ rows: readonly WorkUnitRow[]; total: number }> {
        const dasar = () => {
            let q = this.query(ctx).selectFrom("work_units");
            if (filter.jenis !== undefined) q = q.where("jenis", "=", filter.jenis);
            if (filter.status !== undefined) q = q.where("status", "=", filter.status);
            return q;
        };
        const [rows, hitung] = await Promise.all([
            dasar()
                .select(KOLOM_UNIT)
                .orderBy("nama", "asc")
                .limit(filter.perPage)
                .offset((filter.page - 1) * filter.perPage)
                .execute(),
            dasar()
                .select(sql<string>`count(*)`.as("total"))
                .executeTakeFirst(),
        ]);
        return { rows, total: Number(hitung?.total ?? 0) };
    }

    async findById(ctx: AuthContext, id: number): Promise<WorkUnitRow | undefined> {
        return this.query(ctx).selectFrom("work_units").select(KOLOM_UNIT).where("id", "=", String(id)).executeTakeFirst();
    }

    /** Kunci keunikan sama dengan indeks `0017`: `lower(btrim(...))`. */
    async kodeSudahDipakai(ctx: AuthContext, kode: string, kecualiId?: number): Promise<boolean> {
        let q = this.query(ctx)
            .selectFrom("work_units")
            .select("id")
            .where(sql<boolean>`lower(btrim(kode)) = lower(btrim(${kode}))`);
        if (kecualiId !== undefined) q = q.where("id", "!=", String(kecualiId));
        return (await q.executeTakeFirst()) !== undefined;
    }

    async namaSudahDipakai(ctx: AuthContext, nama: string, kecualiId?: number): Promise<boolean> {
        let q = this.query(ctx)
            .selectFrom("work_units")
            .select("id")
            .where(sql<boolean>`lower(btrim(nama)) = lower(btrim(${nama}))`);
        if (kecualiId !== undefined) q = q.where("id", "!=", String(kecualiId));
        return (await q.executeTakeFirst()) !== undefined;
    }

    /** Membaca `users` LANGSUNG untuk validasi rujukan (pola `roomExists`, keputusan 23). */
    async penggunaAda(ctx: AuthContext, id: number): Promise<boolean> {
        return (await this.query(ctx).selectFrom("users").select("id").where("id", "=", String(id)).executeTakeFirst()) !== undefined;
    }

    /** Dipakai sebagai kelas oleh `student_enrollments` (SL-01) — menahan perubahan `jenis` (SDD-05 §4.7d). */
    async dipakaiSebagaiKelas(ctx: AuthContext, id: number): Promise<boolean> {
        return (
            (await this.query(ctx).selectFrom("student_enrollments").select("id").where("kelas_id", "=", String(id)).limit(1).executeTakeFirst()) !==
            undefined
        );
    }

    async insert(ctx: AuthContext, data: WorkUnitData): Promise<WorkUnitRow> {
        return this.query(ctx)
            .insertInto("work_units")
            .values({
                nama: data.nama,
                kode: data.kode,
                jenis: data.jenis,
                kepala_unit_id: data.kepalaUnitId,
                created_by: ctx.userId,
            })
            .returning(KOLOM_UNIT)
            .executeTakeFirstOrThrow();
    }

    async update(ctx: AuthContext, id: number, data: WorkUnitData): Promise<WorkUnitRow> {
        return this.query(ctx)
            .updateTable("work_units")
            .set({
                nama: data.nama,
                kode: data.kode,
                jenis: data.jenis,
                kepala_unit_id: data.kepalaUnitId,
                updated_by: ctx.userId,
            })
            .where("id", "=", String(id))
            .returning(KOLOM_UNIT)
            .executeTakeFirstOrThrow();
    }

    async setStatus(ctx: AuthContext, id: number, status: StatusUnit): Promise<WorkUnitRow> {
        return this.query(ctx)
            .updateTable("work_units")
            .set({ status, updated_by: ctx.userId })
            .where("id", "=", String(id))
            .returning(KOLOM_UNIT)
            .executeTakeFirstOrThrow();
    }
}

export function createWorkUnitRepository(executor: QueryExecutor): WorkUnitRepository {
    return defineRepository(new WorkUnitRepository(executor));
}
