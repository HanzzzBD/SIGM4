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
}

const KOLOM = ["id", "object_key", "mime", "ukuran", "checksum", "scan_status", "owner_type"] as const;

export class StoredFileRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
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

    /** Foto lama dilepas menjadi yatim — dibersihkan job SDD-FS-09 (keputusan 7b log phase-03). */
    async lepasFotoProfil(ctx: AuthContext, id: string): Promise<void> {
        await this.query(ctx).updateTable("stored_files").set({ owner_id: null }).where("id", "=", id).where("owner_type", "=", "USER_PHOTO").where("owner_id", "=", String(ctx.userId)).execute();
    }

/** Putusan pemindaian (SDD-09 §4.2 langkah 4): hanya dari `PENDING` — pengulangan event tidak menimpa. */
    async tetapkanHasilPindai(ctx: AuthContext, id: string, hasil: Exclude<FileScanStatus, "PENDING">, waktu: Date): Promise<boolean> {
        const r = await this.query(ctx).updateTable("stored_files").set({ scan_status: hasil, scanned_at: waktu }).where("id", "=", id).where("scan_status", "=", "PENDING").executeTakeFirst();
        return r.numUpdatedRows > 0n;
    }

    async ambil(ctx: AuthContext, id: string): Promise<BerkasRow | undefined> {
        return this.query(ctx).selectFrom("stored_files").select(KOLOM).where("id", "=", id).executeTakeFirst();
    }
}

/** Pintu masuk repository: `defineRepository` menolak metode yang tidak menerima `AuthContext` (SDD-AUTH-02). */
export function createStoredFileRepository(executor: QueryExecutor): StoredFileRepository {
    return defineRepository(new StoredFileRepository(executor));
}
