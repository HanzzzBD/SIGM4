// Enkripsi secret TOTP saat disimpan (SDD-SESS-08): AES-256-GCM, kunci terpisah dari JWT.

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KotakRahasia } from "../../../src/shared/security/index.js";

const kunci = (): string => randomBytes(32).toString("base64");

describe("KotakRahasia", () => {
    it("bolak-balik utuh; ciphertext berbeda tiap kali (IV acak) dan tidak memuat plaintext", () => {
        const kotak = KotakRahasia.dariBase64(kunci());
        const isi = Buffer.from("secret-totp-rahasia");
        const a = kotak.enkripsi(isi, "totp:1");
        const b = kotak.enkripsi(isi, "totp:1");
        expect(a.equals(b)).toBe(false);
        expect(a.includes(isi)).toBe(false);
        expect(kotak.dekripsi(a, "totp:1").equals(isi)).toBe(true);
    });

    it("AAD mengikat pemilik: rahasia yang ditukar ke akun lain gagal didekripsi", () => {
        const kotak = KotakRahasia.dariBase64(kunci());
        const tersimpan = kotak.enkripsi(Buffer.from("rahasia"), "totp:1");
        expect(() => kotak.dekripsi(tersimpan, "totp:2")).toThrow();
    });

    it("kunci lain, isi yang diubah satu bit, dan bentuk rusak/berversi asing semuanya ditolak", () => {
        const kotak = KotakRahasia.dariBase64(kunci());
        const tersimpan = kotak.enkripsi(Buffer.from("rahasia"), "totp:1");
        expect(() => KotakRahasia.dariBase64(kunci()).dekripsi(tersimpan, "totp:1")).toThrow();

        const rusak = Buffer.from(tersimpan);
        rusak[rusak.length - 1] = (rusak[rusak.length - 1] ?? 0) ^ 1;
        expect(() => kotak.dekripsi(rusak, "totp:1")).toThrow();

        expect(() => kotak.dekripsi(tersimpan.subarray(0, 10), "totp:1")).toThrow(/tidak dikenal/);
        const versiAsing = Buffer.from(tersimpan);
        versiAsing[0] = 2;
        expect(() => kotak.dekripsi(versiAsing, "totp:1")).toThrow(/tidak dikenal/);
    });

    it("kunci harus base64 yang sah dan tepat 32 byte; galatnya tidak memuat nilainya", () => {
        expect(() => KotakRahasia.dariBase64("bukan base64!")).toThrow("bukan base64 yang sah");
        expect(() => KotakRahasia.dariBase64(randomBytes(16).toString("base64"))).toThrow("tepat 32 byte");
        expect(() => KotakRahasia.dariBase64(randomBytes(48).toString("base64"))).toThrow("tepat 32 byte");
        expect(() => KotakRahasia.dariBase64("")).toThrow();
    });
});
