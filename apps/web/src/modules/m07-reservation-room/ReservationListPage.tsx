// P-30 Daftar Reservasi (UX §6, §7.4; FR-07.3 langkah 1; PR-03-27, keputusan 17 log phase-03).
// Satu baris per pengajuan; scope ditegakkan server (Siswa/OSIS hanya miliknya). Saringan, urutan,
// dan halaman hidup di URL (C-15, SDD-FE-10). Tabel menjadi kartu per baris di bawah 48rem.

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { STATUS_RESERVASI } from "@sigm4/schemas";
import type { ReservationListItem, ReservationListQuery, StatusReservasi } from "@sigm4/schemas";
import { useState } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Isian, KotakCentang, Lencana, Pilihan, Tombol } from "../../shared/ui/primitives";
import { daftarReservasiQuery } from "./api";
import { jamWib, tanggalPendek, tanggalWib } from "./kalender";
import { LABEL_STATUS_RESERVASI, VARIAN_STATUS_RESERVASI } from "./status";

export interface PencarianDaftar {
    readonly q?: string | undefined;
    readonly status?: StatusReservasi | undefined;
    readonly saya?: true | undefined;
    readonly dari?: string | undefined;
    readonly sampai?: string | undefined;
    /** Bawaan: tanggal pengajuan terbaru. */
    readonly urut?: "mulai" | undefined;
    readonly page?: number | undefined;
}

const PER_HALAMAN = 25;
const TH = "sticky top-0 bg-surface-subtle px-4 py-3 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";

const jadwal = (r: ReservationListItem) => {
    const t = tanggalWib(new Date(r.waktu_mulai));
    return `${tanggalPendek(t)}, ${jamWib(r.waktu_mulai)}–${jamWib(r.waktu_selesai)} WIB`;
};

function Nomor({ r }: { readonly r: ReservationListItem }) {
    return (
        <Link to="/reservasi/$id" params={{ id: r.id }} className="font-medium text-text-link hover:text-text-link-hover">
            {r.nomor}
        </Link>
    );
}

export default function ReservationListPage({ pencarian, onPencarian }: { readonly pencarian: PencarianDaftar; readonly onPencarian: (p: Partial<PencarianDaftar>) => void }) {
    const can = useCan();
    const page = pencarian.page ?? 1;
    const query: ReservationListQuery = {
        page,
        per_page: PER_HALAMAN,
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

            <section aria-label="Saringan reservasi" className="grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-3">
                <form
                    className="flex items-end gap-2 md:col-span-3"
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
                <Isian label="Dari tanggal" type="date" value={pencarian.dari ?? ""} onChange={(e) => ubah({ dari: e.target.value === "" ? undefined : e.target.value })} />
                <Isian label="Sampai tanggal" type="date" value={pencarian.sampai ?? ""} onChange={(e) => ubah({ sampai: e.target.value === "" ? undefined : e.target.value })} />
                <KotakCentang label="Hanya pengajuan saya" checked={pencarian.saya === true} onCheckedChange={(v) => ubah({ saya: v ? true : undefined })} />
                <Pilihan
                    label="Urutkan"
                    value={pencarian.urut ?? "diajukan"}
                    opsi={[
                        { nilai: "diajukan", label: "Tanggal pengajuan terbaru" },
                        { nilai: "mulai", label: "Waktu mulai terbaru" },
                    ]}
                    onChange={(e) => onPencarian({ urut: e.target.value === "mulai" ? "mulai" : undefined, page: undefined })}
                />
            </section>

            {kueri.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat daftar reservasi" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : kueri.data.data.length === 0 ? (
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
            ) : (
                <>
                    <div className="hidden overflow-x-auto rounded-md border border-border-subtle bg-surface-default md:block">
                        <table className="w-full border-collapse">
                            <caption className="sr-only">Pengajuan reservasi, {pencarian.urut === "mulai" ? "urut waktu mulai terbaru" : "urut tanggal pengajuan terbaru"}</caption>
                            <thead>
                                <tr>
                                    {["Nomor", "Kegiatan", "Ruangan", "Jadwal", "Pemohon", "Status"].map((k) => (
                                        <th key={k} scope="col" className={TH} aria-sort={k === "Jadwal" && pencarian.urut === "mulai" ? "descending" : undefined}>
                                            {k}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {kueri.data.data.map((r) => (
                                    <tr key={r.id} className="hover:bg-neutral-50">
                                        <th scope="row" className={`${TD} text-left`}>
                                            <Nomor r={r} />
                                        </th>
                                        <td className={TD}>{r.nama_kegiatan ?? "—"}</td>
                                        <td className={TD}>{r.ruangan?.nama ?? "—"}</td>
                                        <td className={TD}>
                                            {jadwal(r)}
                                            {r.jumlah_tanggal > 0 && <span className="block text-sm text-text-secondary">Berulang · {r.jumlah_tanggal} tanggal</span>}
                                        </td>
                                        <td className={TD}>{r.pemohon.nama}</td>
                                        <td className={TD}>
                                            <Lencana varian={VARIAN_STATUS_RESERVASI[r.status]}>{LABEL_STATUS_RESERVASI[r.status]}</Lencana>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <ul aria-label="Pengajuan reservasi" className="flex flex-col gap-2 md:hidden">
                        {kueri.data.data.map((r) => (
                            <li key={r.id} className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-default p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <Nomor r={r} />
                                    <Lencana varian={VARIAN_STATUS_RESERVASI[r.status]}>{LABEL_STATUS_RESERVASI[r.status]}</Lencana>
                                </div>
                                <p className="text-base text-text-primary">{r.nama_kegiatan ?? "—"}</p>
                                <p className="text-sm text-text-secondary">
                                    {r.ruangan?.nama ?? "—"} · {jadwal(r)}
                                </p>
                            </li>
                        ))}
                    </ul>
                    <nav aria-label="Halaman daftar reservasi" className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-secondary">
                        <p>
                            Menampilkan {(page - 1) * PER_HALAMAN + 1}–{(page - 1) * PER_HALAMAN + kueri.data.data.length} dari {kueri.data.meta.total}
                        </p>
                        <div className="flex gap-2">
                            <Tombol varian="secondary" disabled={page <= 1} onClick={() => onPencarian({ page: page - 1 === 1 ? undefined : page - 1 })}>
                                Sebelumnya
                            </Tombol>
                            <Tombol varian="secondary" disabled={page >= kueri.data.meta.total_pages} onClick={() => onPencarian({ page: page + 1 })}>
                                Berikutnya
                            </Tombol>
                        </div>
                    </nav>
                </>
            )}
        </div>
    );
}
