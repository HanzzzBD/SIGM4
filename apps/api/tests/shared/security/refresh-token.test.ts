// Refresh token buram (SDD-SESS-03): 32 byte acak, hanya SHA-256-nya yang disimpan.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    REFRESH_TTL_DETIK,
    bangkitkanRefreshToken,
    bentukRefreshTokenSah,
    hashRefreshToken,
} from "../../../src/shared/security/index.js";

describe("refresh token", () => {
    it("32 byte acak → 43 karakter base64url, dan setiap pembangkitan berbeda", () => {
        const a = bangkitkanRefreshToken();
        const b = bangkitkanRefreshToken();
        expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(a.token).not.toBe(b.token);
        expect(bentukRefreshTokenSah(a.token)).toBe(true);
    });

    it("yang disimpan adalah SHA-256 token, bukan tokennya (SDD-SESS-03)", () => {
        const { token, hash } = bangkitkanRefreshToken();
        expect(hash).toEqual(createHash("sha256").update(token).digest());
        expect(hash).toHaveLength(32);
        expect(hashRefreshToken(token)).toEqual(hash);
        expect(hash.toString("base64url")).not.toBe(token);
    });

    it.each(["", "pendek", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)} `, `${"a".repeat(42)}+`])(
        "bentuk tidak sah ditolak sebelum menyentuh basis data: %j",
        (nilai) => {
            expect(bentukRefreshTokenSah(nilai)).toBe(false);
        },
    );

    it("masa berlaku: 12 jam web, 30 hari mobile (FR-01.1 langkah 6)", () => {
        expect(REFRESH_TTL_DETIK).toEqual({ WEB: 43_200, ANDROID: 2_592_000, IOS: 2_592_000 });
    });
});
