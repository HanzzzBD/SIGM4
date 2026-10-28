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

/**
 * Kolom entri. `user_nama` = nama yang tersimpan pada entri (pelaku sistem/CLI) atau, bila kosong, nama pengguna
 * pelaku saat ini (`AuditLogger.write` tidak menyimpan nama pengguna terautentikasi) — P-73/P-74 menampilkan
 * pelaku, bukan sekadar ID (FR-18.2). Entri tidak diubah: hanya dibaca dengan LEFT JOIN.
 */
const KOLOM_LOG = [
    "l.id",
    "l.waktu",
    "l.user_id",
    sql<string | null>`coalesce(l.user_nama, u.nama)`.as("user_nama"),
    "l.role",
    "l.ip",
    "l.user_agent",
    "l.modul",
    "l.aksi",
    "l.entitas",
    "l.entitas_id",
    "l.nilai_sebelum",
    "l.nilai_sesudah",
    "l.keterangan",
    "l.hasil",
    "l.request_id",
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

/** Filter kombinasi, dipakai bersama daftar (paginasi) dan ekspor (utuh). */
export interface ActivityLogFilter {
    readonly dari?: Date;
    readonly sampai?: Date;
    readonly userId?: number;
    readonly role?: string;
    readonly modul?: string;
    readonly aksi?: string;
    readonly entitas?: string;
    readonly entitasId?: number;
}

export interface ListActivityLogsFilter extends ActivityLogFilter {
    readonly page: number;
    readonly perPage: number;
}

export interface ListActivityLogsResult {
    readonly rows: readonly ActivityLogRow[];
    readonly total: number;
}

export class ActivityLogRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    private dasar(ctx: AuthContext, filter: ActivityLogFilter) {
        let q = this.query(ctx).selectFrom("activity_logs as l").leftJoin("users as u", "u.id", "l.user_id");
        if (filter.dari !== undefined) q = q.where("l.waktu", ">=", filter.dari);
        if (filter.sampai !== undefined) q = q.where("l.waktu", "<=", filter.sampai);
        if (filter.userId !== undefined) q = q.where("l.user_id", "=", String(filter.userId));
        if (filter.role !== undefined) q = q.where("l.role", "=", filter.role);
        if (filter.modul !== undefined) q = q.where("l.modul", "=", filter.modul);
        if (filter.aksi !== undefined) q = q.where("l.aksi", "=", filter.aksi);
        if (filter.entitas !== undefined) q = q.where("l.entitas", "=", filter.entitas);
        if (filter.entitasId !== undefined)
            q = q.where("l.entitas_id", "=", String(filter.entitasId));
        return q;
    }

    /** FR-18.2 langkah 2-3: terurut terbaru, terpaginasi, filter dapat digabung. */
    async list(ctx: AuthContext, filter: ListActivityLogsFilter): Promise<ListActivityLogsResult> {
        const [rows, hitung] = await Promise.all([
            this.dasar(ctx, filter)
                .select(KOLOM_LOG)
                .orderBy("l.waktu", "desc")
                .orderBy("l.id", "desc")
                .limit(filter.perPage)
                .offset((filter.page - 1) * filter.perPage)
                .execute(),
            this.dasar(ctx, filter)
                .select(sql<string>`count(*)`.as("total"))
                .executeTakeFirst(),
        ]);

        return { rows, total: Number(hitung?.total ?? 0) };
    }

    /**
     * FR-18.2 langkah 5: hasil filter UTUH, tanpa paginasi, terbatas `batas`
     * baris (`batas + 1` diminta pemanggil untuk mendeteksi kelebihan —
     * `BATAS_EKSPOR`, SDD-PERF-06).
     */
    async listForExport(
        ctx: AuthContext,
        filter: ActivityLogFilter,
        batas: number,
    ): Promise<readonly ActivityLogRow[]> {
        return this.dasar(ctx, filter)
            .select(KOLOM_LOG)
            .orderBy("l.waktu", "desc")
            .orderBy("l.id", "desc")
            .limit(batas)
            .execute();
    }

    /** FR-18.2 langkah 4 (P-74): satu entri; `undefined` bila tidak ada. */
    async findById(ctx: AuthContext, id: number): Promise<ActivityLogRow | undefined> {
        return this.query(ctx).selectFrom("activity_logs as l").leftJoin("users as u", "u.id", "l.user_id").select(KOLOM_LOG).where("l.id", "=", String(id)).executeTakeFirst();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createActivityLogRepository(executor: QueryExecutor): ActivityLogRepository {
    return defineRepository(new ActivityLogRepository(executor));
}
