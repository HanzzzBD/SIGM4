// Kolom QR milik `assets` (FR-05.1; PR-03-01): `uuid` (payload QR permanen) dan `qr_terpasang`.
// Ditulis HANYA lewat fungsi M-04 di `index.ts` — M-05 tidak menyentuh tabel `assets` (SDD-SYS-03).

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface QrAsetRow {
    readonly id: string;
    readonly uuid: string;
    readonly qr_terpasang: boolean;
}

export class QrRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Baris dikunci (`FOR UPDATE`) urut `id` — dua permintaan atas aset yang sama tidak saling tindih. */
    async kunci(ctx: AuthContext, ids: readonly number[]): Promise<readonly QrAsetRow[]> {
        if (ids.length === 0) return [];
        return this.query(ctx)
            .selectFrom("assets")
            .select(["id", "uuid", "qr_terpasang"])
            .where("id", "in", ids.map(String))
            .orderBy("id")
            .forUpdate()
            .execute();
    }

    /** FR-05.1 A2: UUIDv4 BARU dari basis data (`gen_random_uuid`), unik oleh indeks `assets_uuid_uq`. */
    async gantiUuid(ctx: AuthContext, id: number): Promise<string> {
        const baris = await this.query(ctx)
            .updateTable("assets")
            .set({ uuid: sql<string>`gen_random_uuid()` })
            .where("id", "=", String(id))
            .returning("uuid")
            .executeTakeFirstOrThrow();
        return baris.uuid;
    }

    async setQrTerpasang(ctx: AuthContext, ids: readonly number[], nilai: boolean): Promise<void> {
        if (ids.length === 0) return;
        await this.query(ctx).updateTable("assets").set({ qr_terpasang: nilai }).where("id", "in", ids.map(String)).execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createQrRepository(executor: QueryExecutor): QrRepository {
    return defineRepository(new QrRepository(executor));
}
