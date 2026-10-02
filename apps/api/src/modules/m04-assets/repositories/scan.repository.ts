// Resolusi UUID QR → aset (FR-05.2; PR-03-03, keputusan 3 log phase-03). Kolom `assets` dibaca
// HANYA di M-04; endpoint pemindaian milik M-05 memanggilnya lewat `index.ts` (SDD-SYS-03).

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { Database, QueryExecutor } from "../../../shared/db/index.js";

/** Kolom bersama kedua jalur: pengenal, atribut dasar, dan nama lokasi/kategori (FR-05.2 A3). */
const KOLOM_DASAR = [
    "assets.kode_barang",
    "assets.nama",
    "assets.kondisi",
    "assets.status",
    "assets.dihapuskan",
    "asset_categories.nama as kategori_nama",
    "rooms.nama as ruang_nama",
    "areas.nama as area_nama",
    "buildings.nama as gedung_nama",
] as const;

/** Profil hasil pindai bagi pengguna ber-`asset.view` — setara item katalog `GET /assets` (keputusan 3a). */
const KOLOM_PINDAI = [
    ...KOLOM_DASAR,
    "assets.id",
    "assets.uuid",
    "assets.category_id",
    "assets.merek",
    "assets.model",
    "assets.nomor_seri",
    "assets.tahun_perolehan",
    "assets.room_id",
    "assets.dapat_dipinjam",
    "assets.boleh_dipinjam_siswa",
    "assets.qr_terpasang",
    "assets.created_at",
] as const;

/** BR-073: hanya ter-SELECT bila pemanggil memegang `asset.view_financial` (pola katalog). */
const KOLOM_PINDAI_FINANSIAL = ["assets.nilai_perolehan", "assets.sumber_perolehan"] as const;

/**
 * Halaman publik (FR-05.2 A3, 17.5 butir 2): kode, nama, kategori, lokasi, kondisi, status — dan
 * penanda tidak aktif. Daftar TETAP: tanpa nilai/biaya, dokumen, foto, maupun data orang (`DP-05`).
 */
export const KOLOM_PUBLIK = KOLOM_DASAR;

function dasar(executor: QueryExecutor, uuid: string) {
    return executor
        .selectFrom("assets")
        .innerJoin("asset_categories", "asset_categories.id", "assets.category_id")
        .innerJoin("rooms", "rooms.id", "assets.room_id")
        .innerJoin("areas", "areas.id", "rooms.area_id")
        .innerJoin("buildings", "buildings.id", "areas.building_id")
        .where("assets.uuid", "=", uuid);
}

export class ScanRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * FR-05.2 langkah 3. Aset terhapuskan TETAP ditemukan (A2 — profil bertanda tidak aktif), berbeda
     * dari katalog. Scope `restricted` (Siswa/OSIS) hanya melihat `boleh_dipinjam_siswa` — selain itu
     * tidak ditemukan, sama dengan katalog (keputusan 3b, 17.5 butir 3).
     */
    async cariByUuid(ctx: AuthContext, uuid: string): Promise<Record<string, unknown> | undefined> {
        let q = dasar(this.query(ctx), uuid);
        if (ctx.scopeOf("asset.view") === "restricted") q = q.where("assets.boleh_dipinjam_siswa", "=", true);
        return ctx.can("asset.view_financial") ? q.select([...KOLOM_PINDAI, ...KOLOM_PINDAI_FINANSIAL]).executeTakeFirst() : q.select(KOLOM_PINDAI).executeTakeFirst();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createScanRepository(executor: QueryExecutor): ScanRepository {
    return defineRepository(new ScanRepository(executor));
}

/**
 * PENGECUALIAN SDD-AUTH-02 (kedua setelah `AuthRepository`; keputusan 3d log phase-03): halaman
 * publik QR berjalan TANPA pengguna, sehingga tidak ada `AuthContext`. Pagar penggantinya: satu
 * kueri berkunci pasti (UUIDv4 yang tak dapat ditebak), daftar kolom tetap `KOLOM_PUBLIK`, tidak
 * pernah mengembalikan daftar. Tidak memakai `BaseRepository` dan hanya dipanggil
 * `profilPublikAset`.
 */
export class PublicAssetRepository {
    constructor(private readonly executor: Kysely<Database>) {}

    async profil(uuid: string): Promise<PublicAssetRow | undefined> {
        return dasar(this.executor, uuid).select(KOLOM_PUBLIK).executeTakeFirst();
    }
}

export interface PublicAssetRow {
    readonly kode_barang: string;
    readonly nama: string;
    readonly kondisi: string;
    readonly status: string;
    readonly dihapuskan: boolean;
    readonly kategori_nama: string;
    readonly ruang_nama: string;
    readonly area_nama: string;
    readonly gedung_nama: string;
}
