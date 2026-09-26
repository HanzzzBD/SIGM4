// Acceptance PR-02-13 — "Perubahan kondisi aset + riwayat" (FR-04.3,
// BR-005/BR-005a/BR-005b, BR-006, BR-007, BR-012) terhadap PostgreSQL NYATA.
// Transaksi (riwayat + dua kemungkinan aksi log dalam SATU commit) dan
// constraint FK `asset_condition_history` tidak dapat dibuktikan lewat tiruan.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import { AssetService } from "../../src/modules/m04-assets/services/asset.service.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const WAKTU_UJI = new Date("2026-09-26T04:00:00Z");

let urut = 0;
function kodeUnik(awalan: string): string {
    urut += 1;
    return `${awalan}-${urut}`;
}
function emailUnik(): string {
    urut += 1;
    return `ubah-kondisi-uji${urut}@sekolah.sch.id`;
}
function nipUnik(): string {
    urut += 1;
    return `NIPUBAHKONDISI${String(urut).padStart(6, "0")}`;
}

/** `asset_condition_history.diubah_oleh` ber-FK ke `users(id)` — wajib baris nyata. */
async function seedPetugas(): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Petugas Uji Kondisi', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false)
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan petugas uji");
    return Number(baris.id);
}

async function seedRoom(): Promise<string> {
    const [gedung] = await kueri<{ id: string }>(
        `INSERT INTO buildings (nama, kode) VALUES ('Gedung Uji Kondisi', '${kodeUnik("GDG")}') RETURNING id::text`,
    );
    if (gedung === undefined) throw new Error("Gagal menyisipkan gedung uji");
    const [area] = await kueri<{ id: string }>(
        `INSERT INTO areas (building_id, nama, kode) VALUES (${gedung.id}, 'Area Uji Kondisi', '${kodeUnik("ARA")}') RETURNING id::text`,
    );
    if (area === undefined) throw new Error("Gagal menyisipkan area uji");
    const [ruang] = await kueri<{ id: string }>(
        `INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${area.id}, 'Ruang Uji Kondisi', '${kodeUnik("RG")}', 'GUDANG') RETURNING id::text`,
    );
    if (ruang === undefined) throw new Error("Gagal menyisipkan ruangan uji");
    return ruang.id;
}

async function seedKategori(): Promise<string> {
    const [baris] = await kueri<{ id: string }>(
        `INSERT INTO asset_categories (nama, kode) VALUES ('Kategori Uji Kondisi', '${kodeUnik("KAT")}') RETURNING id::text`,
    );
    if (baris === undefined) throw new Error("Gagal menyisipkan kategori uji");
    return baris.id;
}

async function seedAset(
    kategoriId: string,
    roomId: string,
    opts: { readonly kondisi?: string; readonly status?: string } = {},
): Promise<string> {
    const [a] = await kueri<{ id: string }>(`
        INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, status)
        VALUES ('${kodeUnik("BRG")}', 'Aset Uji Kondisi', ${kategoriId}, 2024, 'PEMBELIAN', ${roomId},
                '${opts.kondisi ?? "BAIK"}', '${opts.status ?? "TERSEDIA"}')
        RETURNING id::text
    `);
    if (a === undefined) throw new Error("Gagal menyisipkan aset uji");
    return a.id;
}

function buatCtx(userId: number): AuthContext {
    return createAuthContext({ userId, roleCode: "PETUGAS", scopes: new Map([["asset.update_condition", "all"]]) });
}

function buatService(): AssetService {
    const clock = new FixedClock(WAKTU_UJI);
    return new AssetService(getDb(), new AuditLogger({ clock }), clock);
}

async function riwayatTerakhir(assetId: string): Promise<
    | {
          kondisi_lama: string;
          kondisi_baru: string;
          alasan: string;
          referensi_jenis: string | null;
          referensi_id: string | null;
          diubah_oleh: string;
          diubah_pada: string;
      }
    | undefined
> {
    const [baris] = await kueri<{
        kondisi_lama: string;
        kondisi_baru: string;
        alasan: string;
        referensi_jenis: string | null;
        referensi_id: string | null;
        diubah_oleh: string;
        diubah_pada: string;
    }>(`SELECT kondisi_lama, kondisi_baru, alasan, referensi_jenis, referensi_id, diubah_oleh::text, diubah_pada::text
          FROM asset_condition_history WHERE asset_id = ${assetId} ORDER BY id DESC LIMIT 1`);
    return baris;
}

async function jumlahRiwayat(assetId: string): Promise<number> {
    return Number((await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM asset_condition_history WHERE asset_id = ${assetId}`))[0]?.n);
}

async function aksiLog(entitasId: string): Promise<readonly string[]> {
    const baris = await kueri<{ aksi: string }>(
        `SELECT aksi FROM activity_logs WHERE entitas = 'assets' AND entitas_id = '${entitasId}' AND hasil = 'SUKSES' ORDER BY id`,
    );
    return baris.map((b) => b.aksi);
}

describe.skipIf(!ADA_DB)("PR-02-13 — perubahan kondisi aset + riwayat (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await kueri("DELETE FROM asset_condition_history");
        await kueri("DELETE FROM activity_logs WHERE entitas = 'assets'");
        await kueri("DELETE FROM assets");
        await kueri("DELETE FROM asset_categories");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
        await kueri("DELETE FROM users");
    });

    afterAll(async () => {
        await kueri("DELETE FROM asset_condition_history");
        await kueri("DELETE FROM activity_logs WHERE entitas = 'assets'");
        await kueri("DELETE FROM assets");
        await kueri("DELETE FROM asset_categories");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
    });

    it("katalog endpoint: PATCH /assets/:id/condition berpermission asset.update_condition (bukan asset.update)", () => {
        const route = registry.all().find((r) => r.method === "PATCH" && r.path === "/assets/:id/condition");
        expect(route?.permission).toBe("asset.update_condition");
    });

    it("kondisi BAIK -> RUSAK_RINGAN: riwayat tercatat, status TIDAK berubah, hanya ASSET_CONDITION_CHANGED (BR-007)", async () => {
        const kategoriId = await seedKategori();
        const roomId = await seedRoom();
        const asetId = await seedAset(kategoriId, roomId);
        const petugasId = await seedPetugas();
        const service = buatService();

        const hasil = await service.ubahKondisi(buatCtx(petugasId), Number(asetId), {
            kondisi: "RUSAK_RINGAN",
            alasan: "Tergores saat pemindahan",
            referensiJenis: null,
            referensiId: null,
        });

        expect(hasil.kondisi).toBe("RUSAK_RINGAN");
        expect(hasil.status).toBe("TERSEDIA");

        const riwayat = await riwayatTerakhir(asetId);
        expect(riwayat).toMatchObject({
            kondisi_lama: "BAIK",
            kondisi_baru: "RUSAK_RINGAN",
            alasan: "Tergores saat pemindahan",
            referensi_jenis: null,
            referensi_id: null,
            diubah_oleh: String(petugasId),
        });
        expect(new Date(riwayat?.diubah_pada ?? "")).toEqual(WAKTU_UJI);
        expect(await aksiLog(asetId)).toEqual(["ASSET_CONDITION_CHANGED"]);
    });

    it("kondisi -> RUSAK_BERAT: status turunan TIDAK_TERSEDIA (BR-006), DUA aksi log terpisah (§11)", async () => {
        const kategoriId = await seedKategori();
        const roomId = await seedRoom();
        const asetId = await seedAset(kategoriId, roomId);
        const petugasId = await seedPetugas();
        const service = buatService();

        const hasil = await service.ubahKondisi(buatCtx(petugasId), Number(asetId), {
            kondisi: "RUSAK_BERAT",
            alasan: "Rusak parah tertimpa rak",
            referensiJenis: null,
            referensiId: null,
        });

        expect(hasil.status).toBe("TIDAK_TERSEDIA");
        expect(await aksiLog(asetId)).toEqual(["ASSET_CONDITION_CHANGED", "ASSET_STATUS_CHANGED"]);
    });

    it("kondisi -> HILANG TANPA referensi -> VALIDATION_ERROR (BR-012), tidak ada perubahan tersimpan", async () => {
        const kategoriId = await seedKategori();
        const roomId = await seedRoom();
        const asetId = await seedAset(kategoriId, roomId);
        const petugasId = await seedPetugas();
        const service = buatService();

        await expect(
            service.ubahKondisi(buatCtx(petugasId), Number(asetId), {
                kondisi: "HILANG",
                alasan: "Tidak ditemukan saat opname",
                referensiJenis: null,
                referensiId: null,
            }),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "referensi_jenis" } });

        expect(await jumlahRiwayat(asetId)).toBe(0);
        expect(await aksiLog(asetId)).toEqual([]);
        const [baris] = await kueri<{ kondisi: string; status: string }>(`SELECT kondisi, status FROM assets WHERE id = ${asetId}`);
        expect(baris).toMatchObject({ kondisi: "BAIK", status: "TERSEDIA" });
    });

    it("kondisi -> HILANG DENGAN referensi -> berhasil, status TIDAK_TERSEDIA, riwayat menyimpan referensi (BR-012)", async () => {
        const kategoriId = await seedKategori();
        const roomId = await seedRoom();
        const asetId = await seedAset(kategoriId, roomId);
        const petugasId = await seedPetugas();
        const service = buatService();

        const hasil = await service.ubahKondisi(buatCtx(petugasId), Number(asetId), {
            kondisi: "HILANG",
            alasan: "Tidak ditemukan saat opname",
            referensiJenis: "STOCK_OPNAME",
            referensiId: 42,
        });

        expect(hasil.kondisi).toBe("HILANG");
        expect(hasil.status).toBe("TIDAK_TERSEDIA");
        const riwayat = await riwayatTerakhir(asetId);
        expect(riwayat).toMatchObject({ referensi_jenis: "STOCK_OPNAME", referensi_id: "42" });
    });

    it("status SUDAH TIDAK_TERSEDIA -> transisi kondisi lain yang juga mensyaratkan Tidak Tersedia TIDAK mencatat ASSET_STATUS_CHANGED dua kali", async () => {
        const kategoriId = await seedKategori();
        const roomId = await seedRoom();
        const asetId = await seedAset(kategoriId, roomId, { kondisi: "RUSAK_BERAT", status: "TIDAK_TERSEDIA" });
        const petugasId = await seedPetugas();
        const service = buatService();

        const hasil = await service.ubahKondisi(buatCtx(petugasId), Number(asetId), {
            kondisi: "HILANG",
            alasan: "Dipastikan hilang setelah pencarian",
            referensiJenis: "BERITA_ACARA_KEHILANGAN",
            referensiId: 1,
        });

        expect(hasil.status).toBe("TIDAK_TERSEDIA");
        expect(await aksiLog(asetId)).toEqual(["ASSET_CONDITION_CHANGED"]);
    });

    it("aset tidak ada -> NotFoundError", async () => {
        const service = buatService();
        await expect(
            service.ubahKondisi(buatCtx(1), 999_999_999, {
                kondisi: "RUSAK_RINGAN",
                alasan: "x",
                referensiJenis: null,
                referensiId: null,
            }),
        ).rejects.toThrow(/tidak ditemukan/);
    });
});
