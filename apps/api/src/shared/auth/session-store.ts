// Pemeriksaan sesi hidup untuk `authenticate` (SDD-SESS-04, SDD-04 §4.6, FR-01.2 AC).
//
// Access token JWT berlaku sampai `exp` (60 menit) dan tidak menyimpan keadaan; tanpa
// pemeriksaan ini, logout hanya mencabut refresh token sementara access token yang sudah
// terbit tetap diterima sampai kedaluwarsa. `sid` pada token = `family_id` refresh token,
// jadi sebuah sesi hidup selama keluarganya masih punya baris yang belum dicabut.
//
// Dibaca dari PostgreSQL pada SETIAP permintaan, bukan dari cache: pencabutan berlaku pada
// permintaan berikutnya (acceptance `PR-02-04`: ≤ 60 detik), dan `SDD-04 §5` menegaskan
// bahwa kebenaran pencabutan tidak boleh bergantung pada ketersediaan Redis. Kueri ini satu
// pencarian berindeks (`refresh_tokens_family_idx`).

import type { Kysely } from "kysely";
import type { Database } from "../db/index.js";

/** Bentuk `sid` yang kita terbitkan (`randomUUID`); yang lain tidak perlu menyentuh basis data. */
const BENTUK_SID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionChecker {
    /** true bila sesi `sid` milik `userId` belum dicabut seluruhnya. */
    aktif(userId: number, sid: string): Promise<boolean>;
}

export class SessionStore implements SessionChecker {
    constructor(private readonly db: Kysely<Database>) {}

    async aktif(userId: number, sid: string): Promise<boolean> {
        if (!BENTUK_SID.test(sid)) return false;
        const baris = await this.db
            .selectFrom("refresh_tokens")
            .select("id")
            .where("family_id", "=", sid)
            .where("user_id", "=", String(userId))
            .where("revoked_at", "is", null)
            .limit(1)
            .executeTakeFirst();
        return baris !== undefined;
    }
}
