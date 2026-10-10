// P-30 Daftar Reservasi (UX §6, §7.4; FR-07.3 langkah 1; PR-03-27, keputusan 17 log phase-03).
// Satu baris per pengajuan; scope ditegakkan server (Siswa/OSIS hanya miliknya). Tabel lokal yang
// memenuhi spesifikasi C-15 (ekstraksi menjadi komponen bersama menunggu pemakai kedua, log §10):
// sudut tegas, kepala 48px melekat, baris 44px, urut lewat kepala kolom (ikon + `aria-sort`), klik
// baris membuka detail, kosong di dalam badan tabel, kartu per baris 48px di bawah 48rem, dan
// saringan/urutan/halaman/ukuran halaman di URL (SDD-FE-10).

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { STATUS_RESERVASI } from "@sigm4/schemas";
import type { ReservationListItem, ReservationListQuery, StatusReservasi } from "@sigm4/schemas";
import { useState } from "react";
import type { ReactNode } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Ikon } from "../../shared/ui/icon";
import { Isian, KotakCentang, Lencana, Pilihan, Tombol, gabung } from "../../shared/ui/primitives";
import { daftarReservasiQuery } from "./api";
import { jamWib, tanggalPendek, tanggalWib } from "./kalender";
import { LABEL_STATUS_RESERVASI, VARIAN_STATUS_RESERVASI } from "./status";

export const UKURAN_HALAMAN = [25, 50, 100] as const;
export type UkuranHalaman = (typeof UKURAN_HALAMAN)[number];

export interface PencarianDaftar {
    readonly q?: string | undefined;
    readonly status?: StatusReservasi | undefined;
    readonly saya?: true | undefined;
    readonly dari?: string | undefined;
    readonly sampai?: string | undefined;
    /** Bawaan: tanggal pengajuan terbaru. */
    readonly urut?: "mulai" | undefined;
    readonly page?: number | undefined;
    /** Bawaan 25 (C-15) — hanya ukuran lain yang tercatat di URL. */
    readonly per?: Exclude<UkuranHalaman, 25> | undefined;
}

const TH = "sticky top-0 h-header-table bg-surface-subtle px-4 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";
const ANGKA = new Intl.NumberFormat("id-ID");

const jadwal = (r: ReservationListItem) => `${tanggalPendek(tanggalWib(new Date(r.waktu_mulai)))}, ${jamWib(r.waktu_mulai)}–${jamWib(r.waktu_selesai)} WIB`;
const diajukan = (r: ReservationListItem) => `${tanggalPendek(tanggalWib(new Date(r.diajukan_pada)))}, ${jamWib(r.diajukan_pada)} WIB`;

/** Kepala kolom yang dapat diurutkan: tombol + ikon arah, `aria-sort` pada `<th>` (C-15). Hanya urut menurun yang tersedia. */
function KepalaUrut({ label, aktif, onUrut }: { readonly label: string; readonly aktif: boolean; readonly onUrut: () => void }) {
    return (
        <th scope="col" className={TH} aria-sort={aktif ? "descending" : "none"}>
            <button type="button" onClick={onUrut} className="inline-flex items-center gap-1 font-medium text-text-primary hover:text-text-link">
                {label}
                <span aria-hidden className={gabung(aktif ? "text-text-primary" : "text-text-secondary")}>
                    <Ikon nama="chevron" ukuran="sm" />
                </span>
                <span className="sr-only">{aktif ? ", diurutkan terbaru lebih dulu" : ", urutkan terbaru lebih dulu"}</span>
            </button>
        </th>
    );
}

/** Nomor halaman berjendela: 1 … sekitar halaman kini … terakhir. */
export function halamanTampil(kini: number, total: number): readonly (number | "…")[] {
    const set = new Set([1, total, kini - 1, kini, kini + 1].filter((n) => n >= 1 && n <= total));
    const urut = [...set].sort((a, b) => a - b);
    return urut.flatMap((n, i) => (i > 0 && n - (urut[i - 1] ?? n) > 1 ? (["…", n] as const) : [n]));
}

export default function ReservationListPage({ pencarian, onPencarian }: { readonly pencarian: PencarianDaftar; readonly onPencarian: (p: Partial<PencarianDaftar>) => void }) {
    const can = useCan();
    const navigate = useNavigate();
    const page = pencarian.page ?? 1;
    const perHalaman = pencarian.per ?? 25;
    const query: ReservationListQuery = {
        page,
        per_page: perHalaman,
        urut: pencarian.urut ?? "diajukan",
        ...(pencarian.q === undefined ? {} : { q: pencarian.q }),
        ...(pencarian.status === undefined ? {} : { status: pencarian.status }),
        ...(pencarian.saya === true ? { pemohon: "saya" as const } : {}),
        ...(pencarian.dari === undefined ? {} : { dari: pencarian.dari }),
        ...(pencarian.sampai === undefined ? {} : { sampai: pencarian.sampai }),
    };
    const kueri = useQuery(daftarReservasiQuery(query));
    // Kata kunci dikirim saat formulir dikirim, bukan per ketukan.
    const [kata, setKata] = useState(pencarian.q ?? "");
    const tersaring = pencarian.q !== undefined || pencarian.status !== undefined || pencarian.saya === true || pencarian.dari !== undefined || pencarian.sampai !== undefined;
    const ubah = (p: Partial<PencarianDaftar>) => onPencarian({ ...p, page: undefined });
    const buka = (r: ReservationListItem) => void navigate({ to: "/reservasi/$id", params: { id: r.id } });

    const kosong: ReactNode = (
        <KeadaanKosong
            judul={tersaring ? "Tidak ada reservasi yang cocok" : "Belum ada pengajuan reservasi"}
            pesan={tersaring ? "Ubah atau hapus saringan untuk melihat pengajuan lain." : "Pengajuan muncul di sini setelah diajukan dari Kalender Ruangan."}
            aksi={
                tersaring ? (
                    <Tombol varian="secondary" onClick={() => onPencarian({ q: undefined, status: undefined, saya: undefined, dari: undefined, sampai: undefined, page: undefined })}>
                        Hapus saringan
                    </Tombol>
                ) : (
                    <Link to="/kalender-ruangan" className="text-text-link hover:text-text-link-hover">
                        Buka Kalender Ruangan
                    </Link>
                )
            }
        />
    );

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-text-heading">Daftar Reservasi</h1>
                    <p className="text-base text-text-secondary">Pengajuan reservasi ruangan beserta statusnya. Seluruh waktu dalam WIB.</p>
                </div>
                {can("reservation.create") && (
                    <Link to="/reservasi/baru" className="inline-flex min-h-control-md items-center rounded-md bg-teal-600 px-4 text-base font-medium text-text-inverse hover:bg-teal-700">
                        Ajukan reservasi
                    </Link>
                )}
            </header>

            <section aria-label="Saringan reservasi" className="grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-2">
                <form
                    className="flex items-end gap-2 md:col-span-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        ubah({ q: kata.trim() === "" ? undefined : kata.trim() });
                    }}
                >
                    <div className="flex-1">
                        <Isian label="Cari nomor pengajuan atau nama kegiatan" type="search" value={kata} onChange={(e) => setKata(e.target.value)} />
                    </div>
                    <Tombol type="submit" varian="secondary">
                        Cari
                    </Tombol>
                </form>
                <Pilihan
                    label="Status"
                    kosong="Semua status"
                    value={pencarian.status ?? ""}
                    opsi={STATUS_RESERVASI.filter((s) => s !== "DRAF").map((s) => ({ nilai: s, label: LABEL_STATUS_RESERVASI[s] }))}
                    onChange={(e) => ubah({ status: e.target.value === "" ? undefined : (e.target.value as StatusReservasi) })}
                />
                <div className="flex items-end">
                    <KotakCentang label="Hanya pengajuan saya" checked={pencarian.saya === true} onCheckedChange={(v) => ubah({ saya: v ? true : undefined })} />
                </div>
                <Isian label="Dari tanggal" type="date" value={pencarian.dari ?? ""} onChange={(e) => ubah({ dari: e.target.value === "" ? undefined : e.target.value })} />
                <Isian label="Sampai tanggal" type="date" value={pencarian.sampai ?? ""} onChange={(e) => ubah({ sampai: e.target.value === "" ? undefined : e.target.value })} />
            </section>

            {kueri.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat daftar reservasi" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : (
                <>
                    {/* Tabel lebar menggulir di dalam wadahnya sendiri (NFR-C-02); sudut tegas (C-15). */}
                    <div className="hidden max-h-screen overflow-auto border border-border-subtle bg-surface-default md:block">
                        <table className="w-full border-collapse">
                            <caption className="sr-only">Pengajuan reservasi, {pencarian.urut === "mulai" ? "urut waktu mulai terbaru" : "urut tanggal pengajuan terbaru"}</caption>
                            <thead>
                                <tr>
                                    {["Nomor", "Kegiatan", "Ruangan"].map((k) => (
                                        <th key={k} scope="col" className={TH}>
                                            {k}
                                        </th>
                                    ))}
                                    <KepalaUrut label="Jadwal" aktif={pencarian.urut === "mulai"} onUrut={() => onPencarian({ urut: "mulai", page: undefined })} />
                                    <KepalaUrut label="Diajukan" aktif={pencarian.urut !== "mulai"} onUrut={() => onPencarian({ urut: undefined, page: undefined })} />
                                    {["Pemohon", "Status"].map((k) => (
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
                                    kueri.data.data.map((r) => (
                                        // Klik baris membuka detail; nomor adalah tautan (jalur papan ketik).
                                        <tr key={r.id} className="h-row cursor-pointer hover:bg-neutral-50" onClick={() => buka(r)}>
                                            <th scope="row" className={`${TD} text-left font-medium`}>
                                                <Link to="/reservasi/$id" params={{ id: r.id }} className="text-text-link hover:text-text-link-hover" onClick={(e) => e.stopPropagation()}>
                                                    {r.nomor}
                                                </Link>
                                            </th>
                                            <td className={TD}>{r.nama_kegiatan ?? "—"}</td>
                                            <td className={TD}>{r.ruangan?.nama ?? "—"}</td>
                                            <td className={TD}>
                                                {jadwal(r)}
                                                {r.jumlah_tanggal > 0 && <span className="block text-sm text-text-secondary">Berulang · {r.jumlah_tanggal} tanggal</span>}
                                            </td>
                                            <td className={TD}>{diajukan(r)}</td>
                                            <td className={TD}>{r.pemohon.nama}</td>
                                            <td className={TD}>
                                                <Lencana varian={VARIAN_STATUS_RESERVASI[r.status]}>{LABEL_STATUS_RESERVASI[r.status]}</Lencana>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* < 48rem: kartu per baris, 3–4 field terpenting, seluruh kartu satu target ketuk ≥ 48px (C-15). */}
                    <div className="md:hidden">
                        {kueri.data.data.length === 0 ? (
                            kosong
                        ) : (
                            <ul aria-label="Pengajuan reservasi" className="flex flex-col gap-2">
                                {kueri.data.data.map((r) => (
                                    <li key={r.id}>
                                        <Link
                                            to="/reservasi/$id"
                                            params={{ id: r.id }}
                                            aria-label={`${r.nomor}, ${LABEL_STATUS_RESERVASI[r.status]}, ${r.nama_kegiatan ?? "tanpa nama kegiatan"}, ${jadwal(r)}`}
                                            className="flex min-h-row-mobile flex-col gap-1 border border-border-subtle bg-surface-default p-3 hover:bg-neutral-50"
                                        >
                                            <span className="flex items-start justify-between gap-2">
                                                <span className="font-medium text-text-link">{r.nomor}</span>
                                                <Lencana varian={VARIAN_STATUS_RESERVASI[r.status]}>{LABEL_STATUS_RESERVASI[r.status]}</Lencana>
                                            </span>
                                            <span className="text-base text-text-primary">{r.nama_kegiatan ?? "—"}</span>
                                            <span className="text-sm text-text-secondary">{jadwal(r)}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {kueri.data.meta.total > 0 && (
                        <nav aria-label="Halaman daftar reservasi" className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-secondary tabular-nums">
                            <p>
                                Menampilkan {ANGKA.format((page - 1) * perHalaman + 1)}–{ANGKA.format((page - 1) * perHalaman + kueri.data.data.length)} dari {ANGKA.format(kueri.data.meta.total)}
                            </p>
                            <div className="flex flex-wrap items-center gap-1">
                                <Tombol varian="secondary" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => onPencarian({ page: page - 1 === 1 ? undefined : page - 1 })}>
                                    ‹
                                </Tombol>
                                {halamanTampil(page, kueri.data.meta.total_pages).map((n, i) =>
                                    n === "…" ? (
                                        <span key={`elipsis-${String(i)}`} aria-hidden className="px-2">
                                            …
                                        </span>
                                    ) : (
                                        <Tombol key={n} varian={n === page ? "primary" : "tertiary"} aria-label={`Halaman ${String(n)}`} aria-current={n === page ? "page" : undefined} onClick={() => onPencarian({ page: n === 1 ? undefined : n })}>
                                            {String(n)}
                                        </Tombol>
                                    ),
                                )}
                                <Tombol varian="secondary" aria-label="Halaman berikutnya" disabled={page >= kueri.data.meta.total_pages} onClick={() => onPencarian({ page: page + 1 })}>
                                    ›
                                </Tombol>
                            </div>
                            <div className="w-40">
                                <Pilihan
                                    label="Baris per halaman"
                                    value={String(perHalaman)}
                                    opsi={UKURAN_HALAMAN.map((n) => ({ nilai: String(n), label: String(n) }))}
                                    onChange={(e) => onPencarian({ per: Number(e.target.value) === 25 ? undefined : (Number(e.target.value) as Exclude<UkuranHalaman, 25>), page: undefined })}
                                />
                            </div>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}
