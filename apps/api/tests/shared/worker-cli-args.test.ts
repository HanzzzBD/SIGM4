// Penguraian argumen CLI break-glass (SDD-SESS-11, PR-02-08) — murni, tanpa basis data.

import { describe, expect, it } from "vitest";
import { GalatArgumenCli, uraiArgumen } from "../../src/worker/cli.js";

describe("uraiArgumen", () => {
    it("admin:recover --email=... terurai dengan paksa=false", () => {
        expect(uraiArgumen(["admin:recover", "--email=admin@sekolah.sch.id"])).toEqual({
            perintah: "admin:recover",
            email: "admin@sekolah.sch.id",
            paksa: false,
        });
    });

    it("--force menaikkan paksa=true, urutan argumen bebas", () => {
        expect(uraiArgumen(["admin:recover", "--force", "--email=admin@sekolah.sch.id"])).toEqual({
            perintah: "admin:recover",
            email: "admin@sekolah.sch.id",
            paksa: true,
        });
    });

    it("admin:activation-code tidak menuntut --force", () => {
        expect(uraiArgumen(["admin:activation-code", "--email=pimpinan@sekolah.sch.id"])).toEqual({
            perintah: "admin:activation-code",
            email: "pimpinan@sekolah.sch.id",
            paksa: false,
        });
    });

    it("email diberi spasi di sekitarnya dipangkas", () => {
        expect(uraiArgumen(["admin:recover", "--email= admin@sekolah.sch.id "]).email).toBe("admin@sekolah.sch.id");
    });

    it("perintah kosong (argv kosong) → GalatArgumenCli", () => {
        expect(() => uraiArgumen([])).toThrow(GalatArgumenCli);
    });

    it.each([[["admin:recover"]], [["admin:recover", "--email="]], [["admin:recover", "--email= "]]])(
        "perintah dikenal tetapi tanpa --email atau kosong (%j) → GalatArgumenCli menyebut --email",
        (argv) => {
            expect(() => uraiArgumen(argv)).toThrow(GalatArgumenCli);
            expect(() => uraiArgumen(argv)).toThrow(/--email/);
        },
    );

    it("perintah tidak dikenal → GalatArgumenCli menyebut daftar yang tersedia", () => {
        expect(() => uraiArgumen(["admin:hapus-semua", "--email=x@y.z"])).toThrow(GalatArgumenCli);
        expect(() => uraiArgumen(["admin:hapus-semua", "--email=x@y.z"])).toThrow(/admin:recover/);
    });

    it("argumen tidak dikenal ditolak, bukan diabaikan diam-diam", () => {
        expect(() => uraiArgumen(["admin:recover", "--email=x@y.z", "--yakin"])).toThrow(GalatArgumenCli);
    });

    it("tidak ada nilai bawaan tersembunyi: --force TIDAK mengisi email", () => {
        expect(() => uraiArgumen(["admin:recover", "--force"])).toThrow(/--email/);
    });
});
