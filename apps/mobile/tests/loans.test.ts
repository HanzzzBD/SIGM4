import { describe, expect, it } from "vitest";
import { extensionBody, fineBreakdown, loanTone, unitState } from "../src/features/loans/model.js";
import { rupiah } from "../src/shared/wib.js";
import { taskDestination } from "../src/features/tasks/model.js";
import { nativeChatPath } from "../src/features/chat/model.js";
import { visibleMenu } from "../src/features/menu/model.js";

describe("rupiah tanpa kehilangan presisi", () => {
    it("formats decimal strings like the web", () => {
        expect(rupiah("1500000")).toBe("Rp1.500.000");
        expect(rupiah("12345678901234567890.50")).toBe("Rp12.345.678.901.234.567.890,50");
        expect(rupiah(null)).toBe("Menunggu penetapan");
    });
});

describe("Detail kewajiban (BR-028, BR-028b)", () => {
    const fine = { jenis: "KETERLAMBATAN" as const, menunggu_penetapan: false, hari_terlambat: 3, tarif_per_hari: "5000", jumlah_sebelum_cap: "15000", jumlah: "10000" };
    it("shows days × rate and flags the cap", () => {
        expect(fineBreakdown(fine)).toEqual(["3 hari × Rp5.000 = Rp15.000", "Batas maksimum diterapkan: Rp10.000"]);
        expect(fineBreakdown({ ...fine, jumlah: "15000" })).toEqual(["3 hari × Rp5.000 = Rp15.000"]);
        expect(fineBreakdown({ ...fine, menunggu_penetapan: true })[0]).toMatch(/menunggu penetapan/);
    });
});

describe("status peminjaman berikon", () => {
    it("maps loans and units to semantic tones", () => {
        expect([loanTone("TERLAMBAT"), loanTone("DIKEMBALIKAN"), loanTone("X")]).toEqual(["error", "success", "pending"]);
        expect(unitState({ status_kembali: "BELUM_KEMBALI", kondisi_akhir: null, tidak_lengkap: false })).toEqual({ label: "Belum kembali", tone: "info" });
        expect(unitState({ status_kembali: "DIKEMBALIKAN", kondisi_akhir: "BAIK", tidak_lengkap: true })).toEqual({ label: "Kembali · Tidak Lengkap", tone: "warning" });
    });
});

describe("MS-13 Ajukan Perpanjangan (FR-09.5)", () => {
    const due = "2026-11-03T10:00:00.000Z";
    it("requires a later WIB due date and a reason", () => {
        expect(extensionBody("2026-11-03", "17:00", "Masih dipakai", due)).toEqual({ error: "Jatuh tempo baru harus sesudah jatuh tempo saat ini." });
        expect(extensionBody("2026-11-04", "17:00", "  ", due)).toHaveProperty("error");
        expect(extensionBody("2026-11-04", "25:00", "x", due)).toEqual({ error: "Pilih tanggal dan jam jatuh tempo baru." });
        expect(extensionBody("2026-11-04", "17:00", "Masih dipakai", due)).toEqual({ body: { tanggal_jatuh_tempo: "2026-11-04T17:00:00+07:00", alasan: "Masih dipakai" } });
    });
});

describe("tujuan pemohon kini native", () => {
    it("opens loans and fines in the app instead of the web", () => {
        expect(taskDestination("loans", { "loan.view": "own" }, "https://s.test")).toEqual({ native: "/peminjaman" });
        expect(taskDestination("fines", { "fine.view": "own" }, "https://s.test", "4")).toEqual({ native: "/denda/4" });
    });
    it("lets chatbot links open loan and fine details only with permission", () => {
        expect(nativeChatPath("/peminjaman/12", { "loan.view": "own" })).toBe("/peminjaman/12");
        expect(nativeChatPath("/denda/3", {})).toBeNull();
    });
    it("shows Peminjaman and Denda in the menu through the pemohon screens", () => {
        expect(visibleMenu({ "loan.view": "own", "fine.view": "own" }).flatMap((g) => g.entries.map((e) => [e.label, e.path]))).toEqual([["Peminjaman", "/peminjaman"], ["Denda & Kewajiban", "/denda"]]);
    });
});
