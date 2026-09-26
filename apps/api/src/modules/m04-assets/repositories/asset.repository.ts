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

type AssetCondition = "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" | "HILANG";
type AssetStatus = "TERSEDIA" | "DIRESERVASI" | "DIPINJAM" | "DALAM_PERBAIKAN" | "TIDAK_TERSEDIA";

/** `sort` (SDD-API-06 allow-list) — awalan `-` = menurun (SDD-API §4.5). */
export type AssetSortField =
    | "created_at"
    | "-created_at"
    | "nama"
    | "-nama"
    | "kode_barang"
    | "-kode_barang"
    | "tahun_perolehan"
    | "-tahun_perolehan";

const KOLOM_URUT: Record<AssetSortField, "created_at" | "nama" | "kode_barang" | "tahun_perolehan"> = {
    created_at: "created_at",
    "-created_at": "created_at",
    nama: "nama",
    "-nama": "nama",
    kode_barang: "kode_barang",
    "-kode_barang": "kode_barang",
    tahun_perolehan: "tahun_perolehan",
    "-tahun_perolehan": "tahun_perolehan",
};

function arahUrut(sort: AssetSortField): "asc" | "desc" {
    return sort.startsWith("-") ? "desc" : "asc";
}

/** Field dasar (FR-04.2 langkah 2-4) — SELALU terlihat oleh siapa pun ber-`asset.view`. */
const KOLOM_KATALOG_BASE = [
    "id",
    "uuid",
    "kode_barang",
    "nama",
    "category_id",
    "merek",
    "model",
    "nomor_seri",
    "tahun_perolehan",
    "room_id",
    "kondisi",
    "status",
    "dapat_dipinjam",
    "boleh_dipinjam_siswa",
    "created_at",
] as const;

/** BR-073: hanya ter-SELECT bila pemanggil memegang `asset.view_financial` (SDD-03 §4.3, SDD-AUTH-06). */
const KOLOM_KATALOG_FINANSIAL = ["nilai_perolehan", "sumber_perolehan"] as const;

export interface AssetCatalogFilter {
    /** FR-04.2 langkah 3: kode aset, nama, merek, atau nomor seri (substring, tanpa mempedulikan huruf besar/kecil). */
    readonly q?: string;
    readonly categoryId?: number;
    readonly roomId?: number;
    readonly kondisi?: AssetCondition;
    readonly status?: AssetStatus;
    readonly tahunPerolehan?: number;
    readonly dapatDipinjam?: boolean;
}

export interface ListAssetsFilter extends AssetCatalogFilter {
    readonly page: number;
    readonly perPage: number;
    readonly sort: AssetSortField;
}

export interface ListAssetsResult {
    readonly rows: readonly Record<string, unknown>[];
    readonly total: number;
}

export interface RingkasanBarisRow {
    readonly kondisi: AssetCondition;
    readonly status: AssetStatus;
    readonly jumlah: string;
}

export class AssetRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * Kueri dasar katalog aset (FR-04.2, dipakai bersama `GET /assets` dan
     * `GET /rooms/{id}/assets`). `dihapuskan = false` SELALU diterapkan (BR-008:
     * aset terhapuskan tetap tertelusuri, tetapi bukan pada katalog biasa).
     * Scope `restricted` (Siswa/OSIS, `SDD-AUTH-03 §4.2`) hanya melihat
     * `boleh_dipinjam_siswa = true` (`BR-073`, `FR-04.2 A1`).
     */
    private dasarKatalog(ctx: AuthContext, filter: AssetCatalogFilter) {
        let q = this.query(ctx)
            .selectFrom("assets")
            .where("dihapuskan", "=", false);
        if (filter.roomId !== undefined) q = q.where("room_id", "=", String(filter.roomId));
        if (filter.categoryId !== undefined) q = q.where("category_id", "=", String(filter.categoryId));
        if (filter.kondisi !== undefined) q = q.where("kondisi", "=", filter.kondisi);
        if (filter.status !== undefined) q = q.where("status", "=", filter.status);
        if (filter.tahunPerolehan !== undefined) q = q.where("tahun_perolehan", "=", filter.tahunPerolehan);
        if (filter.dapatDipinjam !== undefined) q = q.where("dapat_dipinjam", "=", filter.dapatDipinjam);
        if (filter.q !== undefined && filter.q.length > 0) {
            const kata = `%${filter.q}%`;
            q = q.where((eb) =>
                eb.or([
                    eb("kode_barang", "ilike", kata),
                    eb("nama", "ilike", kata),
                    eb("merek", "ilike", kata),
                    eb("nomor_seri", "ilike", kata),
                ]),
            );
        }
        if (ctx.scopeOf("asset.view") === "restricted") {
            q = q.where("boleh_dipinjam_siswa", "=", true);
        }
        return q;
    }

    /**
     * `GET /assets` (FR-04.2) dan `GET /rooms/{id}/assets` (FR-03.2, roomId
     * terisi). `total` dihitung `COUNT(*) OVER ()` pada kueri yang sama
     * (`SDD-API-05 §4.5`), bukan kueri kedua.
     */
    async list(ctx: AuthContext, filter: ListAssetsFilter): Promise<ListAssetsResult> {
        const dasar = this.dasarKatalog(ctx, filter)
            .orderBy(KOLOM_URUT[filter.sort], arahUrut(filter.sort))
            .orderBy("id", arahUrut(filter.sort))
            .limit(filter.perPage)
            .offset((filter.page - 1) * filter.perPage)
            .select(sql<string>`count(*) over()`.as("total"));

        const rows = ctx.can("asset.view_financial")
            ? await dasar.select([...KOLOM_KATALOG_BASE, ...KOLOM_KATALOG_FINANSIAL]).execute()
            : await dasar.select(KOLOM_KATALOG_BASE).execute();

        const total = rows.length > 0 ? Number((rows[0] as { total: string }).total) : 0;
        return {
            rows: rows.map((baris) => {
                const sisanya: Record<string, unknown> = { ...baris };
                delete sisanya["total"];
                return sisanya;
            }),
            total,
        };
    }

    /**
     * Ringkasan kondisi/status SELURUH aset ruangan (FR-03.2 langkah 2),
     * TANPA paginasi/filter daftar — kartu ringkasan selalu menghitung
     * keseluruhan isi ruangan, bukan hasil filter yang sedang ditampilkan.
     */
    async ringkasanRuangan(ctx: AuthContext, roomId: number): Promise<readonly RingkasanBarisRow[]> {
        let q = this.query(ctx)
            .selectFrom("assets")
            .select(["kondisi", "status", sql<string>`count(*)`.as("jumlah")])
            .where("room_id", "=", String(roomId))
            .where("dihapuskan", "=", false)
            .groupBy(["kondisi", "status"]);
        if (ctx.scopeOf("asset.view") === "restricted") {
            q = q.where("boleh_dipinjam_siswa", "=", true);
        }
        return q.execute();
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

    /** `PATCH /assets/{id}/condition` (FR-04.3 langkah 1): baris lengkap, termasuk `status` saat ini. */
    async findById(ctx: AuthContext, id: number): Promise<AssetRow | undefined> {
        return this.query(ctx)
            .selectFrom("assets")
            .select(KOLOM_ASSET)
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    /**
     * FR-04.3 langkah 4: memperbarui `kondisi`, dan `status` HANYA bila
     * dinyatakan (BR-006/FR-04.3 A1/A2: `RUSAK_BERAT`/`HILANG` → `TIDAK_TERSEDIA`
     * ditentukan pemanggil, bukan di sini — repository tidak berisi aturan bisnis).
     */
    async updateKondisi(
        ctx: AuthContext,
        id: number,
        data: { kondisi: AssetCondition; status?: AssetStatus },
    ): Promise<AssetRow> {
        return this.query(ctx)
            .updateTable("assets")
            .set({
                kondisi: data.kondisi,
                ...(data.status === undefined ? {} : { status: data.status }),
                updated_by: ctx.userId,
            })
            .where("id", "=", String(id))
            .returning(KOLOM_ASSET)
            .executeTakeFirstOrThrow();
    }

    /** BR-007: setiap perubahan kondisi wajib tercatat (nilai lama → baru, pelaku, waktu, alasan). */
    async insertRiwayatKondisi(
        ctx: AuthContext,
        data: {
            readonly assetId: number;
            readonly kondisiLama: AssetCondition;
            readonly kondisiBaru: AssetCondition;
            readonly alasan: string;
            readonly referensiJenis: string | null;
            readonly referensiId: number | null;
            readonly diubahOleh: number;
            readonly diubahPada: Date;
        },
    ): Promise<void> {
        await this.query(ctx)
            .insertInto("asset_condition_history")
            .values({
                asset_id: data.assetId,
                kondisi_lama: data.kondisiLama,
                kondisi_baru: data.kondisiBaru,
                alasan: data.alasan,
                referensi_jenis: data.referensiJenis,
                referensi_id: data.referensiId,
                diubah_oleh: data.diubahOleh,
                diubah_pada: data.diubahPada,
            })
            .execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createAssetRepository(executor: QueryExecutor): AssetRepository {
    return defineRepository(new AssetRepository(executor));
}
