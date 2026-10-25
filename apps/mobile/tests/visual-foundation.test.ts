import { describe, expect, it } from "vitest";
import { bellLabel, cardMeta, chartSeries, chatFabVisible, countBadge, headerCollapsed, initials, ringProgress, ringText, stepLabels, tileIconColor } from "../src/shared/ui/model.js";
import { tokens as t } from "../src/shared/ui/tokens.js";

describe("C-30 lonceng header (UXD-21)", () => {
    it("hides the badge at zero and caps it at 99+", () => {
        expect(countBadge(0)).toBeNull();
        expect(countBadge(-3)).toBeNull();
        expect(countBadge(Number.NaN)).toBeNull();
        expect(countBadge(7)).toBe("7");
        expect(countBadge(99)).toBe("99");
        expect(countBadge(100)).toBe("99+");
    });
    it("reads the unread count in the bell label", () => {
        expect(bellLabel(0)).toBe("Notifikasi");
        expect(bellLabel(150)).toBe("Notifikasi, 99+ belum dibaca");
    });
    it("collapses to the title only after scrolling past the header height", () => {
        expect(headerCollapsed(0)).toBe(false);
        expect(headerCollapsed(t.size.topbar)).toBe(false);
        expect(headerCollapsed(t.size.topbar + 1)).toBe(true);
    });
});

describe("C-31 ikon tile di atas accent (DSD-12, DSD-07)", () => {
    it("uses the dark icon only on yellow and white elsewhere", () => {
        expect(tileIconColor("PERAWATAN")).toBe(t.color.iconDefault);
        for (const group of ["ASET_BAHAN", "PEMANFAATAN", "PENGAWASAN", "SISTEM"] as const) expect(tileIconColor(group)).toBe(t.color.iconInverse);
    });
});

describe("C-32 kartu entitas", () => {
    it("keeps at most two non-empty meta items", () => {
        expect(cardMeta(["Lab RPL", null, "", "DEMO-AST-0001", "Gedung B"])).toBe("Lab RPL · DEMO-AST-0001");
        expect(cardMeta([])).toBe("");
    });
    it("derives two-letter initials", () => {
        expect(initials("  Siti  nur Aisyah ")).toBe("SN");
        expect(initials("Budi")).toBe("B");
    });
});

describe("C-33 grafik mini & C-34 cincin progres", () => {
    it("follows the fixed series order and caps at six series", () => {
        const series = chartSeries([1, 2, 3, 4, 5, 6, 7]);
        expect(series).toHaveLength(6);
        expect(series.map((s) => s.color)).toEqual([t.color.accent.blue, t.color.accent.green, t.color.accent.yellow, t.color.accent.red, t.color.accent.gray, t.color.accent.purple]);
        expect(chartSeries([-2, Number.NaN]).map((s) => s.value)).toEqual([0, 0]);
    });
    it("clamps progress and formats percent or fraction", () => {
        expect(ringProgress(5, 0)).toBe(0);
        expect(ringProgress(12, 10)).toBe(1);
        expect(ringText(1, 3, "percent")).toBe("33%");
        expect(ringText(7, 20, "fraction")).toBe("7/20");
    });
});

describe("C-35 stepper", () => {
    it("shows only the active label on phones and all labels on tablets", () => {
        expect(stepLabels(["Objek", "Waktu", "Tinjau"], 1, false)).toEqual([null, "Waktu", null]);
        expect(stepLabels(["Objek", "Waktu", "Tinjau"], 1, true)).toEqual(["Objek", "Waktu", "Tinjau"]);
    });
});

describe("C-38 tombol chatbot mengambang (UXD-22)", () => {
    const chat = { "chat.use": "own" };
    it("is hidden without chat.use", () => { expect(chatFabVisible("/", {})).toBe(false); });
    it("is hidden on the scanner, inside the chatbot, and on the stocktake scan session", () => {
        expect(chatFabVisible("/scan", chat)).toBe(false);
        expect(chatFabVisible("/chat", chat)).toBe(false);
        expect(chatFabVisible("/chat/riwayat", chat)).toBe(false);
        expect(chatFabVisible("/opname/12", chat)).toBe(false);
    });
    it("is shown elsewhere", () => {
        for (const path of ["/", "/tugas", "/menu", "/scan/hasil/1", "/opname/12/rekonsiliasi", "/persetujuan/3"]) expect(chatFabVisible(path, chat)).toBe(true);
    });
});
