// Repository M-04 (SDD-AUTH-02, PM-03). PRIVAT terhadap modul (SDD-SYS-03) —
// hanya service/asset.service.ts yang boleh memanggilnya.
//
// `roomExists`/`findKategoriById`/`findRuanganAktifById` mengueri `rooms` dan
// `asset_categories` LANGSUNG, bukan lewat repository modul lain (dilarang
// lintas modul, SDD-00 §4.2) — `m04-assets.md` §13 menyatakan M-04 bergantung
// M-03 justru pada data lokasi ini; `asset_categories` tabel milik modul sendiri.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface KategoriRow {
    readonly id: string;
    readonly kode: string;
}

export interface RuanganRow {
    readonly id: string;
    readonly kode: string;
}

/** `kode_aset.*` (0027, `system_settings` kelompok `KODE_ASET`, FR-20.1). */
export interface PengaturanKodeAset {
    readonly pola: string;
    readonly pemisah: string;
    readonly panjangUrut: number;
}

const KOLOM_ASSET = [
    "id",
    "uuid",
    "kode_barang",
    "nama",
    "category_id",
    "merek",
    "model",
    "nomor_seri",
    "tahun_perolehan",
    "sumber_perolehan",
    "nilai_perolehan",
    "room_id",
    "kondisi",
    "status",
    "dapat_dipinjam",
    "boleh_dipinjam_siswa",
    "penanggung_jawab_id",
    "procurement_id",
    "created_at",
] as const;

export interface AssetRow {
    readonly id: string;
    readonly uuid: string;
    readonly kode_barang: string;
    readonly nama: string;
    readonly category_id: string;
    readonly merek: string | null;
    readonly model: string | null;
    readonly nomor_seri: string | null;
    readonly tahun_perolehan: number;
    readonly sumber_perolehan: "PEMBELIAN" | "HIBAH" | "BANTUAN_PEMERINTAH" | "SUMBANGAN" | "LAINNYA";
    readonly nilai_perolehan: string | null;
    readonly room_id: string;
    readonly kondisi: "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" | "HILANG";
    readonly status: "TERSEDIA" | "DIRESERVASI" | "DIPINJAM" | "DALAM_PERBAIKAN" | "TIDAK_TERSEDIA";
    readonly dapat_dipinjam: boolean;
    readonly boleh_dipinjam_siswa: boolean;
    readonly penanggung_jawab_id: string | null;
    readonly procurement_id: string | null;
    readonly created_at: Date;
}

export interface AssetFields {
    readonly kodeBarang: string;
    readonly nama: string;
    readonly categoryId: number;
    readonly merek: string | null;
    readonly model: string | null;
    readonly nomorSeri: string | null;
    readonly tahunPerolehan: number;
    readonly sumberPerolehan: "PEMBELIAN" | "HIBAH" | "BANTUAN_PEMERINTAH" | "SUMBANGAN" | "LAINNYA";
    readonly nilaiPerolehan: number | null;
    readonly roomId: number;
    readonly kondisi: "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" | "HILANG";
    readonly dapatDipinjam: boolean;
    readonly bolehDipinjamSiswa: boolean;
    readonly penanggungJawabId: number | null;
    readonly procurementId: number | null;
}

export class AssetRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async roomExists(ctx: AuthContext, roomId: number): Promise<boolean> {
        return (
            (await this.query(ctx)
                .selectFrom("rooms")
                .select("id")
                .where("id", "=", String(roomId))
                .executeTakeFirst()) !== undefined
        );
    }

    async findKategoriById(ctx: AuthContext, id: number): Promise<KategoriRow | undefined> {
        return this.query(ctx)
            .selectFrom("asset_categories")
            .select(["id", "kode"])
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    /** BR-009: lokasi penempatan wajib AKTIF (pola `work_unit_id`, SDD-05 §4.7c). */
    async findRuanganAktifById(ctx: AuthContext, id: number): Promise<RuanganRow | undefined> {
        return this.query(ctx)
            .selectFrom("rooms")
            .select(["id", "kode"])
            .where("id", "=", String(id))
            .where("status", "=", "AKTIF")
            .executeTakeFirst();
    }

    /** BR-003 A1: nomor seri duplikat ditolak dengan pesan spesifik sebelum INSERT. */
    async existsNomorSeri(ctx: AuthContext, nomorSeri: string): Promise<boolean> {
        return (
            (await this.query(ctx)
                .selectFrom("assets")
                .select("id")
                .where("nomor_seri", "=", nomorSeri)
                .executeTakeFirst()) !== undefined
        );
    }

    async ambilPengaturanKodeAset(ctx: AuthContext): Promise<PengaturanKodeAset> {
        const baris = await this.query(ctx)
            .selectFrom("system_settings")
            .select(["key", "value"])
            .where("key", "in", ["kode_aset.pola", "kode_aset.pemisah", "kode_aset.panjang_urut"])
            .execute();
        const peta = new Map(baris.map((b) => [b.key, b.value]));
        const pola = peta.get("kode_aset.pola");
        const pemisah = peta.get("kode_aset.pemisah");
        const panjangUrut = peta.get("kode_aset.panjang_urut");
        if (typeof pola !== "string" || typeof pemisah !== "string" || typeof panjangUrut !== "number") {
            throw new Error("Pengaturan kode_aset.* hilang atau berbentuk salah (migration 0027).");
        }
        return { pola, pemisah, panjangUrut };
    }

    /**
     * Nomor urut berikutnya untuk kombinasi (kategori, ruangan) — pola
     * `document_counters` (SDD-AVL-09): `ON CONFLICT DO UPDATE` mengunci baris
     * sehingga permintaan bersamaan atas kombinasi yang sama diserialisasi
     * basis data, bukan kunci aplikasi yang dapat dilewati proses lain.
     */
    async nomorUrutBerikutnya(ctx: AuthContext, categoryId: number, roomId: number): Promise<string> {
        const hasil = await sql<{ value: string }>`
            INSERT INTO asset_code_counters (category_id, room_id, value)
            VALUES (${categoryId}, ${roomId}, 1)
            ON CONFLICT (category_id, room_id) DO UPDATE SET value = asset_code_counters.value + 1
            RETURNING value
        `.execute(this.query(ctx));
        const urut = hasil.rows[0]?.value;
        if (urut === undefined) {
            throw new Error("Penghitung kode aset tidak mengembalikan nilai.");
        }
        return urut;
    }

    async insertAsset(ctx: AuthContext, data: AssetFields): Promise<AssetRow> {
        return this.query(ctx)
            .insertInto("assets")
            .values({
                kode_barang: data.kodeBarang,
                nama: data.nama,
                category_id: data.categoryId,
                merek: data.merek,
                model: data.model,
                nomor_seri: data.nomorSeri,
                tahun_perolehan: data.tahunPerolehan,
                sumber_perolehan: data.sumberPerolehan,
                nilai_perolehan: data.nilaiPerolehan,
                room_id: data.roomId,
                kondisi: data.kondisi,
                dapat_dipinjam: data.dapatDipinjam,
                boleh_dipinjam_siswa: data.bolehDipinjamSiswa,
                penanggung_jawab_id: data.penanggungJawabId,
                procurement_id: data.procurementId,
                created_by: ctx.userId,
                updated_by: ctx.userId,
            })
            .returning(KOLOM_ASSET)
            .executeTakeFirstOrThrow();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createAssetRepository(executor: QueryExecutor): AssetRepository {
    return defineRepository(new AssetRepository(executor));
}
