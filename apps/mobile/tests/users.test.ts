import { describe, expect, it } from "vitest";
import { formFromUser, lockedSelf, promotionItems, remainingChoices, userBody } from "../src/features/users/model.js";
import type { UserRow } from "../src/features/users/model.js";

const user: UserRow = { id: "5", nama: "Sari", email: "sari@sekolah.id", nip_nis: "1987", role_id: "4", work_unit_id: "9", telepon: null, status: "AKTIF", must_change_password: false, login_terakhir_pada: null, consent_guardian_at: null, created_at: "2026-01-01T00:00:00Z" };
const f = { nama: " Sari ", email: "sari@sekolah.id", nip: "1987", role: "4", unit: "", telepon: " ", consent: false };

describe("MS-77/78 pengguna (FR-02.1)", () => {
    it("requires identity fields and a role", () => {
        expect(userBody(f, { student: false, canSetting: true })).toEqual({ body: { nama: "Sari", email: "sari@sekolah.id", nip_nis: "1987", role_id: 4, work_unit_id: null, telepon: null } });
        for (const k of ["nama", "email", "nip", "role"] as const) expect(userBody({ ...f, [k]: "" }, { student: false, canSetting: true })).toHaveProperty("error");
    });
    it("demands guardian consent for students (DP-02)", () => {
        expect(userBody(f, { student: true, canSetting: true })).toEqual({ error: "Akun siswa wajib disertai persetujuan wali (DP-02)." });
        expect(userBody({ ...f, consent: true }, { student: true, canSetting: true })).toMatchObject({ body: { consent_wali: true } });
    });
    it("keeps the existing work unit when the editor cannot see units", () => {
        expect(userBody(f, { student: false, canSetting: false, original: user })).toMatchObject({ body: { work_unit_id: 9 } });
        expect(Object.keys((userBody(f, { student: false, canSetting: false }) as { body: object }).body)).not.toContain("work_unit_id");
        expect(formFromUser(user)).toMatchObject({ unit: "9", role: "4" });
    });
    it("locks email and role on one's own account (BR-069)", () => {
        expect(lockedSelf(user, "5")).toBe(true);
        expect(lockedSelf(user, "6")).toBe(false);
        expect(lockedSelf(undefined, "5")).toBe(false);
    });
});

describe("MS-79 kenaikan kelas (SL-02)", () => {
    it("sends only complete choices within the 200 limit and keeps failures", () => {
        expect(promotionItems({ "1": { action: "NAIK", kelas: "7" }, "2": { action: "LULUS" }, "3": { action: "NAIK", kelas: "" } })).toEqual({ items: [{ user_id: 1, tindakan: "NAIK", kelas_id: 7 }, { user_id: 2, tindakan: "LULUS" }] });
        expect(promotionItems({})).toHaveProperty("error");
        expect(promotionItems(Object.fromEntries(Array.from({ length: 201 }, (_v, i) => [String(i + 1), { action: "LULUS" as const }])))).toEqual({ error: "Maksimal 200 siswa per proses." });
        expect(remainingChoices({ "1": { action: "LULUS" }, "2": { action: "LULUS" } }, [{ user_id: 1, status: "SUKSES" }, { user_id: 2, status: "GAGAL" }])).toEqual({ "2": { action: "LULUS" } });
    });
});
