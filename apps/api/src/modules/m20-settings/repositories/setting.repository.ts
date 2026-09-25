// Repository parameter sistem (SDD-AUTH-02, `FR-20.1`). PRIVAT terhadap modul
// (SDD-SYS-03) — hanya services/setting.service.ts yang boleh memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

const KOLOM_SETTING = [
    "key",
    "kelompok",
    "tipe",
    "value",
    "nilai_bawaan",
    "nilai_min",
    "nilai_maks",
    "deskripsi",
    "updated_at",
    "updated_by",
] as const;

export interface SettingRow {
    readonly key: string;
    readonly kelompok:
        | "IDENTITAS_SEKOLAH"
        | "KODE_ASET"
        | "PEMINJAMAN"
        | "DENDA"
        | "RESERVASI"
        | "MAINTENANCE"
        | "BAHAN"
        | "NOTIFIKASI"
        | "KEAMANAN"
        | "CHATBOT_AI";
    readonly tipe: "BILANGAN_BULAT" | "DESIMAL" | "BOOLEAN" | "TEKS";
    readonly value: unknown;
    readonly nilai_bawaan: unknown;
    /** `numeric` kembali sebagai string dari driver `pg`. */
    readonly nilai_min: string | null;
    readonly nilai_maks: string | null;
    readonly deskripsi: string;
    readonly updated_at: Date;
    readonly updated_by: string | null;
}

export interface ListSettingsFilter {
    readonly page: number;
    readonly perPage: number;
    readonly kelompok?: SettingRow["kelompok"];
}

export class SettingRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Terpaginasi (SDD-PERF-04); `kelompok` menyaring satu tab P-70. */
    async list(ctx: AuthContext, filter: ListSettingsFilter): Promise<{ rows: readonly SettingRow[]; total: number }> {
        const dasar = () => {
            const q = this.query(ctx).selectFrom("system_settings");
            return filter.kelompok === undefined ? q : q.where("kelompok", "=", filter.kelompok);
        };
        const [rows, hitung] = await Promise.all([
            dasar()
                .select(KOLOM_SETTING)
                .orderBy("kelompok")
                .orderBy("key")
                .limit(filter.perPage)
                .offset((filter.page - 1) * filter.perPage)
                .execute(),
            dasar()
                .select(sql<string>`count(*)`.as("total"))
                .executeTakeFirst(),
        ]);
        return { rows, total: Number(hitung?.total ?? 0) };
    }

    /**
     * Baris dikunci (`FOR UPDATE`) selama transaksi: dua Administrator yang
     * menyimpan bersamaan tidak boleh sama-sama membaca nilai lama yang sama,
     * karena entri log memuat nilai lama dan baru (`FR-20.1` AC 3).
     */
    async findByKeysForUpdate(ctx: AuthContext, keys: readonly string[]): Promise<readonly SettingRow[]> {
        return this.query(ctx)
            .selectFrom("system_settings")
            .select(KOLOM_SETTING)
            .where("key", "in", [...keys])
            .forUpdate()
            .execute();
    }

    async updateValue(ctx: AuthContext, key: string, value: unknown): Promise<void> {
        await this.query(ctx)
            .updateTable("system_settings")
            .set({ value: JSON.stringify(value), updated_by: ctx.userId })
            .where("key", "=", key)
            .execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createSettingRepository(executor: QueryExecutor): SettingRepository {
    return defineRepository(new SettingRepository(executor));
}
