// Acceptance PR-01-15: penyaringan field per permission (SDD-AUTH-06, SDD-03 §4.3).
//
// Kebijakan di bawah adalah contoh persis dari SDD-03 §4.3 (`ASSET_FIELDS`),
// sekadar untuk menguji utilitasnya — domain aset sendiri belum ada sampai
// Phase 02 (M-04).

import { describe, expect, it } from "vitest";
import { allowedFields, createAuthContext } from "../../../src/shared/auth/index.js";
import type { FieldPolicy } from "../../../src/shared/auth/index.js";

const KEBIJAKAN: FieldPolicy<
    "id" | "uuid" | "kode_barang" | "nama",
    "nilai_perolehan" | "sumber_perolehan"
> = {
    base: ["id", "uuid", "kode_barang", "nama"],
    extra: ["nilai_perolehan", "sumber_perolehan"],
    requires: "asset.view_financial",
};

describe("allowedFields (SDD-03 §4.3)", () => {
    it("tanpa permission `requires` -> hanya base", () => {
        const ctx = createAuthContext({
            userId: 1,
            roleCode: "SISWA",
            scopes: new Map(),
        });
        expect(allowedFields(ctx, KEBIJAKAN)).toEqual(KEBIJAKAN.base);
    });

    it("dengan permission `requires` -> base digabung extra, urutan terjaga", () => {
        const ctx = createAuthContext({
            userId: 1,
            roleCode: "ADMIN",
            scopes: new Map([["asset.view_financial", "all"]]),
        });
        expect(allowedFields(ctx, KEBIJAKAN)).toEqual([
            ...KEBIJAKAN.base,
            ...KEBIJAKAN.extra,
        ]);
    });

    it("memegang permission lain tidak membuka extra — SEC-T-02", () => {
        const ctx = createAuthContext({
            userId: 1,
            roleCode: "SISWA",
            scopes: new Map([["asset.view", "restricted"]]),
        });
        const fields = allowedFields(ctx, KEBIJAKAN);
        expect(fields).not.toContain("nilai_perolehan");
        expect(fields).not.toContain("sumber_perolehan");
    });
});
