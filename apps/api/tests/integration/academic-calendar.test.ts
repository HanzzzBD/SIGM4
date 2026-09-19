// Acceptance PR-01-11: "Kalender akademik: academic_years, terms, +
// academic_year_id pada holidays" — "Tepat satu tahun ajaran aktif"
// (Lampiran E.2, AC-YR-01, SDD-DB-18) terhadap PostgreSQL NYATA.
//
// PR ini skema saja (keputusan 27): tidak ada service, sehingga invariant
// diuji LANGSUNG di basis data — itulah tempat penegakannya. Kueri majemuk
// (`a; b;`) dijalankan driver `pg` sebagai SATU transaksi implisit, sehingga
// constraint trigger DEFERRED baru diperiksa di akhirnya.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

const TAHUN_A = `INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai, is_active)
                 VALUES ('2090/2091', '2090-07-01', '2091-06-30', true)`;
const TAHUN_B = (aktif: boolean) => `INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai, is_active)
                 VALUES ('2091/2092', '2091-07-01', '2092-06-30', ${aktif})`;

async function namaAktif(): Promise<string[]> {
    const rows = await kueri<{ nama: string }>("SELECT nama FROM academic_years WHERE is_active ORDER BY nama");
    return rows.map((r) => r.nama);
}

describe.skipIf(!ADA_DB)("PR-01-11 — kalender akademik (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });
    // Satu pernyataan: tabel kosong pada akhir pernyataan, jadi constraint
    // trigger deferred (yang mewajibkan satu tahun aktif) tidak menolaknya.
    afterEach(async () => {
        await kueri("DELETE FROM holidays WHERE nama LIKE 'uji-kalender-%'");
        await kueri("DELETE FROM academic_terms");
        await kueri("DELETE FROM academic_years");
    });

    it("paling banyak SATU tahun ajaran aktif — yang kedua ditolak partial unique index", async () => {
        await kueri(TAHUN_A);
        await expect(kueri(TAHUN_B(true))).rejects.toMatchObject({
            code: "23505",
            constraint: "academic_years_satu_aktif_uq",
        });
        expect(await namaAktif()).toEqual(["2090/2091"]);
    });

    it("pergantian tahun aktif dalam SATU transaksi berhasil, dan tetap tepat satu yang aktif (AC-YR-02)", async () => {
        await kueri(TAHUN_A);
        await kueri(TAHUN_B(false));

        await kueri(`UPDATE academic_years SET is_active = false WHERE nama = '2090/2091';
                     UPDATE academic_years SET is_active = true  WHERE nama = '2091/2092';`);

        expect(await namaAktif()).toEqual(["2091/2092"]);
    });

    it("menonaktifkan satu-satunya tahun aktif tanpa menggantinya ditolak saat COMMIT (AC-YR-01)", async () => {
        await kueri(TAHUN_A);
        await kueri(TAHUN_B(false));

        await expect(kueri("UPDATE academic_years SET is_active = false WHERE nama = '2090/2091'")).rejects.toMatchObject({
            constraint: "academic_years_tepat_satu_aktif",
        });
        expect(await namaAktif()).toEqual(["2090/2091"]);
    });

    it("menghapus tahun aktif selagi tahun lain masih ada ditolak", async () => {
        await kueri(TAHUN_A);
        await kueri(TAHUN_B(false));

        await expect(kueri("DELETE FROM academic_years WHERE nama = '2090/2091'")).rejects.toMatchObject({
            constraint: "academic_years_tepat_satu_aktif",
        });
        expect(await namaAktif()).toEqual(["2090/2091"]);
    });

    it("tahun ajaran PERTAMA wajib aktif; tabel kosong sah (instalasi awal)", async () => {
        await expect(kueri(TAHUN_B(false))).rejects.toMatchObject({
            constraint: "academic_years_tepat_satu_aktif",
        });
        expect(await kueri("SELECT 1 FROM academic_years")).toHaveLength(0);

        await kueri(TAHUN_B(true));
        expect(await namaAktif()).toEqual(["2091/2092"]);
    });

    it("tahun ajaran tidak boleh beririsan, terbalik, atau bernama sama", async () => {
        await kueri(TAHUN_A);

        await expect(
            kueri(`INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai)
                   VALUES ('irisan', '2091-06-30', '2091-12-31')`),
        ).rejects.toMatchObject({ code: "23P01", constraint: "academic_years_tidak_beririsan" });

        await expect(
            kueri(`INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai)
                   VALUES ('terbalik', '2095-06-30', '2095-01-01')`),
        ).rejects.toMatchObject({ code: "23514", constraint: "academic_years_rentang_urut" });

        await expect(
            kueri(`INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai)
                   VALUES ('2090/2091', '2100-07-01', '2101-06-30')`),
        ).rejects.toMatchObject({ code: "23505", constraint: "academic_years_nama_uq" });
    });

    it("semester: satu Ganjil dan satu Genap per tahun, tidak beririsan, nama di luar enum ditolak", async () => {
        await kueri(TAHUN_A);
        const tahun = `(SELECT id FROM academic_years WHERE nama = '2090/2091')`;
        await kueri(`INSERT INTO academic_terms (academic_year_id, nama, tanggal_mulai, tanggal_selesai)
                     VALUES (${tahun}, 'GANJIL', '2090-07-01', '2090-12-31'),
                            (${tahun}, 'GENAP',  '2091-01-01', '2091-06-30')`);

        await expect(
            kueri(`INSERT INTO academic_terms (academic_year_id, nama, tanggal_mulai, tanggal_selesai)
                   VALUES (${tahun}, 'GANJIL', '2091-02-01', '2091-03-01')`),
        ).rejects.toMatchObject({ code: "23505", constraint: "academic_terms_nama_uq" });

        await kueri("DELETE FROM academic_terms WHERE nama = 'GENAP'");
        await expect(
            kueri(`INSERT INTO academic_terms (academic_year_id, nama, tanggal_mulai, tanggal_selesai)
                   VALUES (${tahun}, 'GENAP', '2090-12-01', '2091-06-30')`),
        ).rejects.toMatchObject({ code: "23P01", constraint: "academic_terms_tidak_beririsan" });

        await expect(
            kueri(`INSERT INTO academic_terms (academic_year_id, nama, tanggal_mulai, tanggal_selesai)
                   VALUES (${tahun}, 'TRIWULAN', '2091-01-01', '2091-06-30')`),
        ).rejects.toMatchObject({ code: "22P02" });
    });

    it("holidays.academic_year_id NULLABLE (libur nasional), tertaut bila diisi, dan FK menolak tahun yang tidak ada", async () => {
        await kueri(TAHUN_A);
        await kueri(`INSERT INTO holidays (tanggal, nama, jenis) VALUES ('2090-08-17', 'uji-kalender-nasional', 'NASIONAL')`);
        await kueri(`INSERT INTO holidays (tanggal, nama, jenis, academic_year_id)
                     VALUES ('2090-12-25', 'uji-kalender-sekolah', 'SEKOLAH',
                             (SELECT id FROM academic_years WHERE nama = '2090/2091'))`);

        const rows = await kueri<{ nama: string; terkait: boolean }>(
            "SELECT nama, academic_year_id IS NOT NULL AS terkait FROM holidays WHERE nama LIKE 'uji-kalender-%' ORDER BY nama",
        );
        expect(rows).toEqual([
            { nama: "uji-kalender-nasional", terkait: false },
            { nama: "uji-kalender-sekolah", terkait: true },
        ]);

        await expect(
            kueri(`INSERT INTO holidays (tanggal, nama, jenis, academic_year_id)
                   VALUES ('2090-09-09', 'uji-kalender-yatim', 'SEKOLAH', 999999999)`),
        ).rejects.toMatchObject({ code: "23503" });
        // Tahun ajaran yang masih punya hari libur tidak dapat dihapus diam-diam.
        await expect(kueri("DELETE FROM academic_years")).rejects.toMatchObject({ code: "23503" });
    });
});
