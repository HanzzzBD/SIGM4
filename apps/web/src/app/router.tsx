// Router (SDD-FE-15): TanStack Router; search param divalidasi Zod. Gerbang sesi mengikuti
// urutan middleware server (SDD-AUTH-09, F-01): belum masuk → Login (tujuan tersimpan);
// wajib ganti password → P-05; role wajib 2FA yang belum terdaftar → P-03 (keputusan 85).
// Challenge 2FA dari login → P-02. Parameter `tujuan` dibawa sepanjang rantai.
// Path literal di sini dijaga sama dengan `HALAMAN_TERDAFTAR` oleh uji.

import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { STATUS_RESERVASI } from "@sigm4/schemas";
import { HalamanLokasi, HalamanDetailRuangan } from "../pages";
import type { RouterHistory } from "@tanstack/react-router";
import { Link, Outlet, createRootRouteWithContext, createRoute, createRouter, redirect, useNavigate } from "@tanstack/react-router";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ambilTantangan } from "../modules/m01-auth";
import { jalurTerdaftar } from "../shared/navigasi";
import { TAMPILAN, detailReservasiQuery, hariIniWib, isianDariReservasi, isianDariSlot } from "../modules/m07-reservation-room";
import { KONDISI, STATUS, URUTAN } from "../modules/m04-assets";
import { STATUS_TIKET, URGENSI_TIKET } from "../modules/m11-damage-reports";
import { STATUS_PENGGUNA } from "../modules/m02-users";
import { JENIS_UNIT, KELOMPOK as KELOMPOK_PARAMETER, STATUS_UNIT } from "../modules/m20-settings";
import { RENTANG } from "../modules/m15-dashboard";
import { KELOMPOK, TAMPILAN_NOTIFIKASI } from "../modules/m17-notifications";
import {
    HalamanAktivasiDuaFaktor,
    HalamanApprovalRules,
    HalamanDashboard,
    HalamanDataTidakTersedia,
    HalamanDetailAset,
    HalamanInventaris,
    HalamanDaftarReservasi,
    HalamanDetailReservasi,
    HalamanEditorAturan,
    HalamanGangguan,
    HalamanGantiPassword,
    HalamanLogin,
    HalamanImporAset,
    HalamanKategoriAset,
    HalamanTambahAset,
    HalamanUbahAset,
    HalamanKalenderRuangan,
    HalamanLabelQr,
    HalamanPublikAset,
    HalamanScanQr,
    HalamanMutasiAset,
    HalamanPanelBlokade,
    HalamanDaftarKerusakan,
    HalamanKalenderAkademik,
    HalamanParameter,
    HalamanUnitKerja,
    HalamanActivityLog,
    HalamanDetailLog,
    HalamanDetailPengguna,
    HalamanImporPengguna,
    HalamanKenaikanKelas,
    HalamanPengguna,
    HalamanTambahPengguna,
    HalamanMatriksPermission,
    HalamanRole,
    HalamanDetailKerusakan,
    HalamanDetailKeputusan,
    HalamanLaporKerusakan,
    HalamanPersetujuanSaya,
    HalamanPreferensiNotifikasi,
    HalamanPusatNotifikasi,
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
        /** Aksi sekunder P-27 "Kelola Jadwal Tetap · Blokade Manual" (FR-07.5, PR-03-13): panel terbuka + ruangannya. */
        kelola: z.catch(z.optional(z.literal(true)), undefined),
        ruang: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined),
    }),
    component: function RouteKalenderRuangan() {
        const { kelola, ruang, ...cari } = kalenderRuanganRoute.useSearch();
        const navigate = useNavigate({ from: kalenderRuanganRoute.fullPath });
        const izin = useSesi().permissions;
        // UX F-09: slot kosong terpilih → wizard P-29 langkah 1 terisi, hanya bagi pemegang reservation.create.
        const bolehAjukan = izin["reservation.create"] !== undefined;
        const bolehBlokade = izin["reservation.fixed_schedule"] !== undefined;
        return (
            <HalamanKalenderRuangan
                aksiSekunder={
                    bolehBlokade && kelola !== true ? (
                        <Tombol varian="secondary" onClick={() => void navigate({ search: (lama) => ({ ...lama, kelola: true }) })}>
                            Kelola Jadwal Tetap & Blokade
                        </Tombol>
                    ) : undefined
                }
                panel={
                    bolehBlokade && kelola === true ? (
                        <HalamanPanelBlokade
                            roomId={ruang ?? null}
                            onRuangan={(id) => void navigate({ search: (lama) => ({ ...lama, ruang: id }) })}
                            onTutup={() => void navigate({ search: (lama) => ({ ...lama, kelola: undefined, ruang: undefined }) })}
                        />
                    ) : undefined
                }
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
        per: z.catch(z.optional(z.union([z.literal(50), z.literal(100)])), undefined),
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

/** P-13 Pusat Notifikasi (FR-17.1, UX §6 `/notifikasi`; PR-02-43): saringan & halaman di URL. */
const pusatNotifikasiRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/notifikasi",
    beforeLoad: butuhIzin("notification.manage_own"),
    validateSearch: z.object({
        jenis: z.catch(z.optional(z.enum(KELOMPOK)), undefined),
        tampilan: z.catch(z.optional(z.enum(TAMPILAN_NOTIFIKASI)), undefined),
        page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(2))), undefined),
    }),
    component: function RoutePusatNotifikasi() {
        const cari = pusatNotifikasiRoute.useSearch();
        const navigate = useNavigate({ from: pusatNotifikasiRoute.fullPath });
        return <HalamanPusatNotifikasi pencarian={cari} onPencarian={(p) => void navigate({ search: (lama) => ({ ...lama, ...p }) })} />;
    },
});

/** P-78 Preferensi Notifikasi (FR-17.3, UX §6 `/profil/notifikasi`; PR-02-43). */
const preferensiNotifikasiRoute = createRoute({ getParentRoute: () => shellRoute, path: "/profil/notifikasi", beforeLoad: butuhIzin("notification.manage_own"), component: HalamanPreferensiNotifikasi });

/** P-37 Persetujuan Saya (FR-10.2, UX §6 `/persetujuan`; PR-02-44). `diputuskan` = umpan balik setelah P-38. */
const persetujuanSayaRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/persetujuan",
    beforeLoad: butuhIzin("approval.decide"),
    validateSearch: z.object({
        page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(2))), undefined),
        diputuskan: z.catch(z.optional(z.string()), undefined),
    }),
    component: function RoutePersetujuanSaya() {
        const { page, diputuskan } = persetujuanSayaRoute.useSearch();
        const navigate = useNavigate({ from: persetujuanSayaRoute.fullPath });
        return <HalamanPersetujuanSaya page={page ?? 1} diputuskan={diputuskan} onPage={(p) => void navigate({ search: { page: p === 1 ? undefined : p } })} />;
    },
});

/** P-38 Detail Keputusan (FR-10.2, FR-10.3; PR-02-44) — sasaran deep link NT-01/05/06/07/47. Keputusan kembali ke P-37. */
const detailKeputusanRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/persetujuan/$id",
    beforeLoad: async (a) => {
        if (!/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" });
        await butuhIzin("approval.decide")(a);
    },
    component: function RouteDetailKeputusan() {
        const { id } = detailKeputusanRoute.useParams();
        const navigate = useNavigate({ from: detailKeputusanRoute.fullPath });
        return <HalamanDetailKeputusan key={id} id={Number(id)} onSelesai={(label) => void navigate({ to: "/persetujuan", search: { diputuskan: label } })} />;
    },
});

/** P-06 Halaman Publik Aset (FR-05.2 A3, UX §6 `/a/{uuid}`; PR-03-28): TANPA gerbang sesi — payload QR permanen. */
const publikAsetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/a/$uuid",
    component: function RoutePublikAset() {
        const { uuid } = publikAsetRoute.useParams();
        return <HalamanPublikAset uuid={uuid} />;
    },
});

/** P-24 Label QR (FR-05.1, UX §6 `/label-qr`; PR-03-28). `?aset=1,2,3` membawa pilihan dari P-16/P-18. */
const labelQrRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/label-qr",
    beforeLoad: butuhIzin("asset.qr_print"),
    validateSearch: z.object({ aset: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*(,[1-9]\d*)*$/))), undefined), belum: z.catch(z.optional(z.literal(true)), undefined) }),
    component: function RouteLabelQr() {
        const { aset, belum } = labelQrRoute.useSearch();
        return <HalamanLabelQr awal={aset === undefined ? [] : [...new Set(aset.split(","))]} belum={belum} />;
    },
});

/** P-25 Scan QR web (FR-05.2, UX §6 `/scan`; PR-03-28). Hasil → P-18 bila terdaftar. */
const scanRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/scan",
    beforeLoad: butuhIzin("asset.view"),
    component: function RouteScan() {
        const navigate = useNavigate();
        return <HalamanScanQr onBuka={(id) => void navigate({ href: jalurTerdaftar(`/aset/${id}`) ? `/aset/${id}` : "/" })} />;
    },
});

/** P-15 Inventaris Aset (FR-04.2, UX §7.4; PR-02-45): saringan, urutan, halaman di URL (SDD-FE-10). */
const inventarisRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/aset",
    beforeLoad: butuhIzin("asset.view"),
    validateSearch: z.object({
        q: z.catch(z.optional(z.coerce.string()), undefined),
        kategori: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined),
        lokasi: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined),
        kondisi: z.catch(z.optional(z.enum(KONDISI)), undefined),
        status: z.catch(z.optional(z.enum(STATUS)), undefined),
        tahun: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(1900), z.maximum(2100))), undefined),
        pinjam: z.catch(z.optional(z.boolean()), undefined),
        impor: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(1))), undefined),
        urut: z.catch(z.optional(z.enum(URUTAN)), undefined),
        page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(2))), undefined),
        per: z.catch(z.optional(z.union([z.literal(50), z.literal(100)])), undefined),
    }),
    component: function RouteInventaris() {
        const cari = inventarisRoute.useSearch();
        const navigate = useNavigate({ from: inventarisRoute.fullPath });
        return <HalamanInventaris pencarian={cari} onPencarian={(p) => void navigate({ search: (lama) => ({ ...lama, ...p }) })} />;
    },
});

/** P-18 Detail Aset (FR-04.2 langkah 5; PR-02-45). Tab sebagai segmen (UXP-01): `/aset/{id}` · `/aset/{id}/riwayat`. */
const cekIdAset = async (a: { params: { id: string }; context: KonteksRouter }) => {
    if (!/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" });
    await butuhIzin("asset.view")(a);
};
const detailAsetRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/aset/$id",
    beforeLoad: cekIdAset,
    component: function RouteDetailAset() {
        const { id } = detailAsetRoute.useParams();
        return <HalamanDetailAset key={id} id={id} tab="informasi" riwayatPage={1} onRiwayatPage={() => undefined} />;
    },
});
const riwayatAsetRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/aset/$id/riwayat",
    beforeLoad: cekIdAset,
    validateSearch: z.object({ page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(2))), undefined) }),
    component: function RouteRiwayatAset() {
        const { id } = riwayatAsetRoute.useParams();
        const { page } = riwayatAsetRoute.useSearch();
        const navigate = useNavigate({ from: riwayatAsetRoute.fullPath });
        return <HalamanDetailAset key={id} id={id} tab="riwayat" riwayatPage={page ?? 1} onRiwayatPage={(p) => void navigate({ search: { page: p === 1 ? undefined : p } })} />;
    },
});

/** P-16 Tambah Aset (FR-04.1, UX §6 `/aset/baru`; PR-02-46). */
const tambahAsetRoute = createRoute({ getParentRoute: () => shellRoute, path: "/aset/baru", beforeLoad: butuhIzin("asset.create"), validateSearch: z.object({ ruang: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined) }), component: function TambahDariLokasi() { return <HalamanTambahAset initialRoom={tambahAsetRoute.useSearch().ruang} />; } });

/** P-19 Ubah Aset (FR-04.3, UX §6 `/aset/{id}/ubah`; PR-02-46). Selesai/batal kembali ke P-18 bila terdaftar. */
const ubahAsetRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/aset/$id/ubah",
    beforeLoad: async (a) => {
        if (!/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" });
        await butuhIzin("asset.update")(a);
    },
    component: function RouteUbahAset() {
        const { id } = ubahAsetRoute.useParams();
        const navigate = useNavigate();
        return <HalamanUbahAset key={id} id={id} onSelesai={() => void navigate({ href: jalurTerdaftar(`/aset/${id}`) ? `/aset/${id}` : "/" })} />;
    },
});

/** P-21 Kategori Aset (FR-04.5, UX §6 `/kategori-aset`; PR-02-46). */
const kategoriAsetRoute = createRoute({ getParentRoute: () => shellRoute, path: "/kategori-aset", beforeLoad: butuhIzin("category.manage"), component: HalamanKategoriAset });

/** P-39 Laporan Kerusakan (FR-11.3, UX §6 `/kerusakan`; PR-03-32): tab status, saringan, halaman di URL. */
const daftarKerusakanRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/kerusakan",
    beforeLoad: butuhIzin("damage.view"),
    validateSearch: z.object({
        q: z.catch(z.optional(z.coerce.string()), undefined),
        status: z.catch(z.optional(z.enum(STATUS_TIKET)), undefined),
        urgensi: z.catch(z.optional(z.enum(URGENSI_TIKET)), undefined),
        ruang: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined),
        saya: z.catch(z.optional(z.literal(true)), undefined),
        sla: z.catch(z.optional(z.literal(true)), undefined),
        dari: z.catch(z.optional(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/))), undefined),
        sampai: z.catch(z.optional(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/))), undefined),
        urut: z.catch(z.optional(z.literal("urgensi")), undefined),
        page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(2))), undefined),
    }),
    component: function RouteDaftarKerusakan() {
        const cari = daftarKerusakanRoute.useSearch();
        const navigate = useNavigate({ from: daftarKerusakanRoute.fullPath });
        return <HalamanDaftarKerusakan pencarian={cari} onPencarian={(p) => void navigate({ search: (lama) => ({ ...lama, ...p }) })} />;
    },
});

/** P-40 Lapor Kerusakan (FR-11.1, UX §6 `/kerusakan/baru`; PR-03-32): `?aset=` / `?ruang=&reservasi=` (P-18, P-31). */
const laporKerusakanRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/kerusakan/baru",
    beforeLoad: butuhIzin("damage.create"),
    validateSearch: z.object({
        aset: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined),
        ruang: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined),
        reservasi: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined),
    }),
    component: function RouteLaporKerusakan() {
        const awal = laporKerusakanRoute.useSearch();
        const navigate = useNavigate();
        return <HalamanLaporKerusakan awal={awal} onSelesai={(id) => void navigate({ to: "/kerusakan/$id", params: { id } })} />;
    },
});

/** P-41 Detail Tiket Kerusakan (FR-11.2, UX §6 `/kerusakan/{id}`; PR-03-32). Drawer verifikasi `?aksi=verifikasi` (UXD-02). */
const detailKerusakanRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/kerusakan/$id",
    beforeLoad: async (a) => {
        if (!/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" });
        await butuhIzin("damage.view")(a);
    },
    validateSearch: z.object({ aksi: z.catch(z.optional(z.literal("verifikasi")), undefined) }),
    component: function RouteDetailKerusakan() {
        const { id } = detailKerusakanRoute.useParams();
        const { aksi } = detailKerusakanRoute.useSearch();
        const navigate = useNavigate({ from: detailKerusakanRoute.fullPath });
        return <HalamanDetailKerusakan key={id} id={id} aksi={aksi} onAksi={(a) => void navigate({ search: { aksi: a } })} />;
    },
});

const idAngka = z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined);

/** P-60 Pengguna (FR-02.1, UX §6 `/pengguna`; PR-01-19): saringan role/status/unit kerja dan halaman di URL. */
const penggunaRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/pengguna",
    beforeLoad: butuhIzin("user.view"),
    // `filter[...]` = bentuk drill-down kartu dashboard UX §8.3 ("Total Pengguna Aktif"); dinormalkan di bawah.
    validateSearch: z.object({
        role: idAngka,
        status: z.catch(z.optional(z.enum(STATUS_PENGGUNA)), undefined),
        unit: idAngka,
        "filter[role_id]": idAngka,
        "filter[status]": z.catch(z.optional(z.enum(STATUS_PENGGUNA)), undefined),
        "filter[work_unit_id]": idAngka,
        page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(2))), undefined),
    }),
    component: function RoutePengguna() {
        const cari = penggunaRoute.useSearch();
        const navigate = useNavigate({ from: penggunaRoute.fullPath });
        const saringan = { role: cari.role ?? cari["filter[role_id]"], status: cari.status ?? cari["filter[status]"], unit: cari.unit ?? cari["filter[work_unit_id]"], page: cari.page };
        return <HalamanPengguna saringan={saringan} onSaringan={(s) => void navigate({ search: { ...saringan, ...s } })} />;
    },
});

/** P-61 Tambah Pengguna (FR-02.1, UX §6 `/pengguna/baru`; PR-01-19). */
const tambahPenggunaRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/pengguna/baru",
    beforeLoad: butuhIzin("user.create"),
    component: function RouteTambahPengguna() {
        const navigate = useNavigate();
        return <HalamanTambahPengguna onDibuat={(id) => void navigate({ to: "/pengguna/$id", params: { id } })} onBatal={() => void navigate({ href: jalurTerdaftar("/pengguna") ? "/pengguna" : "/" })} />;
    },
});

/** P-62 Impor Pengguna (FR-02.1 A4, UX §6 `/pengguna/impor`; PR-01-19): laporan pekerjaan di `?job=`. */
const imporPenggunaRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/pengguna/impor",
    beforeLoad: butuhIzin("user.create"),
    validateSearch: z.object({ job: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(1))), undefined) }),
    component: function RouteImporPengguna() {
        const { job } = imporPenggunaRoute.useSearch();
        const navigate = useNavigate({ from: imporPenggunaRoute.fullPath });
        return <HalamanImporPengguna jobId={job ?? null} onJob={(id) => void navigate({ search: { job: id } })} />;
    },
});

/** P-64 Kenaikan Kelas Massal (SL-02, UX §6 `/pengguna/kenaikan-kelas`; PR-01-19). */
const kenaikanKelasRoute = createRoute({ getParentRoute: () => shellRoute, path: "/pengguna/kenaikan-kelas", beforeLoad: butuhIzin("user.update"), component: HalamanKenaikanKelas });

/** P-63 Detail Pengguna (FR-02.1, UX §6 `/pengguna/{id}`; PR-01-19). Drawer aksi `?aksi=` (UXD-02). */
const detailPenggunaRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/pengguna/$id",
    beforeLoad: async (a) => {
        if (!/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" });
        await butuhIzin("user.view")(a);
    },
    validateSearch: z.object({ aksi: z.catch(z.optional(z.enum(["ubah", "status", "reset-password", "reset-2fa", "kode-aktivasi"])), undefined) }),
    component: function RouteDetailPengguna() {
        const { id } = detailPenggunaRoute.useParams();
        const { aksi } = detailPenggunaRoute.useSearch();
        const navigate = useNavigate({ from: detailPenggunaRoute.fullPath });
        return <HalamanDetailPengguna key={id} id={id} aksi={aksi} onAksi={(x) => void navigate({ search: { aksi: x } })} />;
    },
});

/** P-65 Role & Permission (FR-02.2, UX §6 `/role`; PR-01-20). `disimpan` = umpan balik sesudah P-66 menyimpan. */
const roleRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/role",
    beforeLoad: butuhIzin("role.view"),
    validateSearch: z.object({ disimpan: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined) }),
    component: function RouteRole() {
        const { disimpan } = roleRoute.useSearch();
        const navigate = useNavigate();
        return <HalamanRole disimpan={disimpan} onBuka={(id) => void navigate({ to: "/role/$id", params: { id } })} />;
    },
});

/** P-66 Matriks Permission (FR-02.2, UX §6 `/role/{id}`; PR-01-20): dibaca `role.view`, diubah `role.update`. */
const matriksRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/role/$id",
    beforeLoad: async (a) => {
        if (!/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" });
        await butuhIzin("role.view")(a);
    },
    component: function RouteMatriks() {
        const { id } = matriksRoute.useParams();
        const navigate = useNavigate();
        return <HalamanMatriksPermission key={id} id={id} onSimpan={(x) => void navigate({ to: "/role", search: { disimpan: x } })} onBatal={() => void navigate({ to: "/role", search: {} })} />;
    },
});

/** P-70 Parameter Sistem (FR-20.1, UX §6 `/pengaturan`; PR-01-24): kelompok aktif di `?kelompok=`. */
const parameterRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/pengaturan",
    beforeLoad: butuhIzin("setting.view"),
    validateSearch: z.object({ kelompok: z.catch(z.optional(z.enum(KELOMPOK_PARAMETER)), undefined) }),
    component: function RouteParameter() {
        const { kelompok } = parameterRoute.useSearch();
        const navigate = useNavigate({ from: parameterRoute.fullPath });
        return <HalamanParameter kelompok={kelompok ?? KELOMPOK_PARAMETER[0]} onKelompok={(k) => void navigate({ search: { kelompok: k } })} />;
    },
});

/** P-71 Kalender Akademik (Lampiran E.2, UX §6; PR-01-24): terbaca `setting.view`, diubah `setting.manage`. */
const kalenderAkademikRoute = createRoute({ getParentRoute: () => shellRoute, path: "/pengaturan/kalender-akademik", beforeLoad: butuhIzin("setting.view"), component: HalamanKalenderAkademik });

/** P-72 Unit Kerja (Lampiran E.3, UX §6; PR-01-24): saringan jenis/status dan halaman di URL. */
const unitKerjaRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/pengaturan/unit-kerja",
    beforeLoad: butuhIzin("setting.view"),
    validateSearch: z.object({
        jenis: z.catch(z.optional(z.enum(JENIS_UNIT)), undefined),
        status: z.catch(z.optional(z.enum(STATUS_UNIT)), undefined),
        page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(2))), undefined),
    }),
    component: function RouteUnitKerja() {
        const saringan = unitKerjaRoute.useSearch();
        const navigate = useNavigate({ from: unitKerjaRoute.fullPath });
        return <HalamanUnitKerja saringan={saringan} onSaringan={(s) => void navigate({ search: { ...saringan, ...s } })} />;
    },
});

const tanggalWib = z.catch(z.optional(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/))), undefined);
const teksSaring = z.catch(z.optional(z.string().check(z.minLength(1), z.maxLength(100))), undefined);
const idSaring = z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined);

/**
 * P-73 Activity Log (FR-18.2, UX §6 `/activity-log`; PR-01-25). Saringan di URL; alias `filter[aksi]` (drill-down
 * dashboard UX §8.3, satu nilai) dan `entitas`/`entitas_id` (tombol Riwayat Perubahan pada detail entitas, FR-18.2 A2).
 */
const activityLogRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/activity-log",
    beforeLoad: butuhIzin("activity_log.view"),
    validateSearch: z.object({
        dari: tanggalWib,
        sampai: tanggalWib,
        user: idSaring,
        role: teksSaring,
        modul: teksSaring,
        aksi: teksSaring,
        "filter[aksi]": teksSaring,
        entitas: teksSaring,
        entitas_id: idSaring,
        page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(2))), undefined),
        snap: z.catch(z.optional(z.iso.datetime({ offset: true })), undefined),
    }),
    component: function RouteActivityLog() {
        const cari = activityLogRoute.useSearch();
        const navigate = useNavigate({ from: activityLogRoute.fullPath });
        const saringan = { dari: cari.dari, sampai: cari.sampai, user: cari.user, role: cari.role, modul: cari.modul, aksi: cari.aksi ?? cari["filter[aksi]"], entitas: cari.entitas, entitas_id: cari.entitas_id, page: cari.page, snap: cari.snap };
        return <HalamanActivityLog saringan={saringan} onSaringan={(s) => void navigate({ search: { ...saringan, ...s } })} />;
    },
});

/** P-74 Detail Entri Log (FR-18.2 langkah 4, UX §6 `/activity-log/{id}`; PR-01-25). */
const detailLogRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/activity-log/$id",
    beforeLoad: async (a) => {
        if (!/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" });
        await butuhIzin("activity_log.view")(a);
    },
    validateSearch: z.object({ kembali: z.catch(z.optional(z.string().check(z.maxLength(2000))), undefined) }),
    component: function RouteDetailLog() {
        const { id } = detailLogRoute.useParams();
        const { kembali } = detailLogRoute.useSearch();
        return <HalamanDetailLog key={id} id={id} kembali={kembali} />;
    },
});

const lokasiRoute = createRoute({
    getParentRoute: () => shellRoute, path: "/lokasi", beforeLoad: butuhIzin("location.view"),
    validateSearch: z.object({ q: z.catch(z.optional(z.coerce.string()), undefined), status: z.catch(z.optional(z.enum(["AKTIF", "NONAKTIF"])), undefined) }),
    component: function LokasiRoute() {
        const s = lokasiRoute.useSearch(); const navigate = useNavigate({ from: lokasiRoute.fullPath });
        return <HalamanLokasi q={s.q ?? ""} status={s.status ?? ""} onSearch={(q, status) => void navigate({ search: { q: q || undefined, status: status === "AKTIF" || status === "NONAKTIF" ? status : undefined } })} />;
    },
});
const ruanganRoute = createRoute({
    getParentRoute: () => shellRoute, path: "/lokasi/ruangan/$id",
    beforeLoad: async (a) => { await butuhIzin("location.view")(a); if (!/^[1-9]\d*$/.test(a.params.id)) throw redirect({ to: "/tidak-ditemukan" }); },
    validateSearch: z.object({ q: z.catch(z.optional(z.coerce.string().check(z.maxLength(200))), undefined), kategori: z.catch(z.optional(z.coerce.string().check(z.regex(/^[1-9]\d*$/))), undefined), kondisi: z.catch(z.optional(z.enum(KONDISI)), undefined), status: z.catch(z.optional(z.enum(STATUS)), undefined), page: z.catch(z.optional(z.coerce.number().check(z.int(), z.minimum(1))), undefined), tab: z.catch(z.optional(z.enum(["aset", "jadwal"])), undefined) }),
    component: function RuanganRoute() {
        const { tab, ...filters } = ruanganRoute.useSearch(); const { id } = ruanganRoute.useParams(); const navigate = useNavigate({ from: ruanganRoute.fullPath });
        return <HalamanDetailRuangan id={id} filters={filters} tab={tab ?? "aset"} onFilters={(f) => void navigate({ search: { ...f, kondisi: KONDISI.find((k) => k === f.kondisi), status: STATUS.find((s) => s === f.status), tab } })} onTab={(t) => void navigate({ search: { ...filters, tab: t } })} />;
    },
});

export const routeTree = rootRoute.addChildren([
    loginRoute,
    verifikasiDuaFaktorRoute,
    aktivasiDuaFaktorRoute,
    gantiPasswordRoute,
    gangguanRoute,
    tidakDitemukanRoute,
    publikAsetRoute,
    shellRoute.addChildren([lokasiRoute, ruanganRoute, dashboardRoute, parameterRoute, kalenderAkademikRoute, unitKerjaRoute, activityLogRoute, detailLogRoute, penggunaRoute, tambahPenggunaRoute, imporPenggunaRoute, kenaikanKelasRoute, detailPenggunaRoute, roleRoute, matriksRoute, daftarKerusakanRoute, laporKerusakanRoute, detailKerusakanRoute, inventarisRoute, detailAsetRoute, riwayatAsetRoute, tambahAsetRoute, ubahAsetRoute, kategoriAsetRoute, labelQrRoute, scanRoute, approvalRulesRoute, editorAturanRoute, assetImportRoute, assetMovementRoute, kalenderRuanganRoute, wizardReservasiRoute, daftarReservasiRoute, detailReservasiRoute, pusatNotifikasiRoute, preferensiNotifikasiRoute, persetujuanSayaRoute, detailKeputusanRoute, tanpaAksesRoute, dataTidakTersediaRoute]),
]);

export function buatRouter(queryClient: QueryClient, history?: RouterHistory) {
    return createRouter({ routeTree, context: { queryClient }, defaultPreload: false, ...(history === undefined ? {} : { history }) });
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof buatRouter>;
    }
}
