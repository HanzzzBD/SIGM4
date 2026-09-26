// Acceptance PR-02-14 — "Mutasi lokasi aset + riwayat" (FR-04.4, BR-009,
// BR-010) terhadap PostgreSQL NYATA. Atomisitas mutasi massal (satu aset gagal
// → tak satu pun berpindah) hanya dapat dibuktikan dengan transaksi sungguhan.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import { AssetService } from "../../src/modules/m04-assets/services/asset.service.js";
import type { MutasiLokasiInput } from "../../src/modules/m04-assets/services/asset.service.js";
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
    return `${awalan}-${urut}`;
}

/** `asset_movements.dilakukan_oleh` dan `assets.penanggung_jawab_id` ber-FK ke `users(id)`. */
async function seedPengguna(): Promise<number> {
    urut += 1;
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Petugas Uji Mutasi ${urut}', 'mutasi-uji${urut}@sekolah.sch.id', 'x', 'NIPMUTASI${String(urut).padStart(6, "0")}',
                (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false)
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
    return Number(baris.id);
}

async function seedRuangan(status: "AKTIF" | "NONAKTIF" = "AKTIF"): Promise<string> {
    const [gedung] = await kueri<{ id: string }>(
        `INSERT INTO buildings (nama, kode) VALUES ('Gedung Uji Mutasi', '${kodeUnik("GDG")}') RETURNING id::text`,
    );
    if (gedung === undefined) throw new Error("Gagal menyisipkan gedung uji");
    const [area] = await kueri<{ id: string }>(
        `INSERT INTO areas (building_id, nama, kode) VALUES (${gedung.id}, 'Area Uji Mutasi', '${kodeUnik("ARA")}') RETURNING id::text`,
    );
    if (area === undefined) throw new Error("Gagal menyisipkan area uji");
    const [ruang] = await kueri<{ id: string }>(`
        INSERT INTO rooms (area_id, nama, kode, jenis, status)
        VALUES (${area.id}, 'Ruang Uji Mutasi', '${kodeUnik("RG")}', 'GUDANG', '${status}')
        RETURNING id::text
    `);
    if (ruang === undefined) throw new Error("Gagal menyisipkan ruangan uji");
    return ruang.id;
}

async function seedKategori(): Promise<string> {
    const [baris] = await kueri<{ id: string }>(
        `INSERT INTO asset_categories (nama, kode) VALUES ('Kategori Uji Mutasi', '${kodeUnik("KAT")}') RETURNING id::text`,
    );
    if (baris === undefined) throw new Error("Gagal menyisipkan kategori uji");
    return baris.id;
}

async function seedAset(kategoriId: string, roomId: string, status = "TERSEDIA"): Promise<string> {
    const [a] = await kueri<{ id: string }>(`
        INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, status)
        VALUES ('${kodeUnik("BRG")}', 'Aset Uji Mutasi', ${kategoriId}, 2024, 'PEMBELIAN', ${roomId}, 'BAIK', '${status}')
        RETURNING id::text
    `);
    if (a === undefined) throw new Error("Gagal menyisipkan aset uji");
    return a.id;
}

function buatCtx(userId: number): AuthContext {
    return createAuthContext({ userId, roleCode: "PETUGAS", scopes: new Map([["asset.update", "all"]]) });
}

function buatService(): AssetService {
    const clock = new FixedClock(new Date("2026-09-26T05:00:00Z"));
    return new AssetService(getDb(), new AuditLogger({ clock }), clock);
}

function input(assetIds: readonly string[], roomTujuanId: string, override: Partial<MutasiLokasiInput> = {}): MutasiLokasiInput {
    return {
        assetIds: assetIds.map(Number),
        roomTujuanId: Number(roomTujuanId),
        tanggal: "2026-09-26",
        alasan: "Penataan ulang laboratorium",
        penanggungJawabBaruId: null,
        ...override,
    };
}

async function roomIdAset(id: string): Promise<string | undefined> {
    return (await kueri<{ room_id: string }>(`SELECT room_id::text FROM assets WHERE id = ${id}`))[0]?.room_id;
}

async function jumlahMutasi(): Promise<number> {
    return Number((await kueri<{ n: string }>("SELECT count(*)::text AS n FROM asset_movements"))[0]?.n);
}

async function jumlahLogMoved(): Promise<number> {
    return Number(
        (await kueri<{ n: string }>("SELECT count(*)::text AS n FROM activity_logs WHERE aksi = 'ASSET_MOVED' AND hasil = 'SUKSES'"))[0]?.n,
    );
}

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM asset_movements");
    await kueri("DELETE FROM asset_condition_history");
    await kueri("DELETE FROM activity_logs WHERE entitas = 'assets'");
    await kueri("DELETE FROM assets");
    await kueri("DELETE FROM asset_code_counters");
    await kueri("DELETE FROM asset_categories");
    await kueri("DELETE FROM rooms");
    await kueri("DELETE FROM areas");
    await kueri("DELETE FROM buildings");
}

describe.skipIf(!ADA_DB)("PR-02-14 — mutasi lokasi aset + riwayat (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await bersihkan();
        await kueri("DELETE FROM users");
    });

    afterAll(bersihkan);

    it("katalog endpoint: POST /assets/move berpermission asset.update, sukses 200", () => {
        const route = registry.all().find((r) => r.method === "POST" && r.path === "/assets/move");
        expect(route?.permission).toBe("asset.update");
        expect(route?.successStatus).toBe(200);
    });

    it("mutasi massal: aset dari DUA ruangan asal berbeda pindah ke satu tujuan; riwayat memuat asal/tujuan/tanggal/pelaku/alasan (AC)", async () => {
        const kategoriId = await seedKategori();
        const asalA = await seedRuangan();
        const asalB = await seedRuangan();
        const tujuan = await seedRuangan();
        const a1 = await seedAset(kategoriId, asalA);
        const a2 = await seedAset(kategoriId, asalB, "DALAM_PERBAIKAN");
        const petugas = await seedPengguna();

        const hasil = await buatService().mutasiLokasi(buatCtx(petugas), input([a1, a2], tujuan));

        expect(hasil.map((r) => r.room_id)).toEqual([tujuan, tujuan]);
        const riwayat = await kueri<Record<string, string>>(`
            SELECT asset_id::text, room_asal_id::text, room_tujuan_id::text, tanggal::text, alasan, dilakukan_oleh::text
              FROM asset_movements ORDER BY id`);
        expect(riwayat).toEqual([
            { asset_id: a1, room_asal_id: asalA, room_tujuan_id: tujuan, tanggal: "2026-09-26", alasan: "Penataan ulang laboratorium", dilakukan_oleh: String(petugas) },
            { asset_id: a2, room_asal_id: asalB, room_tujuan_id: tujuan, tanggal: "2026-09-26", alasan: "Penataan ulang laboratorium", dilakukan_oleh: String(petugas) },
        ]);
        expect(await jumlahLogMoved()).toBe(2);
    });

    it("penanggung jawab baru diisi -> assets.penanggung_jawab_id berganti; kosong -> yang lama dipertahankan", async () => {
        const kategoriId = await seedKategori();
        const asal = await seedRuangan();
        const tujuan = await seedRuangan();
        const lama = await seedPengguna();
        const baru = await seedPengguna();
        const a1 = await seedAset(kategoriId, asal);
        const a2 = await seedAset(kategoriId, asal);
        await kueri(`UPDATE assets SET penanggung_jawab_id = ${lama} WHERE id IN (${a1}, ${a2})`);
        const service = buatService();

        const [dgnBaru] = await service.mutasiLokasi(buatCtx(lama), input([a1], tujuan, { penanggungJawabBaruId: baru }));
        const [tanpaBaru] = await service.mutasiLokasi(buatCtx(lama), input([a2], tujuan));

        expect(dgnBaru?.penanggung_jawab_id).toBe(String(baru));
        expect(tanpaBaru?.penanggung_jawab_id).toBe(String(lama));
    });

    it("ruangan tujuan NONAKTIF -> VALIDATION_ERROR room_tujuan_id (BR-009, acceptance PR-02-14); tak ada yang berpindah", async () => {
        const kategoriId = await seedKategori();
        const asal = await seedRuangan();
        const nonaktif = await seedRuangan("NONAKTIF");
        const a1 = await seedAset(kategoriId, asal);
        const petugas = await seedPengguna();

        await expect(buatService().mutasiLokasi(buatCtx(petugas), input([a1], nonaktif))).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            detail: { field: "room_tujuan_id" },
        });
        expect(await roomIdAset(a1)).toBe(asal);
        expect(await jumlahMutasi()).toBe(0);
    });

    it.each(["DIPINJAM", "DIRESERVASI", "TIDAK_TERSEDIA"])(
        "aset berstatus %s -> VALIDATION_ERROR asset_ids (Preconditions, BR-010, A1)",
        async (status) => {
            const kategoriId = await seedKategori();
            const asal = await seedRuangan();
            const tujuan = await seedRuangan();
            const a1 = await seedAset(kategoriId, asal, status);
            const petugas = await seedPengguna();

            await expect(buatService().mutasiLokasi(buatCtx(petugas), input([a1], tujuan))).rejects.toMatchObject({
                kode: "VALIDATION_ERROR",
                detail: { field: "asset_ids" },
            });
            expect(await roomIdAset(a1)).toBe(asal);
        },
    );

    it("ATOMIK (AC): satu aset tak memenuhi syarat di tengah batch -> aset sebelumnya TIDAK ikut berpindah, tanpa riwayat/log", async () => {
        const kategoriId = await seedKategori();
        const asal = await seedRuangan();
        const tujuan = await seedRuangan();
        const ok1 = await seedAset(kategoriId, asal);
        const dipinjam = await seedAset(kategoriId, asal, "DIPINJAM");
        const ok2 = await seedAset(kategoriId, asal);
        const petugas = await seedPengguna();

        await expect(
            buatService().mutasiLokasi(buatCtx(petugas), input([ok1, dipinjam, ok2], tujuan)),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });

        expect(await roomIdAset(ok1)).toBe(asal);
        expect(await roomIdAset(ok2)).toBe(asal);
        expect(await jumlahMutasi()).toBe(0);
        expect(await jumlahLogMoved()).toBe(0);
    });

    it("aset tidak ada -> VALIDATION_ERROR asset_ids, tak ada yang berpindah", async () => {
        const kategoriId = await seedKategori();
        const asal = await seedRuangan();
        const tujuan = await seedRuangan();
        const a1 = await seedAset(kategoriId, asal);
        const petugas = await seedPengguna();

        await expect(
            buatService().mutasiLokasi(buatCtx(petugas), input([a1, "999999999"], tujuan)),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "asset_ids" } });
        expect(await roomIdAset(a1)).toBe(asal);
    });

    it("id aset ganda dalam satu permintaan dipindah SEKALI (satu riwayat, bukan riwayat asal=tujuan palsu)", async () => {
        const kategoriId = await seedKategori();
        const asal = await seedRuangan();
        const tujuan = await seedRuangan();
        const a1 = await seedAset(kategoriId, asal);
        const petugas = await seedPengguna();

        const hasil = await buatService().mutasiLokasi(buatCtx(petugas), input([a1, a1], tujuan));

        expect(hasil).toHaveLength(1);
        expect(await jumlahMutasi()).toBe(1);
    });

    it("50 aset dalam satu operasi berhasil (AC mutasi massal)", async () => {
        const kategoriId = await seedKategori();
        const asal = await seedRuangan();
        const tujuan = await seedRuangan();
        const petugas = await seedPengguna();
        const ids: string[] = [];
        for (let i = 0; i < 50; i += 1) ids.push(await seedAset(kategoriId, asal));

        const hasil = await buatService().mutasiLokasi(buatCtx(petugas), input(ids, tujuan));

        expect(hasil).toHaveLength(50);
        expect(await jumlahMutasi()).toBe(50);
    });
});
