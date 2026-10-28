import { describe, expect, it } from "vitest";
import { canApprove, finalizationBlockers, findingBody, itemActions, readyToSubmit, reconcileBody, sessionBody } from "../src/features/stocktake/manage.js";

const form = { domain: "ASET" as const, name: "Opname Semester 1", start: "2026-11-02", end: "2026-11-06", scope: "GEDUNG" as const, target: "4", category: "9", people: ["7", "8"] };
const session = { status: "MENUNGGU_PERSETUJUAN" as const, created_by: "1", pelaksana: [{ id: "7", nama: "Petugas" }], domain: "ASET" as const };

describe("MS-65 buat sesi opname (FR-13.1)", () => {
    it("sends one domain, a scoped target and unique executors", () => {
        expect(sessionBody(form)).toEqual({ body: { domain: "ASET", nama: "Opname Semester 1", periode_mulai: "2026-11-02", periode_selesai: "2026-11-06", cakupan: { jenis: "GEDUNG", id: 4, category_id: 9 }, pelaksana_ids: [7, 8] } });
        expect(sessionBody({ ...form, scope: "SEKOLAH" })).toMatchObject({ body: { cakupan: { jenis: "SEKOLAH", category_id: 9 } } });
        expect(sessionBody({ ...form, scope: "SEKOLAH" })).not.toMatchObject({ body: { cakupan: { id: 4 } } });
    });
    it("drops the asset category from material sessions and rejects incomplete forms", () => {
        expect(sessionBody({ ...form, domain: "BAHAN" })).toEqual({ body: expect.objectContaining({ cakupan: { jenis: "GEDUNG", id: 4 } }) });
        expect(sessionBody({ ...form, target: "" })).toEqual({ error: "Pilih cakupan." });
        expect(sessionBody({ ...form, people: [] })).toHaveProperty("error");
        expect(sessionBody({ ...form, people: ["7", "7"] })).toHaveProperty("error");
        expect(sessionBody({ ...form, end: "2026-11-01" })).toHaveProperty("error");
    });
});

describe("MS-66 rekonsiliasi opname (FR-13.3)", () => {
    const base = { target: 10, diperiksa: 10, lokasi: [{ selesai: true }], periode_selesai: "2026-11-06", domain: "ASET" as const, foto_tertunda: 0 } as unknown as Parameters<typeof finalizationBlockers>[0];
    it("blocks finalization on open locations within the period, uncounted materials and pending photos", () => {
        expect(finalizationBlockers(base, "2026-11-05")).toEqual([]);
        const open = { ...base, lokasi: [{ selesai: false }, { selesai: true }] } as typeof base;
        expect(finalizationBlockers(open, "2026-11-05")).toEqual(["1 lokasi belum selesai."]);
        expect(finalizationBlockers(open, "2026-11-07")).toEqual([]);
        expect(finalizationBlockers({ ...base, domain: "BAHAN", diperiksa: 7 } as typeof base, "2026-11-05")).toEqual(["3 bahan/lokasi belum dihitung."]);
        expect(finalizationBlockers({ ...base, foto_tertunda: 2, target: 0 } as typeof base, "2026-11-05")).toEqual(["Sesi belum memiliki target pemeriksaan.", "2 foto belum siap."]);
    });
    it("offers Hilang only for missing assets and reconciles against the current basis", () => {
        expect(itemActions({ hasil: "TIDAK_DITEMUKAN" }).map((a) => a.value)).toEqual(["HILANG", "TANPA_PENYESUAIAN"]);
        expect(itemActions({ hasil: "SALAH_LOKASI" }).map((a) => a.value)).toEqual(["SESUAIKAN", "TANPA_PENYESUAIAN"]);
        expect(reconcileBody({ room_id_sekarang: "5", kondisi_sekarang: "BAIK" }, "SESUAIKAN", " Dipindah ke lab ")).toEqual({ body: { keterangan: "Dipindah ke lab", tindakan: "SESUAIKAN", basis: { room_id: 5, kondisi: "BAIK" } } });
        expect(reconcileBody({ room_id_sekarang: "5", kondisi_sekarang: "BAIK" }, "SESUAIKAN", "  ")).toEqual({ error: "Isi keterangan selisih." });
    });
    it("requires complete registration data for new findings", () => {
        const f = { name: "Proyektor", category: "3", room: "5", condition: "BAIK", year: "2024", source: "HIBAH", value: "", note: "Belum terdaftar" };
        expect(findingBody(f)).toEqual({ body: { keterangan: "Belum terdaftar", nama: "Proyektor", category_id: 3, room_id: 5, kondisi: "BAIK", tahun_perolehan: 2024, sumber_perolehan: "HIBAH", nilai_perolehan: null } });
        expect(findingBody({ ...f, value: "1500000" })).toMatchObject({ body: { nilai_perolehan: 1500000 } });
        expect(findingBody({ ...f, year: "" })).toHaveProperty("error");
        expect(findingBody({ ...f, note: "" })).toHaveProperty("error");
    });
    it("submits only when every difference, finding and photo is settled", () => {
        expect(readyToSubmit({ belum_dilengkapi: 0, temuan_belum_dilengkapi: 0, foto_tertunda: 0 })).toBe(true);
        expect(readyToSubmit({ belum_dilengkapi: 1, temuan_belum_dilengkapi: 0, foto_tertunda: 0 })).toBe(false);
        expect(readyToSubmit({ belum_dilengkapi: 0, temuan_belum_dilengkapi: 1, foto_tertunda: 0 })).toBe(false);
        expect(readyToSubmit({ belum_dilengkapi: 0, temuan_belum_dilengkapi: 0, foto_tertunda: 1 })).toBe(false);
    });
    it("separates duties: creators and executors never approve, materials need R-03", () => {
        const perms = { "audit.approve": "all" };
        expect(canApprove(session, { id: "2", role_kode: "R-03" }, perms)).toBe("YES");
        expect(canApprove(session, { id: "1", role_kode: "R-03" }, perms)).toBe("SELF");
        expect(canApprove(session, { id: "7", role_kode: "R-03" }, perms)).toBe("SELF");
        expect(canApprove(session, { id: "2", role_kode: "R-03" }, {})).toBe("NO");
        expect(canApprove({ ...session, status: "BERJALAN" }, { id: "2", role_kode: "R-03" }, perms)).toBe("NO");
        expect(canApprove({ ...session, domain: "BAHAN" }, { id: "2", role_kode: "R-02" }, perms)).toBe("NO");
        expect(canApprove(session, { id: "2", role_kode: "R-02" }, perms)).toBe("YES");
    });
});
