// Router (SDD-FE-15): TanStack Router; search param divalidasi Zod. Gerbang sesi mengikuti
// urutan middleware server (SDD-AUTH-09, F-01): belum masuk → Login (tujuan tersimpan);
// wajib ganti password → P-05; role wajib 2FA yang belum terdaftar → P-03 (keputusan 85).
// Challenge 2FA dari login → P-02. Parameter `tujuan` dibawa sepanjang rantai.
// Path literal di sini dijaga sama dengan `HALAMAN_TERDAFTAR` oleh uji.

import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { STATUS_RESERVASI } from "@sigm4/schemas";
import type { RouterHistory } from "@tanstack/react-router";
import { Link, Outlet, createRootRouteWithContext, createRoute, createRouter, redirect, useNavigate } from "@tanstack/react-router";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ambilTantangan } from "../modules/m01-auth";
import { TAMPILAN, detailReservasiQuery, hariIniWib, isianDariReservasi, isianDariSlot } from "../modules/m07-reservation-room";
import { RENTANG } from "../modules/m15-dashboard";
import {
    HalamanAktivasiDuaFaktor,
    HalamanApprovalRules,
    HalamanDashboard,
    HalamanDataTidakTersedia,
    HalamanDaftarReservasi,
    HalamanDetailReservasi,
    HalamanEditorAturan,
    HalamanGangguan,
    HalamanGantiPassword,
    HalamanLogin,
    HalamanImporAset,
    HalamanKalenderRuangan,
    HalamanMutasiAset,
    HalamanTanpaAkses,
    HalamanTidakDitemukan,
    HalamanWizardReservasi,
    HalamanVerifikasiDuaFaktor,
} from "../pages";
import { ApiError } from "../shared/api";
import { kueriMe, useSesi } from "../shared/auth";
import { KeadaanGalat, KeadaanMemuat } from "../shared/states";
import { Tombol } from "../shared/ui/primitives";
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

/**
 * Gerbang permission halaman (PM-04, UXP-02): tanpa permission → P-08, tanpa mengonfirmasi
 * keberadaan data (SDD-AUTH-08). Hanya kenyamanan — server tetap menolak (NFR-S-05).
 */
function butuhIzin(permission: string) {
    return async ({ context }: { context: KonteksRouter }) => {
        const sesi = await context.queryClient.ensureQueryData(kueriMe);
        if (sesi.permissions[permission] === undefined) throw redirect({ to: "/tidak-punya-akses" });
    };
}

/** P-68 Approval Rules; `disimpan` = umpan balik sukses setelah P-69 menyimpan. */
const approvalRulesRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/approval-rules",
    validateSearch: z.object({ disimpan: z.catch(z.optional(z.coerce.number()), undefined) }),
    beforeLoad: butuhIzin("approval_rule.view"),
    component: function RouteApprovalRules() {
        return <HalamanApprovalRules disimpan={approvalRulesRoute.useSearch().disimpan} />;
    },
});

/** P-69 — `/approval-rules/baru` atau `/approval-rules/{id}` (UX §6), satu route berparameter. */
const editorAturanRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/approval-rules/$id",
    beforeLoad: async (a) => {
        if (a.params.id !== "baru" && !/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" });
        await butuhIzin("approval_rule.manage")(a);
    },
    component: function RouteEditorAturan() {
        const { id } = editorAturanRoute.useParams();
        return <HalamanEditorAturan id={id === "baru" ? null : Number(id)} />;
    },
});

const tanpaAksesRoute = createRoute({ getParentRoute: () => shellRoute, path: "/tidak-punya-akses", component: HalamanTanpaAkses });
const assetImportRoute = createRoute({
    getParentRoute: () => shellRoute, path: "/aset/impor", beforeLoad: butuhIzin("asset.create"),
    validateSearch: z.object({ job: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(1))), undefined) }),
    component: function ImportRoute() {
        const { job } = assetImportRoute.useSearch();
        const navigate = useNavigate({ from: assetImportRoute.fullPath });
        return <HalamanImporAset jobId={job ?? null} onJob={(id) => void navigate({ search: { job: id } })} />;
    },
});
const dataTidakTersediaRoute = createRoute({ getParentRoute: () => shellRoute, path: "/data-tidak-tersedia", component: HalamanDataTidakTersedia });
const assetMovementRoute = createRoute({
    getParentRoute: () => shellRoute, path: "/aset/mutasi",
    beforeLoad: async ({ context }) => {
        const sesi = await context.queryClient.ensureQueryData(kueriMe);
        if (sesi.permissions["asset.update"] === undefined && sesi.permissions["asset_movement_document.view"] === undefined) throw redirect({ to: "/tidak-punya-akses" });
    },
    validateSearch: z.object({ document: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(1))), undefined) }),
    component: function MovementRoute() {
        const { document } = assetMovementRoute.useSearch();
        const navigate = useNavigate({ from: assetMovementRoute.fullPath });
        return <HalamanMutasiAset documentId={document ?? null} onDocument={(id) => void navigate({ search: { document: id ?? undefined } })} />;
    },
});

/** P-27 Kalender Ruangan (FR-07.1, UX §7.6.1): tampilan, tanggal WIB, dan filter tersimpan di URL. */
const kalenderRuanganRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/kalender-ruangan",
    beforeLoad: butuhIzin("reservation.view"),
    validateSearch: z.object({
        tampilan: z.catch(z.optional(z.enum(TAMPILAN)), undefined),
        tanggal: z.catch(z.optional(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/))), undefined),
        gedung: z.catch(z.optional(z.string().check(z.regex(/^[1-9]\d*$/))), undefined),
        jenis: z.catch(z.optional(z.string()), undefined),
        kapasitas: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(1))), undefined),
    }),
    component: function RouteKalenderRuangan() {
        const cari = kalenderRuanganRoute.useSearch();
        const navigate = useNavigate({ from: kalenderRuanganRoute.fullPath });
        // UX F-09: slot kosong terpilih → wizard P-29 langkah 1 terisi, hanya bagi pemegang reservation.create.
        const bolehAjukan = useSesi().permissions["reservation.create"] !== undefined;
        return (
            <HalamanKalenderRuangan
                pencarian={{ ...cari, tampilan: cari.tampilan ?? "harian", tanggal: cari.tanggal ?? hariIniWib() }}
                onPencarian={(p) => void navigate({ search: (lama) => ({ ...lama, ...p }) })}
                aksiPilihan={
                    bolehAjukan
                        ? (p) => (
                              <Tombol className="self-start" onClick={() => void navigate({ to: "/reservasi/baru", search: { ruangan: p.ruangan.id, mulai: p.mulai.toISOString(), selesai: p.selesai.toISOString() } })}>
                                  Ajukan reservasi
                              </Tombol>
                          )
                        : undefined
                }
                tautanReservasi={(r) => (
                    <Link to="/reservasi/$id" params={{ id: r.id }} className="text-text-link hover:text-text-link-hover">
                        Lihat detail {r.nomor}
                    </Link>
                )}
            />
        );
    },
});

/** P-29 Wizard Pengajuan Reservasi (FR-07.2, UX §6 `/reservasi/baru`): slot terpilih P-27 dibawa lewat URL. */
const wizardReservasiRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/reservasi/baru",
    beforeLoad: butuhIzin("reservation.create"),
    validateSearch: z.object({
        // `?ruangan=10` diurai router sebagai angka — dikoersi agar tautan tulisan tangan tetap sah.
        ruangan: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined),
        mulai: z.catch(z.optional(z.string()), undefined),
        selesai: z.catch(z.optional(z.string()), undefined),
        /** Ubah jadwal / Ajukan Ulang dari P-31 (BR-024, keputusan 17d): isian dari reservasi ini. */
        dari: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined),
    }),
    component: function RouteWizardReservasi() {
        const cari = wizardReservasiRoute.useSearch();
        const navigate = useNavigate({ from: wizardReservasiRoute.fullPath });
        const asal = useQuery({ ...detailReservasiQuery(cari.dari ?? ""), enabled: cari.dari !== undefined });
        if (cari.dari !== undefined && asal.isPending) return <KeadaanMemuat label="Memuat data reservasi" baris={6} />;
        const isianAwal = asal.data === undefined ? isianDariSlot(cari.ruangan, cari.mulai, cari.selesai) : isianDariReservasi(asal.data);
        const keKalender = (tanggal: string) => void navigate({ to: "/kalender-ruangan", search: { tanggal: tanggal === "" ? undefined : tanggal } });
        return (
            <HalamanWizardReservasi
                key={cari.dari ?? "baru"}
                isianAwal={isianAwal}
                onBatal={() => keKalender(isianAwal.tanggal)}
                onKalender={keKalender}
                // UXD-06: objek bernomor → Detail Reservasi P-31 menampilkan nomornya.
                onTerbentuk={(h) => void navigate({ to: "/reservasi/$id", params: { id: h.id }, search: { terkirim: true } })}
            />
        );
    },
});

/** P-30 Daftar Reservasi (FR-07.3, UX §7.4; PR-03-27): saringan, urutan, halaman di URL (C-15). */
const daftarReservasiRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/reservasi",
    beforeLoad: butuhIzin("reservation.view"),
    validateSearch: z.object({
        q: z.catch(z.optional(z.coerce.string()), undefined),
        status: z.catch(z.optional(z.enum(STATUS_RESERVASI)), undefined),
        saya: z.catch(z.optional(z.literal(true)), undefined),
        dari: z.catch(z.optional(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/))), undefined),
        sampai: z.catch(z.optional(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/))), undefined),
        urut: z.catch(z.optional(z.literal("mulai")), undefined),
        page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(2))), undefined),
    }),
    component: function RouteDaftarReservasi() {
        const cari = daftarReservasiRoute.useSearch();
        const navigate = useNavigate({ from: daftarReservasiRoute.fullPath });
        return <HalamanDaftarReservasi pencarian={cari} onPencarian={(p) => void navigate({ search: (lama) => ({ ...lama, ...p }) })} />;
    },
});

/** P-31 Detail Reservasi (FR-07.3, FR-07.4, FR-10.3; PR-03-27). */
const detailReservasiRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/reservasi/$id",
    beforeLoad: async (a) => {
        if (!/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" });
        await butuhIzin("reservation.view")(a);
    },
    validateSearch: z.object({ terkirim: z.catch(z.optional(z.literal(true)), undefined) }),
    component: function RouteDetailReservasi() {
        const { id } = detailReservasiRoute.useParams();
        const { terkirim } = detailReservasiRoute.useSearch();
        const navigate = useNavigate({ from: detailReservasiRoute.fullPath });
        return <HalamanDetailReservasi key={id} id={id} terkirim={terkirim === true} onUlang={(d) => void navigate({ to: "/reservasi/baru", search: { dari: d.id } })} />;
    },
});

export const routeTree = rootRoute.addChildren([
    loginRoute,
    verifikasiDuaFaktorRoute,
    aktivasiDuaFaktorRoute,
    gantiPasswordRoute,
    gangguanRoute,
    tidakDitemukanRoute,
    shellRoute.addChildren([dashboardRoute, approvalRulesRoute, editorAturanRoute, assetImportRoute, assetMovementRoute, kalenderRuanganRoute, wizardReservasiRoute, daftarReservasiRoute, detailReservasiRoute, tanpaAksesRoute, dataTidakTersediaRoute]),
]);

export function buatRouter(queryClient: QueryClient, history?: RouterHistory) {
    return createRouter({ routeTree, context: { queryClient }, defaultPreload: false, ...(history === undefined ? {} : { history }) });
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof buatRouter>;
    }
}
