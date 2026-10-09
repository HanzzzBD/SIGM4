// Repository registri berkas `stored_files` (SDD-FS-02, SDD-AUTH-05). Pesanan dan konfirmasi
// terbatas pada berkas unggahan pemanggil sendiri (`uploaded_by = ctx.userId`).
//
// PRIVAT terhadap modul (SDD-SYS-03).

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { FileOwnerType, FileScanStatus, QueryExecutor } from "../../../shared/db/index.js";

export interface BerkasRow {
    readonly id: string;
    readonly object_key: string;
    readonly mime: string;
    readonly ukuran: string;
    readonly checksum: string | null;
    readonly scan_status: FileScanStatus;
    readonly owner_type: FileOwnerType;
    readonly thumb_key: string | null;
    readonly medium_key: string | null;
}

const KOLOM = ["id", "object_key", "mime", "ukuran", "checksum", "scan_status", "owner_type", "thumb_key", "medium_key"] as const;

/** Kunci-kunci objek milik satu baris (asli + turunan) — yang dihapus pembersih yatim. */
export interface KunciBerkasRow {
    readonly id: string;
    readonly object_key: string;
    readonly thumb_key: string | null;
    readonly medium_key: string | null;
}

export class StoredFileRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async registerMovementPdf(ctx: AuthContext, input: { objectKey: string; ownerId: string; creatorId: string; checksum: string; size: number; now: Date }): Promise<string> {
        const row = await this.query(ctx).insertInto("stored_files").values({ object_key: input.objectKey, mime: "application/pdf", ukuran: input.size,
            checksum: input.checksum, scan_status: "CLEAN", scanned_at: input.now, created_at: input.now,
            owner_type: "ASSET_MOVEMENT_DOCUMENT", owner_id: input.ownerId, uploaded_by: input.creatorId }).returning("id").executeTakeFirstOrThrow();
        return row.id;
    }

    /** Langkah 1 SDD-09 §4.2: baris pesanan — `checksum` NULL, yatim sampai ditautkan (SDD-FS-09). */
    async pesan(ctx: AuthContext, input: { objectKey: string; mime: string; ukuran: number; jenis: FileOwnerType }): Promise<string> {
        const baris = await this.query(ctx)
            .insertInto("stored_files")
            .values({ object_key: input.objectKey, mime: input.mime, ukuran: input.ukuran, owner_type: input.jenis, uploaded_by: ctx.userId })
            .returning("id")
            .executeTakeFirstOrThrow();
        return baris.id;
    }

    async milikPengunggah(ctx: AuthContext, id: number): Promise<BerkasRow | undefined> {
        return this.query(ctx).selectFrom("stored_files").select(KOLOM).where("id", "=", String(id)).where("uploaded_by", "=", String(ctx.userId)).executeTakeFirst();
    }

    /** Langkah 3: `checksum IS NULL` di WHERE — konfirmasi serentak hanya satu yang menang. */
    async konfirmasi(ctx: AuthContext, id: string, checksum: string): Promise<boolean> {
        const hasil = await this.query(ctx).updateTable("stored_files").set({ checksum }).where("id", "=", id).where("checksum", "is", null).executeTakeFirst();
        return hasil.numUpdatedRows > 0n;
    }

    /**
     * Menautkan foto profil (FR-01.4): hanya berkas unggahan pemanggil, jenis `USER_PHOTO`, sudah
     * dikonfirmasi, tidak `INFECTED`, dan belum dimiliki pengguna lain.
     */
    async tautkanFotoProfil(ctx: AuthContext, id: number): Promise<boolean> {
        const hasil = await this.query(ctx)
            .updateTable("stored_files")
            .set({ owner_id: ctx.userId })
            .where("id", "=", String(id))
            .where("uploaded_by", "=", String(ctx.userId))
            .where("owner_type", "=", "USER_PHOTO")
            .where("checksum", "is not", null)
            .where("scan_status", "<>", "INFECTED")
            .where((eb) => eb.or([eb("owner_id", "is", null), eb("owner_id", "=", String(ctx.userId))]))
            .executeTakeFirst();
        return hasil.numUpdatedRows > 0n;
    }

    /**
     * Berkas yang boleh menjadi dokumen aset (FR-06.1, PR-03-06): unggahan pemanggil, jenis
     * `ASSET_DOCUMENT`, sudah dikonfirmasi, tidak `INFECTED`, belum dimiliki — dikunci.
     */
    async kunciBerkasDokumen(ctx: AuthContext, id: number): Promise<{ readonly id: string } | undefined> {
        return this.query(ctx)
            .selectFrom("stored_files")
            .select("id")
            .where("id", "=", String(id))
            .where("uploaded_by", "=", String(ctx.userId))
            .where("owner_type", "=", "ASSET_DOCUMENT")
            .where("checksum", "is not", null)
            .where("scan_status", "<>", "INFECTED")
            .where("owner_id", "is", null)
            .forUpdate()
            .executeTakeFirst();
    }

    /** Pemilik berkas = dokumen (SDD-FS-02) — berkas tak lagi yatim (SDD-FS-09). */
    async tetapkanPemilik(ctx: AuthContext, id: string, ownerId: string): Promise<void> {
        await this.query(ctx).updateTable("stored_files").set({ owner_id: ownerId }).where("id", "=", id).execute();
    }

    /** Foto lama dilepas menjadi yatim — dibersihkan job SDD-FS-09 (keputusan 7b log phase-03). */
    async lepasFotoProfil(ctx: AuthContext, id: string): Promise<void> {
        await this.query(ctx).updateTable("stored_files").set({ owner_id: null }).where("id", "=", id).where("owner_type", "=", "USER_PHOTO").where("owner_id", "=", String(ctx.userId)).execute();
    }

/** Putusan pemindaian (SDD-09 §4.2 langkah 4): hanya dari `PENDING` — pengulangan event tidak menimpa. */
    async tetapkanHasilPindai(ctx: AuthContext, id: string, hasil: Exclude<FileScanStatus, "PENDING">, waktu: Date): Promise<boolean> {
        const r = await this.query(ctx).updateTable("stored_files").set({ scan_status: hasil, scanned_at: waktu }).where("id", "=", id).where("scan_status", "=", "PENDING").executeTakeFirst();
        return r.numUpdatedRows > 0n;
    }

    /** Turunan WebP (SDD-FS-07): hanya berkas CLEAN yang belum punya turunan — pengulangan tidak menimpa. */
    async tetapkanTurunan(ctx: AuthContext, id: string, thumbKey: string, mediumKey: string): Promise<boolean> {
        const r = await this.query(ctx).updateTable("stored_files").set({ thumb_key: thumbKey, medium_key: mediumKey }).where("id", "=", id).where("scan_status", "=", "CLEAN").where("thumb_key", "is", null).executeTakeFirst();
        return r.numUpdatedRows > 0n;
    }

    /**
     * Berkas yatim lewat batas (SDD-FS-09): tanpa pemilik, dibuat sebelum `batas`. Baris `INFECTED`
     * dipertahankan sebagai jejak karantina (SDD-09 §4.6, keputusan 10d). Paling lama dahulu.
     */
    async yatimSebelum(ctx: AuthContext, batas: Date, jumlah: number): Promise<readonly KunciBerkasRow[]> {
        return this.query(ctx)
            .selectFrom("stored_files")
            .select(["id", "object_key", "thumb_key", "medium_key"])
            .where("owner_id", "is", null)
            .where("created_at", "<", batas)
            .where("scan_status", "<>", "INFECTED")
            .orderBy("created_at")
            .orderBy("id")
            .limit(jumlah)
            .execute();
    }

    /**
     * Menghapus baris yatim; `false` bila sementara itu sudah ditautkan atau hilang. Syarat `owner_id`
     * diulang di sini DENGAN SENGAJA: penautan serentak sesudah `yatimSebelum` tidak boleh kehilangan berkasnya.
     */
    async hapusYatim(ctx: AuthContext, id: string): Promise<boolean> {
        const r = await this.query(ctx).deleteFrom("stored_files").where("id", "=", id).where("owner_id", "is", null).executeTakeFirst();
        return r.numDeletedRows > 0n;
    }

    async ambil(ctx: AuthContext, id: string): Promise<BerkasRow | undefined> {
        return this.query(ctx).selectFrom("stored_files").select(KOLOM).where("id", "=", id).executeTakeFirst();
    }
}

/** Pintu masuk repository: `defineRepository` menolak metode yang tidak menerima `AuthContext` (SDD-AUTH-02). */
export function createStoredFileRepository(executor: QueryExecutor): StoredFileRepository {
    return defineRepository(new StoredFileRepository(executor));
}
