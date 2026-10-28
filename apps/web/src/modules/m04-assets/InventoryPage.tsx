// P-15 Inventaris Aset (UX §6, §7.1 A, §7.4; FR-04.2 langkah 2–4, A1, A2; PR-02-45). Seluruh saringan,
// urutan, dan halaman hidup di URL (SDD-FE-10) dan tampil sebagai chip yang dapat dihapus (31.3). Tabel
// C-15: kepala melekat, urut lewat kepala kolom (ikon + `aria-sort`), klik baris membuka P-18, kartu di
// bawah 48rem. Ekspor melalui worker PR-02-47 mengikuti izin finansial server (BR-073).
// Pemilihan massal mengikuti P-24 (log phase-02 §3).

import { useQuery } from "@tanstack/react-query";
import { ReportExportPanel } from "../m16-analytics";
import { Link, useNavigate } from "@tanstack/react-router";
import { LABEL_KONDISI_ASET, LABEL_STATUS_ASET } from "@sigm4/schemas";
import { useState } from "react";
import type { ReactNode } from "react";
import { useCan } from "../../shared/auth";
import { jalurTerdaftar } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Ikon } from "../../shared/ui/icon";
import { Isian, Lencana, Pilihan, Tombol, gabung } from "../../shared/ui/primitives";
import type { ItemKatalog, Kondisi, SaringanKatalog, StatusAset, Urutan } from "./katalog";
import { KONDISI, STATUS, VARIAN_KONDISI, VARIAN_STATUS, kategoriQuery, katalogQuery, ruanganQuery } from "./katalog";

const TH = "sticky top-0 h-header-table bg-surface-subtle px-4 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";
const ANGKA = new Intl.NumberFormat("id-ID");

type Kolom = "kode_barang" | "nama" | "tahun_perolehan";

function KepalaUrut({ label, kolom, urut, onUrut }: { readonly label: string; readonly kolom: Kolom; readonly urut: Urutan; readonly onUrut: (u: Urutan) => void }) {
    const aktif = urut.replace("-", "") === kolom;
    const turun = urut.startsWith("-");
    return (
        <th scope="col" className={TH} aria-sort={aktif ? (turun ? "descending" : "ascending") : "none"}>
            <button type="button" onClick={() => onUrut(aktif && !turun ? `-${kolom}` : kolom)} className="inline-flex items-center gap-1 font-medium text-text-primary hover:text-text-link">
                {label}
                <span aria-hidden className={gabung(aktif ? "text-text-primary" : "text-text-secondary", aktif && !turun && "rotate-180")}>
                    <Ikon nama="chevron" ukuran="sm" />
                </span>
            </button>
        </th>
    );
}

export default function InventoryPage({ pencarian, onPencarian }: { readonly pencarian: SaringanKatalog; readonly onPencarian: (p: Partial<SaringanKatalog>) => void }) {
    const can = useCan();
    const navigate = useNavigate();
    const kueri = useQuery(katalogQuery(pencarian));
    const kategori = useQuery(kategoriQuery);
    const ruangan = useQuery({ ...ruanganQuery, enabled: can("location.view") });
    const [kata, setKata] = useState(pencarian.q ?? "");
    const page = pencarian.page ?? 1;
    const urut = pencarian.urut ?? "kode_barang";
    const ubah = (p: Partial<SaringanKatalog>) => onPencarian({ ...p, page: undefined });
    const buka = (a: ItemKatalog) => void navigate({ to: "/aset/$id", params: { id: a.id } });

    const chip: { readonly label: string; readonly hapus: Partial<SaringanKatalog> }[] = [
        ...(pencarian.q === undefined ? [] : [{ label: `Kata kunci: ${pencarian.q}`, hapus: { q: undefined } }]),
        ...(pencarian.kategori === undefined ? [] : [{ label: `Kategori: ${kategori.data?.find((k) => k.id === pencarian.kategori)?.nama ?? pencarian.kategori}`, hapus: { kategori: undefined } }]),
        ...(pencarian.lokasi === undefined ? [] : [{ label: `Lokasi: ${ruangan.data?.find((r) => r.id === pencarian.lokasi)?.nama ?? pencarian.lokasi}`, hapus: { lokasi: undefined } }]),
        ...(pencarian.kondisi === undefined ? [] : [{ label: `Kondisi: ${LABEL_KONDISI_ASET[pencarian.kondisi]}`, hapus: { kondisi: undefined } }]),
        ...(pencarian.status === undefined ? [] : [{ label: `Status: ${LABEL_STATUS_ASET[pencarian.status]}`, hapus: { status: undefined } }]),
        ...(pencarian.tahun === undefined ? [] : [{ label: `Tahun: ${String(pencarian.tahun)}`, hapus: { tahun: undefined } }]),
        ...(pencarian.pinjam === undefined ? [] : [{ label: pencarian.pinjam ? "Dapat dipinjam" : "Tidak dapat dipinjam", hapus: { pinjam: undefined } }]),
        ...(pencarian.impor === undefined ? [] : [{ label: `Hasil impor #${String(pencarian.impor)}`, hapus: { impor: undefined } }]),
    ];
    const semuaKosong: Partial<SaringanKatalog> = { q: undefined, kategori: undefined, lokasi: undefined, kondisi: undefined, status: undefined, tahun: undefined, pinjam: undefined, impor: undefined, page: undefined };

    const kosong: ReactNode = (
        <KeadaanKosong
            judul={chip.length > 0 ? "Tidak ada aset yang cocok" : "Belum ada aset terdaftar"}
            pesan={chip.length > 0 ? "Ubah atau hapus saringan untuk melihat aset lain." : "Aset yang didaftarkan atau diimpor akan muncul di sini."}
            aksi={
                chip.length > 0 ? (
                    <Tombol varian="secondary" onClick={() => onPencarian({ ...semuaKosong })}>
                        Hapus saringan
                    </Tombol>
                ) : undefined
            }
        />
    );

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-text-heading">Inventaris Aset</h1>
                    <p className="text-base text-text-secondary">Katalog seluruh unit aset beserta kondisi dan statusnya.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {can("asset.create") && jalurTerdaftar("/aset/impor") && (
                        <Link to="/aset/impor" className="inline-flex min-h-control-md items-center rounded-md border border-border-strong px-4 text-base font-medium text-text-primary hover:bg-neutral-50">
                            Impor Aset
                        </Link>
                    )}
                    {can("asset.create") && jalurTerdaftar("/aset/baru") && (
                        <a href="/aset/baru" className="inline-flex min-h-control-md items-center rounded-md bg-teal-600 px-4 text-base font-medium text-text-inverse hover:bg-teal-700">
                            Tambah Aset
                        </a>
                    )}
                </div>
            </header>

            <section aria-label="Saringan aset" className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-default p-4">
                <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        ubah({ q: kata.trim() === "" ? undefined : kata.trim() });
                    }}
                >
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                        <Isian label="Cari kode aset, nama, merek, atau nomor seri" type="search" value={kata} onChange={(e) => setKata(e.target.value)} />
                    </div>
                    <Tombol type="submit" varian="secondary">
                        Cari
                    </Tombol>
                </form>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Pilihan label="Kategori" kosong="Semua kategori" value={pencarian.kategori ?? ""} opsi={(kategori.data ?? []).map((k) => ({ nilai: k.id, label: k.nama }))} onChange={(e) => ubah({ kategori: e.target.value === "" ? undefined : e.target.value })} />
                    {can("location.view") && <Pilihan label="Lokasi" kosong="Semua lokasi" value={pencarian.lokasi ?? ""} opsi={(ruangan.data ?? []).map((r) => ({ nilai: r.id, label: r.nama }))} onChange={(e) => ubah({ lokasi: e.target.value === "" ? undefined : e.target.value })} />}
                    <Pilihan label="Kondisi" kosong="Semua kondisi" value={pencarian.kondisi ?? ""} opsi={KONDISI.map((k) => ({ nilai: k, label: LABEL_KONDISI_ASET[k] }))} onChange={(e) => ubah({ kondisi: e.target.value === "" ? undefined : (e.target.value as Kondisi) })} />
                    <Pilihan label="Status" kosong="Semua status" value={pencarian.status ?? ""} opsi={STATUS.map((s) => ({ nilai: s, label: LABEL_STATUS_ASET[s] }))} onChange={(e) => ubah({ status: e.target.value === "" ? undefined : (e.target.value as StatusAset) })} />
                    <Isian label="Tahun perolehan" type="number" inputMode="numeric" value={pencarian.tahun ?? ""} onChange={(e) => ubah({ tahun: /^\d{4}$/.test(e.target.value) ? Number(e.target.value) : undefined })} />
                    <Pilihan
                        label="Kelayakan pinjam"
                        kosong="Semua"
                        value={pencarian.pinjam === undefined ? "" : String(pencarian.pinjam)}
                        opsi={[
                            { nilai: "true", label: "Dapat dipinjam" },
                            { nilai: "false", label: "Tidak dapat dipinjam" },
                        ]}
                        onChange={(e) => ubah({ pinjam: e.target.value === "" ? undefined : e.target.value === "true" })}
                    />
                </div>
                {chip.length > 0 && (
                    <ul aria-label="Saringan aktif" className="flex flex-wrap items-center gap-2">
                        {chip.map((c) => (
                            <li key={c.label}>
                                <button type="button" onClick={() => ubah(c.hapus)} className="inline-flex min-h-touch items-center gap-1 rounded-full bg-neutral-100 px-3 text-sm text-neutral-700 hover:bg-neutral-200" aria-label={`Hapus saringan ${c.label}`}>
                                    {c.label}
                                    <Ikon nama="tutup" ukuran="sm" />
                                </button>
                            </li>
                        ))}
                        <li>
                            <Tombol varian="tertiary" onClick={() => onPencarian({ ...semuaKosong })}>
                                Hapus semua
                            </Tombol>
                        </li>
                    </ul>
                )}
            </section>

            <ReportExportPanel path="/assets/export" jenis="assets" exportId={pencarian.ekspor} filter={{
                q: pencarian.q, sort: pencarian.urut ?? "kode_barang", kategori_id: pencarian.kategori, lokasi_id: pencarian.lokasi,
                kondisi: pencarian.kondisi, status: pencarian.status, tahun_perolehan: pencarian.tahun,
                dapat_dipinjam: pencarian.pinjam, import_job_id: pencarian.impor,
            }} />

            {kueri.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat inventaris aset" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : (
                <>
                    <div className="hidden max-h-screen overflow-auto border border-border-subtle bg-surface-default md:block">
                        <table className="w-full border-collapse">
                            <caption className="sr-only">Inventaris aset</caption>
                            <thead>
                                <tr>
                                    <KepalaUrut label="Kode Aset" kolom="kode_barang" urut={urut} onUrut={(u) => ubah({ urut: u === "kode_barang" ? undefined : u })} />
                                    <KepalaUrut label="Nama" kolom="nama" urut={urut} onUrut={(u) => ubah({ urut: u })} />
                                    {["Kategori", "Lokasi"].map((k) => (
                                        <th key={k} scope="col" className={TH}>
                                            {k}
                                        </th>
                                    ))}
                                    <KepalaUrut label="Tahun" kolom="tahun_perolehan" urut={urut} onUrut={(u) => ubah({ urut: u })} />
                                    {["Kondisi", "Status"].map((k) => (
                                        <th key={k} scope="col" className={TH}>
                                            {k}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {kueri.data.data.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className={TD}>
                                            {kosong}
                                        </td>
                                    </tr>
                                ) : (
                                    kueri.data.data.map((a) => (
                                        <tr key={a.id} className="h-row cursor-pointer hover:bg-neutral-50" onClick={() => buka(a)}>
                                            <th scope="row" className={`${TD} text-left font-medium`}>
                                                <Link to="/aset/$id" params={{ id: a.id }} className="font-mono text-text-link hover:text-text-link-hover" onClick={(e) => e.stopPropagation()}>
                                                    {a.kode_barang}
                                                </Link>
                                            </th>
                                            <td className={TD}>
                                                {a.nama}
                                                {a.merek !== null && <span className="block text-sm text-text-secondary">{a.merek}</span>}
                                            </td>
                                            <td className={TD}>{a.kategori_nama}</td>
                                            <td className={TD}>
                                                {a.lokasi.ruang}
                                                <span className="block text-sm text-text-secondary">{a.lokasi.gedung}</span>
                                            </td>
                                            <td className={`${TD} tabular-nums`}>{a.tahun_perolehan}</td>
                                            <td className={TD}>
                                                <Lencana varian={VARIAN_KONDISI[a.kondisi]}>{LABEL_KONDISI_ASET[a.kondisi]}</Lencana>
                                            </td>
                                            <td className={TD}>
                                                <Lencana varian={VARIAN_STATUS[a.status]}>{LABEL_STATUS_ASET[a.status]}</Lencana>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="md:hidden">
                        {kueri.data.data.length === 0 ? (
                            kosong
                        ) : (
                            <ul aria-label="Inventaris aset" className="flex flex-col gap-2">
                                {kueri.data.data.map((a) => (
                                    <li key={a.id}>
                                        <Link
                                            to="/aset/$id"
                                            params={{ id: a.id }}
                                            aria-label={`${a.kode_barang}, ${a.nama}, ${LABEL_KONDISI_ASET[a.kondisi]}, ${LABEL_STATUS_ASET[a.status]}`}
                                            className="flex min-h-row-mobile flex-col gap-1 border border-border-subtle bg-surface-default p-3 hover:bg-neutral-50"
                                        >
                                            <span className="flex items-start justify-between gap-2">
                                                <span className="font-mono font-medium text-text-link">{a.kode_barang}</span>
                                                <Lencana varian={VARIAN_STATUS[a.status]}>{LABEL_STATUS_ASET[a.status]}</Lencana>
                                            </span>
                                            <span className="text-base text-text-primary">{a.nama}</span>
                                            <span className="text-sm text-text-secondary">
                                                {LABEL_KONDISI_ASET[a.kondisi]} · {a.lokasi.ruang}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {kueri.data.meta.total > 0 && (
                        <nav aria-label="Halaman inventaris" className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-secondary tabular-nums">
                            <p>
                                Menampilkan {ANGKA.format((page - 1) * (pencarian.per ?? 25) + 1)}–{ANGKA.format((page - 1) * (pencarian.per ?? 25) + kueri.data.data.length)} dari {ANGKA.format(kueri.data.meta.total)}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <Tombol varian="secondary" disabled={page <= 1} onClick={() => onPencarian({ page: page - 1 === 1 ? undefined : page - 1 })}>
                                    Sebelumnya
                                </Tombol>
                                <span>
                                    Halaman {page} dari {kueri.data.meta.total_pages}
                                </span>
                                <Tombol varian="secondary" disabled={page >= kueri.data.meta.total_pages} onClick={() => onPencarian({ page: page + 1 })}>
                                    Berikutnya
                                </Tombol>
                            </div>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}
