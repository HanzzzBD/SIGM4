// Perakitan halaman (SDD-11 §4.1): route → komponen modul/keadaan. P-08…P-11 adalah
// halaman keadaan global (UX §6.2, §7.3): setiap layar galat selalu kembali ke Dashboard,
// bukan berhenti (UX-05, UX §5.6).

import { Link } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import type { ReactNode } from "react";
import { AktivasiDuaFaktorPage, GantiPasswordPage, LoginPage, VerifikasiDuaFaktorPage } from "../modules/m01-auth";
import type { AlasanLogin } from "../modules/m01-auth";
import { muatApprovalRulesPage, muatEditorAturanPage } from "../modules/m10-approval";
import { muatDashboardPage } from "../modules/m15-dashboard";
import { loadAssetImportPage, loadAssetMovementPage } from "../modules/m04-assets";
import { loadReservationDetailPage, loadReservationListPage, loadReservationWizardPage, loadRoomBlocksPanel, loadRoomCalendarPage } from "../modules/m07-reservation-room";
import type { IsianWizard, PencarianDaftar, PencarianKalender, PilihanSlot, ReservasiSlot } from "../modules/m07-reservation-room";
import type { ReservationDetail, RoomReservationCreated } from "@sigm4/schemas";
import type { Rentang } from "../modules/m15-dashboard";
import { KeadaanKosong, KeadaanMemuat, KeadaanTanpaAkses } from "../shared/states";
import { Ikon } from "../shared/ui/icon";

const keDashboard = (
    <Link to="/" className="inline-flex min-h-control-md items-center rounded-md border border-border-strong px-4 text-base font-medium text-text-primary hover:bg-neutral-50">
        Kembali ke Dashboard
    </Link>
);

function Tunggal({ children }: { readonly children: ReactNode }) {
    return <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4">{children}</main>;
}

export const HalamanLogin = ({ tujuan, alasan }: { readonly tujuan?: string | undefined; readonly alasan?: AlasanLogin | undefined }) => <LoginPage tujuan={tujuan} alasan={alasan} />;

type Tujuan = { readonly tujuan?: string | undefined };
/** P-02, P-03, P-05 — alur masuk di luar shell (F-01, F-03). */
export const HalamanVerifikasiDuaFaktor = ({ tujuan }: Tujuan) => <VerifikasiDuaFaktorPage tujuan={tujuan} />;
export const HalamanAktivasiDuaFaktor = ({ tujuan }: Tujuan) => <AktivasiDuaFaktorPage tujuan={tujuan} />;
export const HalamanGantiPassword = ({ tujuan }: Tujuan) => <GantiPasswordPage tujuan={tujuan} />;

const DashboardPage = lazy(muatDashboardPage);
const AssetImportPage = lazy(loadAssetImportPage);
const AssetMovementPage = lazy(loadAssetMovementPage);
const RoomCalendarPage = lazy(loadRoomCalendarPage);
const ReservationWizardPage = lazy(loadReservationWizardPage);
const ReservationListPage = lazy(loadReservationListPage);
const ReservationDetailPage = lazy(loadReservationDetailPage);
const RoomBlocksPanel = lazy(loadRoomBlocksPanel);
/** P-27 (FR-07.1). `aksiPilihan` = jalan ke wizard P-29 bagi pemegang `reservation.create` (PR-03-10). */
export const HalamanKalenderRuangan = (props: {
    readonly pencarian: PencarianKalender;
    readonly onPencarian: (p: Partial<PencarianKalender>) => void;
    readonly aksiPilihan?: ((p: PilihanSlot) => ReactNode) | undefined;
    /** UX §7.6.1: slot terisi → P-31 bila berhak (PR-03-27). */
    readonly tautanReservasi?: ((r: ReservasiSlot) => ReactNode) | undefined;
    /** Aksi sekunder P-27 + panelnya (FR-07.5, PR-03-13) — dirender di atas kalender. */
    readonly aksiSekunder?: ReactNode;
    readonly panel?: ReactNode;
}) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat kalender ruangan" baris={6} />}>
        {props.aksiSekunder !== undefined && <div className="mb-4 flex justify-end">{props.aksiSekunder}</div>}
        {props.panel !== undefined && <div className="mb-6">{props.panel}</div>}
        <RoomCalendarPage
            pencarian={props.pencarian}
            onPencarian={props.onPencarian}
            {...(props.aksiPilihan === undefined ? {} : { aksiPilihan: props.aksiPilihan })}
            {...(props.tautanReservasi === undefined ? {} : { tautanReservasi: props.tautanReservasi })}
        />
    </Suspense>
);
/** P-29 Wizard Pengajuan Reservasi (FR-07.2, UX §7.6.2). */
export const HalamanWizardReservasi = (props: { readonly isianAwal: IsianWizard; readonly onBatal: () => void; readonly onKalender: (tanggal: string) => void; readonly onTerbentuk?: (h: RoomReservationCreated) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat formulir reservasi" baris={6} />}>
        <ReservationWizardPage {...props} />
    </Suspense>
);
/** Panel blokade ruangan — aksi sekunder P-27 (FR-07.5, PR-03-13). */
export const HalamanPanelBlokade = (props: { readonly roomId: string | null; readonly onRuangan: (id: string) => void; readonly onTutup: () => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat blokade ruangan" baris={4} />}>
        <RoomBlocksPanel {...props} />
    </Suspense>
);
/** P-30 Daftar Reservasi (FR-07.3, UX §7.4; PR-03-27). */
export const HalamanDaftarReservasi = (props: { readonly pencarian: PencarianDaftar; readonly onPencarian: (p: Partial<PencarianDaftar>) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat daftar reservasi" baris={6} />}>
        <ReservationListPage {...props} />
    </Suspense>
);
/** P-31 Detail Reservasi (FR-07.3, FR-07.4, FR-10.3; PR-03-27). */
export const HalamanDetailReservasi = (props: { readonly id: string; readonly terkirim: boolean; readonly onUlang: (d: ReservationDetail) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat detail reservasi" baris={8} />}>
        <ReservationDetailPage {...props} />
    </Suspense>
);
export const HalamanMutasiAset = (props: { readonly documentId: number | null; readonly onDocument: (id: number | null) => void }) => <Suspense fallback={<KeadaanMemuat label="Memuat mutasi aset" baris={4} />}><AssetMovementPage {...props} /></Suspense>;
export const HalamanImporAset = (props: { readonly jobId: number | null; readonly onJob: (id: number) => void }) => <Suspense fallback={<KeadaanMemuat label="Memuat impor aset" baris={4} />}><AssetImportPage {...props} /></Suspense>;

/** Dimuat malas (SDD-11 §4.7): skeleton seketika selama bundel halaman diunduh. */
export const HalamanDashboard = ({ rentang, onRentang }: { readonly rentang: Rentang; readonly onRentang: (r: Rentang) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat dashboard" baris={6} />}>
        <DashboardPage rentang={rentang} onRentang={onRentang} />
    </Suspense>
);

const ApprovalRulesPage = lazy(muatApprovalRulesPage);
const EditorAturanPage = lazy(muatEditorAturanPage);

/** P-68 Approval Rules (FR-10.1). */
export const HalamanApprovalRules = ({ disimpan }: { readonly disimpan?: number | undefined }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat approval rule" baris={6} />}>
        <ApprovalRulesPage disimpan={disimpan} />
    </Suspense>
);

/** P-69 Editor Approval Rule — `id` null = aturan baru (FR-10.1, RE-07). */
export const HalamanEditorAturan = ({ id }: { readonly id: number | null }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat editor approval rule" baris={8} />}>
        <EditorAturanPage id={id} />
    </Suspense>
);

/** P-08 — tidak mengonfirmasi keberadaan data (SDD-AUTH-08). */
export const HalamanTanpaAkses = () => <KeadaanTanpaAkses aksi={keDashboard} />;

/** P-09 — objek rujukan sudah dihapus/dibatalkan (FR-17.1 A1). */
export const HalamanDataTidakTersedia = () => <KeadaanKosong judul="Data tidak lagi tersedia" pesan="Data yang Anda tuju sudah dihapus atau dibatalkan." aksi={keDashboard} />;

/** P-10 — gangguan server; `request_id` tampil di keadaan galat tempat kejadiannya (NFR-R-10). */
export const HalamanGangguan = () => (
    <Tunggal>
        <KeadaanKosong
            judul="Sistem sedang mengalami gangguan"
            pesan="Permintaan Anda belum dapat diproses. Coba lagi beberapa saat lagi."
            aksi={
                <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-control-md items-center gap-2 rounded-md bg-teal-600 px-4 text-base font-medium text-text-inverse hover:bg-teal-700">
                    <Ikon nama="muatUlang" />
                    Coba lagi
                </button>
            }
        />
    </Tunggal>
);

/** P-11 — route tidak dikenali. */
export const HalamanTidakDitemukan = () => (
    <Tunggal>
        <KeadaanKosong judul="Halaman tidak ditemukan" pesan="Alamat yang Anda buka tidak dikenali. Periksa kembali tautannya." aksi={keDashboard} />
    </Tunggal>
);
