// Acceptance PR-02-12 — "Pencarian & penyaringan aset + paginasi" (FR-04.2,
// SDD-API-05, SDD-PERF-01) terhadap PostgreSQL NYATA. BR-073 (field finansial)
// dan scope `restricted` (Siswa/OSIS, SDD-AUTH-03 §4.2) hanya dapat dibuktikan
// dengan AuthContext berbeda-beda, bukan tiruan.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import { AssetService } from "../../src/modules/m04-assets/services/asset.service.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
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

async function seedRoom(): Promise<string> {
    const [gedung] = await kueri<{ id: string }>(
        `INSERT INTO buildings (nama, kode) VALUES ('Gedung Uji Katalog', '${kodeUnik("GDG")}') RETURNING id::text`,
    );
    if (gedung === undefined) throw new Error("Gagal menyisipkan gedung uji");
    const [area] = await kueri<{ id: string }>(
        `INSERT INTO areas (building_id, nama, kode) VALUES (${gedung.id}, 'Area Uji Katalog', '${kodeUnik("ARA")}') RETURNING id::text`,
    );
    if (area === undefined) throw new Error("Gagal menyisipkan area uji");
    const [ruang] = await kueri<{ id: string }>(
        `INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${area.id}, 'Ruang Uji Katalog', '${kodeUnik("RG")}', 'GUDANG') RETURNING id::text`,
    );
    if (ruang === undefined) throw new Error("Gagal menyisipkan ruangan uji");
    return ruang.id;
}

async function seedKategori(): Promise<string> {
    const [baris] = await kueri<{ id: string }>(
        `INSERT INTO asset_categories (nama, kode) VALUES ('Kategori Uji Katalog', '${kodeUnik("KAT")}') RETURNING id::text`,
    );
    if (baris === undefined) throw new Error("Gagal menyisipkan kategori uji");
    return baris.id;
}

interface SeedAsetOpts {
    readonly kategoriId: string;
    readonly roomId: string;
    readonly kodeBarang?: string;
    readonly nama?: string;
    readonly merek?: string | null;
    readonly nomorSeri?: string | null;
    readonly tahunPerolehan?: number;
    readonly kondisi?: "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" | "HILANG";
    readonly status?: "TERSEDIA" | "DIRESERVASI" | "DIPINJAM" | "DALAM_PERBAIKAN" | "TIDAK_TERSEDIA";
    readonly dapatDipinjam?: boolean;
    readonly bolehDipinjamSiswa?: boolean;
    readonly nilaiPerolehan?: number | null;
    readonly dihapuskan?: boolean;
}

function nullable(v: string | null | undefined): string {
    return v === undefined || v === null ? "NULL" : `'${v}'`;
}

async function seedAset(opts: SeedAsetOpts): Promise<string> {
    const [a] = await kueri<{ id: string }>(`
        INSERT INTO assets (
            kode_barang, nama, category_id, merek, nomor_seri, tahun_perolehan, sumber_perolehan,
            room_id, kondisi, status, dapat_dipinjam, boleh_dipinjam_siswa, nilai_perolehan, dihapuskan
        ) VALUES (
            '${opts.kodeBarang ?? kodeUnik("BRG")}', '${opts.nama ?? "Aset Uji Katalog"}', ${opts.kategoriId},
            ${nullable(opts.merek)}, ${nullable(opts.nomorSeri)}, ${opts.tahunPerolehan ?? 2024}, 'PEMBELIAN',
            ${opts.roomId}, '${opts.kondisi ?? "BAIK"}', '${opts.status ?? "TERSEDIA"}',
            ${opts.dapatDipinjam ?? true}, ${opts.bolehDipinjamSiswa ?? false},
            ${opts.nilaiPerolehan ?? "NULL"}, ${opts.dihapuskan ?? false}
        ) RETURNING id::text
    `);
    if (a === undefined) throw new Error("Gagal menyisipkan aset uji");
    return a.id;
}

function buatCtx(roleCode: string, scopes: ReadonlyMap<string, Scope>): AuthContext {
    return createAuthContext({ userId: 1, roleCode, scopes });
}

function buatService(): AssetService {
    const clock = new FixedClock(new Date("2026-09-26T00:00:00Z"));
    return new AssetService(getDb(), new AuditLogger({ clock }), clock);
}

describe.skipIf(!ADA_DB)("PR-02-12 — katalog aset: pencarian, filter, paginasi (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await kueri("DELETE FROM asset_condition_history");
        await kueri("DELETE FROM assets");
        await kueri("DELETE FROM asset_categories");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
    });

    afterAll(async () => {
        await kueri("DELETE FROM asset_condition_history");
        await kueri("DELETE FROM assets");
        await kueri("DELETE FROM asset_categories");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
    });

    it("katalog endpoint: GET /assets berpermission asset.view (m04-assets.md §7)", () => {
        const route = registry.all().find((r) => r.method === "GET" && r.path === "/assets");
        expect(route?.permission).toBe("asset.view");
    });

    describe("GET /assets — pencarian & filter (FR-04.2 langkah 3-4)", () => {
        it("q mencari kode aset, nama, merek, dan nomor seri tanpa mempedulikan huruf besar/kecil", async () => {
            const kategoriId = await seedKategori();
            const roomId = await seedRoom();
            const target = await seedAset({ kategoriId, roomId, nama: "Proyektor Epson", merek: "Epson" });
            await seedAset({ kategoriId, roomId, nama: "Kursi Kelas", merek: "Chitose" });
            const ctx = buatCtx("ADMIN", new Map([["asset.view", "all"]]));

            const hasil = await buatService().list(ctx, {
                page: 1,
                perPage: 25,
                sort: "-created_at",
                q: "epson",
            });

            expect(hasil.rows).toHaveLength(1);
            expect((hasil.rows[0] as { id: string }).id).toBe(target);
        });

        it("filter kategori, lokasi, kondisi, status, tahun_perolehan, dan dapat_dipinjam dapat digabung", async () => {
            const kategoriA = await seedKategori();
            const kategoriB = await seedKategori();
            const roomId = await seedRoom();
            const cocok = await seedAset({
                kategoriId: kategoriA,
                roomId,
                kondisi: "RUSAK_RINGAN",
                status: "DIPINJAM",
                tahunPerolehan: 2020,
                dapatDipinjam: false,
            });
            await seedAset({ kategoriId: kategoriB, roomId, kondisi: "RUSAK_RINGAN", status: "DIPINJAM", tahunPerolehan: 2020 });
            await seedAset({ kategoriId: kategoriA, roomId, kondisi: "BAIK", status: "DIPINJAM", tahunPerolehan: 2020 });
            const ctx = buatCtx("ADMIN", new Map([["asset.view", "all"]]));

            const hasil = await buatService().list(ctx, {
                page: 1,
                perPage: 25,
                sort: "-created_at",
                categoryId: Number(kategoriA),
                kondisi: "RUSAK_RINGAN",
                status: "DIPINJAM",
                tahunPerolehan: 2020,
                dapatDipinjam: false,
            });

            expect(hasil.rows).toHaveLength(1);
            expect((hasil.rows[0] as { id: string }).id).toBe(cocok);
        });

        it("aset dihapuskan tidak muncul pada katalog biasa (BR-008)", async () => {
            const kategoriId = await seedKategori();
            const roomId = await seedRoom();
            await seedAset({ kategoriId, roomId, dihapuskan: true });
            const tampil = await seedAset({ kategoriId, roomId });
            const ctx = buatCtx("ADMIN", new Map([["asset.view", "all"]]));

            const hasil = await buatService().list(ctx, { page: 1, perPage: 25, sort: "-created_at" });

            expect(hasil.rows).toHaveLength(1);
            expect((hasil.rows[0] as { id: string }).id).toBe(tampil);
        });

        it("tidak ada hasil -> data kosong, total 0, total_pages 1 (FR-04.2 A2)", async () => {
            const ctx = buatCtx("ADMIN", new Map([["asset.view", "all"]]));
            const hasil = await buatService().list(ctx, { page: 1, perPage: 25, sort: "-created_at", q: "tidak-ada-begini" });
            expect(hasil.rows).toEqual([]);
            expect(hasil.total).toBe(0);
            expect(hasil.totalPages).toBe(1);
        });
    });

    describe("GET /assets — paginasi & urutan (SDD-API-05 §4.5)", () => {
        it("total dihitung dari SELURUH baris cocok, bukan hanya satu halaman (COUNT(*) OVER())", async () => {
            const kategoriId = await seedKategori();
            const roomId = await seedRoom();
            for (let i = 0; i < 5; i += 1) {
                await seedAset({ kategoriId, roomId });
            }
            const ctx = buatCtx("ADMIN", new Map([["asset.view", "all"]]));

            const halaman1 = await buatService().list(ctx, { page: 1, perPage: 2, sort: "-created_at" });
            expect(halaman1.rows).toHaveLength(2);
            expect(halaman1.total).toBe(5);
            expect(halaman1.totalPages).toBe(3);

            const halaman3 = await buatService().list(ctx, { page: 3, perPage: 2, sort: "-created_at" });
            expect(halaman3.rows).toHaveLength(1);
            expect(halaman3.total).toBe(5);
        });

        it("sort=nama mengurutkan menaik menurut nama", async () => {
            const kategoriId = await seedKategori();
            const roomId = await seedRoom();
            await seedAset({ kategoriId, roomId, nama: "Zebra" });
            await seedAset({ kategoriId, roomId, nama: "Amplop" });
            const ctx = buatCtx("ADMIN", new Map([["asset.view", "all"]]));

            const hasil = await buatService().list(ctx, { page: 1, perPage: 25, sort: "nama" });

            expect(hasil.rows.map((r) => (r as { nama: string }).nama)).toEqual(["Amplop", "Zebra"]);
        });
    });

    describe("GET /assets — BR-073: field finansial hanya bagi asset.view_financial (SDD-AUTH-06)", () => {
        it("Administrator (asset.view_financial) menerima nilai_perolehan & sumber_perolehan", async () => {
            const kategoriId = await seedKategori();
            const roomId = await seedRoom();
            await seedAset({ kategoriId, roomId, nilaiPerolehan: 1_500_000 });
            const ctx = buatCtx(
                "ADMIN",
                new Map([
                    ["asset.view", "all"],
                    ["asset.view_financial", "all"],
                ]),
            );

            const hasil = await buatService().list(ctx, { page: 1, perPage: 25, sort: "-created_at" });

            const baris = hasil.rows[0] as Record<string, unknown>;
            expect(baris["nilai_perolehan"]).toBe("1500000.00");
            expect(baris["sumber_perolehan"]).toBe("PEMBELIAN");
        });

        it("Guru (TANPA asset.view_financial) TIDAK menerima nilai_perolehan maupun sumber_perolehan sama sekali", async () => {
            const kategoriId = await seedKategori();
            const roomId = await seedRoom();
            await seedAset({ kategoriId, roomId, nilaiPerolehan: 1_500_000 });
            const ctx = buatCtx("GURU", new Map([["asset.view", "all"]]));

            const hasil = await buatService().list(ctx, { page: 1, perPage: 25, sort: "-created_at" });

            const baris = hasil.rows[0] as Record<string, unknown>;
            expect("nilai_perolehan" in baris).toBe(false);
            expect("sumber_perolehan" in baris).toBe(false);
        });
    });

    describe("GET /assets — scope restricted: katalog Siswa/OSIS (BR-073, SDD-AUTH-03 §4.2)", () => {
        it("scope restricted hanya melihat aset boleh_dipinjam_siswa=true", async () => {
            const kategoriId = await seedKategori();
            const roomId = await seedRoom();
            const publikSiswa = await seedAset({ kategoriId, roomId, bolehDipinjamSiswa: true });
            await seedAset({ kategoriId, roomId, bolehDipinjamSiswa: false });
            const ctx = buatCtx("SISWA", new Map([["asset.view", "restricted"]]));

            const hasil = await buatService().list(ctx, { page: 1, perPage: 25, sort: "-created_at" });

            expect(hasil.rows).toHaveLength(1);
            expect((hasil.rows[0] as { id: string }).id).toBe(publikSiswa);
        });

        it("scope all (mis. Petugas) melihat aset boleh_dipinjam_siswa=false juga", async () => {
            const kategoriId = await seedKategori();
            const roomId = await seedRoom();
            await seedAset({ kategoriId, roomId, bolehDipinjamSiswa: true });
            await seedAset({ kategoriId, roomId, bolehDipinjamSiswa: false });
            const ctx = buatCtx("PETUGAS", new Map([["asset.view", "all"]]));

            const hasil = await buatService().list(ctx, { page: 1, perPage: 25, sort: "-created_at" });

            expect(hasil.rows).toHaveLength(2);
        });
    });

    describe("GET /rooms/{id}/assets — kini bersambung ke data sungguhan (FR-03.2, wired PR-02-12)", () => {
        it("daftar terpaginasi berisi aset ruangan itu saja, ringkasan mencakup SELURUH isi ruangan tanpa terpotong filter", async () => {
            const kategoriId = await seedKategori();
            const roomA = await seedRoom();
            const roomB = await seedRoom();
            await seedAset({ kategoriId, roomId: roomA, kondisi: "BAIK", status: "TERSEDIA" });
            await seedAset({ kategoriId, roomId: roomA, kondisi: "RUSAK_RINGAN", status: "DIPINJAM" });
            await seedAset({ kategoriId, roomId: roomA, kondisi: "RUSAK_BERAT", status: "DALAM_PERBAIKAN" });
            await seedAset({ kategoriId, roomId: roomB, kondisi: "BAIK", status: "TERSEDIA" });
            const ctx = buatCtx("ADMIN", new Map([["asset.view", "all"]]));

            const hasil = await buatService().listByRoom(ctx, Number(roomA), { page: 1, perPage: 25 });

            expect(hasil.assets).toHaveLength(3);
            expect(hasil.total).toBe(3);
            expect(hasil.ringkasan).toEqual({
                total: 3,
                perKondisi: { BAIK: 1, RUSAK_RINGAN: 1, RUSAK_BERAT: 1, HILANG: 0 },
                jumlahDipinjam: 1,
                jumlahDalamPerbaikan: 1,
            });

            // Filter mempersempit DAFTAR, tetapi ringkasan tetap menghitung ketiganya.
            const terfilter = await buatService().listByRoom(ctx, Number(roomA), {
                page: 1,
                perPage: 25,
                kondisi: "BAIK",
            });
            expect(terfilter.assets).toHaveLength(1);
            expect(terfilter.ringkasan.total).toBe(3);
        });

        it("ruangan tidak ada -> NotFoundError (tetap berlaku, PR-01-07)", async () => {
            const ctx = buatCtx("ADMIN", new Map([["asset.view", "all"]]));
            await expect(
                buatService().listByRoom(ctx, 999_999_999, { page: 1, perPage: 25 }),
            ).rejects.toThrow(/tidak ditemukan/);
        });
    });
});
