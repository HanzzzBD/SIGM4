// P-06 Halaman Publik Aset (UX §6, PATTERNS §2; FR-05.2 A2/A3, DP-05; PR-03-28). Tanpa autentikasi dan
// tanpa sidebar: logo, profil non-sensitif, ajakan masuk untuk aksi lanjutan. `noindex` dipasang selama
// halaman tampil — label QR permanen tidak boleh membuat aset terindeks mesin pencari.

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LABEL_KONDISI_ASET, LABEL_STATUS_ASET } from "@sigm4/schemas";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../../shared/api";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Logo } from "../../shared/ui/logo";
import { Lencana, Peringatan } from "../../shared/ui/primitives";
import type { Semantik } from "../../shared/ui/primitives";
import { profilPublikQuery } from "./api";

const VARIAN_KONDISI: Record<string, Semantik> = { BAIK: "success", RUSAK_RINGAN: "warning", RUSAK_BERAT: "error", HILANG: "error" };
const VARIAN_STATUS: Record<string, Semantik> = { TERSEDIA: "success", DIRESERVASI: "warning", DIPINJAM: "info", DALAM_PERBAIKAN: "info", TIDAK_TERSEDIA: "error" };

/** Meta `robots: noindex` selama komponen terpasang. */
function useNoIndex(): void {
    useEffect(() => {
        const meta = document.createElement("meta");
        meta.name = "robots";
        meta.content = "noindex, nofollow";
        document.head.appendChild(meta);
        return () => meta.remove();
    }, []);
}

function Baris({ label, children }: { readonly label: string; readonly children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1 border-t border-border-subtle py-3 first:border-t-0 sm:flex-row sm:gap-4">
            <dt className="text-sm font-medium text-text-secondary sm:w-1/3 sm:shrink-0">{label}</dt>
            <dd className="text-base text-text-primary">{children}</dd>
        </div>
    );
}

export default function PublicAssetPage({ uuid }: { readonly uuid: string }) {
    useNoIndex();
    const kueri = useQuery(profilPublikQuery(uuid));
    let isi: ReactNode;
    if (kueri.isPending) isi = <KeadaanMemuat baris={5} label="Memuat informasi aset" />;
    else if (kueri.isError)
        isi =
            kueri.error instanceof ApiError && kueri.error.status === 404 ? (
                // FR-05.2 A1 — termasuk QR lama yang UUID-nya diregenerasi.
                <KeadaanKosong judul="QR tidak dikenali" pesan="Label ini tidak lagi menunjuk aset yang terdaftar. Hubungi petugas sarana prasarana sekolah." />
            ) : (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            );
    else {
        const d = kueri.data;
        isi = (
            <div className="flex flex-col gap-4">
                <h1 className="text-2xl font-semibold text-text-heading">
                    <span className="font-mono">{d.kode_barang}</span> · {d.nama}
                </h1>
                {!d.aktif && <Peringatan varian="warning">Aset tidak aktif — sudah dihapuskan dari inventaris sekolah.</Peringatan>}
                <dl className="flex flex-col rounded-md border border-border-subtle bg-surface-default px-4">
                    <Baris label="Kategori">{d.kategori}</Baris>
                    <Baris label="Lokasi">
                        {d.lokasi.ruang} · {d.lokasi.area} · {d.lokasi.gedung}
                    </Baris>
                    <Baris label="Kondisi">
                        <Lencana varian={VARIAN_KONDISI[d.kondisi] ?? "neutral"}>{LABEL_KONDISI_ASET[d.kondisi]}</Lencana>
                    </Baris>
                    <Baris label="Status">
                        <Lencana varian={VARIAN_STATUS[d.status] ?? "neutral"}>{LABEL_STATUS_ASET[d.status]}</Lencana>
                    </Baris>
                </dl>
            </div>
        );
    }
    return (
        <div className="flex min-h-full flex-col bg-bg-page">
            <header className="flex min-h-topbar items-center border-b border-border-subtle bg-surface-default px-4">
                <Logo ukuran="sm" />
            </header>
            <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
                {isi}
                <p className="text-base text-text-secondary">
                    Petugas dan warga sekolah dapat{" "}
                    <Link to="/login" className="text-text-link hover:text-text-link-hover">
                        masuk ke SIGM4
                    </Link>{" "}
                    untuk aksi lanjutan seperti peminjaman atau pelaporan kerusakan.
                </p>
            </main>
        </div>
    );
}
