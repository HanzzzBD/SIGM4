// Access token EdDSA (SDD-SESS-02, NFR-S-03). Setiap uji menutup satu kelas bug JWT
// yang nyata: bila penjagaannya dicabut dari `jwt.ts`, uji terkait gagal.

import { createHmac, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_TTL_DETIK, JwtError, JwtKeys } from "../../../src/shared/security/index.js";
import { bangkitkanPem, kunciUji } from "../../helpers/auth.js";

const T0 = new Date("2026-09-19T03:00:00Z");
const KLAIM = { sub: "42", sid: "3f6c1c0e-0000-4000-8000-000000000001", pwd: false, amr: ["pwd"] } as const;

const b64u = (x: string | Buffer) => Buffer.from(x).toString("base64url");
const bacaBagian = (token: string, i: number) =>
    JSON.parse(Buffer.from(token.split(".")[i] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;

function alasan(fn: () => unknown): string {
    try {
        fn();
    } catch (galat) {
        if (galat instanceof JwtError) return galat.alasan;
        throw galat;
    }
    return "TIDAK_DITOLAK";
}

/** Token berkunci `kid` sah tetapi ditandatangani kunci LAIN — pemalsu yang tahu `kid` publik. */
function tandaiDenganKunciLain(kid: string, badan: Record<string, unknown>, header: Record<string, unknown> = {}): string {
    const { privateKey } = generateKeyPairSync("ed25519");
    const h = b64u(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid, ...header }));
    const p = b64u(JSON.stringify(badan));
    return `${h}.${p}.${b64u(sign(null, Buffer.from(`${h}.${p}`), privateKey))}`;
}

describe("JwtKeys — terbit dan verifikasi", () => {
    const kunci = kunciUji();

    it("token terbit membawa klaim tetap, masa berlaku 60 menit, dan header EdDSA + kid", () => {
        const token = kunci.terbitkan(KLAIM, T0);
        expect(bacaBagian(token, 0)).toEqual({ alg: "EdDSA", typ: "JWT", kid: kunci.kid });
        const klaim = kunci.verifikasi(token, T0);
        expect(klaim).toMatchObject({ sub: "42", sid: KLAIM.sid, pwd: false, amr: ["pwd"] });
        expect(klaim.exp - klaim.iat).toBe(ACCESS_TOKEN_TTL_DETIK);
        expect(ACCESS_TOKEN_TTL_DETIK).toBe(3600);
        const badan = bacaBagian(token, 1);
        expect(badan["iss"]).toBe("sigm4");
        expect(badan["aud"]).toBe("sigm4-api");
        expect(typeof badan["jti"]).toBe("string");
    });

    it("waktu dari argumen (Clock), bukan jam sistem: token kedaluwarsa tepat pada `exp`", () => {
        const token = kunci.terbitkan(KLAIM, T0);
        const tepat = new Date(T0.getTime() + ACCESS_TOKEN_TTL_DETIK * 1000);
        expect(() => kunci.verifikasi(token, new Date(tepat.getTime() - 1000))).not.toThrow();
        expect(alasan(() => kunci.verifikasi(token, tepat))).toBe("EXPIRED");
    });

    it("dua token untuk klaim yang sama berbeda (jti acak)", () => {
        expect(kunci.terbitkan(KLAIM, T0)).not.toBe(kunci.terbitkan(KLAIM, T0));
    });

    it("kid = thumbprint kunci publik: stabil untuk kunci yang sama, berbeda antar kunci", () => {
        const pem = bangkitkanPem();
        expect(kunciUji(pem).kid).toBe(kunciUji(pem).kid);
        expect(kunciUji().kid).not.toBe(kunciUji().kid);
    });
});

describe("JwtKeys — penolakan (kelas bug JWT)", () => {
    const kunci = kunciUji();
    const sah = kunci.terbitkan(KLAIM, T0);
    const [h, p, s] = sah.split(".") as [string, string, string];

    it("EXPIRED hanya bila tanda tangan sah; token kedaluwarsa yang dipalsukan tetap INVALID", () => {
        const kedaluwarsa = new Date(T0.getTime() + 2 * ACCESS_TOKEN_TTL_DETIK * 1000);
        expect(alasan(() => kunci.verifikasi(sah, kedaluwarsa))).toBe("EXPIRED");
        const palsu = tandaiDenganKunciLain(kunci.kid, bacaBagian(sah, 1));
        expect(alasan(() => kunci.verifikasi(palsu, kedaluwarsa))).toBe("INVALID");
    });

    it("tanda tangan kunci lain dengan kid yang benar ditolak", () => {
        const palsu = tandaiDenganKunciLain(kunci.kid, bacaBagian(sah, 1));
        expect(alasan(() => kunci.verifikasi(palsu, T0))).toBe("INVALID");
    });

    it("badan yang diubah setelah ditandatangani ditolak", () => {
        const badan = { ...bacaBagian(sah, 1), sub: "1" };
        expect(alasan(() => kunci.verifikasi(`${h}.${b64u(JSON.stringify(badan))}.${s}`, T0))).toBe("INVALID");
    });

    it("alg=none ditolak", () => {
        const none = `${b64u(JSON.stringify({ alg: "none", typ: "JWT", kid: kunci.kid }))}.${p}.`;
        expect(alasan(() => kunci.verifikasi(none, T0))).toBe("INVALID");
        expect(alasan(() => kunci.verifikasi(`${b64u(JSON.stringify({ alg: "none", kid: kunci.kid }))}.${p}.${s}`, T0))).toBe("INVALID");
    });

    it("kebingungan HS256 ↔ kunci publik: token HMAC bertanda kunci publik ditolak", () => {
        const pem = bangkitkanPem();
        const k = kunciUji(pem);
        const hh = b64u(JSON.stringify({ alg: "HS256", typ: "JWT", kid: k.kid }));
        const pp = b64u(JSON.stringify(bacaBagian(k.terbitkan(KLAIM, T0), 1)));
        const hmac = createHmac("sha256", pem.publik).update(`${hh}.${pp}`).digest();
        expect(alasan(() => k.verifikasi(`${hh}.${pp}.${b64u(hmac)}`, T0))).toBe("INVALID");
    });

    it("kid tak dikenal ditolak (kunci rotasi lama/asing)", () => {
        expect(alasan(() => kunciUji().verifikasi(sah, T0))).toBe("INVALID");
    });

    it.each(["crit", "jku", "jwk", "x5u"])("header dengan parameter %s ditolak", (nama) => {
        const token = tandaiDenganKunciLain(kunci.kid, bacaBagian(sah, 1), { [nama]: "x" });
        expect(alasan(() => kunci.verifikasi(token, T0))).toBe("INVALID");
    });

    it.each([
        ["bukan tiga bagian", "a.b"],
        ["bagian kosong", `${h}..${s}`],
        ["kosong", ""],
        ["base64url tidak ketat", `${h}!.${p}.${s}`],
        ["header bukan JSON", `${b64u("bukan json")}.${p}.${s}`],
        ["header array", `${b64u("[]")}.${p}.${s}`],
        ["tanda tangan terpotong", `${h}.${p}.${s.slice(0, -4)}`],
    ])("%s → INVALID", (_nama, token) => {
        expect(alasan(() => kunci.verifikasi(token, T0))).toBe("INVALID");
    });

    it("penerbit/audiens salah dan klaim tak lengkap atau salah tipe ditolak — walau tanda tangannya sah", () => {
        // Ditandatangani kunci yang sama lewat JwtKeys internal: bangun ulang badan lalu tanda tangani dengan kunci uji.
        const pem = bangkitkanPem();
        const k = JwtKeys.dariPem(pem.privat, pem.publik);
        const dasar = bacaBagian(k.terbitkan(KLAIM, T0), 1);
        const priv = createPrivateKey(pem.privat);
        const ttd = (badan: Record<string, unknown>) => {
            const hh = b64u(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: k.kid }));
            const pp = b64u(JSON.stringify(badan));
            return `${hh}.${pp}.${b64u(sign(null, Buffer.from(`${hh}.${pp}`), priv))}`;
        };
        expect(alasan(() => k.verifikasi(ttd(dasar), T0))).toBe("TIDAK_DITOLAK");
        for (const rusak of [
            { ...dasar, iss: "lain" },
            { ...dasar, aud: "lain" },
            { ...dasar, sub: 42 },
            { ...dasar, sub: "abc" },
            { ...dasar, sid: "" },
            { ...dasar, pwd: "false" },
            { ...dasar, amr: "pwd" },
            { ...dasar, amr: [1] },
            { ...dasar, iat: "x" },
            { ...dasar, exp: null },
            { ...dasar, iat: Math.floor(T0.getTime() / 1000) + 3600 },
        ]) {
            expect(alasan(() => k.verifikasi(ttd(rusak), T0)), JSON.stringify(rusak)).toBe("INVALID");
        }
    });
});

describe("JwtKeys.dariPem — gagal saat startup, bukan diam-diam", () => {
    it("bukan PEM → galat", () => {
        expect(() => JwtKeys.dariPem("bukan pem", "bukan pem")).toThrow(/bukan PEM yang sah/);
    });

    it("bukan Ed25519 (RSA) → galat", () => {
        const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
        expect(() =>
            JwtKeys.dariPem(
                rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
                rsa.publicKey.export({ type: "spki", format: "pem" }).toString(),
            ),
        ).toThrow(/harus Ed25519/);
    });

    it("kunci publik bukan pasangan kunci privat → galat", () => {
        expect(() => JwtKeys.dariPem(bangkitkanPem().privat, bangkitkanPem().publik)).toThrow(/bukan pasangan/);
    });
});
