// Repository hasil pengiriman per kanal (SDD-08 §4.1/§4.4a; SDD-AUTH-02). PRIVAT.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { KelompokNotifikasi, QueryExecutor, StatusPengiriman } from "../../../shared/db/index.js";

export interface NotifikasiPush {
    readonly userId: number;
    readonly kode: string;
    readonly jenis: KelompokNotifikasi;
    readonly judul: string;
    readonly isi: string;
    readonly deepLink: string | null;
    readonly wajib: boolean;
}

export class DeliveryRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async notifikasi(ctx: AuthContext, id: number): Promise<NotifikasiPush | undefined> {
        const b = await this.query(ctx)
            .selectFrom("notifications")
            .select(["user_id", "kode", "jenis", "judul", "isi", "deep_link", "wajib"])
            .where("id", "=", String(id))
            .executeTakeFirst();
        return b === undefined ? undefined : { userId: Number(b.user_id), kode: b.kode, jenis: b.jenis, judul: b.judul, isi: b.isi, deepLink: b.deep_link, wajib: b.wajib };
    }

    /** Satu baris per (notifikasi, kanal); percobaan berikutnya memperbaruinya (job diulang). */
    async catat(ctx: AuthContext, notifikasiId: number, status: StatusPengiriman, attempts: number, lastError: string | null, sentAt: Date | null): Promise<void> {
        await this.query(ctx)
            .insertInto("notification_deliveries")
            .values({ notification_id: notifikasiId, kanal: "PUSH", status, attempts, last_error: lastError, sent_at: sentAt })
            .onConflict((oc) =>
                oc.columns(["notification_id", "kanal"]).doUpdateSet({ status, attempts: sql<number>`greatest(notification_deliveries.attempts, ${attempts})`, last_error: lastError, sent_at: sentAt }),
            )
            .execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createDeliveryRepository(executor: QueryExecutor): DeliveryRepository {
    return defineRepository(new DeliveryRepository(executor));
}
