// Repository notifikasi (SDD-08 §4.1; SDD-AUTH-02). PRIVAT terhadap modul.

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { KelompokNotifikasi, QueryExecutor } from "../../../shared/db/index.js";

export interface BarisNotifikasi {
    readonly userId: number;
    readonly kode: string;
    readonly jenis: KelompokNotifikasi;
    readonly judul: string;
    readonly isi: string;
    readonly params: Readonly<Record<string, unknown>>;
    readonly referensiJenis: string | null;
    readonly referensiId: number | null;
    readonly deepLink: string | null;
    readonly wajib: boolean;
    readonly createdAt: Date;
    readonly dedupeKey: string;
}

export class NotificationRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * SDD-NTF-07: konflik `dedupe_key` = "sudah pernah dikirim", ditelan diam-diam —
     * pengulangan outbox dan anti-spam harian tak menggandakan. Mengembalikan jumlah baris baru.
     */
    async sisip(ctx: AuthContext, baris: readonly BarisNotifikasi[]): Promise<number> {
        if (baris.length === 0) return 0;
        const hasil = await this.query(ctx)
            .insertInto("notifications")
            .values(
                baris.map((b) => ({
                    user_id: b.userId,
                    kode: b.kode,
                    jenis: b.jenis,
                    judul: b.judul,
                    isi: b.isi,
                    params: JSON.stringify(b.params),
                    referensi_jenis: b.referensiJenis,
                    referensi_id: b.referensiId,
                    deep_link: b.deepLink,
                    wajib: b.wajib,
                    created_at: b.createdAt,
                    dedupe_key: b.dedupeKey,
                })),
            )
            .onConflict((oc) => oc.column("dedupe_key").where("dedupe_key", "is not", null).doNothing())
            // `DO NOTHING` tak mengembalikan baris yang ditelan: panjangnya = yang benar-benar baru.
            .returning("id")
            .execute();
        return hasil.length;
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createNotificationRepository(executor: QueryExecutor): NotificationRepository {
    return defineRepository(new NotificationRepository(executor));
}
