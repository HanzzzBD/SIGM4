// TOTP RFC 6238 (FR-01.5, SDD-04 §4.4): kebenaran terhadap vektor uji baku, jendela ±1 langkah,
// dan larangan pemakaian ulang satu kode (RFC 6238 §5.2).

import { describe, expect, it } from "vitest";
import {
    TOTP_PERIODE_DETIK,
    base32Decode,
    base32Encode,
    bangkitkanSecretTotp,
    bentukKodeTotpSah,
    cocokkanTotp,
    kodeTotp,
    langkahTotp,
    urlOtpauth,
} from "../../../src/shared/security/index.js";

/** Secret uji RFC 6238 Lampiran B (SHA-1): ASCII "12345678901234567890". */
const SECRET_RFC = Buffer.from("12345678901234567890");
const pada = (detik: number): Date => new Date(detik * 1000);

describe("kodeTotp — vektor uji RFC 6238 Lampiran B (SHA-1)", () => {
    // Lampiran B memakai 8 digit; 6 digit adalah 6 digit terakhirnya (RFC 4226 §5.3: modulo 10^d).
    it.each([
        [59, "287082"],
        [1111111109, "081804"],
        [1111111111, "050471"],
        [1234567890, "005924"],
        [2000000000, "279037"],
        [20000000000, "353130"],
    ])("T=%i → %s", (detik, kode) => {
        expect(kodeTotp(SECRET_RFC, langkahTotp(pada(detik)))).toBe(kode);
    });

    it("langkah ganti tepat tiap 30 detik", () => {
        expect(TOTP_PERIODE_DETIK).toBe(30);
        expect(langkahTotp(pada(29))).toBe(0);
        expect(langkahTotp(pada(30))).toBe(1);
    });
});

describe("base32 (RFC 4648)", () => {
    it.each([
        ["", ""],
        ["f", "MY"],
        ["fo", "MZXQ"],
        ["foo", "MZXW6"],
        ["foob", "MZXW6YQ"],
        ["fooba", "MZXW6YTB"],
        ["foobar", "MZXW6YTBOI"],
    ])("%j ↔ %s", (teks, b32) => {
        expect(base32Encode(Buffer.from(teks))).toBe(b32);
        expect(base32Decode(b32).toString()).toBe(teks);
    });

    it("menolak karakter di luar alfabet, bukan mengabaikannya", () => {
        expect(() => base32Decode("MZXW6!")).toThrow();
        expect(() => base32Decode("MZXW6=")).toThrow();
    });

    it("secret acak 20 byte (160 bit) dan bolak-balik utuh", () => {
        const a = bangkitkanSecretTotp();
        expect(a).toHaveLength(20);
        expect(base32Decode(base32Encode(a)).equals(a)).toBe(true);
        expect(bangkitkanSecretTotp().equals(a)).toBe(false);
    });
});

describe("cocokkanTotp — jendela ±1 langkah dan sekali pakai (SDD-04 §4.4)", () => {
    const sekarang = pada(1_800_000_015); // di tengah sebuah langkah
    const langkah = langkahTotp(sekarang);
    const kode = (geser: number): string => kodeTotp(SECRET_RFC, langkah + geser);

    it("menerima langkah sekarang, satu sebelum, dan satu sesudah; mengembalikan langkah yang cocok", () => {
        expect(cocokkanTotp(SECRET_RFC, kode(0), sekarang, null)).toBe(langkah);
        expect(cocokkanTotp(SECRET_RFC, kode(-1), sekarang, null)).toBe(langkah - 1);
        expect(cocokkanTotp(SECRET_RFC, kode(1), sekarang, null)).toBe(langkah + 1);
    });

    it("menolak dua langkah menyimpang — jendela tidak melebar", () => {
        expect(cocokkanTotp(SECRET_RFC, kode(-2), sekarang, null)).toBeUndefined();
        expect(cocokkanTotp(SECRET_RFC, kode(2), sekarang, null)).toBeUndefined();
    });

    it("kode yang langkahnya sudah pernah diterima ditolak (RFC 6238 §5.2), yang lebih baru diterima", () => {
        expect(cocokkanTotp(SECRET_RFC, kode(0), sekarang, langkah)).toBeUndefined();
        expect(cocokkanTotp(SECRET_RFC, kode(-1), sekarang, langkah)).toBeUndefined();
        expect(cocokkanTotp(SECRET_RFC, kode(1), sekarang, langkah)).toBe(langkah + 1);
    });

    it("secret lain tidak cocok", () => {
        expect(cocokkanTotp(bangkitkanSecretTotp(), kode(0), sekarang, null)).toBeUndefined();
    });

    it.each(["12345", "1234567", "12345a", "", " 123456", "١٢٣٤٥٦"])("bentuk %j bukan kode 6 digit → ditolak tanpa menghitung", (masukan) => {
        expect(bentukKodeTotpSah(masukan)).toBe(false);
        expect(cocokkanTotp(SECRET_RFC, masukan, sekarang, null)).toBeUndefined();
    });
});

describe("urlOtpauth", () => {
    it("memuat secret base32, penerbit, dan parameter baku yang dipahami aplikasi authenticator", () => {
        const url = new URL(urlOtpauth(SECRET_RFC, "guru@sekolah.sch.id", "SIGM4"));
        expect(url.protocol).toBe("otpauth:");
        expect(url.host).toBe("totp");
        expect(decodeURIComponent(url.pathname)).toBe("/SIGM4:guru@sekolah.sch.id");
        expect(url.searchParams.get("secret")).toBe(base32Encode(SECRET_RFC));
        expect(url.searchParams.get("issuer")).toBe("SIGM4");
        expect(url.searchParams.get("algorithm")).toBe("SHA1");
        expect(url.searchParams.get("digits")).toBe("6");
        expect(url.searchParams.get("period")).toBe("30");
    });
});
