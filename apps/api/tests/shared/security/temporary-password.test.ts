// FR-02.1 langkah 4: password sementara harus lolos kebijakan NFR-S-03a
// (PR-01-16) dengan konstruksi, bukan lolos secara kebetulan.

import { describe, expect, it } from "vitest";
import {
    PASSWORD_MIN_LENGTH,
    checkPasswordPolicy,
    generateTemporaryPassword,
} from "../../../src/shared/security/index.js";

const IDENTITAS = { nama: "Budi Santoso", email: "budi@sekolah.sch.id", nipNis: "198001012005011001" };

describe("generateTemporaryPassword (FR-02.1 langkah 4)", () => {
    it("selalu lolos checkPasswordPolicy (NFR-S-03a)", () => {
        for (let i = 0; i < 200; i += 1) {
            const password = generateTemporaryPassword(IDENTITAS);
            expect(checkPasswordPolicy(password, IDENTITAS)).toEqual([]);
        }
    });

    it("panjang minimal terpenuhi", () => {
        expect(generateTemporaryPassword(IDENTITAS).length).toBeGreaterThanOrEqual(
            PASSWORD_MIN_LENGTH,
        );
    });

    it("tidak pernah memuat identitas pemiliknya (mis. bagian nama)", () => {
        for (let i = 0; i < 50; i += 1) {
            const password = generateTemporaryPassword(IDENTITAS).toLowerCase();
            expect(password).not.toContain("budi");
            expect(password).not.toContain("santoso");
        }
    });

    it("dua panggilan berturutan tidak identik (acak, bukan tabel tetap)", () => {
        const a = generateTemporaryPassword(IDENTITAS);
        const b = generateTemporaryPassword(IDENTITAS);
        expect(a).not.toBe(b);
    });
});
