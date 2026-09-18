// Repository activity log (SDD-AUTH-02, PM-03, `FR-18.2`). PRIVAT terhadap
// modul (SDD-SYS-03) — hanya service/activity-log.service.ts yang boleh
// memanggilnya.
//
// Mengueri `activity_logs` LANGSUNG: tabel itu ditulis `shared/audit`
// (`AuditLogger`, bukan modul), sehingga tidak ada repository modul lain yang
// dilewati (SDD-00 §4.2).

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

const KOLOM_LOG = [
    "id",
    "waktu",
    "user_id",
    "user_nama",
    "role",
    "ip",
    "user_agent",
    "modul",
    "aksi",
    "entitas",
    "entitas_id",
    "nilai_sebelum",
    "nilai_sesudah",
    "keterangan",
    "hasil",
    "request_id",
] as const;

export interface ActivityLogRow {
    readonly id: string;
    readonly waktu: Date;
    readonly user_id: string | null;
    readonly user_nama: string | null;
    readonly role: string | null;
    readonly ip: string | null;
    readonly user_agent: string | null;
    readonly modul: string;
    readonly aksi: string;
    readonly entitas: string | null;
    readonly entitas_id: string | null;
    readonly nilai_sebelum: unknown;
    readonly nilai_sesudah: unknown;
    readonly keterangan: string | null;
    readonly hasil: "SUKSES" | "GAGAL";
    readonly request_id: string | null;
}

export interface ListActivityLogsFilter {
    readonly page: number;
    readonly perPage: number;
    readonly dari?: Date;
    readonly sampai?: Date;
    readonly userId?: number;
    readonly role?: string;
    readonly modul?: string;
    readonly aksi?: string;
    readonly entitas?: string;
    readonly entitasId?: number;
}

export interface ListActivityLogsResult {
    readonly rows: readonly ActivityLogRow[];
    readonly total: number;
}

export class ActivityLogRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** FR-18.2 langkah 2-3: terurut terbaru, terpaginasi, filter dapat digabung. */
    async list(ctx: AuthContext, filter: ListActivityLogsFilter): Promise<ListActivityLogsResult> {
        const eksekutor = this.query(ctx);
        const dasar = () => {
            let q = eksekutor.selectFrom("activity_logs");
            if (filter.dari !== undefined) q = q.where("waktu", ">=", filter.dari);
            if (filter.sampai !== undefined) q = q.where("waktu", "<=", filter.sampai);
            if (filter.userId !== undefined) q = q.where("user_id", "=", String(filter.userId));
            if (filter.role !== undefined) q = q.where("role", "=", filter.role);
            if (filter.modul !== undefined) q = q.where("modul", "=", filter.modul);
            if (filter.aksi !== undefined) q = q.where("aksi", "=", filter.aksi);
            if (filter.entitas !== undefined) q = q.where("entitas", "=", filter.entitas);
            if (filter.entitasId !== undefined)
                q = q.where("entitas_id", "=", String(filter.entitasId));
            return q;
        };

        const [rows, hitung] = await Promise.all([
            dasar()
                .select(KOLOM_LOG)
                .orderBy("waktu", "desc")
                .orderBy("id", "desc")
                .limit(filter.perPage)
                .offset((filter.page - 1) * filter.perPage)
                .execute(),
            dasar()
                .select(sql<string>`count(*)`.as("total"))
                .executeTakeFirst(),
        ]);

        return { rows, total: Number(hitung?.total ?? 0) };
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createActivityLogRepository(executor: QueryExecutor): ActivityLogRepository {
    return defineRepository(new ActivityLogRepository(executor));
}
