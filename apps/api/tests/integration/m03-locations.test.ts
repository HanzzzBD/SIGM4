// Acceptance PR-01-05: "Skema buildings/areas/rooms + CRUD" (FR-03.1, BR-013,
// BR-014) — terhadap PostgreSQL NYATA. Constraint UNIQUE dan activity log
// tidak dapat dibuktikan lewat tiruan.

import { describe, expect, it, afterAll, beforeAll, beforeEach } from "vitest";
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
    return `lokasi-uji${urut}@sekolah.sch.id`;
}
function nipUnik(): string {
    urut += 1;
    return `NIPLOKASIUJI${String(urut).padStart(6, "0")}`;
}
function kodeUnik(awalan: string): string {
    urut += 1;
    return `${awalan}-${urut}`;
}

/** Admin ber-status AKTIF — pelaku (`created_by`/`updated_by`) bagi operasi tulis. */
async function seedAdmin(): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Uji Lokasi', '${emailUnik()}', 'x', '${nipUnik()}',
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
        scopes: new Map([["location.manage", "all"]]),
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

describe.skipIf(!ADA_DB)("PR-01-05 — skema lokasi + CRUD (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
        await kueri("DELETE FROM users");
    });

    // Berkas uji LAIN membersihkan `users` di `beforeEach`-nya sendiri
    // (mis. `m02-users-import.test.ts`) — baris `buildings`/`areas`/`rooms`
    // yang ditinggalkan uji TERAKHIR berkas ini akan memblokir DELETE itu
    // lewat `*_created_by_fkey` bila tidak dibersihkan di sini juga.
    afterAll(async () => {
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
    });

    it("katalog endpoint: POST /buildings, /areas, /rooms dan PUT /rooms/:id berpermission location.manage", () => {
        const rute = registry
            .all()
            .filter((r) => ["/buildings", "/areas", "/rooms", "/rooms/:id"].includes(r.path));
        expect(rute.map((r) => `${r.method} ${r.path}`)).toEqual(
            expect.arrayContaining(["POST /buildings", "POST /areas", "POST /rooms", "PUT /rooms/:id"]),
        );
        expect(registry.guarded().filter((r) => r.path.startsWith("/rooms") || r.path === "/buildings" || r.path === "/areas").every((r) => r.permission === "location.manage")).toBe(true);
    });

    it("createBuilding(): tersimpan, LOCATION_CREATED tercatat (FR-03.1 langkah 2, AL-01)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const kode = kodeUnik("GD");

        const building = await service.createBuilding(buatCtx(adminId), {
            nama: "Gedung A",
            kode,
            keterangan: "Gedung utama",
        });

        expect(building.status).toBe("AKTIF");
        expect(building.kode).toBe(kode);

        const log = await aksiTerakhir("buildings", building.id);
        expect(log).toMatchObject({ aksi: "LOCATION_CREATED", hasil: "SUKSES" });
    });

    it("createBuilding(): kode duplikat -> DUPLICATE_CODE (FR-03.1 A1, BR-014)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const kode = kodeUnik("GD");
        await service.createBuilding(ctx, { nama: "Gedung A", kode, keterangan: null });

        await expect(
            service.createBuilding(ctx, { nama: "Gedung B", kode, keterangan: null }),
        ).rejects.toMatchObject({ kode: "DUPLICATE_CODE", detail: { field: "kode" } });
    });

    it("createArea(): tersimpan di bawah gedung, LOCATION_CREATED tercatat (FR-03.1 langkah 3, BR-013)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const building = await service.createBuilding(ctx, {
            nama: "Gedung A",
            kode: kodeUnik("GD"),
            keterangan: null,
        });

        const area = await service.createArea(ctx, {
            buildingId: Number(building.id),
            nama: "Lantai 1",
            kode: kodeUnik("AR"),
            lantai: 1,
        });

        expect(area.building_id).toBe(building.id);
        const log = await aksiTerakhir("areas", area.id);
        expect(log).toMatchObject({ aksi: "LOCATION_CREATED", hasil: "SUKSES" });
    });

    it("createArea(): building_id tidak ada -> VALIDATION_ERROR", async () => {
        const adminId = await seedAdmin();
        const service = buatService();

        await expect(
            service.createArea(buatCtx(adminId), {
                buildingId: 999_999_999,
                nama: "Lantai 1",
                kode: kodeUnik("AR"),
                lantai: null,
            }),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "building_id" } });
    });

    it("createArea(): kode duplikat -> DUPLICATE_CODE (BR-014)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const building = await service.createBuilding(ctx, {
            nama: "Gedung A",
            kode: kodeUnik("GD"),
            keterangan: null,
        });
        const kode = kodeUnik("AR");
        await service.createArea(ctx, { buildingId: Number(building.id), nama: "L1", kode, lantai: null });

        await expect(
            service.createArea(ctx, { buildingId: Number(building.id), nama: "L2", kode, lantai: null }),
        ).rejects.toMatchObject({ kode: "DUPLICATE_CODE" });
    });

    it("createRoom(): tersimpan dengan bawaan dapat_direservasi/boleh_direservasi_siswa=false, LOCATION_CREATED tercatat (FR-03.1 langkah 4, BR-016)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const building = await service.createBuilding(ctx, {
            nama: "Gedung A",
            kode: kodeUnik("GD"),
            keterangan: null,
        });
        const area = await service.createArea(ctx, {
            buildingId: Number(building.id),
            nama: "L1",
            kode: kodeUnik("AR"),
            lantai: 1,
        });

        const room = await service.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "Lab Komputer",
            kode: kodeUnik("RM"),
            jenis: "LABORATORIUM",
            kapasitas: 30,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });

        expect(room.jenis).toBe("LABORATORIUM");
        expect(room.dapat_direservasi).toBe(false);
        expect(room.boleh_direservasi_siswa).toBe(false);
        expect(room.status).toBe("AKTIF");
        const log = await aksiTerakhir("rooms", room.id);
        expect(log).toMatchObject({ aksi: "LOCATION_CREATED", hasil: "SUKSES" });
    });

    it("createRoom(): area_id tidak ada -> VALIDATION_ERROR", async () => {
        const adminId = await seedAdmin();
        const service = buatService();

        await expect(
            service.createRoom(buatCtx(adminId), {
                areaId: 999_999_999,
                nama: "Ruang X",
                kode: kodeUnik("RM"),
                jenis: "KELAS",
                kapasitas: null,
                penanggungJawabId: null,
                dapatDireservasi: false,
                bolehDireservasiSiswa: false,
            }),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "area_id" } });
    });

    it("createRoom(): kode duplikat -> DUPLICATE_CODE (BR-014)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
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
        const kode = kodeUnik("RM");
        await service.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "Kelas A",
            kode,
            jenis: "KELAS",
            kapasitas: null,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });

        await expect(
            service.createRoom(ctx, {
                areaId: Number(area.id),
                nama: "Kelas B",
                kode,
                jenis: "KELAS",
                kapasitas: null,
                penanggungJawabId: null,
                dapatDireservasi: false,
                bolehDireservasiSiswa: false,
            }),
        ).rejects.toMatchObject({ kode: "DUPLICATE_CODE" });
    });

    it("updateRoom(): mengganti field, LOCATION_UPDATED dengan nilai sebelum/sesudah (AL-01)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
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
        const room = await service.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "Sebelum",
            kode: kodeUnik("RM"),
            jenis: "KELAS",
            kapasitas: null,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });

        const after = await service.updateRoom(ctx, Number(room.id), {
            areaId: Number(area.id),
            nama: "Sesudah",
            kode: room.kode,
            jenis: "AULA",
            kapasitas: 100,
            penanggungJawabId: null,
            dapatDireservasi: true,
            bolehDireservasiSiswa: true,
        });

        expect(after.nama).toBe("Sesudah");
        expect(after.jenis).toBe("AULA");
        expect(after.dapat_direservasi).toBe(true);
        expect(after.boleh_direservasi_siswa).toBe(true);

        const log = await aksiTerakhir("rooms", room.id);
        expect(log).toMatchObject({ aksi: "LOCATION_UPDATED", hasil: "SUKSES" });
    });

    it("updateRoom(): tidak menganggap kode milik sendiri sebagai duplikat", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
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
        const room = await service.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "X",
            kode: kodeUnik("RM"),
            jenis: "KELAS",
            kapasitas: null,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });

        await expect(
            service.updateRoom(ctx, Number(room.id), {
                areaId: Number(area.id),
                nama: "X diubah",
                kode: room.kode,
                jenis: "KELAS",
                kapasitas: null,
                penanggungJawabId: null,
                dapatDireservasi: false,
                bolehDireservasiSiswa: false,
            }),
        ).resolves.toMatchObject({ nama: "X diubah" });
    });

    it("updateRoom(): room tidak ada -> NotFoundError", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
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

        await expect(
            service.updateRoom(ctx, 999_999_999, {
                areaId: Number(area.id),
                nama: "X",
                kode: kodeUnik("RM"),
                jenis: "KELAS",
                kapasitas: null,
                penanggungJawabId: null,
                dapatDireservasi: false,
                bolehDireservasiSiswa: false,
            }),
        ).rejects.toThrow(/tidak ditemukan/);
    });

    it("updateRoom(): area_id baru tidak ada -> VALIDATION_ERROR", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
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
        const room = await service.createRoom(ctx, {
            areaId: Number(area.id),
            nama: "X",
            kode: kodeUnik("RM"),
            jenis: "KELAS",
            kapasitas: null,
            penanggungJawabId: null,
            dapatDireservasi: false,
            bolehDireservasiSiswa: false,
        });

        await expect(
            service.updateRoom(ctx, Number(room.id), {
                areaId: 999_999_999,
                nama: "X",
                kode: room.kode,
                jenis: "KELAS",
                kapasitas: null,
                penanggungJawabId: null,
                dapatDireservasi: false,
                bolehDireservasiSiswa: false,
            }),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "area_id" } });
    });
});
