// Acceptance PR-01-06: "Pohon lokasi + penonaktifan berjenjang" (FR-03.1
// langkah 1, BR-015 — KERANGKA hierarki, lihat catatan lingkup di
// `location.service.ts`) — terhadap PostgreSQL NYATA.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
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
    return `lokasi-pohon-uji${urut}@sekolah.sch.id`;
}
function nipUnik(): string {
    urut += 1;
    return `NIPLOKASIPOHONUJI${String(urut).padStart(6, "0")}`;
}
function kodeUnik(awalan: string): string {
    urut += 1;
    return `${awalan}-${urut}`;
}

async function seedAdmin(): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Uji Pohon Lokasi', '${emailUnik()}', 'x', '${nipUnik()}',
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
            ["location.view", "all"],
            ["location.manage", "all"],
        ]),
    });
}

function buatService(): LocationService {
    return new LocationService(
        getDb(),
        new AuditLogger({ clock: new FixedClock(new Date("2026-09-18T00:00:00Z")) }),
    );
}

async function aksiTerakhir(
    entitas: string,
    entitasId: string,
): Promise<{ aksi: string; hasil: string } | undefined> {
    const [baris] = await kueri<{ aksi: string; hasil: string }>(
        `SELECT aksi, hasil FROM activity_logs
          WHERE entitas = '${entitas}' AND entitas_id = '${entitasId}'
          ORDER BY id DESC LIMIT 1`,
    );
    return baris;
}

/** Membangun gedung -> area -> ruangan minimal, untuk diuji lebih lanjut. */
async function seedHierarki(service: LocationService, ctx: AuthContext) {
    const building = await service.createBuilding(ctx, {
        nama: "Gedung A",
        kode: kodeUnik("GD"),
        keterangan: null,
    });
    const area = await service.createArea(ctx, {
        buildingId: Number(building.id),
        nama: "L1",
        kode: kodeUnik("AR"),
        lantai: null,
    });
    return { building, area };
}

describe.skipIf(!ADA_DB)("PR-01-06 — pohon lokasi + penonaktifan berjenjang (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        // BR-015 (fix/PR-02-10): assets menunjuk rooms DAN asset_categories —
        // dibersihkan SEBELUM keduanya.
        await kueri("DELETE FROM assets");
        await kueri("DELETE FROM asset_categories");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
        await kueri("DELETE FROM users");
    });

    afterAll(async () => {
        await kueri("DELETE FROM assets");
        await kueri("DELETE FROM asset_categories");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
    });

    it("katalog endpoint: GET /locations/tree (location.view), PATCH .../status (location.manage)", () => {
        const tree = registry.all().find((r) => r.path === "/locations/tree");
        expect(tree).toMatchObject({ method: "GET", permission: "location.view" });

        const statusRoutes = registry
            .all()
            .filter((r) => r.path === "/buildings/:id/status" || r.path === "/rooms/:id/status");
        expect(statusRoutes).toHaveLength(2);
        expect(statusRoutes.every((r) => r.method === "PATCH" && r.permission === "location.manage")).toBe(
            true,
        );
    });

    it("getTree(): kosong -> array kosong", async () => {
        const service = buatService();
        await expect(service.getTree(buatCtx(1))).resolves.toEqual([]);
    });

    it("getTree(): menyusun gedung -> area -> ruangan bersarang (FR-03.1 langkah 1)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const { building, area } = await seedHierarki(service, ctx);
        const room = await service.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "Kelas A",
            kode: kodeUnik("RM"),
            jenis: "KELAS",
            kapasitas: null,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });

        const tree = await service.getTree(ctx);
        const gedung = tree.find((b) => b.id === building.id);
        expect(gedung).toBeDefined();
        expect(gedung?.areas).toHaveLength(1);
        expect(gedung?.areas[0]?.id).toBe(area.id);
        expect(gedung?.areas[0]?.rooms).toHaveLength(1);
        expect(gedung?.areas[0]?.rooms[0]?.id).toBe(room.id);
    });

    it("updateBuildingStatus(): nonaktifkan gedung TANPA ruangan aktif -> berhasil, LOCATION_DEACTIVATED tercatat", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const { building } = await seedHierarki(service, ctx);

        const after = await service.updateBuildingStatus(ctx, Number(building.id), "NONAKTIF");

        expect(after.status).toBe("NONAKTIF");
        const log = await aksiTerakhir("buildings", building.id);
        expect(log).toMatchObject({ aksi: "LOCATION_DEACTIVATED", hasil: "SUKSES" });
    });

    it("updateBuildingStatus(): nonaktifkan gedung DENGAN ruangan AKTIF -> VALIDATION_ERROR, status tidak berubah (BR-015 kerangka hierarki)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const { building, area } = await seedHierarki(service, ctx);
        await service.createRoom(ctx, {
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
            service.updateBuildingStatus(ctx, Number(building.id), "NONAKTIF"),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { rule: "BR-015" } });

        const [row] = await kueri<{ status: string }>(`SELECT status FROM buildings WHERE id = ${building.id}`);
        expect(row?.status).toBe("AKTIF");
    });

    it("updateBuildingStatus(): nonaktifkan gedung yang ruangannya SUDAH NONAKTIF -> berhasil", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const { building, area } = await seedHierarki(service, ctx);
        const room = await service.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "Kelas A",
            kode: kodeUnik("RM"),
            jenis: "KELAS",
            kapasitas: null,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });
        await service.updateRoomStatus(ctx, Number(room.id), "NONAKTIF");

        await expect(
            service.updateBuildingStatus(ctx, Number(building.id), "NONAKTIF"),
        ).resolves.toMatchObject({ status: "NONAKTIF" });
    });

    it("updateBuildingStatus(): aktifkan kembali -> LOCATION_UPDATED (bukan LOCATION_DEACTIVATED)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const { building } = await seedHierarki(service, ctx);
        await service.updateBuildingStatus(ctx, Number(building.id), "NONAKTIF");

        const after = await service.updateBuildingStatus(ctx, Number(building.id), "AKTIF");

        expect(after.status).toBe("AKTIF");
        const log = await aksiTerakhir("buildings", building.id);
        expect(log).toMatchObject({ aksi: "LOCATION_UPDATED", hasil: "SUKSES" });
    });

    it("updateBuildingStatus(): gedung tidak ada -> NotFoundError", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        await expect(
            service.updateBuildingStatus(buatCtx(adminId), 999_999_999, "NONAKTIF"),
        ).rejects.toThrow(/tidak ditemukan/);
    });

    it("updateRoomStatus(): nonaktifkan lalu aktifkan kembali, LOCATION_DEACTIVATED/LOCATION_UPDATED tercatat (AL-01)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const { area } = await seedHierarki(service, ctx);
        const room = await service.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "Kelas A",
            kode: kodeUnik("RM"),
            jenis: "KELAS",
            kapasitas: null,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });

        const dinonaktifkan = await service.updateRoomStatus(ctx, Number(room.id), "NONAKTIF");
        expect(dinonaktifkan.status).toBe("NONAKTIF");
        expect(await aksiTerakhir("rooms", room.id)).toMatchObject({
            aksi: "LOCATION_DEACTIVATED",
            hasil: "SUKSES",
        });

        const diaktifkan = await service.updateRoomStatus(ctx, Number(room.id), "AKTIF");
        expect(diaktifkan.status).toBe("AKTIF");
        expect(await aksiTerakhir("rooms", room.id)).toMatchObject({
            aksi: "LOCATION_UPDATED",
            hasil: "SUKSES",
        });
    });

    it("updateRoomStatus(): ruangan tidak ada -> NotFoundError", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        await expect(
            service.updateRoomStatus(buatCtx(adminId), 999_999_999, "NONAKTIF"),
        ).rejects.toThrow(/tidak ditemukan/);
    });

    describe("updateRoomStatus() — BR-015 tingkat ruangan (fix/PR-02-10, memuat aset)", () => {
        async function seedKategoriAset(): Promise<string> {
            const [baris] = await kueri<{ id: string }>(
                `INSERT INTO asset_categories (nama, kode) VALUES ('Kategori Uji', '${kodeUnik("KAT")}') RETURNING id::text`,
            );
            if (baris === undefined) throw new Error("Gagal menyisipkan kategori uji");
            return baris.id;
        }

        async function seedAset(roomId: string, kategoriId: string, dihapuskan = false): Promise<string> {
            const [baris] = await kueri<{ id: string }>(`
                INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, dihapuskan)
                VALUES ('${kodeUnik("BRG")}', 'Aset Uji', ${kategoriId}, 2024, 'PEMBELIAN', ${roomId}, 'BAIK', ${dihapuskan})
                RETURNING id::text
            `);
            if (baris === undefined) throw new Error("Gagal menyisipkan aset uji");
            return baris.id;
        }

        it("ruangan masih memuat aset -> VALIDATION_ERROR (BR-015), status TIDAK berubah", async () => {
            const adminId = await seedAdmin();
            const service = buatService();
            const ctx = buatCtx(adminId);
            const { area } = await seedHierarki(service, ctx);
            const room = await service.createRoom(ctx, {
                areaId: Number(area.id),
                nama: "Gudang Beraset",
                kode: kodeUnik("RM"),
                jenis: "GUDANG",
                kapasitas: null,
                penanggungJawabId: null,
                dapatDireservasi: false,
                bolehDireservasiSiswa: false,
            });
            const kategoriId = await seedKategoriAset();
            await seedAset(room.id, kategoriId);

            await expect(
                service.updateRoomStatus(ctx, Number(room.id), "NONAKTIF"),
            ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { rule: "BR-015" } });

            const [ulang] = await kueri<{ status: string }>(`SELECT status FROM rooms WHERE id = ${room.id}`);
            expect(ulang?.status).toBe("AKTIF");
        });

        it("aset yang SUDAH dihapuskan (M-21) tidak menghalangi penonaktifan", async () => {
            const adminId = await seedAdmin();
            const service = buatService();
            const ctx = buatCtx(adminId);
            const { area } = await seedHierarki(service, ctx);
            const room = await service.createRoom(ctx, {
                areaId: Number(area.id),
                nama: "Gudang Aset Dihapuskan",
                kode: kodeUnik("RM"),
                jenis: "GUDANG",
                kapasitas: null,
                penanggungJawabId: null,
                dapatDireservasi: false,
                bolehDireservasiSiswa: false,
            });
            const kategoriId = await seedKategoriAset();
            await seedAset(room.id, kategoriId, true);

            const hasil = await service.updateRoomStatus(ctx, Number(room.id), "NONAKTIF");
            expect(hasil.status).toBe("NONAKTIF");
        });

        it("aset dipindahkan ke ruangan lain -> ruangan asal dapat dinonaktifkan (\"seluruh asetnya dipindahkan\")", async () => {
            const adminId = await seedAdmin();
            const service = buatService();
            const ctx = buatCtx(adminId);
            const { area } = await seedHierarki(service, ctx);
            const asal = await service.createRoom(ctx, {
                areaId: Number(area.id),
                nama: "Gudang Asal",
                kode: kodeUnik("RM"),
                jenis: "GUDANG",
                kapasitas: null,
                penanggungJawabId: null,
                dapatDireservasi: false,
                bolehDireservasiSiswa: false,
            });
            const tujuan = await service.createRoom(ctx, {
                areaId: Number(area.id),
                nama: "Gudang Tujuan",
                kode: kodeUnik("RM"),
                jenis: "GUDANG",
                kapasitas: null,
                penanggungJawabId: null,
                dapatDireservasi: false,
                bolehDireservasiSiswa: false,
            });
            const kategoriId = await seedKategoriAset();
            const asetId = await seedAset(asal.id, kategoriId);

            await expect(
                service.updateRoomStatus(ctx, Number(asal.id), "NONAKTIF"),
            ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { rule: "BR-015" } });

            await kueri(`UPDATE assets SET room_id = ${tujuan.id} WHERE id = ${asetId}`);

            const hasil = await service.updateRoomStatus(ctx, Number(asal.id), "NONAKTIF");
            expect(hasil.status).toBe("NONAKTIF");
        });
    });
});
