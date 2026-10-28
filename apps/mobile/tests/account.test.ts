import { describe, expect, it } from "vitest";
import { preferencePayload, relevantPreferences, setChannel, shownChannels } from "../src/features/notifications/preferences.js";
import type { Preference } from "../src/features/notifications/preferences.js";
import { deviceTitle, profileLinks, revokeEndsHere } from "../src/features/account/model.js";
import { backupCodesMessage } from "../src/features/auth/codes.js";

const pref = (jenis: Preference["jenis"], overrides: Partial<Preference> = {}): Preference => ({ jenis, in_app: true, push: true, terkunci: false, ...overrides });

describe("MS-28 Preferensi Notifikasi (FR-17.3, UXD-05)", () => {
    it("filters groups by /me permissions, keeping Akun & Sistem always", () => {
        const list = [pref("PERSETUJUAN"), pref("DENDA_KEWAJIBAN"), pref("AKUN_SISTEM")];
        expect(relevantPreferences(list, {}).map((p) => p.jenis)).toEqual(["AKUN_SISTEM"]);
        expect(relevantPreferences(list, { "fine.view": "own" }).map((p) => p.jenis)).toEqual(["DENDA_KEWAJIBAN", "AKUN_SISTEM"]);
    });
    it("turns push off with in-app and never enables push without in-app (keputusan 81c)", () => {
        const off = setChannel({ PERSETUJUAN: { in_app: true, push: true } }, "PERSETUJUAN", "in_app", false);
        expect(off.PERSETUJUAN).toEqual({ in_app: false, push: false });
        expect(setChannel(off, "PERSETUJUAN", "push", true).PERSETUJUAN).toEqual({ in_app: false, push: false });
        expect(setChannel(off, "PERSETUJUAN", "in_app", true).PERSETUJUAN).toEqual({ in_app: true, push: false });
    });
    it("shows locked groups on and never sends them (FR-17.3 A1, keputusan 81e)", () => {
        const locked = pref("PERSETUJUAN", { terkunci: true, in_app: false, push: false });
        expect(shownChannels(locked, { PERSETUJUAN: { in_app: false, push: false } })).toEqual({ in_app: true, push: true });
        expect(preferencePayload([locked, pref("AKUN_SISTEM", { push: false })], { AKUN_SISTEM: { in_app: true, push: true } })).toEqual([{ jenis: "AKUN_SISTEM", in_app: true, push: true }]);
    });
    it("sends server values for untouched groups", () => {
        expect(preferencePayload([pref("DENDA_KEWAJIBAN", { push: false })], {})).toEqual([{ jenis: "DENDA_KEWAJIBAN", in_app: true, push: false }]);
    });
});

describe("MS-27 Keamanan & 2FA", () => {
    it("ends the local session only when this device or all devices are revoked (FR-01.2 A1)", () => {
        expect(revokeEndsHere({ id: null, current: true })).toBe(true);
        expect(revokeEndsHere({ id: "s1", current: true })).toBe(true);
        expect(revokeEndsHere({ id: "s2", current: false })).toBe(false);
    });
    it("names devices by platform", () => {
        expect(deviceTitle({ platform: "ANDROID", user_agent: null })).toBe("Android");
        expect(deviceTitle({ platform: "WEB", user_agent: "Mozilla/5.0" })).toBe("Browser · Mozilla/5.0");
    });
    it("backup code text carries the codes but no account identity (BR-070c)", () => {
        const text = backupCodesMessage(["AAAA-1111", "BBBB-2222"]);
        expect(text.split("\n")).toEqual(["Kode cadangan SIGM4", "Setiap kode hanya dapat dipakai satu kali.", "", "AAAA-1111", "BBBB-2222", ""]);
    });
    it("Profil links to Keamanan and Preferensi once registered; Privasi waits for PR-08-12", () => {
        expect(profileLinks({ "notification.manage_own": "own" }).map((link) => link.id)).toEqual(["MS-27", "MS-28"]);
        expect(profileLinks({}).map((link) => link.id)).toEqual(["MS-27"]);
    });
});
