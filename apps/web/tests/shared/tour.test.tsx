// Tur produk berbasis role: katalog konsisten dengan registri halaman, narasi mengikuti role,
// tur otomatis hanya sekali per akun, dan progresnya tersimpan ke `/me/tours`.

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HALAMAN_TERDAFTAR } from "../../src/shared/navigasi";
import { TUR_HALAMAN, VERSI_TUR, perluDiputar, turUtama } from "../../src/shared/tour";
import { gagal, pasangServer, renderAplikasi, sukses } from "../helpers";
import type { Permintaan } from "../helpers";

const ME_SISWA = {
    user: { id: "7", nama: "Sari Siswa", email: "sari@sekolah.sch.id", telepon: null, role_kode: "R-07", must_change_password: false },
    permissions: { "notification.manage_own": "own" },
};

afterEach(() => {
    document.querySelectorAll(".driver-popover, .driver-overlay").forEach((el) => el.remove());
});

describe("katalog tur", () => {
    const terdaftar = new Set(Object.values(HALAMAN_TERDAFTAR));

    it("setiap mini-tur menunjuk route yang benar-benar terdaftar", () => {
        for (const path of Object.keys(TUR_HALAMAN)) expect(terdaftar, path).toContain(path);
    });

    it("setiap sorotan menu menunjuk ID halaman yang terdaftar", () => {
        for (const role of ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06", "R-07"]) {
            for (const l of turUtama(role, "Uji").langkah) {
                const id = l.elemen?.[0]?.match(/nav-(P-\d+)/)?.[1];
                if (id !== undefined) expect(HALAMAN_TERDAFTAR[id], `${role} ${id}`).toBeDefined();
            }
        }
    });

    it("narasi dipilih per role; role kustom tetap mendapat tur umum", () => {
        const siswa = turUtama("R-07", "Sari Siswa");
        expect(siswa.kunci).toBe("utama.r-07");
        expect(siswa.langkah[0]?.isi).toContain("Siswa / OSIS");
        expect(siswa.langkah.some((l) => l.elemen?.includes('[data-tour="nav-P-35"]'))).toBe(true);
        expect(turUtama("R-01", "A").langkah.some((l) => l.elemen?.includes('[data-tour="nav-P-35"]'))).toBe(false);
        const kustom = turUtama("R-99", "B");
        expect(kustom.kunci).toBe("utama.r-99");
        expect(kustom.langkah.some((l) => l.elemen?.[0]?.startsWith('[data-tour="nav-'))).toBe(false);
    });

    it("perluDiputar: belum ada catatan atau versi usang → ya; versi terkini → tidak", () => {
        const p = (versi: number) => [{ kunci: "utama.r-07", status: "SELESAI" as const, versi, diperbarui_pada: "" }];
        expect(perluDiputar([], "utama.r-07", 1)).toBe(true);
        expect(perluDiputar(p(1), "utama.r-07", 2)).toBe(true);
        expect(perluDiputar(p(2), "utama.r-07", 2)).toBe(false);
    });
});

describe("tur otomatis di shell", () => {
    const server = (progres: unknown[]): Permintaan[] =>
        pasangServer((p) => {
            if (p.url === "/me") return sukses(ME_SISWA);
            if (p.url === "/me/tours" && p.method === "GET") return sukses({ tur: progres });
            if (p.url.startsWith("/me/tours/") && p.method === "PUT") return sukses({ tur: { kunci: p.url.slice(10), ...(p.data as object), diperbarui_pada: "2026-10-26T03:00:00.000Z" } });
            return gagal(404, "NOT_FOUND", "Tidak ditemukan.");
        });

    it("login pertama → tur utama role muncul; dilewati → tersimpan DILEWATI dengan versi terkini", async () => {
        const log = server([]);
        await renderAplikasi("/profil");
        expect(await screen.findByText("Selamat datang, Sari!", undefined, { timeout: 4000 })).toBeTruthy();
        // Esc menutup tur (driver.js mendengarkan `keyup` di window).
        fireEvent.keyUp(window, { key: "Escape" });
        await waitFor(() => expect(log.some((p) => p.method === "PUT")).toBe(true));
        expect(log.find((p) => p.method === "PUT")).toMatchObject({ url: "/me/tours/utama.r-07", data: { status: "DILEWATI", versi: VERSI_TUR } });
    });

    it("tur yang sudah tersimpan pada versi terkini tidak diputar lagi", async () => {
        const log = server([{ kunci: "utama.r-07", status: "SELESAI", versi: VERSI_TUR, diperbarui_pada: "2026-10-26T03:00:00.000Z" }]);
        await renderAplikasi("/profil");
        await new Promise((r) => setTimeout(r, 1600));
        expect(screen.queryByText("Selamat datang, Sari!")).toBeNull();
        expect(log.some((p) => p.method === "PUT")).toBe(false);
    });

    it("menu akun → Tur Aplikasi memutar ulang tur walau sudah selesai", async () => {
        server([{ kunci: "utama.r-07", status: "SELESAI", versi: VERSI_TUR, diperbarui_pada: "2026-10-26T03:00:00.000Z" }]);
        await renderAplikasi("/profil");
        const pemicu = await screen.findByRole("button", { name: /Sari Siswa/ });
        fireEvent.pointerDown(pemicu, { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Tur Aplikasi" }));
        expect(await screen.findByText("Selamat datang, Sari!")).toBeTruthy();
    });
});
