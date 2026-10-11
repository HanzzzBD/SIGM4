// Tab Riwayat P-18 (UX §7.6.3; FR-04.2 langkah 5, BR-007, FR-04.3 AC 3): linimasa berjenis dari
// `GET /assets/{id}/timeline` (PR-03-24) — kronologis, terbaru lebih dulu, berpelaku. Jenis yang tak boleh
// dilihat (DOKUMEN bagi Siswa/OSIS) memang tidak dikirim server (FR-04.2 A1).

import { useQuery } from "@tanstack/react-query";
import { LABEL_KONDISI_ASET } from "@sigm4/schemas";
import type { EntriLinimasaAset } from "@sigm4/schemas";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Tombol } from "../../shared/ui/primitives";
import { linimasaAsetQuery } from "./katalog";

const WAKTU = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
const waktuWib = (iso: string) => `${WAKTU.format(new Date(iso))} WIB`;
const TANGGAL = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", dateStyle: "long" });
const pelaku = (p: { readonly nama: string } | null) => p?.nama ?? "Sistem";

const LABEL_DOKUMEN: Record<Extract<EntriLinimasaAset, { jenis: "DOKUMEN" }>["jenis_dokumen"], string> = {
    FAKTUR: "Faktur",
    GARANSI: "Garansi",
    SERTIFIKAT: "Sertifikat",
    MANUAL: "Manual",
    BERITA_ACARA: "Berita acara",
    LAINNYA: "Lainnya",
};
const LABEL_KERUSAKAN = { DILAPORKAN: "Dilaporkan", DIVERIFIKASI: "Diverifikasi", DALAM_PERBAIKAN: "Dalam Perbaikan", SELESAI: "Selesai", DITOLAK: "Ditolak" } as const;
const LABEL_URGENSI = { RENDAH: "Rendah", SEDANG: "Sedang", TINGGI: "Tinggi", KRITIS: "Kritis" } as const;

function Isi({ e }: { readonly e: EntriLinimasaAset }) {
    switch (e.jenis) {
        case "KONDISI":
            return (
                <>
                    <p className="font-medium text-text-primary">
                        Kondisi {LABEL_KONDISI_ASET[e.kondisi_lama]} → {LABEL_KONDISI_ASET[e.kondisi_baru]}
                    </p>
                    <p className="text-sm text-text-secondary">Alasan: {e.alasan}</p>
                    <p className="text-sm text-text-secondary">{pelaku(e.pelaku)}</p>
                </>
            );
        case "MUTASI":
            return (
                <>
                    <p className="font-medium text-text-primary">
                        Mutasi {e.ruang_asal.nama} → {e.ruang_tujuan.nama}
                    </p>
                    <p className="text-sm text-text-secondary">
                        Tanggal mutasi {TANGGAL.format(new Date(e.tanggal))} · Alasan: {e.alasan}
                    </p>
                    <p className="text-sm text-text-secondary">{pelaku(e.pelaku)}</p>
                </>
            );
        case "DOKUMEN":
            return (
                <>
                    <p className="font-medium text-text-primary">
                        {e.aksi === "DITAUTKAN" ? "Dokumen ditautkan" : "Dokumen dilepas"}: {e.nama_berkas}
                    </p>
                    <p className="text-sm text-text-secondary">
                        {LABEL_DOKUMEN[e.jenis_dokumen]} · {pelaku(e.pelaku)}
                    </p>
                </>
            );
        case "KERUSAKAN":
            return (
                <>
                    <p className="font-medium text-text-primary">Laporan kerusakan {e.nomor}</p>
                    <p className="text-sm text-text-secondary">
                        Status {LABEL_KERUSAKAN[e.status]} · Urgensi {LABEL_URGENSI[e.urgensi]}
                    </p>
                </>
            );
    }
}

export function LinimasaAset({ id, page, onPage }: { readonly id: string; readonly page: number; readonly onPage: (p: number) => void }) {
    const kueri = useQuery(linimasaAsetQuery(id, page));
    if (kueri.isPending) return <KeadaanMemuat baris={5} label="Memuat riwayat aset" />;
    if (kueri.isError) return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    if (kueri.data.data.length === 0) return <KeadaanKosong judul="Belum ada riwayat" pesan="Perubahan kondisi, mutasi lokasi, dokumen, dan laporan kerusakan aset ini akan tercatat di sini." />;
    return (
        <section aria-labelledby="judul-riwayat" className="flex flex-col gap-4">
            <h2 id="judul-riwayat" className="sr-only">
                Riwayat aset
            </h2>
            <ol className="flex flex-col">
                {kueri.data.data.map((e) => (
                    <li key={`${e.jenis}-${e.id}`} className="flex gap-3 border-l border-border-subtle pb-4 pl-4">
                        <div className="flex flex-col gap-1">
                            <time dateTime={e.waktu} className="text-sm text-text-tertiary">
                                {waktuWib(e.waktu)}
                            </time>
                            <Isi e={e} />
                        </div>
                    </li>
                ))}
            </ol>
            {kueri.data.meta.total_pages > 1 && (
                <nav aria-label="Halaman riwayat" className="flex items-center justify-between gap-3 text-sm text-text-secondary tabular-nums">
                    <Tombol varian="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                        Lebih baru
                    </Tombol>
                    <span>
                        Halaman {page} dari {kueri.data.meta.total_pages}
                    </span>
                    <Tombol varian="secondary" disabled={page >= kueri.data.meta.total_pages} onClick={() => onPage(page + 1)}>
                        Lebih lama
                    </Tombol>
                </nav>
            )}
        </section>
    );
}
