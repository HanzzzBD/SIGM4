// Unit tes siklus akun siswa (SL-02, SL-04): skema permintaan, registri kewajiban,
// dan batas hari WIB — tanpa basis data.

import { describe, expect, it } from "vitest";
import { ClassPromotionBodySchema } from "../../../src/modules/m02-users/schemas/class-promotion.schema.js";
import { ImportUserRowSchema } from "../../../src/modules/m02-users/schemas/user-import.schema.js";
import { CreateUserBodySchema } from "../../../src/modules/m02-users/schemas/user.schema.js";
import { tanggalWib } from "../../../src/modules/m02-users/services/graduation.service.js";
import { StudentObligationRegistry } from "../../../src/modules/m02-users/services/student-obligation-registry.js";
import type { TransactionScope } from "../../../src/shared/db/index.js";

const scope = {} as unknown as TransactionScope;

describe("ClassPromotionBodySchema (SL-02)", () => {
    it("menerima NAIK dengan kelas_id dan LULUS tanpa kelas_id", () => {
        const hasil = ClassPromotionBodySchema.parse({
            academic_year_id: "3",
            items: [
                { user_id: 1, tindakan: "NAIK", kelas_id: 9 },
                { user_id: "2", tindakan: "LULUS" },
            ],
        });
        expect(hasil.academic_year_id).toBe(3);
        expect(hasil.items).toEqual([
            { user_id: 1, tindakan: "NAIK", kelas_id: 9 },
            { user_id: 2, tindakan: "LULUS" },
        ]);
    });

    it("menolak NAIK tanpa kelas_id, tindakan asing, daftar kosong, dan lebih dari 200 item", () => {
        expect(() =>
            ClassPromotionBodySchema.parse({ academic_year_id: 1, items: [{ user_id: 1, tindakan: "NAIK" }] }),
        ).toThrow();
        expect(() =>
            ClassPromotionBodySchema.parse({ academic_year_id: 1, items: [{ user_id: 1, tindakan: "PINDAH" }] }),
        ).toThrow();
        expect(() => ClassPromotionBodySchema.parse({ academic_year_id: 1, items: [] })).toThrow();
        const banyak = Array.from({ length: 201 }, () => ({ user_id: 1, tindakan: "LULUS" }));
        expect(() => ClassPromotionBodySchema.parse({ academic_year_id: 1, items: banyak })).toThrow();
    });
});

describe("StudentObligationRegistry (SL-04)", () => {
    const k = (jenis: string) => ({ jenis, keterangan: `ket ${jenis}` });

    it("registri kosong mengembalikan daftar kosong — 'belum ada yang mendefinisikan', bukan jaminan", async () => {
        expect(await new StudentObligationRegistry().cek(scope, 1)).toEqual([]);
    });

    it("menggabungkan kewajiban seluruh pemeriksa, dan meneruskan userId", async () => {
        const dilihat: number[] = [];
        const registri = new StudentObligationRegistry().register(
            { nama: "loans", daftarKewajiban: (_s, id) => (dilihat.push(id), Promise.resolve([k("PEMINJAMAN_AKTIF")])) },
            { nama: "fines", daftarKewajiban: () => Promise.resolve([k("DENDA")]) },
        );
        expect((await registri.cek(scope, 7)).map((x) => x.jenis)).toEqual(["PEMINJAMAN_AKTIF", "DENDA"]);
        expect(dilihat).toEqual([7]);
    });

    it("menolak nama pemeriksa yang didaftarkan dua kali", () => {
        const c = { nama: "loans", daftarKewajiban: () => Promise.resolve([]) };
        expect(() => new StudentObligationRegistry().register(c).register(c)).toThrow(/dua kali/);
    });
});

describe("tanggalWib (CAL-03)", () => {
    it("batas hari mengikuti WIB, bukan UTC", () => {
        // 17:30 UTC tanggal 30 = 00:30 WIB tanggal 1 berikutnya.
        expect(tanggalWib(new Date("2021-06-30T17:30:00Z"))).toBe("2021-07-01");
        expect(tanggalWib(new Date("2021-06-30T16:59:00Z"))).toBe("2021-06-30");
    });
});

describe("consent_wali (DP-02, SL-06)", () => {
    const dasar = { nama: "A", email: "a@sekolah.sch.id", nip_nis: "1", role_id: 7 };

    it("CreateUserBodySchema menerima consent_wali boolean dan menolak yang bukan boolean", () => {
        expect(CreateUserBodySchema.parse({ ...dasar, consent_wali: true }).consent_wali).toBe(true);
        expect(CreateUserBodySchema.parse(dasar).consent_wali).toBeUndefined();
        expect(() => CreateUserBodySchema.parse({ ...dasar, consent_wali: "ya" })).toThrow();
    });

    it("impor E.5.2: 'true'/'TRUE'/' true ' → true, 'false' → false, kosong → tidak diisi, isian lain ditolak", () => {
        const baris = { nama_lengkap: "A", email: "a@sekolah.sch.id", nip_nis: "1", kode_role: "R-07", kode_unit_kerja: "X-1" };
        expect(ImportUserRowSchema.parse({ ...baris, consent_wali: "true" }).consent_wali).toBe(true);
        expect(ImportUserRowSchema.parse({ ...baris, consent_wali: "TRUE" }).consent_wali).toBe(true);
        expect(ImportUserRowSchema.parse({ ...baris, consent_wali: " true " }).consent_wali).toBe(true);
        expect(ImportUserRowSchema.parse({ ...baris, consent_wali: "false" }).consent_wali).toBe(false);
        expect(ImportUserRowSchema.parse(baris).consent_wali).toBeUndefined();
        expect(() => ImportUserRowSchema.parse({ ...baris, consent_wali: "ya" })).toThrow();
    });
});
