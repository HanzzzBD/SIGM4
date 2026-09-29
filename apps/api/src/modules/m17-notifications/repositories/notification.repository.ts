// Repository notifikasi (SDD-08 §4.1/§4.6, SDD-NTF-10; SDD-AUTH-02). PRIVAT terhadap
// modul. Baca/tandai selalu berscope PEMILIK — `ctx.userId` — tidak pernah id dari klien.

import { sql } from "kysely";
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

/** Notifikasi yang benar-benar baru — bahan siaran setelah commit (SDD-08 §4.3a). */
export interface NotifikasiBaru {
    readonly id: number;
    readonly userId: number;
    readonly kode: string;
    readonly judul: string;
    readonly isi: string;
    readonly deepLink: string | null;
    readonly createdAt: Date;
}

export interface NotifikasiTampil {
    readonly id: number;
    readonly kode: string;
    readonly jenis: KelompokNotifikasi;
    readonly judul: string;
    readonly isi: string;
    readonly referensi_jenis: string | null;
    readonly referensi_id: number | null;
    readonly deep_link: string | null;
    readonly wajib: boolean;
    readonly dibaca_pada: Date | null;
    readonly created_at: Date;
}

export interface FilterNotifikasi {
    readonly jenis?: KelompokNotifikasi | undefined;
    /** `FR-17.1 A3`: `true` = hanya belum dibaca, `false` = hanya sudah dibaca. */
    readonly belumDibaca?: boolean | undefined;
    /** `FR-17.1 A2` / `SDD-NTF-10`: tabel arsip — tidak pernah di-UNION dengan tabel utama. */
    readonly arsip: boolean;
    readonly page: number;
    readonly perPage: number;
}

export class NotificationRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * SDD-NTF-07: konflik `dedupe_key` = "sudah pernah dikirim", ditelan diam-diam —
     * pengulangan outbox dan anti-spam harian tak menggandakan. Mengembalikan baris baru saja.
     */
    async sisip(ctx: AuthContext, baris: readonly BarisNotifikasi[]): Promise<readonly NotifikasiBaru[]> {
        if (baris.length === 0) return [];
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
            // `DO NOTHING` tak mengembalikan baris yang ditelan: yang kembali = yang benar-benar baru.
            .returning(["id", "user_id", "kode", "judul", "isi", "deep_link", "created_at"])
            .execute();
        return hasil.map((h) => ({ id: Number(h.id), userId: Number(h.user_id), kode: h.kode, judul: h.judul, isi: h.isi, deepLink: h.deep_link, createdAt: h.created_at }));
    }

    /** `GET /notifications` (FR-17.1 langkah 3, A2, A3): terbaru dulu. */
    async daftar(ctx: AuthContext, f: FilterNotifikasi): Promise<{ rows: readonly NotifikasiTampil[]; total: number }> {
        let q = this.query(ctx)
            .selectFrom(f.arsip ? "notifications_archive" : "notifications")
            .select([
                "id",
                "kode",
                "jenis",
                "judul",
                "isi",
                "referensi_jenis",
                "referensi_id",
                "deep_link",
                "wajib",
                "dibaca_pada",
                "created_at",
                sql<string>`count(*) OVER ()`.as("total"),
            ])
            .where("user_id", "=", String(ctx.userId));
        if (f.jenis !== undefined) q = q.where("jenis", "=", f.jenis);
        if (f.belumDibaca !== undefined) q = q.where("dibaca_pada", f.belumDibaca ? "is" : "is not", null);
        const baris = await q
            .orderBy("created_at", "desc")
            .orderBy("id", "desc")
            .limit(f.perPage)
            .offset((f.page - 1) * f.perPage)
            .execute();
        return {
            total: Number(baris[0]?.total ?? 0),
            rows: baris.map((b) => ({
                id: Number(b.id),
                kode: b.kode,
                jenis: b.jenis,
                judul: b.judul,
                isi: b.isi,
                referensi_jenis: b.referensi_jenis,
                referensi_id: b.referensi_id === null ? null : Number(b.referensi_id),
                deep_link: b.deep_link,
                wajib: b.wajib,
                dibaca_pada: b.dibaca_pada,
                created_at: b.created_at,
            })),
        };
    }

    /** `undefined` bila bukan milik pemanggil / tak ada; sudah dibaca → tetap waktu semula (idempoten). */
    async tandaiBaca(ctx: AuthContext, id: number, pada: Date): Promise<{ dibaca_pada: Date } | undefined> {
        const baris = await this.query(ctx)
            .updateTable("notifications")
            .set({ dibaca_pada: sql<Date>`coalesce(dibaca_pada, ${pada})` })
            .where("id", "=", String(id))
            .where("user_id", "=", String(ctx.userId))
            .returning("dibaca_pada")
            .executeTakeFirst();
        return baris?.dibaca_pada == null ? undefined : { dibaca_pada: baris.dibaca_pada };
    }

    async tandaiSemua(ctx: AuthContext, pada: Date): Promise<number> {
        const hasil = await this.query(ctx)
            .updateTable("notifications")
            .set({ dibaca_pada: pada })
            .where("user_id", "=", String(ctx.userId))
            .where("dibaca_pada", "is", null)
            .executeTakeFirst();
        return Number(hasil.numUpdatedRows);
    }

    /** `NTF-05`: dihitung server (indeks `notifications_unread`). */
    async belumDibaca(ctx: AuthContext, userId: number): Promise<number> {
        const b = await this.query(ctx)
            .selectFrom("notifications")
            .select(sql<string>`count(*)`.as("n"))
            .where("user_id", "=", String(userId))
            .where("dibaca_pada", "is", null)
            .executeTakeFirstOrThrow();
        return Number(b.n);
    }

    /** SDD-08 §4.6: pindahkan satu batch berusia > batas ke arsip (salin lalu hapus, satu pernyataan). */
    async arsipkanBatch(ctx: AuthContext, sebelum: Date, batch: number): Promise<number> {
        const hasil = await sql<{ n: string }>`
            WITH dipindah AS (
                DELETE FROM notifications
                 WHERE id IN (SELECT id FROM notifications WHERE created_at < ${sebelum} ORDER BY id LIMIT ${batch})
                RETURNING *
            ), disalin AS (
                INSERT INTO notifications_archive SELECT * FROM dipindah RETURNING 1
            )
            SELECT count(*)::text AS n FROM disalin`.execute(this.query(ctx));
        return Number(hasil.rows[0]?.n ?? 0);
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createNotificationRepository(executor: QueryExecutor): NotificationRepository {
    return defineRepository(new NotificationRepository(executor));
}
