// Skema Zod matriks permission (SDD-API-01, FR-02.2). Uji negatif adalah
// acceptance PR-01-04 yang sebenarnya: payload tidak sah ditolak SEBELUM
// lapisan layanan pernah menyentuh basis data.

import { describe, expect, it } from "vitest";
import {
    RoleIdParamSchema,
    UpdateRolePermissionsBodySchema,
} from "../../../src/modules/m02-users/schemas/role.schema.js";

describe("UpdateRolePermissionsBodySchema (FR-02.2 langkah 4)", () => {
    it("menerima daftar permission sah", () => {
        const hasil = UpdateRolePermissionsBodySchema.parse({
            permissions: [
                { kode: "user.view", scope: "ALL" },
                { kode: "asset.view", scope: "RESTRICTED" },
            ],
        });
        expect(hasil.permissions).toHaveLength(2);
    });

    it("menerima daftar kosong — mencabut seluruh permission role bukan Administrator sah", () => {
        const hasil = UpdateRolePermissionsBodySchema.parse({ permissions: [] });
        expect(hasil.permissions).toHaveLength(0);
    });

    it("menolak scope di luar enum basis data", () => {
        expect(() =>
            UpdateRolePermissionsBodySchema.parse({
                permissions: [{ kode: "user.view", scope: "SEMUA" }],
            }),
        ).toThrow();
    });

    it("menolak kode permission duplikat pada satu payload", () => {
        expect(() =>
            UpdateRolePermissionsBodySchema.parse({
                permissions: [
                    { kode: "user.view", scope: "ALL" },
                    { kode: "user.view", scope: "OWN" },
                ],
            }),
        ).toThrow();
    });
});

describe("RoleIdParamSchema", () => {
    it("menolak id bukan angka positif", () => {
        expect(() => RoleIdParamSchema.parse({ id: "0" })).toThrow();
        expect(() => RoleIdParamSchema.parse({ id: "-1" })).toThrow();
    });
});
