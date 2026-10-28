import { describe, expect, it } from "vitest";
import { cardSeries, quickActions } from "../src/features/dashboard/model.js";
import { profileError, profileLinks } from "../src/features/account/model.js";
import { approvalTone, slaTone } from "../src/features/approvals/model.js";
import { statusTones, urgencyTones } from "../src/features/damage/model.js";
import { workOrderPriorityTones, workOrderStatusTones } from "../src/features/workorders/model.js";
import { REGISTERED_SCREENS } from "../src/shared/screens.js";

describe("Aksi Cepat Beranda sebagai C-31 (DSD-12; keputusan paket 1)", () => {
    const all = { "asset.view": "all", "approval.decide": "all", "reservation.create": "own", "damage.create": "own", "chat.use": "own" };
    it("leaves the chatbot out — it already has a tab and C-38", () => {
        expect(quickActions(all).map((action) => action.label)).not.toContain("Chatbot");
    });
    const withoutWizard = Object.fromEntries(Object.entries(REGISTERED_SCREENS).filter(([id]) => id !== "MS-46"));
    it("hides actions whose mobile screen is not registered yet and shows them once it is", () => {
        expect(quickActions(all, withoutWizard).map((action) => action.screen)).toEqual(["MS-07", "MS-20", "MS-15"]);
        expect(quickActions(all, { ...withoutWizard, "MS-46": "/reservasi/baru" }).find((action) => action.screen === "MS-46")).toMatchObject({ path: "/reservasi/baru", group: "PEMANFAATAN" });
    });
    it("gives every action a domain group for the tile accent", () => {
        expect(quickActions(all).map((action) => action.group)).toEqual(["ASET_BAHAN", "PEMANFAATAN", "PEMANFAATAN", "PERAWATAN"]);
    });
});

describe("Grafik Mini kartu sebaran (C-33)", () => {
    it("turns distribution cards into labelled series", () => {
        expect(cardSeries("kondisi-aset", { kondisi: { BAIK: 10, RUSAK_RINGAN: 2 } })).toEqual([{ label: "Baik", value: 10 }, { label: "Rusak Ringan", value: 2 }]);
        expect(cardSeries("distribusi-role", { per_role: [{ nama: "Guru", jumlah: 4 }, { nama: "Siswa", jumlah: "x" }] })).toEqual([{ label: "Guru", value: 4 }, { label: "Siswa", value: 0 }]);
    });
    it("returns null for single-number cards and malformed data", () => {
        expect(cardSeries("total-aset", { total: 5 })).toBeNull();
        expect(cardSeries("kondisi-aset", null)).toBeNull();
        expect(cardSeries("kondisi-aset", { kondisi: [1, 2] })).toBeNull();
    });
});

describe("Profil MS-30", () => {
    it("validates name and phone like the server (FR-01.4)", () => {
        expect(profileError("  ", "")).toBe("Nama wajib diisi.");
        expect(profileError("a".repeat(201), "")).toMatch(/200/);
        expect(profileError("Siti", "1".repeat(31))).toMatch(/30/);
        expect(profileError("Siti", "")).toBeNull();
    });
    it("links only registered account screens the user may open", () => {
        expect(profileLinks({}, {})).toEqual([]);
        const registered = { "MS-27": "/profil/keamanan", "MS-28": "/profil/notifikasi" };
        expect(profileLinks({}, registered).map((link) => link.id)).toEqual(["MS-27"]);
        expect(profileLinks({ "notification.manage_own": "own" }, registered).map((link) => link.path)).toEqual(["/profil/keamanan", "/profil/notifikasi"]);
    });
});

describe("nada status berikon (UX-03, FOUNDATIONS §1.8)", () => {
    it("maps approval, SLA, damage and work order states to semantic tones", () => {
        expect(["DISETUJUI", "DITOLAK", "PERLU_REVISI", "AKTIF", "MENUNGGU", "DILEWATI"].map(approvalTone)).toEqual(["success", "error", "warning", "info", "pending", "pending"]);
        expect([slaTone(null), slaTone({ terlambat: true }), slaTone({ terlambat: false })]).toEqual(["pending", "error", "info"]);
        expect([statusTones.SELESAI, statusTones.DITOLAK, urgencyTones.KRITIS, urgencyTones.TINGGI]).toEqual(["success", "error", "error", "warning"]);
        expect([workOrderStatusTones.TERTUNDA, workOrderStatusTones.TIDAK_DAPAT_DIPERBAIKI, workOrderPriorityTones.KRITIS]).toEqual(["warning", "error", "error"]);
    });
});
