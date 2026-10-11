// P-18 Detail Aset (UX §6, §7.1 B, §7.6.3; FR-04.2 langkah 5 & A1, BR-073, BR-065d; PR-02-45). Tab di URL
// sebagai segmen (`/aset/{id}` Informasi · `/aset/{id}/riwayat`, UXP-01). Blok finansial hanya dirender
// bila server mengirimnya (SDD-AUTH-06). Tab Foto/Dokumen/Peminjaman/Pemeliharaan dan aksi Ubah/Ubah
// Kondisi/Cetak QR milik PR berikutnya — ditampilkan begitu route-nya terdaftar (`jalurTerdaftar`).

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LABEL_KONDISI_ASET, LABEL_STATUS_ASET } from "@sigm4/schemas";
import type { AssetDetail } from "@sigm4/schemas";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { KodeQr } from "../m01-auth";
import { ApiError } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { jalurTerdaftar } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Lencana, Peringatan, gabung } from "../../shared/ui/primitives";
import { LinimasaAset } from "./LinimasaAset";
import { VARIAN_KONDISI, VARIAN_STATUS, detailAsetQuery, rupiah } from "./katalog";

export type TabAset = "informasi" | "riwayat";

const SUMBER: Record<NonNullable<AssetDetail["sumber_perolehan"]>, string> = {
    PEMBELIAN: "Pembelian",
    HIBAH: "Hibah",
    BANTUAN_PEMERINTAH: "Bantuan Pemerintah",
    SUMBANGAN: "Sumbangan",
    LAINNYA: "Lainnya",
};
const TANGGAL = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long" });

function Baris({ label, children }: { readonly label: string; readonly children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="text-sm font-medium text-text-secondary sm:w-1/3 sm:shrink-0">{label}</dt>
            <dd className="text-base text-text-primary">{children}</dd>
        </div>
    );
}

function Informasi({ d }: { readonly d: AssetDetail }) {
    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
                <section aria-labelledby="judul-identitas" className="flex flex-col gap-3">
                    <h2 id="judul-identitas" className="text-lg font-semibold text-text-primary">
                        Identitas
                    </h2>
                    <dl className="flex flex-col gap-3">
                        <Baris label="Kategori">{d.kategori.nama}</Baris>
                        <Baris label="Merek / model">{[d.merek, d.model].filter(Boolean).join(" · ") || "—"}</Baris>
                        <Baris label="Nomor seri">{d.nomor_seri ?? "—"}</Baris>
                        <Baris label="Lokasi">
                            {d.lokasi.ruang} · {d.lokasi.area} · {d.lokasi.gedung}
                        </Baris>
                        <Baris label="Penanggung jawab">{d.penanggung_jawab?.nama ?? "—"}</Baris>
                        <Baris label="Tahun perolehan">{d.tahun_perolehan}</Baris>
                        <Baris label="Dapat dipinjam">{d.dapat_dipinjam ? (d.boleh_dipinjam_siswa ? "Ya, termasuk oleh siswa" : "Ya, kecuali oleh siswa") : "Tidak"}</Baris>
                    </dl>
                </section>
                {/* BR-073: kunci finansial hanya ada bila pemanggil memegang asset.view_financial. */}
                {d.sumber_perolehan !== undefined && (
                    <section aria-labelledby="judul-perolehan" className="flex flex-col gap-3">
                        <h2 id="judul-perolehan" className="text-lg font-semibold text-text-primary">
                            Perolehan
                        </h2>
                        <dl className="flex flex-col gap-3">
                            <Baris label="Sumber perolehan">{SUMBER[d.sumber_perolehan]}</Baris>
                            <Baris label="Nilai perolehan">{d.nilai_perolehan === null || d.nilai_perolehan === undefined ? "—" : rupiah(d.nilai_perolehan)}</Baris>
                        </dl>
                    </section>
                )}
            </div>
            <section aria-labelledby="judul-qr" className="flex flex-col items-start gap-3">
                <h2 id="judul-qr" className="text-lg font-semibold text-text-primary">
                    QR Code
                </h2>
                <KodeQr isi={d.qr_url} label={`QR Code aset ${d.kode_barang}`} />
                <p className="text-sm text-text-secondary">{d.qr_terpasang ? "Label QR sudah terpasang." : "Label QR belum terpasang."}</p>
            </section>
        </div>
    );
}

export default function AssetDetailPage({ id, tab, riwayatPage, onRiwayatPage }: { readonly id: string; readonly tab: TabAset; readonly riwayatPage: number; readonly onRiwayatPage: (p: number) => void }) {
    const can = useCan();
    const kueri = useQuery(detailAsetQuery(id));
    const judul = useRef<HTMLHeadingElement>(null);
    useEffect(() => judul.current?.focus(), [id]);

    if (kueri.isPending) return <KeadaanMemuat baris={8} label="Memuat detail aset" />;
    if (kueri.isError) {
        // SDD-AUTH-08: tak ada dan di luar scope dijawab sama.
        if (kueri.error instanceof ApiError && kueri.error.status === 404)
            return (
                <KeadaanKosong
                    judul="Aset tidak ditemukan"
                    pesan="Aset ini tidak ada atau tidak dapat Anda lihat."
                    aksi={
                        <Link to="/aset" className="text-text-link hover:text-text-link-hover">
                            Kembali ke Inventaris
                        </Link>
                    }
                />
            );
        return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    }
    const d = kueri.data;
    const aksiTransaksi = !d.dihapuskan;
    const tabKelas = (aktif: boolean) => gabung("inline-flex min-h-touch items-center border-b-2 px-4 text-base font-medium", aktif ? "border-teal-600 text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary");
    return (
        <div className="flex flex-col gap-6">
            <nav aria-label="Jejak halaman" className="text-sm text-text-secondary">
                <Link to="/aset" className="text-text-link hover:text-text-link-hover">
                    Inventaris Aset
                </Link>{" "}
                / {d.kode_barang}
            </nav>
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 ref={judul} tabIndex={-1} className="text-2xl font-semibold text-text-heading outline-none">
                        <span className="font-mono">{d.kode_barang}</span> · {d.nama}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                        <Lencana varian={VARIAN_KONDISI[d.kondisi]}>{LABEL_KONDISI_ASET[d.kondisi]}</Lencana>
                        <Lencana varian={VARIAN_STATUS[d.status]}>{LABEL_STATUS_ASET[d.status]}</Lencana>
                        <span className="text-sm text-text-secondary">
                            {d.kategori.nama} · {d.lokasi.ruang} · Diperoleh {d.tahun_perolehan}
                        </span>
                    </div>
                </div>
                {aksiTransaksi && can("asset.update") && jalurTerdaftar("/aset/mutasi") && (
                    // BR-010: mutasi diblokir saat Dipinjam — tetap terlihat, nonaktif beserta alasannya (UX-05).
                    d.status === "DIPINJAM" ? (
                        <span className="flex flex-col items-end gap-1">
                            <span aria-disabled className="inline-flex min-h-control-md cursor-not-allowed items-center rounded-md border border-border-disabled bg-neutral-100 px-4 text-base font-medium text-text-disabled">
                                Mutasi Lokasi
                            </span>
                            <span className="text-sm text-text-secondary">Aset sedang dipinjam — mutasi menunggu pengembalian.</span>
                        </span>
                    ) : (
                        <Link to="/aset/mutasi" className="inline-flex min-h-control-md items-center rounded-md border border-border-strong px-4 text-base font-medium text-text-primary hover:bg-neutral-50">
                            Mutasi Lokasi
                        </Link>
                    )
                )}
                {/* UX §7.6.3 aksi sekunder: Lapor Kerusakan (P-40, PR-03-32). */}
                {aksiTransaksi && can("damage.create") && jalurTerdaftar("/kerusakan/baru") && (
                    <a href={`/kerusakan/baru?aset=${id}`} className="inline-flex min-h-control-md items-center rounded-md border border-border-strong px-4 text-base font-medium text-text-primary hover:bg-neutral-50">
                        Lapor Kerusakan
                    </a>
                )}
                {/* UX §7.6.3 aksi utama: Ubah (P-19, PR-02-46) · Cetak Label QR (P-24, PR-03-28) — tampil saat route-nya terdaftar. */}
                {aksiTransaksi && can("asset.qr_print") && jalurTerdaftar("/label-qr") && (
                    <a href={`/label-qr?aset=${id}`} className="inline-flex min-h-control-md items-center rounded-md border border-border-strong px-4 text-base font-medium text-text-primary hover:bg-neutral-50">
                        Cetak Label QR
                    </a>
                )}
                {aksiTransaksi && can("asset.update") && jalurTerdaftar(`/aset/${id}/ubah`) && (
                    <a href={`/aset/${id}/ubah`} className="inline-flex min-h-control-md items-center rounded-md bg-teal-600 px-4 text-base font-medium text-text-inverse hover:bg-teal-700">
                        Ubah
                    </a>
                )}
            </header>

            {d.dihapuskan && (
                <Peringatan varian="warning" judul="Aset telah dihapuskan">
                    Dihapuskan {d.tanggal_penghapusan === null ? "" : `pada ${TANGGAL.format(new Date(d.tanggal_penghapusan))}`}. Aksi transaksional tidak tersedia; riwayat tetap dapat dilihat.
                </Peringatan>
            )}

            <nav aria-label="Bagian detail aset" className="flex border-b border-border-subtle">
                <Link to="/aset/$id" params={{ id }} className={tabKelas(tab === "informasi")} aria-current={tab === "informasi" ? "page" : undefined}>
                    Informasi
                </Link>
                <Link to="/aset/$id/riwayat" params={{ id }} className={tabKelas(tab === "riwayat")} aria-current={tab === "riwayat" ? "page" : undefined}>
                    Riwayat
                </Link>
            </nav>
            {tab === "informasi" ? <Informasi d={d} /> : <LinimasaAset id={id} page={riwayatPage} onPage={onRiwayatPage} />}
        </div>
    );
}
