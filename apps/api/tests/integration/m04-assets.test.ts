// Acceptance PR-01-07: "Daftar aset per lokasi (kerangka; data menyusul
// Phase 02)" (FR-03.2) — terhadap PostgreSQL NYATA. Tabel `assets` sendiri
// baru lahir `PR-02-10`; yang dibuktikan di sini adalah KONTRAK endpoint,
// bukan data sungguhan. Modul `m04-assets` lahir PERTAMA kali di PR ini.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import { AssetService } from "../../src/modules/m04-assets/services/asset.service.js";
import { LocationService } from "../../src/modules/m03-locations/services/location.service.js";
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
    return `aset-lokasi-uji${urut}@sekolah.sch.id`;
}
function nipUnik(): string {
    urut += 1;
    return `NIPASETLOKASIUJI${String(urut).padStart(6, "0")}`;
}
function kodeUnik(awalan: string): string {
    urut += 1;
    return `${awalan}-${urut}`;
}

async function seedAdmin(): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Uji Aset Lokasi', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false)
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan admin uji");
    return Number(baris.id);
}

function buatCtx(userId: number): AuthContext {
    return createAuthContext({
        userId,
        roleCode: "ADMIN",
        scopes: new Map([
            ["asset.view", "all"],
            ["location.manage", "all"],
        ]),
    });
}

function buatLocationService(): LocationService {
    return new LocationService(
        getDb(),
        new AuditLogger({ clock: new FixedClock(new Date("2026-09-18T00:00:00Z")) }),
    );
}

function buatAssetService(): AssetService {
    return new AssetService(getDb());
}

describe.skipIf(!ADA_DB)("PR-01-07 — daftar aset per lokasi, kerangka (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
        await kueri("DELETE FROM users");
    });

    afterAll(async () => {
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
    });

    it("katalog endpoint: GET /rooms/:id/assets berpermission asset.view (m04-assets.md §7)", () => {
        const route = registry.all().find((r) => r.path === "/rooms/:id/assets");
        expect(route).toMatchObject({ method: "GET", permission: "asset.view" });
    });

    it("listByRoom(): struktur benar dengan daftar kosong (FR-03.2 langkah 2-3)", async () => {
        const adminId = await seedAdmin();
        const locations = buatLocationService();
        const ctx = buatCtx(adminId);
        const building = await locations.createBuilding(ctx, {
            nama: "Gedung A",
            kode: kodeUnik("GD"),
            keterangan: null,
        });
        const area = await locations.createArea(ctx, {
            buildingId: Number(building.id),
            nama: "L1",
            kode: kodeUnik("AR"),
            lantai: null,
        });
        const room = await locations.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "Lab Komputer",
            kode: kodeUnik("RM"),
            jenis: "LABORATORIUM",
            kapasitas: null,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });

        const hasil = await buatAssetService().listByRoom(ctx, Number(room.id), {
            page: 1,
            perPage: 25,
        });

        expect(hasil.roomId).toBe(room.id);
        expect(hasil.assets).toEqual([]);
        expect(hasil.ringkasan).toEqual({
            total: 0,
            perKondisi: { BAIK: 0, RUSAK_RINGAN: 0, RUSAK_BERAT: 0, HILANG: 0 },
            jumlahDipinjam: 0,
            jumlahDalamPerbaikan: 0,
        });
        expect(hasil.total).toBe(0);
        expect(hasil.page).toBe(1);
        expect(hasil.perPage).toBe(25);
        expect(hasil.totalPages).toBe(1);
    });

    it("listByRoom(): menerima filter kategori/kondisi/status tanpa mengubah struktur (kontrak stabil untuk PR-02-10)", async () => {
        const adminId = await seedAdmin();
        const locations = buatLocationService();
        const ctx = buatCtx(adminId);
        const building = await locations.createBuilding(ctx, {
            nama: "Gedung A",
            kode: kodeUnik("GD"),
            keterangan: null,
        });
        const area = await locations.createArea(ctx, {
            buildingId: Number(building.id),
            nama: "L1",
            kode: kodeUnik("AR"),
            lantai: null,
        });
        const room = await locations.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "Kelas A",
            kode: kodeUnik("RM"),
            jenis: "KELAS",
            kapasitas: null,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });

        await expect(
            buatAssetService().listByRoom(ctx, Number(room.id), {
                page: 2,
                perPage: 10,
                kategoriId: 1,
                kondisi: "RUSAK_RINGAN",
                status: "DIPINJAM",
            }),
        ).resolves.toMatchObject({ assets: [], page: 2, perPage: 10 });
    });

    it("listByRoom(): ruangan tidak ada -> NotFoundError", async () => {
        const adminId = await seedAdmin();
        await expect(
            buatAssetService().listByRoom(buatCtx(adminId), 999_999_999, { page: 1, perPage: 25 }),
        ).rejects.toThrow(/tidak ditemukan/);
    });
});
