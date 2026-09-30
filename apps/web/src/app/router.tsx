// Router (SDD-FE-15): TanStack Router; search param divalidasi Zod. Gerbang sesi mengikuti
// urutan middleware server (SDD-AUTH-09, F-01): belum masuk → Login (tujuan tersimpan);
// wajib ganti password → P-05; role wajib 2FA yang belum terdaftar → P-03 (keputusan 85).
// Challenge 2FA dari login → P-02. Parameter `tujuan` dibawa sepanjang rantai.
// Path literal di sini dijaga sama dengan `HALAMAN_TERDAFTAR` oleh uji.

import type { QueryClient } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";
import { Outlet, createRootRouteWithContext, createRoute, createRouter, redirect, useNavigate } from "@tanstack/react-router";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ambilTantangan } from "../modules/m01-auth";
import { RENTANG } from "../modules/m15-dashboard";
import {
    HalamanAktivasiDuaFaktor,
    HalamanDashboard,
    HalamanDataTidakTersedia,
    HalamanGangguan,
    HalamanGantiPassword,
    HalamanLogin,
    HalamanTanpaAkses,
    HalamanTidakDitemukan,
    HalamanVerifikasiDuaFaktor,
} from "../pages";
import { ApiError } from "../shared/api";
import { kueriMe } from "../shared/auth";
import { KeadaanGalat } from "../shared/states";
import { Shell } from "./shell";

export interface KonteksRouter {
    readonly queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<KonteksRouter>()({
    component: Outlet,
    notFoundComponent: HalamanTidakDitemukan,
});

const cariTujuan = z.object({ tujuan: z.catch(z.optional(z.string()), undefined) });

const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    validateSearch: z.object({ tujuan: z.catch(z.optional(z.string()), undefined), alasan: z.catch(z.optional(z.literal("idle")), undefined) }),
    component: function RouteLogin() {
        const { tujuan, alasan } = loginRoute.useSearch();
        return <HalamanLogin tujuan={tujuan} alasan={alasan} />;
    },
});

/** P-02 hanya bermakna dengan challenge di memori tab; tanpa itu (mis. muat ulang) → Login. */
const verifikasiDuaFaktorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login/2fa",
    validateSearch: cariTujuan,
    beforeLoad: ({ search }) => {
        if (ambilTantangan() === null) throw redirect({ to: "/login", search: { tujuan: search.tujuan } });
    },
    component: function RouteVerifikasi() {
        return <HalamanVerifikasiDuaFaktor tujuan={verifikasiDuaFaktorRoute.useSearch().tujuan} />;
    },
});

const aktivasiDuaFaktorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login/2fa/aktivasi",
    validateSearch: cariTujuan,
    component: function RouteAktivasi() {
        return <HalamanAktivasiDuaFaktor tujuan={aktivasiDuaFaktorRoute.useSearch().tujuan} />;
    },
});

const gantiPasswordRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/ganti-password",
    validateSearch: cariTujuan,
    component: function RouteGantiPassword() {
        return <HalamanGantiPassword tujuan={gantiPasswordRoute.useSearch().tujuan} />;
    },
});

const gangguanRoute = createRoute({ getParentRoute: () => rootRoute, path: "/gangguan", component: HalamanGangguan });
const tidakDitemukanRoute = createRoute({ getParentRoute: () => rootRoute, path: "/tidak-ditemukan", component: HalamanTidakDitemukan });

/** Gerbang sesi seluruh halaman terautentikasi: `/me` wajib termuat sebelum shell dirender. */
const shellRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "shell",
    beforeLoad: async ({ context, location }) => {
        try {
            await context.queryClient.ensureQueryData(kueriMe);
        } catch (g) {
            // 403 TWO_FACTOR_REQUIRED pada /me = role wajib 2FA BELUM terdaftar; yang terdaftar
            // sudah mendapat challenge saat login, bukan sesi (SDD-AUTH-09, keputusan 85).
            if (g instanceof ApiError && g.kode === "TWO_FACTOR_REQUIRED") throw redirect({ to: "/login/2fa/aktivasi", search: { tujuan: location.href } });
            if (g instanceof ApiError && g.kode === "PASSWORD_CHANGE_REQUIRED") throw redirect({ to: "/ganti-password", search: { tujuan: location.href } });
            if (g instanceof ApiError && g.status === 401) throw redirect({ to: "/login", search: { tujuan: location.href } });
            throw g;
        }
    },
    component: Shell,
    errorComponent: function GalatSesi({ error, reset }) {
        return <KeadaanGalat galat={error} onCobaLagi={reset} />;
    },
});

const dashboardRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/",
    // Opsional: tautan ke Dashboard tak wajib menyebut rentang; bawaan 30 hari (keputusan 82h).
    validateSearch: z.object({ rentang: z.catch(z.optional(z.enum(RENTANG)), undefined) }),
    component: function RouteDashboard() {
        const { rentang } = dashboardRoute.useSearch();
        const navigate = useNavigate({ from: dashboardRoute.fullPath });
        return <HalamanDashboard rentang={rentang ?? "30_hari"} onRentang={(r) => void navigate({ search: { rentang: r } })} />;
    },
});

const tanpaAksesRoute = createRoute({ getParentRoute: () => shellRoute, path: "/tidak-punya-akses", component: HalamanTanpaAkses });
const dataTidakTersediaRoute = createRoute({ getParentRoute: () => shellRoute, path: "/data-tidak-tersedia", component: HalamanDataTidakTersedia });

export const routeTree = rootRoute.addChildren([
    loginRoute,
    verifikasiDuaFaktorRoute,
    aktivasiDuaFaktorRoute,
    gantiPasswordRoute,
    gangguanRoute,
    tidakDitemukanRoute,
    shellRoute.addChildren([dashboardRoute, tanpaAksesRoute, dataTidakTersediaRoute]),
]);

export function buatRouter(queryClient: QueryClient, history?: RouterHistory) {
    return createRouter({ routeTree, context: { queryClient }, defaultPreload: false, ...(history === undefined ? {} : { history }) });
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof buatRouter>;
    }
}
