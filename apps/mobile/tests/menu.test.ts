import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { MENU, searchMenu, visibleMenu, webUrl } from "../src/features/menu/model.js";
import { REGISTERED_SCREENS } from "../src/shared/screens.js";

/** Path expo-router dari letak berkas rute (SDD-MOB-12): grup `(x)`, `index`, dan `_layout` tidak menjadi segmen. */
function routePaths(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
        const full = join(dir, item.name);
        if (item.isDirectory()) return routePaths(full);
        if (!/\.tsx$/.test(item.name) || item.name.startsWith("_") || item.name.startsWith("+")) return [];
        const segments = relative(appDir, full).replace(/\.tsx$/, "").split(sep).filter((s) => !/^\(.*\)$/.test(s) && s !== "index");
        return [`/${segments.join("/")}`];
    });
}
const appDir = join(import.meta.dirname, "..", "src", "app");

describe("registri layar dijaga sama dengan rute", () => {
    it("every registered screen path has a route file", () => {
        const routes = routePaths(appDir);
        for (const [id, path] of Object.entries(REGISTERED_SCREENS)) expect(routes, id).toContain(path);
    });
});

const ids = (groups: ReturnType<typeof visibleMenu>) => groups.flatMap((group) => group.entries.map((entry) => entry.id));

describe("MS-31 Menu tersaring permission & registri layar (UXD-20, MOB-SCP-01)", () => {
    it("keeps the five domain groups in UXD-01 order", () => {
        expect(MENU.map((group) => group.group)).toEqual(["ASET_BAHAN", "PEMANFAATAN", "PERAWATAN", "PENGAWASAN", "SISTEM"]);
    });
    it("renders only entries whose screen is registered and whose permission is held", () => {
        const groups = visibleMenu({ "approval.decide": "assigned", "reservation.view": "own" });
        expect(ids(groups)).toEqual(["MS-20"]);
        expect(groups.map((group) => group.group)).toEqual(["PEMANFAATAN"]);
        expect(visibleMenu({})).toEqual([]);
    });
    it("shows an entry as soon as a later package registers its screen", () => {
        const groups = visibleMenu({ "reservation.view": "own" }, { ...REGISTERED_SCREENS, "MS-47": "/reservasi" });
        expect(groups[0]?.entries.map((entry) => [entry.id, entry.path])).toEqual([["MS-47", "/reservasi"]]);
    });
    it("falls back to the first registered alternative the user may open", () => {
        const groups = visibleMenu({ "workorder.execute": "assigned", "audit.execute": "assigned" });
        expect(ids(groups)).toEqual(["MS-16", "MS-18"]);
        expect(groups.flatMap((group) => group.entries.map((entry) => entry.path))).toEqual(["/work-order", "/opname"]);
    });
    it("keeps MOB-SCP-02 exceptions visible as web entries for permitted users only (MOB-SCP-03)", () => {
        const entry = visibleMenu({ "asset.qr_print": "all" })[0]?.entries[0];
        expect(entry).toMatchObject({ label: "Label QR", path: "/label-qr" });
        expect(entry?.web?.reason).toMatch(/printer/);
        expect(ids(visibleMenu({ "asset.view": "all" }))).not.toContain("P-24");
    });
    it("every registered entry path is a registered screen", () => {
        const all = Object.fromEntries(MENU.flatMap((group) => group.entries.flatMap((entry) => [...entry.permission, ...(entry.alternatives ?? []).flatMap((a) => a.permission)])).map((p) => [p, "all"]));
        for (const entry of visibleMenu(all).flatMap((group) => group.entries)) if (!entry.web) expect(Object.values(REGISTERED_SCREENS)).toContain(entry.path);
    });
});

describe("pencarian modul", () => {
    const groups = visibleMenu({ "approval.decide": "assigned", "workorder.execute": "assigned", "asset.view": "all" });
    it("matches entry labels case-insensitively", () => {
        expect(searchMenu(groups, "  PERSETUJUAN ").flatMap((group) => group.entries.map((entry) => entry.label))).toEqual(["Persetujuan Saya"]);
    });
    it("keeps the whole group when the group name matches", () => {
        expect(searchMenu(groups, "perawatan").map((group) => group.label)).toEqual(["Perawatan"]);
    });
    it("returns nothing for unknown words and everything for an empty query", () => {
        expect(searchMenu(groups, "zzz")).toEqual([]);
        expect(searchMenu(groups, "")).toBe(groups);
    });
});

describe("tautan web pengecualian", () => {
    it("builds HTTPS school URLs only", () => {
        expect(webUrl("https://sekolah.test/apa", "/label-qr")).toBe("https://sekolah.test/label-qr");
        for (const origin of ["http://sekolah.test", "https://u:p@sekolah.test", "javascript:alert(1)", ""]) expect(webUrl(origin, "/label-qr")).toBeNull();
        expect(webUrl("https://sekolah.test", "//evil.test")).toBeNull();
    });
});
