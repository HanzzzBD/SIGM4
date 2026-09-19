// Repository `student_enrollments` (SL-01…SL-03, SDD-AUTH-02). PRIVAT terhadap
// modul (SDD-SYS-03) — hanya services/ modul ini yang boleh memanggilnya.
//
// Membaca `users`, `work_units`, dan `academic_years` LANGSUNG untuk validasi
// (pola `roomExists`, keputusan 23): ketiganya tidak punya repository lintas-modul
// yang boleh dipanggil dari sini.

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

/** R-07 — Siswa / OSIS (roles-permissions.md). */
export const KODE_ROLE_SISWA = "R-07";

const KOLOM_ENROLLMENT = [
    "id",
    "user_id",
    "academic_year_id",
    "kelas_id",
    "lulus",
    "created_at",
    "updated_at",
] as const;

export interface EnrollmentRow {
    readonly id: string;
    readonly user_id: string;
    readonly academic_year_id: string;
    readonly kelas_id: string;
    readonly lulus: boolean;
    readonly created_at: Date;
    readonly updated_at: Date;
}

export interface StudentAccount {
    readonly status: "AKTIF" | "NONAKTIF";
    readonly roleKode: string;
}

export interface DueGraduate {
    readonly enrollmentId: string;
    readonly userId: string;
    readonly academicYearId: string;
}

export class StudentEnrollmentRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async findAccount(ctx: AuthContext, userId: number): Promise<StudentAccount | undefined> {
        const baris = await this.query(ctx)
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.status as status", "r.kode as roleKode"])
            .where("u.id", "=", String(userId))
            .executeTakeFirst();
        return baris;
    }

    async findKelas(
        ctx: AuthContext,
        id: number,
    ): Promise<{ jenis: string; status: "AKTIF" | "NONAKTIF" } | undefined> {
        return this.query(ctx)
            .selectFrom("work_units")
            .select(["jenis", "status"])
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    async academicYearExists(ctx: AuthContext, id: number): Promise<boolean> {
        const baris = await this.query(ctx)
            .selectFrom("academic_years")
            .select("id")
            .where("id", "=", String(id))
            .executeTakeFirst();
        return baris !== undefined;
    }

    async findEnrollment(
        ctx: AuthContext,
        userId: number,
        academicYearId: number,
    ): Promise<EnrollmentRow | undefined> {
        return this.query(ctx)
            .selectFrom("student_enrollments")
            .select(KOLOM_ENROLLMENT)
            .where("user_id", "=", String(userId))
            .where("academic_year_id", "=", String(academicYearId))
            .forUpdate()
            .executeTakeFirst();
    }

    /** NAIK: kelas pada tahun ajaran itu ditetapkan; tanda lulus (bila ada) dicabut. */
    async upsertKelas(
        ctx: AuthContext,
        userId: number,
        academicYearId: number,
        kelasId: number,
    ): Promise<EnrollmentRow> {
        return this.query(ctx)
            .insertInto("student_enrollments")
            .values({
                user_id: userId,
                academic_year_id: academicYearId,
                kelas_id: kelasId,
                created_by: ctx.userId,
                updated_by: ctx.userId,
            })
            .onConflict((oc) =>
                oc.columns(["user_id", "academic_year_id"]).doUpdateSet({
                    kelas_id: kelasId,
                    lulus: false,
                    updated_by: ctx.userId,
                }),
            )
            .returning(KOLOM_ENROLLMENT)
            .executeTakeFirstOrThrow();
    }

    async markLulus(ctx: AuthContext, enrollmentId: string): Promise<EnrollmentRow> {
        return this.query(ctx)
            .updateTable("student_enrollments")
            .set({ lulus: true, updated_by: ctx.userId })
            .where("id", "=", enrollmentId)
            .returning(KOLOM_ENROLLMENT)
            .executeTakeFirstOrThrow();
    }

    /**
     * SL-03: siswa AKTIF berbaris lulus yang tahun ajarannya sudah berakhir —
     * `tanggal_selesai` SEBELUM `hariIni` (`YYYY-MM-DD`, hari WIB, CAL-03).
     */
    async listDueGraduates(ctx: AuthContext, hariIni: string): Promise<readonly DueGraduate[]> {
        const rows = await this.query(ctx)
            .selectFrom("student_enrollments as e")
            .innerJoin("academic_years as y", "y.id", "e.academic_year_id")
            .innerJoin("users as u", "u.id", "e.user_id")
            .select(["e.id as enrollmentId", "e.user_id as userId", "e.academic_year_id as academicYearId"])
            .where("e.lulus", "=", true)
            .where("u.status", "=", "AKTIF")
            .where("y.tanggal_selesai", "<", hariIni)
            .orderBy("e.id")
            .execute();
        return rows;
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createStudentEnrollmentRepository(executor: QueryExecutor): StudentEnrollmentRepository {
    return defineRepository(new StudentEnrollmentRepository(executor));
}
