// P-37 Persetujuan Saya (UX §6, §7.4; FR-10.2 langkah 2; PR-02-44). Kotak masuk lintas jenis
// pengajuan — hanya langkah wewenang pemanggil (server, FR-10.2 AC 2), terurut tenggat SLA lalu
// waktu pengajuan. Urgensi = sisa SLA dalam jam kerja (keputusan 92d); terlambat = lencana galat.
// Halaman di URL (SDD-FE-10). Delegasi ditunda (keputusan 92e).

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LABEL_JENIS_PENGAJUAN, labelEnum } from "@sigm4/schemas";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Lencana, Peringatan, Tombol } from "../../shared/ui/primitives";
import { waktuWib } from "./linimasa";
import type { ItemPending } from "./persetujuan";
import { labelPengajuan, pendingQuery, teksSisaSla } from "./persetujuan";

const TH = "sticky top-0 h-header-table bg-surface-subtle px-4 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";

function Urgensi({ p }: { readonly p: ItemPending }) {
    if (p.sla === null) return <Lencana varian="neutral">Tanpa tenggat</Lencana>;
    return <Lencana varian={p.sla.terlambat ? "error" : "neutral"}>{teksSisaSla(p.sla)}</Lencana>;
}

export default function ApprovalInboxPage({ page, diputuskan, onPage }: { readonly page: number; readonly diputuskan?: string | undefined; readonly onPage: (page: number) => void }) {
    const kueri = useQuery(pendingQuery(page));
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-text-heading">Persetujuan Saya</h1>
                <p className="text-base text-text-secondary">Pengajuan yang menunggu keputusan Anda, paling mendesak lebih dulu. Sisa SLA dihitung dalam jam kerja; waktu dalam WIB.</p>
            </header>
            {diputuskan !== undefined && <Peringatan varian="success">Keputusan atas {diputuskan} tersimpan.</Peringatan>}

            {kueri.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat pengajuan yang menunggu" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : kueri.data.data.length === 0 ? (
                <KeadaanKosong judul="Tidak ada pengajuan yang menunggu" pesan="Pengajuan baru yang menjadi wewenang Anda akan muncul di sini dan diberitahukan lewat notifikasi." />
            ) : (
                <>
                    <div className="hidden overflow-auto border border-border-subtle bg-surface-default md:block">
                        <table className="w-full border-collapse">
                            <caption className="sr-only">Pengajuan menunggu keputusan, tenggat SLA terdekat lebih dulu</caption>
                            <thead>
                                <tr>
                                    {["Pengajuan", "Jenis", "Pemohon", "Diajukan", "Sisa SLA"].map((k) => (
                                        <th key={k} scope="col" className={TH}>
                                            {k}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {kueri.data.data.map((p) => (
                                    <tr key={p.instance_id} className="h-row">
                                        <th scope="row" className={`${TD} text-left font-medium`}>
                                            <Link to="/persetujuan/$id" params={{ id: String(p.instance_id) }} className="text-text-link hover:text-text-link-hover">
                                                {labelPengajuan(p.jenis_pengajuan, p.referensi_id)}
                                            </Link>
                                            <span className="block text-sm font-regular text-text-secondary">
                                                Langkah {p.urutan}
                                                {p.atas_nama_user_id !== null && " · sebagai pengganti (delegasi)"}
                                            </span>
                                        </th>
                                        <td className={TD}>{labelEnum(LABEL_JENIS_PENGAJUAN, p.jenis_pengajuan)}</td>
                                        <td className={TD}>{p.pemohon.nama ?? "—"}</td>
                                        <td className={TD}>{waktuWib(p.created_at)}</td>
                                        <td className={TD}>
                                            <Urgensi p={p} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* < 48rem: kartu per baris, seluruh kartu satu target ketuk (C-15). */}
                    <ul aria-label="Pengajuan menunggu keputusan" className="flex flex-col gap-2 md:hidden">
                        {kueri.data.data.map((p) => (
                            <li key={p.instance_id}>
                                <Link
                                    to="/persetujuan/$id"
                                    params={{ id: String(p.instance_id) }}
                                    aria-label={`${labelPengajuan(p.jenis_pengajuan, p.referensi_id)}, ${p.pemohon.nama ?? "pemohon"}, ${p.sla === null ? "tanpa tenggat" : teksSisaSla(p.sla)}`}
                                    className="flex min-h-row-mobile flex-col gap-1 border border-border-subtle bg-surface-default p-3 hover:bg-neutral-50"
                                >
                                    <span className="flex items-start justify-between gap-2">
                                        <span className="font-medium text-text-link">{labelPengajuan(p.jenis_pengajuan, p.referensi_id)}</span>
                                        <Urgensi p={p} />
                                    </span>
                                    <span className="text-sm text-text-secondary">
                                        {p.pemohon.nama ?? "—"} · {waktuWib(p.created_at)}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    {kueri.data.meta.total_pages > 1 && (
                        <nav aria-label="Halaman persetujuan" className="flex items-center justify-between gap-3 text-sm text-text-secondary tabular-nums">
                            <Tombol varian="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                                Sebelumnya
                            </Tombol>
                            <p>
                                Halaman {page} dari {kueri.data.meta.total_pages}
                            </p>
                            <Tombol varian="secondary" disabled={page >= kueri.data.meta.total_pages} onClick={() => onPage(page + 1)}>
                                Berikutnya
                            </Tombol>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}
