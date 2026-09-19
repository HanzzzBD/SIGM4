// Acceptance PR-01-12: "work_units + migrasi users.unit_kerja -> work_unit_id"
// — "Pola expand -> migrate; kolom lama belum dihapus" (Lampiran E.3, WU-01,
// WU-02, SDD-05 §4.7c) terhadap PostgreSQL NYATA. Tidak ada service untuk
// `work_units` (keputusan 28): skema dan fungsi pemetaan diuji langsung.

import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

async function unit(nama: string, kode: string, status = "AKTIF"): Promise<string> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO work_units (nama, kode, jenis, status)
        VALUES ('${nama}', '${kode}', 'MANAJEMEN', '${status}') RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan unit kerja uji");
    return baris.id;
}

/** `unitKerja` = teks bebas warisan; `workUnitId` = penautan yang sudah ada. */
async function pengguna(unitKerja: string | null, workUnitId?: string): Promise<string> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password, unit_kerja, work_unit_id)
        VALUES ('Uji Unit', 'unit-${randomUUID()}@sekolah.sch.id', 'x',
                'NIPUNIT${randomUUID().replace(/-/g, "").slice(0, 16)}',
                (SELECT id FROM roles WHERE kode = 'R-05'), 'AKTIF', false,
                ${unitKerja === null ? "NULL" : `'${unitKerja}'`}, ${workUnitId ?? "NULL"})
        RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
    return baris.id;
}

async function unitDari(userId: string): Promise<string | null> {
    const [baris] = await kueri<{ work_unit_id: string | null }>(
        `SELECT work_unit_id::text FROM users WHERE id = ${userId}`,
    );
    return baris?.work_unit_id ?? null;
}

async function laporan(): Promise<{ unit_kerja: string; jumlah_pengguna: string }[]> {
    return kueri("SELECT unit_kerja, jumlah_pengguna::text FROM map_users_unit_kerja()");
}

describe.skipIf(!ADA_DB)("PR-01-12 — unit kerja (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });
    // Pengguna lebih dulu (FK users.work_unit_id -> work_units), lalu unit.
    beforeEach(async () => {
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM work_units");
    });
    afterEach(async () => {
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM work_units");
    });

    it("skema: unit baru AKTIF; kode dan nama unik TANPA memandang huruf/spasi; jenis tertutup; nama/kode terisi", async () => {
        await unit("Kurikulum", "KUR");
        const [baris] = await kueri<{ status: string }>("SELECT status::text FROM work_units WHERE kode = 'KUR'");
        expect(baris?.status).toBe("AKTIF");

        await expect(unit("Lain", " kur ")).rejects.toMatchObject({ code: "23505", constraint: "work_units_kode_uq" });
        await expect(unit("  KURIKULUM", "LAIN")).rejects.toMatchObject({ code: "23505", constraint: "work_units_nama_uq" });
        await expect(
            kueri(`INSERT INTO work_units (nama, kode, jenis) VALUES ('X', 'X', 'TIDAK_ADA')`),
        ).rejects.toMatchObject({ code: "22P02" });
        await expect(unit("   ", "KOSONG")).rejects.toMatchObject({ code: "23514", constraint: "work_units_nama_terisi" });
    });

    it("WU-02: unit yang masih dirujuk pengguna tidak dapat dihapus, hanya dinonaktifkan", async () => {
        const id = await unit("Sarpras", "SAR");
        await pengguna(null, id);

        await expect(kueri(`DELETE FROM work_units WHERE id = ${id}`)).rejects.toMatchObject({ code: "23503" });
        await kueri(`UPDATE work_units SET status = 'NONAKTIF' WHERE id = ${id}`);

        const kosong = await unit("Kosong", "KSG");
        await kueri(`DELETE FROM work_units WHERE id = ${kosong}`);
    });

    it("expand: kolom lama users.unit_kerja MASIH ada dan work_unit_id nullable (kontrak baru di PR-08-11)", async () => {
        const id = await pengguna("Teks Lama");
        const [baris] = await kueri<{ unit_kerja: string; work_unit_id: string | null }>(
            `SELECT unit_kerja, work_unit_id::text FROM users WHERE id = ${id}`,
        );
        expect(baris).toEqual({ unit_kerja: "Teks Lama", work_unit_id: null });
    });

    it("migrate: map_users_unit_kerja() memetakan by nama ATAU kode (huruf/spasi diabaikan) dan melaporkan sisanya", async () => {
        const kurikulum = await unit("Kurikulum", "KUR");
        const tu = await unit("Tata Usaha", "TU");
        const a = await pengguna(" kurikulum ");
        const b = await pengguna("tu");
        const tak1 = await pengguna("Tidak Ada");
        const tak2 = await pengguna("Tidak Ada");
        const tanpa = await pengguna(null);
        const kosong = await pengguna("   ");

        const hasil = await laporan();

        expect(await unitDari(a)).toBe(kurikulum);
        expect(await unitDari(b)).toBe(tu);
        expect(await unitDari(tak1)).toBeNull();
        expect(await unitDari(tak2)).toBeNull();
        expect(await unitDari(tanpa)).toBeNull();
        expect(await unitDari(kosong)).toBeNull();
        // Laporan HANYA yang bermakna: teks tak terpetakan beserta jumlahnya —
        // NULL dan teks kosong bukan "nilai lama yang harus dipetakan".
        expect(hasil).toEqual([{ unit_kerja: "Tidak Ada", jumlah_pengguna: "2" }]);
    });

    it("migrate: TANPA penebakan — cocok ganda dibiarkan, dan work_unit_id yang sudah terisi tidak pernah ditimpa", async () => {
        // 'ganda' = nama unit A SEKALIGUS kode unit B -> dua kandidat -> tidak dipetakan.
        await unit("Ganda", "AAA");
        await unit("Bbb", "GANDA");
        const kurikulum = await unit("Kurikulum", "KUR");
        await unit("Tata Usaha", "TU");
        const ganda = await pengguna("ganda");
        // Teks lamanya cocok "Tata Usaha", tetapi sudah ditautkan ke Kurikulum.
        const sudah = await pengguna("Tata Usaha", kurikulum);

        const hasil = await laporan();

        expect(await unitDari(ganda)).toBeNull();
        expect(await unitDari(sudah)).toBe(kurikulum);
        expect(hasil).toEqual([{ unit_kerja: "ganda", jumlah_pengguna: "1" }]);
    });

    it("migrate: idempoten, dan dapat dijalankan ulang setelah master diisi (laporan menyusut)", async () => {
        const p1 = await pengguna("Perpustakaan");
        const p2 = await pengguna("Perpustakaan");

        expect(await laporan()).toEqual([{ unit_kerja: "Perpustakaan", jumlah_pengguna: "2" }]);
        expect(await laporan()).toEqual([{ unit_kerja: "Perpustakaan", jumlah_pengguna: "2" }]);

        const perpus = await unit("Perpustakaan", "PERPUS");
        expect(await laporan()).toEqual([]);
        expect(await unitDari(p1)).toBe(perpus);
        expect(await unitDari(p2)).toBe(perpus);
        expect(await laporan()).toEqual([]);
    });
});
