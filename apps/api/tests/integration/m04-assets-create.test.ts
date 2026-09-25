// Acceptance PR-02-11 — "Pendaftaran aset + penomoran + validasi kategori"
// (FR-04.1, BR-001…BR-004) terhadap PostgreSQL NYATA. Konkurensi penomoran
// dan constraint UNIQUE tidak dapat dibuktikan lewat tiruan.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import { AssetService } from "../../src/modules/m04-assets/services/asset.service.js";
import type { DaftarkanAsetInput } from "../../src/modules/m04-assets/services/asset.service.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

let urut = 0;
function emailUnik(): string {
    urut += 1;
    return `daftar-aset-uji${urut}@sekolah.sch.id`;
}
function nipUnik(): string {
    urut += 1;
    return `NIPDAFTARASET${String(urut).padStart(6, "0")}`;
}
function kodeUnik(awalan: string): string {
    urut += 1;
    return `${awalan}${urut}`;
}

async function seedAdmin(): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Uji Daftar Aset', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false)
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan admin uji");
    return Number(baris.id);
}

async function seedKategori(kode: string): Promise<number> {
    const [baris] = await kueri<{ id: string }>(
        `INSERT INTO asset_categories (nama, kode) VALUES ('Kategori ${kode}', '${kode}') RETURNING id::text`,
    );
    if (baris === undefined) throw new Error("Gagal menyisipkan kategori uji");
    return Number(baris.id);
}

async function seedRuangan(kode: string, status: "AKTIF" | "NONAKTIF" = "AKTIF"): Promise<number> {
    const [gedung] = await kueri<{ id: string }>(
        `INSERT INTO buildings (nama, kode) VALUES ('Gedung ${kode}', 'GD${kode}') RETURNING id::text`,
    );
    if (gedung === undefined) throw new Error("Gagal menyisipkan gedung uji");
    const [area] = await kueri<{ id: string }>(
        `INSERT INTO areas (building_id, nama, kode) VALUES (${gedung.id}, 'Area ${kode}', 'AR${kode}') RETURNING id::text`,
    );
    if (area === undefined) throw new Error("Gagal menyisipkan area uji");
    const [ruang] = await kueri<{ id: string }>(`
        INSERT INTO rooms (area_id, nama, kode, jenis, status)
        VALUES (${area.id}, 'Ruang ${kode}', '${kode}', 'GUDANG', '${status}')
        RETURNING id::text
    `);
    if (ruang === undefined) throw new Error("Gagal menyisipkan ruangan uji");
    return Number(ruang.id);
}

function buatCtx(userId: number): AuthContext {
    return createAuthContext({
        userId,
        roleCode: "ADMIN",
        scopes: new Map([["asset.create", "all"]]),
    });
}

function buatService(): AssetService {
    return new AssetService(
        getDb(),
        new AuditLogger({ clock: new FixedClock(new Date("2026-09-25T00:00:00Z")) }),
    );
}

async function aksiTerakhir(entitasId: string): Promise<{ aksi: string; hasil: string } | undefined> {
    const [baris] = await kueri<{ aksi: string; hasil: string }>(
        `SELECT aksi, hasil FROM activity_logs
          WHERE entitas = 'assets' AND entitas_id = '${entitasId}'
          ORDER BY id DESC LIMIT 1`,
    );
    return baris;
}

function inputDasar(kategoriId: number, roomId: number, override: Partial<DaftarkanAsetInput> = {}): DaftarkanAsetInput {
    return {
        nama: "Kursi Kelas",
        categoryId: kategoriId,
        merek: null,
        model: null,
        nomorSeri: null,
        tahunPerolehan: 2024,
        sumberPerolehan: "PEMBELIAN",
        nilaiPerolehan: null,
        roomId,
        kondisi: "BAIK",
        dapatDipinjam: true,
        bolehDipinjamSiswa: false,
        penanggungJawabId: null,
        procurementId: null,
        jumlahUnit: 1,
        ...override,
    };
}

describe.skipIf(!ADA_DB)("PR-02-11 — pendaftaran aset + penomoran (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await kueri("DELETE FROM asset_condition_history");
        await kueri("DELETE FROM assets");
        await kueri("DELETE FROM asset_code_counters");
        await kueri("DELETE FROM asset_categories");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
        await kueri("DELETE FROM users");
    });

    afterAll(async () => {
        await kueri("DELETE FROM asset_condition_history");
        await kueri("DELETE FROM assets");
        await kueri("DELETE FROM asset_code_counters");
        await kueri("DELETE FROM asset_categories");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
    });

    it("katalog endpoint: POST /assets berpermission asset.create", () => {
        const rute = registry.all().find((r) => r.method === "POST" && r.path === "/assets");
        expect(rute?.permission).toBe("asset.create");
    });

    it("kode_barang dirakit dari pola bawaan KATEGORI-LOKASI-URUT, status lahir TERSEDIA, ASSET_CREATED tercatat (AL-01)", async () => {
        const adminId = await seedAdmin();
        const kategoriId = await seedKategori(kodeUnik("KAT"));
        const roomId = await seedRuangan(kodeUnik("RG"));
        const service = buatService();

        const [aset] = await service.daftarkan(buatCtx(adminId), inputDasar(kategoriId, roomId));

        expect(aset).toBeDefined();
        expect(aset?.status).toBe("TERSEDIA");
        expect(aset?.uuid).toMatch(/^[0-9a-f-]{36}$/);
        const [kat] = await kueri<{ kode: string }>(`SELECT kode FROM asset_categories WHERE id = ${kategoriId}`);
        const [ruang] = await kueri<{ kode: string }>(`SELECT kode FROM rooms WHERE id = ${roomId}`);
        expect(aset?.kode_barang).toBe(`${kat?.kode}-${ruang?.kode}-0001`);

        const log = await aksiTerakhir(aset?.id ?? "");
        expect(log).toMatchObject({ aksi: "ASSET_CREATED", hasil: "SUKSES" });
    });

    it("jumlah_unit > 1 menghasilkan N record dengan kode_barang berurutan (BR-001, FR-04.1 langkah 3-4)", async () => {
        const adminId = await seedAdmin();
        const kategoriId = await seedKategori(kodeUnik("KAT"));
        const roomId = await seedRuangan(kodeUnik("RG"));
        const service = buatService();

        const dibuat = await service.daftarkan(buatCtx(adminId), inputDasar(kategoriId, roomId, { jumlahUnit: 3 }));

        expect(dibuat).toHaveLength(3);
        const kodeSet = new Set(dibuat.map((a) => a.kode_barang));
        expect(kodeSet.size).toBe(3);
        expect(dibuat.map((a) => a.kode_barang.split("-").at(-1))).toEqual(["0001", "0002", "0003"]);
    });

    it("counter TERPISAH per kombinasi kategori+lokasi (keputusan pemilik produk, log phase-02)", async () => {
        const adminId = await seedAdmin();
        const kategoriA = await seedKategori(kodeUnik("KAT"));
        const kategoriB = await seedKategori(kodeUnik("KAT"));
        const roomId = await seedRuangan(kodeUnik("RG"));
        const service = buatService();
        const ctx = buatCtx(adminId);

        const [a1] = await service.daftarkan(ctx, inputDasar(kategoriA, roomId));
        const [b1] = await service.daftarkan(ctx, inputDasar(kategoriB, roomId));

        expect(a1?.kode_barang.endsWith("-0001")).toBe(true);
        expect(b1?.kode_barang.endsWith("-0001")).toBe(true);
    });

    it("nomor aset unik di bawah beban paralel (acceptance PR-02-11)", async () => {
        const adminId = await seedAdmin();
        const kategoriId = await seedKategori(kodeUnik("KAT"));
        const roomId = await seedRuangan(kodeUnik("RG"));
        const service = buatService();
        const ctx = buatCtx(adminId);

        const hasil = await Promise.all(
            Array.from({ length: 15 }, () => service.daftarkan(ctx, inputDasar(kategoriId, roomId))),
        );
        const seluruhKode = hasil.flat().map((a) => a.kode_barang);
        expect(seluruhKode).toHaveLength(15);
        expect(new Set(seluruhKode).size).toBe(15);
    });

    it("kategori tidak ditemukan -> VALIDATION_ERROR field category_id", async () => {
        const adminId = await seedAdmin();
        const roomId = await seedRuangan(kodeUnik("RG"));
        const service = buatService();

        await expect(
            service.daftarkan(buatCtx(adminId), inputDasar(999_999_999, roomId)),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "category_id" } });
    });

    it("ruangan tidak ditemukan -> VALIDATION_ERROR field room_id", async () => {
        const adminId = await seedAdmin();
        const kategoriId = await seedKategori(kodeUnik("KAT"));
        const service = buatService();

        await expect(
            service.daftarkan(buatCtx(adminId), inputDasar(kategoriId, 999_999_999)),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "room_id" } });
    });

    it("ruangan NONAKTIF -> VALIDATION_ERROR field room_id (BR-009)", async () => {
        const adminId = await seedAdmin();
        const kategoriId = await seedKategori(kodeUnik("KAT"));
        const roomId = await seedRuangan(kodeUnik("RG"), "NONAKTIF");
        const service = buatService();

        await expect(
            service.daftarkan(buatCtx(adminId), inputDasar(kategoriId, roomId)),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "room_id" } });
    });

    it("nomor seri duplikat -> DUPLICATE_CODE (BR-003, FR-04.1 A1)", async () => {
        const adminId = await seedAdmin();
        const kategoriId = await seedKategori(kodeUnik("KAT"));
        const roomId = await seedRuangan(kodeUnik("RG"));
        const service = buatService();
        const ctx = buatCtx(adminId);
        const seri = kodeUnik("SN");
        await service.daftarkan(ctx, inputDasar(kategoriId, roomId, { nomorSeri: seri }));

        await expect(
            service.daftarkan(ctx, inputDasar(kategoriId, roomId, { nomorSeri: seri })),
        ).rejects.toMatchObject({ kode: "DUPLICATE_CODE", detail: { field: "nomor_seri" } });
    });

    it("nomor_seri diisi bersama jumlah_unit > 1 -> VALIDATION_ERROR (satu unit fisik = satu nomor seri)", async () => {
        const adminId = await seedAdmin();
        const kategoriId = await seedKategori(kodeUnik("KAT"));
        const roomId = await seedRuangan(kodeUnik("RG"));
        const service = buatService();

        await expect(
            service.daftarkan(
                buatCtx(adminId),
                inputDasar(kategoriId, roomId, { jumlahUnit: 2, nomorSeri: kodeUnik("SN") }),
            ),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "nomor_seri" } });
    });

    it("boleh_dipinjam_siswa=true dengan dapat_dipinjam=false -> VALIDATION_ERROR, BUKAN 23514 mentah (conventions.md E.5.1)", async () => {
        const adminId = await seedAdmin();
        const kategoriId = await seedKategori(kodeUnik("KAT"));
        const roomId = await seedRuangan(kodeUnik("RG"));
        const service = buatService();

        await expect(
            service.daftarkan(
                buatCtx(adminId),
                inputDasar(kategoriId, roomId, { dapatDipinjam: false, bolehDipinjamSiswa: true }),
            ),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "boleh_dipinjam_siswa" } });
    });

    it("jumlah_unit di luar 1..500 -> VALIDATION_ERROR", async () => {
        const adminId = await seedAdmin();
        const kategoriId = await seedKategori(kodeUnik("KAT"));
        const roomId = await seedRuangan(kodeUnik("RG"));
        const service = buatService();

        await expect(
            service.daftarkan(buatCtx(adminId), inputDasar(kategoriId, roomId, { jumlahUnit: 501 })),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "jumlah_unit" } });
    });
});
