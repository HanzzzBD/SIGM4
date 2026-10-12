// Perakitan halaman (SDD-11 §4.1): route → komponen modul/keadaan. P-08…P-11 adalah
// halaman keadaan global (UX §6.2, §7.3): setiap layar galat selalu kembali ke Dashboard,
// bukan berhenti (UX-05, UX §5.6).

import { Link } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { loadLocationTreePage, loadRoomDetailPage } from "../modules/m03-locations";
import type { Filters as LocationFilters } from "../modules/m03-locations";
import type { ReactNode } from "react";
import { AktivasiDuaFaktorPage, GantiPasswordPage, LoginPage, VerifikasiDuaFaktorPage } from "../modules/m01-auth";
import type { AlasanLogin } from "../modules/m01-auth";
import { muatApprovalInboxPage, muatApprovalRulesPage, muatDecisionPage, muatEditorAturanPage } from "../modules/m10-approval";
import { muatDashboardPage } from "../modules/m15-dashboard";
import { loadDamageDetailPage, loadDamageListPage, loadDamageReportPage } from "../modules/m11-damage-reports";
import { loadCalendarPage, loadParameterPage, loadWorkUnitPage } from "../modules/m20-settings";
import type { Kelompok, SaringanUnit } from "../modules/m20-settings";
import { loadActivityLogDetailPage, loadActivityLogPage } from "../modules/m18-activity-log";
import type { SaringanLog } from "../modules/m18-activity-log";
import { loadClassPromotionPage, loadUserCreatePage, loadUserDetailPage, loadUserImportPage, loadUserListPage, loadRoleListPage, loadRolePermissionPage } from "../modules/m02-users";
import type { AksiPengguna, SaringanPengguna } from "../modules/m02-users";
import type { AwalLaporan, PencarianKerusakan } from "../modules/m11-damage-reports";
import { loadLabelQrPage, loadPublicAssetPage, loadScanPage } from "../modules/m05-qr";
import { loadNotificationCenterPage, loadPreferencesPage } from "../modules/m17-notifications";
import type { PencarianNotifikasi } from "../modules/m17-notifications";
import { loadAddAssetPage, loadAssetDetailPage, loadAssetImportPage, loadAssetMovementPage, loadCategoryPage, loadEditAssetPage, loadInventoryPage } from "../modules/m04-assets";
import type { SaringanKatalog, TabAset } from "../modules/m04-assets";
import { RingkasanReservasi, loadReservationDetailPage, loadReservationListPage, loadReservationWizardPage, loadRoomBlocksPanel, loadRoomCalendarPage } from "../modules/m07-reservation-room";
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
const LocationTreePage = lazy(loadLocationTreePage);
const RoomDetailPage = lazy(loadRoomDetailPage);
export const HalamanLokasi = (props: { readonly q: string; readonly status: string; readonly onSearch: (q: string, status: string) => void }) => <Suspense fallback={<KeadaanMemuat label="Memuat lokasi" />}><LocationTreePage {...props} /></Suspense>;
export const HalamanDetailRuangan = (props: { readonly id: string; readonly filters: LocationFilters; readonly tab: "aset" | "jadwal"; readonly onFilters: (f: LocationFilters) => void; readonly onTab: (t: "aset" | "jadwal") => void }) => <Suspense fallback={<KeadaanMemuat label="Memuat ruangan" />}><RoomDetailPage {...props} /></Suspense>;
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
const PublicAssetPage = lazy(loadPublicAssetPage);
const LabelQrPage = lazy(loadLabelQrPage);
const ScanPage = lazy(loadScanPage);
/** P-06 Halaman Publik Aset (FR-05.2 A3; PR-03-28) — di luar shell, tanpa sesi. */
export const HalamanPublikAset = ({ uuid }: { readonly uuid: string }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat informasi aset" baris={5} />}>
        <PublicAssetPage uuid={uuid} />
    </Suspense>
);
/** P-24 Label QR (FR-05.1; PR-03-28). */
export const HalamanLabelQr = ({ awal, belum }: { readonly awal: readonly string[]; readonly belum?: boolean | undefined }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat label QR" baris={6} />}>
        <LabelQrPage awal={awal} belum={belum ?? false} />
    </Suspense>
);
/** P-25 Scan QR web (FR-05.2; PR-03-28). */
export const HalamanScanQr = ({ onBuka }: { readonly onBuka: (assetId: string) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat pemindai" baris={4} />}>
        <ScanPage onBuka={onBuka} />
    </Suspense>
);
const InventoryPage = lazy(loadInventoryPage);
const AssetDetailPage = lazy(loadAssetDetailPage);
/** P-15 Inventaris Aset (FR-04.2; PR-02-45). */
export const HalamanInventaris = (props: { readonly pencarian: SaringanKatalog; readonly onPencarian: (p: Partial<SaringanKatalog>) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat inventaris aset" baris={6} />}>
        <InventoryPage {...props} />
    </Suspense>
);
/** P-18 Detail Aset (FR-04.2 langkah 5; PR-02-45). */
export const HalamanDetailAset = (props: { readonly id: string; readonly tab: TabAset; readonly riwayatPage: number; readonly onRiwayatPage: (p: number) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat detail aset" baris={8} />}>
        <AssetDetailPage {...props} />
    </Suspense>
);
const AddAssetPage = lazy(loadAddAssetPage);
const EditAssetPage = lazy(loadEditAssetPage);
const CategoryPage = lazy(loadCategoryPage);
/** P-16 Tambah Aset (FR-04.1; PR-02-46). */
export const HalamanTambahAset = ({ initialRoom }: { readonly initialRoom?: string | undefined }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat formulir aset" baris={6} />}>
        <AddAssetPage initialRoom={initialRoom} />
    </Suspense>
);
/** P-19 Ubah Aset (FR-04.3; PR-02-46). */
export const HalamanUbahAset = (props: { readonly id: string; readonly onSelesai: () => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat data aset" baris={6} />}>
        <EditAssetPage {...props} />
    </Suspense>
);
/** P-21 Kategori Aset (FR-04.5; PR-02-46). */
export const HalamanKategoriAset = () => (
    <Suspense fallback={<KeadaanMemuat label="Memuat kategori aset" baris={6} />}>
        <CategoryPage />
    </Suspense>
);
const UserListPage = lazy(loadUserListPage);
const UserCreatePage = lazy(loadUserCreatePage);
const UserImportPage = lazy(loadUserImportPage);
const UserDetailPage = lazy(loadUserDetailPage);
const ClassPromotionPage = lazy(loadClassPromotionPage);
/** P-60 Pengguna (FR-02.1; PR-01-19). */
export const HalamanPengguna = (props: { readonly saringan: SaringanPengguna; readonly onSaringan: (s: Partial<SaringanPengguna>) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat pengguna" baris={6} />}>
        <UserListPage {...props} />
    </Suspense>
);
/** P-61 Tambah Pengguna (FR-02.1; PR-01-19). */
export const HalamanTambahPengguna = (props: { readonly onDibuat: (id: string) => void; readonly onBatal: () => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat formulir pengguna" baris={6} />}>
        <UserCreatePage {...props} />
    </Suspense>
);
/** P-62 Impor Pengguna (FR-02.1 A4; PR-01-19). */
export const HalamanImporPengguna = (props: { readonly jobId: number | null; readonly onJob: (id: number) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat impor pengguna" baris={4} />}>
        <UserImportPage {...props} />
    </Suspense>
);
/** P-63 Detail Pengguna (FR-02.1; PR-01-19). */
export const HalamanDetailPengguna = (props: { readonly id: string; readonly aksi?: AksiPengguna | undefined; readonly onAksi: (a: AksiPengguna | undefined) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat pengguna" baris={8} />}>
        <UserDetailPage {...props} />
    </Suspense>
);
/** P-64 Kenaikan Kelas Massal (SL-02; PR-01-19). */
export const HalamanKenaikanKelas = () => (
    <Suspense fallback={<KeadaanMemuat label="Memuat kenaikan kelas" baris={6} />}>
        <ClassPromotionPage />
    </Suspense>
);
const RoleListPage = lazy(loadRoleListPage);
const RolePermissionPage = lazy(loadRolePermissionPage);
/** P-65 Role & Permission (FR-02.2; PR-01-20). */
export const HalamanRole = (props: { readonly disimpan?: string | undefined; readonly onBuka: (id: string) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat role" baris={6} />}>
        <RoleListPage {...props} />
    </Suspense>
);
/** P-66 Matriks Permission (FR-02.2; PR-01-20). */
export const HalamanMatriksPermission = (props: { readonly id: string; readonly onSimpan: (id: string) => void; readonly onBatal: () => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat matriks permission" baris={8} />}>
        <RolePermissionPage {...props} />
    </Suspense>
);
const ParameterPage = lazy(loadParameterPage);
const CalendarPage = lazy(loadCalendarPage);
const WorkUnitPage = lazy(loadWorkUnitPage);
/** P-70 Parameter Sistem (FR-20.1; PR-01-24). */
export const HalamanParameter = (props: { readonly kelompok: Kelompok; readonly onKelompok: (k: Kelompok) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat parameter sistem" baris={6} />}>
        <ParameterPage {...props} />
    </Suspense>
);
/** P-71 Kalender Akademik (Lampiran E.2; PR-01-24). */
export const HalamanKalenderAkademik = () => (
    <Suspense fallback={<KeadaanMemuat label="Memuat kalender akademik" baris={6} />}>
        <CalendarPage />
    </Suspense>
);
/** P-72 Unit Kerja (Lampiran E.3; PR-01-24). */
export const HalamanUnitKerja = (props: { readonly saringan: SaringanUnit; readonly onSaringan: (s: Partial<SaringanUnit>) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat unit kerja" baris={6} />}>
        <WorkUnitPage {...props} />
    </Suspense>
);
const ActivityLogPage = lazy(loadActivityLogPage);
const ActivityLogDetailPage = lazy(loadActivityLogDetailPage);
/** P-73 Activity Log (FR-18.2; PR-01-25). */
export const HalamanActivityLog = (props: { readonly saringan: SaringanLog; readonly onSaringan: (s: Partial<SaringanLog>) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat activity log" baris={8} />}>
        <ActivityLogPage {...props} />
    </Suspense>
);
/** P-74 Detail Entri Log (FR-18.2 langkah 4; PR-01-25). */
export const HalamanDetailLog = (props: { readonly id: string; readonly kembali?: string | undefined }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat entri log" baris={8} />}>
        <ActivityLogDetailPage {...props} />
    </Suspense>
);
const DamageListPage = lazy(loadDamageListPage);
const DamageReportPage = lazy(loadDamageReportPage);
const DamageDetailPage = lazy(loadDamageDetailPage);
/** P-39 Laporan Kerusakan (FR-11.3; PR-03-32). */
export const HalamanDaftarKerusakan = (props: { readonly pencarian: PencarianKerusakan; readonly onPencarian: (p: Partial<PencarianKerusakan>) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat laporan kerusakan" baris={6} />}>
        <DamageListPage {...props} />
    </Suspense>
);
/** P-40 Lapor Kerusakan (FR-11.1; PR-03-32). */
export const HalamanLaporKerusakan = (props: { readonly awal: AwalLaporan; readonly onSelesai: (id: string) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat formulir laporan" baris={6} />}>
        <DamageReportPage {...props} />
    </Suspense>
);
/** P-41 Detail Tiket Kerusakan (FR-11.2; PR-03-32). */
export const HalamanDetailKerusakan = (props: { readonly id: string; readonly aksi?: "verifikasi" | undefined; readonly onAksi: (a: "verifikasi" | undefined) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat laporan kerusakan" baris={8} />}>
        <DamageDetailPage {...props} />
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

const NotificationCenterPage = lazy(loadNotificationCenterPage);
const PreferencesPage = lazy(loadPreferencesPage);
/** P-13 Pusat Notifikasi (FR-17.1; PR-02-43). */
export const HalamanPusatNotifikasi = (props: { readonly pencarian: PencarianNotifikasi; readonly onPencarian: (p: Partial<PencarianNotifikasi>) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat notifikasi" baris={6} />}>
        <NotificationCenterPage {...props} />
    </Suspense>
);
/** P-78 Preferensi Notifikasi (FR-17.3; PR-02-43). */
export const HalamanPreferensiNotifikasi = () => (
    <Suspense fallback={<KeadaanMemuat label="Memuat preferensi notifikasi" baris={6} />}>
        <PreferencesPage />
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

const ApprovalInboxPage = lazy(muatApprovalInboxPage);
const DecisionPage = lazy(muatDecisionPage);

/** P-37 Persetujuan Saya (FR-10.2; PR-02-44). */
export const HalamanPersetujuanSaya = (props: { readonly page: number; readonly diputuskan?: string | undefined; readonly onPage: (page: number) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat persetujuan" baris={6} />}>
        <ApprovalInboxPage {...props} />
    </Suspense>
);

/** Konteks objek P-38 per jenis pengajuan (keputusan 92c): hanya reservasi ruangan yang punya modul web kini. */
function konteksPengajuan(jenis: string, referensiId: number): ReactNode {
    if (jenis === "RESERVASI_RUANGAN") return <RingkasanReservasi id={String(referensiId)} />;
    return <p className="text-base text-text-secondary">Rincian objek untuk jenis pengajuan ini belum tersedia.</p>;
}

/** P-38 Detail Keputusan (FR-10.2 langkah 3–7, FR-10.3; PR-02-44). */
export const HalamanDetailKeputusan = (props: { readonly id: number; readonly onSelesai: (label: string) => void }) => (
    <Suspense fallback={<KeadaanMemuat label="Memuat detail pengajuan" baris={8} />}>
        <DecisionPage {...props} konteks={konteksPengajuan} />
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
