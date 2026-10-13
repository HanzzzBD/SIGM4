import { describe, expect, it } from "vitest";
import { internalPath, NavigationInbox } from "../src/shared/navigation";
import { DeviceRegistration } from "../src/features/notifications/registration";
import { taskSections } from "../src/features/tasks/model";
import { quickActions, visibleCards } from "../src/features/dashboard/model";

describe("PR-04-17: jalur privat dan lifecycle push", () => {
    it("hanya menerima path relatif kanonik, bukan URL/intent/traversal", () => {
        expect(internalPath("/persetujuan/123")).toBe("/persetujuan/123");
        expect(internalPath("/reservasi?saya=true")).toBe("/reservasi?saya=true");
        for (const value of ["https://evil.test", "//evil.test", "javascript:alert(1)", "/../secret", "/a/../secret", "/%2f%2fevil", "/\\evil", "/a\n", null]) expect(internalPath(value)).toBeNull();
    });
    it("menyimpan tujuan sebelum login hanya di memori; event akun lama ditolak dan logout membuang tujuan", () => {
        const inbox = new NavigationInbox(); inbox.offer("/persetujuan/123", null); expect(inbox.take("A")).toBe("/persetujuan/123"); expect(inbox.take("A")).toBeNull();
        inbox.offer("/persetujuan/4", "A"); expect(inbox.take("B")).toBeNull();
        inbox.offer("/persetujuan/5", "A"); inbox.clear(); expect(inbox.take("A")).toBeNull();
    });
    it("izin tidak diberikan: tidak mendaftarkan FID ke server", async () => {
        let sent = 0;
        const registration = new DeviceRegistration({ identity: async () => null, register: async () => { sent++; }, unregister: async () => undefined, revokeNative: async () => undefined });
        expect(await registration.start()).toBe(false); expect(sent).toBe(0);
    });
    it("logout membatalkan registrasi terlambat dan selalu mencabut identitas native walau HTTP gagal", async () => {
        let complete!: (fid: string) => void; const calls: string[] = [];
        const registration = new DeviceRegistration({ identity: () => new Promise((resolve) => { complete = resolve; }), register: async () => { calls.push("register"); }, unregister: async () => { calls.push("unregister"); throw new Error("offline"); }, revokeNative: async () => { calls.push("revoke"); } });
        const started = registration.start(); await registration.logout(); complete("fid"); expect(await started).toBe(false); expect(calls).toEqual(["revoke"]);
        const active = new DeviceRegistration({ identity: async () => "fid", register: async () => { calls.push("register"); }, unregister: async () => { throw new Error("offline"); }, revokeNative: async () => { calls.push("revoke"); } });
        await active.start(); await expect(active.logout()).rejects.toThrow("offline"); expect(calls).toEqual(["revoke", "register", "revoke"]);
    });
    it("registrasi berganda memakai generation terakhir dan abort saat stop", async () => {
        const signals: AbortSignal[] = [];
        const registration = new DeviceRegistration({ identity: async () => "fid", register: async (_fid, signal) => { signals.push(signal); }, unregister: async () => undefined, revokeNative: async () => undefined });
        await registration.start(); await registration.start(); expect(signals[0]!.aborted).toBe(true); registration.stop(); expect(signals[1]!.aborted).toBe(true);
    });
    it("seksi Tugas mengikuti semua permission dan fallback hanya bila tidak punya antrean operasional", () => {
        expect(taskSections({ "workorder.execute": "assigned", "approval.decide": "all", "fine.view": "own" }).map((section) => section.kind)).toEqual(["workorder", "approval"]);
        expect(taskSections({ "reservation.view": "own", "loan.view": "own", "fine.view": "own" }).map((section) => section.kind)).toEqual(["requests", "loans", "fines"]);
        expect(taskSections({})).toEqual([]);
    });
    it("kartu finansial dan aksi cepat tidak dirender tanpa izin", () => {
        const cards = [{ id: "ringkasan-aset", judul: "Ringkasan", zona: 2, jenis: "KPI" as const, berperiode: false, drilldown: null }];
        expect(visibleCards(cards, {})).toEqual([]); expect(visibleCards(cards, { "asset.view_financial": "all" })).toEqual(cards);
        expect(quickActions({ "asset.view": "restricted" }).map((action) => action.label)).toEqual(["Scan aset"]);
    });
});
