// PR-02-32 — SystemAuthContext (SDD-03 §5/§6, SDD-AUTH-05, AL-06): identitas yang
// tak dapat ditiru, scope `all`, dan pabrik yang tertutup bagi lapisan HTTP.

import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as publik from "../../../src/shared/auth/index.js";
import { createAuthContext, isSystemAuthContext, pelakuId } from "../../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../../src/shared/auth/system-context.js";
import { AKAR } from "../../helpers/bab113.js";

describe("SystemAuthContext", () => {
    it("berscope `all` atas permission apa pun, berpelaku SYSTEM beserta nama pekerjaannya", () => {
        const ctx = createSystemAuthContext("student-graduation");
        expect(ctx.roleCode).toBe("SYSTEM");
        expect(ctx.namaPekerjaan).toBe("student-graduation");
        expect(ctx.can("user.update")).toBe(true);
        expect(ctx.scopeOf("loan.view")).toBe("all");
        expect(isSystemAuthContext(ctx)).toBe(true);
        expect(pelakuId(ctx)).toBeNull();
    });

    it("objek yang meniru bentuknya TIDAK dikenali sebagai SYSTEM — pelaku tetap id-nya", () => {
        const tiruan = { ...createSystemAuthContext("x") };
        expect(isSystemAuthContext(tiruan)).toBe(false);
        expect(pelakuId(tiruan)).toBe(0);
    });

    it("AuthContext pengguna tidak berubah: pelaku = userId", () => {
        const ctx = createAuthContext({ userId: 42, roleCode: "R-01", scopes: new Map() });
        expect(isSystemAuthContext(ctx)).toBe(false);
        expect(pelakuId(ctx)).toBe(42);
    });

    it("nama pekerjaan wajib (AL-06)", () => {
        expect(() => createSystemAuthContext("  ")).toThrow();
    });

    it("pabriknya tidak diekspor permukaan publik shared/auth", () => {
        expect(Object.keys(publik)).not.toContain("createSystemAuthContext");
    });
});

describe("SDD-03 §6 — SystemAuthContext hanya dibentuk dari src/worker (lint)", () => {
    const API = fileURLToPath(new URL("apps/api/", AKAR));
    async function galatLint(berkas: string, impor: string): Promise<string[]> {
        const eslint = new ESLint({ cwd: API, errorOnUnmatchedPattern: false });
        const hasil = await eslint.lintText(`import { createSystemAuthContext } from "${impor}";\nexport const c = createSystemAuthContext;\n`, {
            filePath: fileURLToPath(new URL(berkas, AKAR)),
        });
        return hasil.flatMap((r) => r.messages.map((m) => m.ruleId ?? m.message));
    }

    it.each([
        ["modul (controller/service)", "apps/api/src/modules/m02-users/services/__probe__.ts", "../../../shared/auth/system-context.js"],
        ["lapisan HTTP src/api", "apps/api/src/api/__probe__.ts", "../shared/auth/system-context.js"],
        ["shared kernel lain", "apps/api/src/shared/http/__probe__.ts", "../auth/system-context.js"],
    ])("menolak impor dari %s", async (_, berkas, impor) => {
        expect(await galatLint(berkas, impor)).toContain("import/no-restricted-paths");
    });

    it("MENGIZINKAN impor dari src/worker", async () => {
        expect(await galatLint("apps/api/src/worker/__probe__.ts", "../shared/auth/system-context.js")).not.toContain("import/no-restricted-paths");
    });
});
