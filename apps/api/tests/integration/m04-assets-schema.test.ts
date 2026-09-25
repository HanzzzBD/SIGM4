// Acceptance PR-02-10 — "Skema assets, asset_categories, asset_condition_history"
// (FR-04.1, SDD-DB-04) terhadap PostgreSQL NYATA. Constraint UNIQUE, CHECK, dan
// FK tidak dapat dibuktikan lewat tiruan. PR ini murni skema — belum ada
// service/route (keduanya milik PR-02-11/PR-02-13) — sehingga uji di sini
// menulis SQL mentah langsung, pola yang sama dengan `migrations.test.ts`.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

let urut = 0;
function emailUnik(): string {
    urut += 1;
    return `aset-uji${urut}@sekolah.sch.id`;
}
function nipUnik(): string {
    urut += 1;
    return `NIPASETUJI${String(urut).padStart(6, "0")}`;
}
function kodeUnik(awalan: string): string {
    urut += 1;
    return `${awalan}-${urut}`;
}

async function seedAdmin(): Promise<string> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Uji Aset', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false)
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan admin uji");
    return baris.id;
}

/** Hierarki lokasi minimal — assets.room_id wajib merujuk baris nyata (BR-009). */
async function seedRoom(): Promise<string> {
    const kode = kodeUnik("GDG");
    const [gedung] = await kueri<{ id: string }>(
        `INSERT INTO buildings (nama, kode) VALUES ('Gedung Uji Aset', '${kode}') RETURNING id::text`,
    );
    if (gedung === undefined) throw new Error("Gagal menyisipkan gedung uji");
    const [area] = await kueri<{ id: string }>(
        `INSERT INTO areas (building_id, nama, kode) VALUES (${gedung.id}, 'Area Uji Aset', '${kodeUnik("ARA")}') RETURNING id::text`,
    );
    if (area === undefined) throw new Error("Gagal menyisipkan area uji");
    const [ruang] = await kueri<{ id: string }>(
        `INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${area.id}, 'Ruang Uji Aset', '${kodeUnik("RG")}', 'GUDANG') RETURNING id::text`,
    );
    if (ruang === undefined) throw new Error("Gagal menyisipkan ruangan uji");
    return ruang.id;
}

async function seedKategori(): Promise<string> {
    const [baris] = await kueri<{ id: string }>(
        `INSERT INTO asset_categories (nama, kode) VALUES ('Kategori Uji', '${kodeUnik("KAT")}') RETURNING id::text`,
    );
    if (baris === undefined) throw new Error("Gagal menyisipkan kategori uji");
    return baris.id;
}

/** Baris `assets` minimal yang sah — dipakai sebagai basis tiap uji constraint. */
function sqlAsetDasar(opts: {
    kategoriId: string;
    roomId: string;
    kodeBarang: string;
    nomorSeri?: string | null;
    dapatDipinjam?: boolean;
    bolehDipinjamSiswa?: boolean;
    procurementId?: number;
}): string {
    const nomorSeri = opts.nomorSeri === undefined ? "NULL" : opts.nomorSeri === null ? "NULL" : `'${opts.nomorSeri}'`;
    return `
        INSERT INTO assets (
            kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan,
            room_id, kondisi, nomor_seri, dapat_dipinjam, boleh_dipinjam_siswa, procurement_id
        ) VALUES (
            '${opts.kodeBarang}', 'Aset Uji', ${opts.kategoriId}, 2024, 'PEMBELIAN',
            ${opts.roomId}, 'BAIK', ${nomorSeri},
            ${opts.dapatDipinjam ?? true}, ${opts.bolehDipinjamSiswa ?? false},
            ${opts.procurementId ?? "NULL"}
        ) RETURNING id::text, uuid::text, status, dihapuskan, tanggal_penghapusan
    `;
}

describe.skipIf(!ADA_DB)("PR-02-10 — skema assets/asset_categories/asset_condition_history", () => {
    let kategoriId: string;
    let roomId: string;
    let adminId: string;

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
        await kueri("DELETE FROM users");
        kategoriId = await seedKategori();
        roomId = await seedRoom();
        adminId = await seedAdmin();
    });

    afterAll(async () => {
        await kueri("DELETE FROM asset_condition_history");
        await kueri("DELETE FROM assets");
        await kueri("DELETE FROM asset_categories");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
    });

    describe("asset_categories", () => {
        it("kode duplikat ditolak (FR-04.5 A1)", async () => {
            const kode = kodeUnik("DUP");
            await kueri(`INSERT INTO asset_categories (nama, kode) VALUES ('A', '${kode}')`);
            await expect(
                kueri(`INSERT INTO asset_categories (nama, kode) VALUES ('B', '${kode}')`),
            ).rejects.toMatchObject({ code: "23505" });
        });

        it("mendukung dua tingkat induk-anak (FR-04.5 AC)", async () => {
            const [induk] = await kueri<{ id: string }>(
                `INSERT INTO asset_categories (nama, kode) VALUES ('Induk', '${kodeUnik("IND")}') RETURNING id::text`,
            );
            const [anak] = await kueri<{ id: string; parent_id: string }>(`
                INSERT INTO asset_categories (nama, kode, parent_id)
                VALUES ('Anak', '${kodeUnik("ANK")}', ${induk?.id})
                RETURNING id::text, parent_id::text
            `);
            expect(anak?.parent_id).toBe(induk?.id);
        });
    });

    describe("assets", () => {
        it("kode_barang unik sistem-wide (BR-002)", async () => {
            const kode = kodeUnik("BRG");
            await kueri(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kode }));
            await expect(
                kueri(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kode })),
            ).rejects.toMatchObject({ code: "23505" });
        });

        it("nomor_seri unik HANYA bila diisi (BR-003) — dua NULL diizinkan", async () => {
            await kueri(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG"), nomorSeri: null }));
            await expect(
                kueri(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG"), nomorSeri: null })),
            ).resolves.toBeDefined();
        });

        it("nomor_seri unik HANYA bila diisi (BR-003) — nilai sama ditolak", async () => {
            const seri = kodeUnik("SN");
            await kueri(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG"), nomorSeri: seri }));
            await expect(
                kueri(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG"), nomorSeri: seri })),
            ).rejects.toMatchObject({ code: "23505" });
        });

        it("uuid terisi otomatis dan unik tanpa dinyatakan (FR-05.1)", async () => {
            const [a] = await kueri<{ uuid: string }>(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG") }));
            const [b] = await kueri<{ uuid: string }>(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG") }));
            expect(a?.uuid).toMatch(/^[0-9a-f-]{36}$/);
            expect(a?.uuid).not.toBe(b?.uuid);
        });

        it("status lahir TERSEDIA tanpa dinyatakan eksplisit (FR-04.1 langkah 5)", async () => {
            const [a] = await kueri<{ status: string }>(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG") }));
            expect(a?.status).toBe("TERSEDIA");
        });

        it("dihapuskan lahir false, tanggal_penghapusan NULL (SDD-DB-04)", async () => {
            const [a] = await kueri<{ dihapuskan: boolean; tanggal_penghapusan: string | null }>(
                sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG") }),
            );
            expect(a?.dihapuskan).toBe(false);
            expect(a?.tanggal_penghapusan).toBeNull();
        });

        it("boleh_dipinjam_siswa=true dengan dapat_dipinjam=false ditolak (conventions.md E.5.1)", async () => {
            await expect(
                kueri(
                    sqlAsetDasar({
                        kategoriId,
                        roomId,
                        kodeBarang: kodeUnik("BRG"),
                        dapatDipinjam: false,
                        bolehDipinjamSiswa: true,
                    }),
                ),
            ).rejects.toMatchObject({ code: "23514" });
        });

        it("category_id wajib merujuk kategori yang ada (FK)", async () => {
            await expect(
                kueri(sqlAsetDasar({ kategoriId: "999999999", roomId, kodeBarang: kodeUnik("BRG") })),
            ).rejects.toMatchObject({ code: "23503" });
        });

        it("room_id wajib merujuk ruangan yang ada (BR-009, FK)", async () => {
            await expect(
                kueri(sqlAsetDasar({ kategoriId, roomId: "999999999", kodeBarang: kodeUnik("BRG") })),
            ).rejects.toMatchObject({ code: "23503" });
        });

        it("procurement_id menerima nilai bebas TANPA FK aktif ke M-14 (BR-011)", async () => {
            await expect(
                kueri(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG"), procurementId: 999999999 })),
            ).resolves.toBeDefined();
        });
    });

    describe("asset_condition_history", () => {
        async function seedAset(): Promise<string> {
            const [a] = await kueri<{ id: string }>(sqlAsetDasar({ kategoriId, roomId, kodeBarang: kodeUnik("BRG") }));
            if (a === undefined) throw new Error("Gagal menyisipkan aset uji");
            return a.id;
        }

        it("alasan wajib terisi (BR-007)", async () => {
            const asetId = await seedAset();
            await expect(
                kueri(`
                    INSERT INTO asset_condition_history (asset_id, kondisi_lama, kondisi_baru, alasan, diubah_oleh, diubah_pada)
                    VALUES (${asetId}, 'BAIK', 'RUSAK_RINGAN', NULL, ${adminId}, now())
                `),
            ).rejects.toMatchObject({ code: "23502" });
        });

        it("asset_id wajib merujuk aset yang ada (FK)", async () => {
            await expect(
                kueri(`
                    INSERT INTO asset_condition_history (asset_id, kondisi_lama, kondisi_baru, alasan, diubah_oleh, diubah_pada)
                    VALUES (999999999, 'BAIK', 'RUSAK_RINGAN', 'jatuh', ${adminId}, now())
                `),
            ).rejects.toMatchObject({ code: "23503" });
        });

        it("riwayat terbaca kronologis menurun (FR-04.3 AC)", async () => {
            const asetId = await seedAset();
            await kueri(`
                INSERT INTO asset_condition_history (asset_id, kondisi_lama, kondisi_baru, alasan, diubah_oleh, diubah_pada)
                VALUES (${asetId}, 'BAIK', 'RUSAK_RINGAN', 'tergores', ${adminId}, '2026-09-01T00:00:00Z'),
                       (${asetId}, 'RUSAK_RINGAN', 'RUSAK_BERAT', 'jatuh', ${adminId}, '2026-09-05T00:00:00Z')
            `);
            const baris = await kueri<{ kondisi_baru: string }>(`
                SELECT kondisi_baru FROM asset_condition_history
                 WHERE asset_id = ${asetId} ORDER BY diubah_pada DESC
            `);
            expect(baris.map((b) => b.kondisi_baru)).toEqual(["RUSAK_BERAT", "RUSAK_RINGAN"]);
        });
    });
});
