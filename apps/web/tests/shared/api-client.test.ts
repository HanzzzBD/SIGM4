// SDD-FE-07 / SDD-11 §4.4: 401 memicu SATU refresh bersama; permintaan paralel menunggu hasil
// yang sama lalu diulang sekali. Refresh gagal = sesi berakhir (sekali). 403 bukan logout.
import { describe, expect, it, vi } from "vitest";
import { ApiError, GalatJaringan, buatKlien } from "../../src/shared/api";
import { gagal, pasangServer, sukses } from "../helpers";

function klienDengan(refreshBerhasil: boolean) {
    const onSesiBerakhir = vi.fn();
    const onSesiDisegarkan = vi.fn();
    const klien = buatKlien({ onSesiBerakhir, onSesiDisegarkan });
    let sesiSegar = false;
    const log = pasangServer(async (p) => {
        if (p.url === "/auth/refresh") {
            await new Promise((r) => setTimeout(r, 20));
            sesiSegar = refreshBerhasil;
            return refreshBerhasil ? sukses({}) : gagal(401, "UNAUTHENTICATED", "Sesi berakhir.");
        }
        if (p.url === "/terlarang") return gagal(403, "FORBIDDEN", "Akses ditolak.");
        return sesiSegar ? sukses({ url: p.url }) : gagal(401, "TOKEN_EXPIRED", "Token kedaluwarsa.");
    }, klien);
    return { klien, log, onSesiBerakhir, onSesiDisegarkan };
}

describe("klien HTTP web", () => {
    it("tiga 401 paralel → tepat SATU POST /auth/refresh, ketiganya diulang dan berhasil", async () => {
        const { klien, log, onSesiDisegarkan } = klienDengan(true);
        const hasil = await Promise.all(["/a", "/b", "/c"].map((u) => klien.get(u)));
        expect(hasil.map((r) => (r.data as { data: { url: string } }).data.url)).toEqual(["/a", "/b", "/c"]);
        expect(log.filter((p) => p.url === "/auth/refresh")).toHaveLength(1);
        expect(log.filter((p) => p.url === "/a")).toHaveLength(2);
        expect(onSesiDisegarkan).toHaveBeenCalledTimes(1);
    });

    it("refresh gagal → onSesiBerakhir dan galat 401 ke pemanggil; tidak ada ulangan tanpa henti", async () => {
        const { klien, log, onSesiBerakhir } = klienDengan(false);
        await expect(klien.get("/a")).rejects.toMatchObject({ status: 401 });
        expect(onSesiBerakhir).toHaveBeenCalledTimes(1);
        expect(log.filter((p) => p.url === "/a")).toHaveLength(1);
    });

    it("refresh berhasil tetapi permintaan ulangan tetap 401 → galat ke pemanggil, TANPA refresh berulang", async () => {
        const onSesiBerakhir = vi.fn();
        const klien = buatKlien({ onSesiBerakhir });
        const log = pasangServer((p) => (p.url === "/auth/refresh" ? sukses({}) : gagal(401, "TOKEN_EXPIRED", "Token kedaluwarsa.")), klien);
        await expect(klien.get("/a")).rejects.toMatchObject({ status: 401 });
        expect(log.filter((p) => p.url === "/auth/refresh")).toHaveLength(1);
        expect(log.filter((p) => p.url === "/a")).toHaveLength(2);
    });

    it("login/refresh/logout tidak memicu refresh — kegagalannya bermakna sendiri (F-01)", async () => {
        const onSesiBerakhir = vi.fn();
        const klien = buatKlien({ onSesiBerakhir });
        const log = pasangServer(() => gagal(401, "UNAUTHENTICATED", "Email atau password salah."), klien);
        await expect(klien.post("/auth/login", {})).rejects.toBeInstanceOf(ApiError);
        expect(log.map((p) => p.url)).toEqual(["/auth/login"]);
        expect(onSesiBerakhir).not.toHaveBeenCalled();
    });

    it("403 dikembalikan apa adanya (layar tanpa-akses), bukan logout", async () => {
        const { klien, onSesiBerakhir } = klienDengan(true);
        const g = await klien.get("/terlarang").catch((e: unknown) => e);
        expect(g).toMatchObject({ status: 403, kode: "FORBIDDEN", requestId: "req-uji-1" });
        expect(onSesiBerakhir).not.toHaveBeenCalled();
    });

    it("amplop Bab 17.2: 5xx memakai pesan umum (tanpa detail teknis); 429 membawa Retry-After", async () => {
        const klien = buatKlien({ onSesiBerakhir: vi.fn() });
        pasangServer((p) => (p.url === "/lima" ? gagal(500, "INTERNAL_ERROR", "TypeError: x is undefined at repo.ts:12") : { ...gagal(429, "RATE_LIMIT_EXCEEDED", "Terlalu banyak."), headers: { "retry-after": "42" } }), klien);
        const g500 = (await klien.get("/lima").catch((e: unknown) => e)) as ApiError;
        expect(g500.message).not.toContain("TypeError");
        expect((await klien.get("/empat").catch((e: unknown) => e)) as ApiError).toMatchObject({ status: 429, tungguDetik: 42 });
    });

    it("tanpa respons → GalatJaringan (keadaan luring)", async () => {
        const klien = buatKlien({ onSesiBerakhir: vi.fn() });
        klien.defaults.adapter = () => Promise.reject(Object.assign(new Error("Network Error"), { isAxiosError: true, config: {} }));
        await expect(klien.get("/a")).rejects.toBeInstanceOf(GalatJaringan);
    });
});
