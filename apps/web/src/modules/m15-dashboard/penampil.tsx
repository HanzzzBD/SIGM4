// Penampil isi per kartu (Bab 19.2–19.7; C-23). Bentuk `isi` ditetapkan SDD-14 §4.3a.
// Enum dirender lewat peta label (SDD-FE-08); waktu selalu WIB (CAL-UI-09); angka
// tabular (FOUNDATIONS §2.1).

import { LABEL_JENIS_PENGAJUAN, LABEL_KONDISI_ASET, LABEL_STATUS_ASET, LABEL_STATUS_INSTANCE_APPROVAL, labelEnum } from "@sigm4/schemas";
import type { ReactNode } from "react";
import { GrafikBatang, GrafikDonat, GrafikGaris } from "../../shared/ui/charts";
import type { Titik } from "../../shared/ui/charts";
import { Lencana } from "../../shared/ui/primitives";

type Isi = Record<string, unknown>;
const angka = new Intl.NumberFormat("id-ID");
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
export const waktuWib = (iso: string): string =>
    `${new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))} WIB`;

function Angka({ nilai, label }: { readonly nilai: number; readonly label?: string }) {
    return (
        <p className="flex flex-col">
            <span className="text-3xl font-semibold tabular-nums text-text-heading">{angka.format(nilai)}</span>
            {label !== undefined && <span className="text-sm text-text-secondary">{label}</span>}
        </p>
    );
}

function Rincian({ baris }: { readonly baris: readonly { readonly label: string; readonly nilai: ReactNode }[] }) {
    return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {baris.map((b) => (
                <div key={b.label} className="contents">
                    <dt className="text-text-secondary">{b.label}</dt>
                    <dd className="text-right font-medium tabular-nums text-text-primary">{b.nilai}</dd>
                </div>
            ))}
        </dl>
    );
}

function Daftar({ baris }: { readonly baris: readonly { readonly kunci: string; readonly utama: string; readonly meta: string }[] }) {
    if (baris.length === 0) return <p className="text-sm text-text-secondary">Tidak ada yang menunggu tindakan Anda hari ini.</p>;
    return (
        <ul className="flex flex-col divide-y divide-border-subtle">
            {baris.map((b) => (
                <li key={b.kunci} className="flex flex-col py-2">
                    <span className="text-base text-text-primary">{b.utama}</span>
                    <span className="text-sm text-text-secondary">{b.meta}</span>
                </li>
            ))}
        </ul>
    );
}

const dariPeta = (peta: Isi | undefined, label: Readonly<Record<string, string>>): Titik[] => Object.entries(label).map(([kode, l]) => ({ label: l, nilai: Number(peta?.[kode] ?? 0) }));
const antrean = (i: Isi, fn: (x: Isi) => { kunci: string; utama: string; meta: string }) => (
    <div className="flex flex-col gap-3">
        <Angka nilai={Number(i["jumlah"] ?? 0)} label="menunggu" />
        <Daftar baris={((i["daftar"] as Isi[] | undefined) ?? []).map(fn)} />
    </div>
);
const menunggu = (i: Isi) =>
    antrean(i, (x) => ({ kunci: String(x["instance_id"]), utama: labelEnum(LABEL_JENIS_PENGAJUAN, String(x["jenis_pengajuan"])), meta: `${String((x["pemohon"] as Isi | undefined)?.["nama"] ?? "")} · ${waktuWib(String(x["created_at"]))}` }));

/** id kartu → penampil. Kartu yang tidak dikenal versi ini ditampilkan dengan penjelasan, bukan disembunyikan. */
export const PENAMPIL: Readonly<Record<string, (isi: Isi, judul: string) => ReactNode>> = {
    "permintaan-reset-password": (i) => antrean(i, (x) => ({ kunci: String(x["id"]), utama: String(x["nama"]), meta: `Diminta ${waktuWib(String(x["diminta_pada"]))}` })),
    "status-konfigurasi": (i) => {
        const kurang = (i["kekurangan"] as Isi[] | undefined) ?? [];
        const aktif = (i["aturan_aktif"] as Isi[] | undefined) ?? [];
        const tanpa = (i["jenis_tanpa_aturan"] as string[] | undefined) ?? [];
        return (
            <div className="flex flex-col gap-3">
                {kurang.length === 0 ? <Lencana varian="success">Konfigurasi dasar lengkap</Lencana> : kurang.map((k) => <Lencana key={String(k["pesan"])} varian="warning">{String(k["pesan"])}</Lencana>)}
                <Rincian baris={[...aktif.map((a) => ({ label: labelEnum(LABEL_JENIS_PENGAJUAN, String(a["jenis"])), nilai: `${angka.format(Number(a["jumlah"]))} aturan aktif` })), ...tanpa.map((j) => ({ label: labelEnum(LABEL_JENIS_PENGAJUAN, j), nilai: "aturan bawaan" }))]} />
            </div>
        );
    },
    "kesehatan-integrasi": (i) => {
        const fcm = i["fcm"] as Isi | null | undefined;
        const s = fcm?.["status"];
        return (
            <Rincian
                baris={[{ label: "Notifikasi push (FCM)", nilai: s === "up" ? <Lencana varian="success">Tersedia</Lencana> : s === "degraded" ? <Lencana varian="warning">Terbatas</Lencana> : s === "down" ? <Lencana varian="error">Gangguan</Lencana> : <Lencana varian="neutral">Tidak diperiksa</Lencana> }]}
            />
        );
    },
    "efek-tertunda-gagal": (i) => antrean(i, (x) => ({ kunci: String(x["id"]), utama: String(x["event_name"]), meta: `${waktuWib(String(x["occurred_at"]))} · ${String(x["last_error"] ?? "")}` })),
    "pengguna-aktif": (i) => (
        <div className="flex flex-col gap-3">
            <Angka nilai={Number(i["total"] ?? 0)} label="akun aktif" />
            <Rincian baris={((i["per_role"] as Isi[] | undefined) ?? []).map((r) => ({ label: String(r["nama"]), nilai: angka.format(Number(r["jumlah"])) }))} />
        </div>
    ),
    "login-hari-ini": (i) => <Rincian baris={[{ label: "Berhasil (24 jam)", nilai: angka.format(Number(i["sukses"] ?? 0)) }, { label: "Gagal (24 jam)", nilai: angka.format(Number(i["gagal"] ?? 0)) }]} />,
    "distribusi-role": (i, j) => <GrafikDonat judul={j} kolom="Role" data={((i["per_role"] as Isi[] | undefined) ?? []).map((r) => ({ label: String(r["nama"]), nilai: Number(r["jumlah"]) }))} />,
    "aktivitas-sistem": (i, j) => <GrafikGaris judul={j} kolom="Tanggal" data={((i["per_hari"] as Isi[] | undefined) ?? []).map((r) => ({ label: String(r["tanggal"]), nilai: Number(r["jumlah"]) }))} />,
    "aktivitas-terbaru": (i) => (
        <Daftar baris={((i["entri"] as Isi[] | undefined) ?? []).map((x, n) => ({ kunci: String(n), utama: `${String(x["aksi"])} · ${String(x["entitas"] ?? x["modul"])}`, meta: `${String(x["user_nama"] ?? "Sistem")} · ${waktuWib(String(x["waktu"]))}` }))} />
    ),
    "pengajuan-menunggu": menunggu,
    "menunggu-persetujuan-saya": menunggu,
    "aset-belum-berlabel-qr": (i) => <Angka nilai={Number(i["jumlah"] ?? 0)} label="aset belum berlabel QR" />,
    "total-aset": (i) => <Angka nilai={Number(i["total"] ?? 0)} label="unit aset aktif" />,
    "komposisi-kondisi-aset": (i, j) => <GrafikDonat judul={j} kolom="Kondisi" data={dariPeta(i["kondisi"] as Isi, LABEL_KONDISI_ASET)} />,
    "kondisi-aset": (i, j) => <GrafikDonat judul={j} kolom="Kondisi" data={dariPeta(i["kondisi"] as Isi, LABEL_KONDISI_ASET)} />,
    "status-aset": (i, j) => <GrafikBatang judul={j} kolom="Status" data={dariPeta(i["status"] as Isi, LABEL_STATUS_ASET)} />,
    "ringkasan-aset": (i) => (
        <div className="flex flex-col gap-3">
            <Angka nilai={Number(i["total"] ?? 0)} label="unit aset aktif" />
            <Rincian baris={[{ label: "Total nilai perolehan", nilai: rupiah.format(Number(i["total_nilai"] ?? 0)) }]} />
        </div>
    ),
    "pengajuan-saya": (i) => <Rincian baris={dariPeta(i["per_status"] as Isi, LABEL_STATUS_INSTANCE_APPROVAL).map((t) => ({ label: t.label, nilai: angka.format(t.nilai) }))} />,
};

/** Efek Tertunda Gagal tidak dirender bila jumlahnya nol (19.2, SDD-EVT-10). */
export const sembunyikan = (id: string, isi: Isi): boolean => id === "efek-tertunda-gagal" && Number(isi["jumlah"] ?? 0) === 0;
