// Acceptance PR-02-15 — "Manajemen kategori aset" (FR-04.5 langkah 1-3,
// A1–A4) terhadap PostgreSQL NYATA. A3/A4 dan endpoint tulis diputuskan pemilik
// produk (keputusan 62 log phase-02) dan dinaikkan ke PRD lebih dulu.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import type { KategoriFields } from "../../src/modules/m04-assets/repositories/category.repository.js";
import { CategoryService } from "../../src/modules/m04-assets/services/category.service.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

let urut = 0;
function kodeUnik(awalan: string): string {
    urut += 1;
    return `${awalan}${urut}`;
}

/** `asset_categories.created_by` ber-FK ke `users(id)`. */
async function seedPetugas(): Promise<number> {
    urut += 1;
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Petugas Uji Kategori', 'kategori-uji${urut}@sekolah.sch.id', 'x', 'NIPKATEGORI${String(urut).padStart(6, "0")}',
                (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false)
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan petugas uji");
    return Number(baris.id);
}

/** Aset di kategori ini (ruangan minimal). `dihapuskan` tetap menghitung sebagai "dipakai". */
async function seedAset(kategoriId: string, dihapuskan = false): Promise<void> {
    const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('G', '${kodeUnik("G")}') RETURNING id::text`);
    const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${g?.id}, 'A', '${kodeUnik("A")}') RETURNING id::text`);
    const [r] = await kueri<{ id: string }>(
        `INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${a?.id}, 'R', '${kodeUnik("R")}', 'GUDANG') RETURNING id::text`,
    );
    await kueri(`
        INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, dihapuskan)
        VALUES ('${kodeUnik("BRG")}', 'Aset Uji', ${kategoriId}, 2024, 'PEMBELIAN', ${r?.id}, 'BAIK', ${dihapuskan})
    `);
}

function buatCtx(userId: number): AuthContext {
    return createAuthContext({ userId, roleCode: "PETUGAS", scopes: new Map([["category.manage", "all"]]) });
}

function buatService(): CategoryService {
    return new CategoryService(getDb(), new AuditLogger({ clock: new FixedClock(new Date("2026-09-26T06:00:00Z")) }));
}

function data(override: Partial<KategoriFields> = {}): KategoriFields {
    return {
        nama: "Komputer",
        kode: kodeUnik("KOM"),
        parentId: null,
        umurTeknisTahun: 5,
        intervalPreventifHari: 180,
        ...override,
    };
}

async function aksiLog(entitasId: string): Promise<readonly string[]> {
    const baris = await kueri<{ aksi: string }>(
        `SELECT aksi FROM activity_logs WHERE entitas = 'asset_categories' AND entitas_id = '${entitasId}' ORDER BY id`,
    );
    return baris.map((b) => b.aksi);
}

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM activity_logs WHERE entitas = 'asset_categories'");
    await kueri("DELETE FROM asset_movements");
    await kueri("DELETE FROM asset_condition_history");
    await kueri("DELETE FROM assets");
    await kueri("DELETE FROM asset_code_counters");
    await kueri("UPDATE asset_categories SET parent_id = NULL");
    await kueri("DELETE FROM asset_categories");
    await kueri("DELETE FROM rooms");
    await kueri("DELETE FROM areas");
    await kueri("DELETE FROM buildings");
}

describe.skipIf(!ADA_DB)("PR-02-15 — manajemen kategori aset (acceptance)", () => {
    let ctx: AuthContext;

    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await bersihkan();
        await kueri("DELETE FROM users");
        ctx = buatCtx(await seedPetugas());
    });

    afterAll(bersihkan);

    it("katalog endpoint: GET asset.view; POST/PUT/DELETE category.manage (m04-assets.md §7)", () => {
        const izin = (m: string, p: string) => registry.all().find((r) => r.method === m && r.path === p)?.permission;
        expect(izin("GET", "/asset-categories")).toBe("asset.view");
        expect(izin("POST", "/asset-categories")).toBe("category.manage");
        expect(izin("PUT", "/asset-categories/:id")).toBe("category.manage");
        expect(izin("DELETE", "/asset-categories/:id")).toBe("category.manage");
    });

    it("buat kategori induk + anak (AC dua tingkat); CATEGORY_CREATED tercatat (AL-01)", async () => {
        const service = buatService();
        const induk = await service.buat(ctx, data({ nama: "Elektronik" }));
        const anak = await service.buat(ctx, data({ nama: "Laptop", parentId: Number(induk.id) }));

        expect(anak.parent_id).toBe(induk.id);
        expect(anak.interval_preventif_hari).toBe(180);
        expect(await aksiLog(induk.id)).toEqual(["CATEGORY_CREATED"]);
    });

    it("A1: kode duplikat ditolak DUPLICATE_CODE pada buat DAN ubah", async () => {
        const service = buatService();
        const a = await service.buat(ctx, data());
        const b = await service.buat(ctx, data());

        await expect(service.buat(ctx, data({ kode: a.kode }))).rejects.toMatchObject({
            kode: "DUPLICATE_CODE",
            detail: { field: "kode" },
        });
        await expect(service.ubah(ctx, Number(b.id), data({ kode: a.kode }))).rejects.toMatchObject({
            kode: "DUPLICATE_CODE",
        });
    });

    it("induk tidak ada -> VALIDATION_ERROR parent_id", async () => {
        await expect(buatService().buat(ctx, data({ parentId: 999_999_999 }))).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            detail: { field: "parent_id" },
        });
    });

    it("A4: kode kategori yang sudah dipakai aset TIDAK dapat diubah; atribut lain tetap dapat diubah", async () => {
        const service = buatService();
        const k = await service.buat(ctx, data());
        await seedAset(k.id);

        await expect(service.ubah(ctx, Number(k.id), data({ kode: kodeUnik("BARU") }))).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            detail: { field: "kode" },
        });
        const [tetap] = await kueri<{ kode: string }>(`SELECT kode FROM asset_categories WHERE id = ${k.id}`);
        expect(tetap?.kode).toBe(k.kode);

        const diubah = await service.ubah(ctx, Number(k.id), data({ kode: k.kode, nama: "Komputer Lab", intervalPreventifHari: 90 }));
        expect(diubah).toMatchObject({ nama: "Komputer Lab", interval_preventif_hari: 90 });
        expect(await aksiLog(k.id)).toEqual(["CATEGORY_CREATED", "CATEGORY_UPDATED"]);
    });

    it("kode kategori yang BELUM dipakai boleh diubah", async () => {
        const service = buatService();
        const k = await service.buat(ctx, data());
        const kodeBaru = kodeUnik("BARU");

        expect((await service.ubah(ctx, Number(k.id), data({ kode: kodeBaru }))).kode).toBe(kodeBaru);
    });

    it("induk tidak boleh dirinya sendiri atau subkategorinya (siklus)", async () => {
        const service = buatService();
        const kakek = await service.buat(ctx, data());
        const anak = await service.buat(ctx, data({ parentId: Number(kakek.id) }));
        const cucu = await service.buat(ctx, data({ parentId: Number(anak.id) }));

        for (const calonInduk of [kakek.id, cucu.id]) {
            await expect(
                service.ubah(ctx, Number(kakek.id), data({ kode: kakek.kode, parentId: Number(calonInduk) })),
            ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "parent_id" } });
        }
    });

    it("A2: kategori yang dipakai aset (TERMASUK aset dihapuskan) tidak dapat dihapus; pesan menyebut jumlah aset", async () => {
        const service = buatService();
        const k = await service.buat(ctx, data());
        await seedAset(k.id);
        await seedAset(k.id, true);

        await expect(service.hapus(ctx, Number(k.id))).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            message: expect.stringContaining("2 aset") as unknown,
        });
        expect(await kueri(`SELECT id FROM asset_categories WHERE id = ${k.id}`)).toHaveLength(1);
    });

    it("A3: kategori yang masih punya subkategori tidak dapat dihapus; pesan menyebut jumlah subkategori", async () => {
        const service = buatService();
        const induk = await service.buat(ctx, data());
        await service.buat(ctx, data({ parentId: Number(induk.id) }));

        await expect(service.hapus(ctx, Number(induk.id))).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            message: expect.stringContaining("1 subkategori") as unknown,
        });
    });

    it("kategori tak terpakai tanpa subkategori terhapus; CATEGORY_DELETED tercatat", async () => {
        const service = buatService();
        const k = await service.buat(ctx, data());

        await service.hapus(ctx, Number(k.id));

        expect(await kueri(`SELECT id FROM asset_categories WHERE id = ${k.id}`)).toHaveLength(0);
        expect(await aksiLog(k.id)).toEqual(["CATEGORY_CREATED", "CATEGORY_DELETED"]);
    });

    it("kategori tidak ada -> NotFoundError pada ubah dan hapus", async () => {
        const service = buatService();
        await expect(service.ubah(ctx, 999_999_999, data())).rejects.toThrow(/tidak ditemukan/);
        await expect(service.hapus(ctx, 999_999_999)).rejects.toThrow(/tidak ditemukan/);
    });

    it("daftar terpaginasi terurut kode, total dari seluruh baris", async () => {
        const service = buatService();
        await service.buat(ctx, data({ kode: "ZZZ" }));
        await service.buat(ctx, data({ kode: "AAA" }));
        await service.buat(ctx, data({ kode: "MMM" }));

        const hal1 = await service.list(ctx, 1, 2);
        expect(hal1.rows.map((r) => r.kode)).toEqual(["AAA", "MMM"]);
        expect(hal1).toMatchObject({ total: 3, totalPages: 2 });
    });
});
