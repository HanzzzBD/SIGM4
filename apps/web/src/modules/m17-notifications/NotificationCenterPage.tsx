// P-13 Pusat Notifikasi (UX §6, §7.6.8; FR-17.1 langkah 3–5, A1–A4; C-29; PR-02-43). Saringan
// jenis, tampilan (aktif / belum dibaca / arsip, UXD-10) dan halaman hidup di URL (SDD-FE-10).
// Penurunan ke polling dijelaskan di atas daftar (UX F-23).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LABEL_KELOMPOK_NOTIFIKASI } from "@sigm4/schemas";
import { useState } from "react";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { Kelompok } from "./api";
import { KELOMPOK, KUNCI_NOTIFIKASI, daftarNotifikasiQuery, tandaiSemuaTerbaca } from "./api";
import { aturPenghitung, useKeadaanAliran } from "./aliran";
import { ItemNotifikasi, useBukaNotifikasi } from "./item";

export const TAMPILAN_NOTIFIKASI = ["belum", "arsip"] as const;

export interface PencarianNotifikasi {
    readonly jenis?: Kelompok | undefined;
    /** Bawaan: seluruh notifikasi aktif. */
    readonly tampilan?: (typeof TAMPILAN_NOTIFIKASI)[number] | undefined;
    readonly page?: number | undefined;
}

const PER_HALAMAN = 25;

export default function NotificationCenterPage({ pencarian, onPencarian }: { readonly pencarian: PencarianNotifikasi; readonly onPencarian: (p: Partial<PencarianNotifikasi>) => void }) {
    const qc = useQueryClient();
    const aliran = useKeadaanAliran();
    const buka = useBukaNotifikasi();
    const arsip = pencarian.tampilan === "arsip";
    const page = pencarian.page ?? 1;
    const kueri = useQuery(daftarNotifikasiQuery({ jenis: pencarian.jenis, belumDibaca: pencarian.tampilan === "belum", arsip, page, perPage: PER_HALAMAN }));
    const [pengumuman, setPengumuman] = useState("");
    const [sibuk, setSibuk] = useState(false);
    const ubah = (p: Partial<PencarianNotifikasi>) => onPencarian({ ...p, page: undefined });

    const tandaiSemua = async () => {
        setSibuk(true);
        try {
            const h = await tandaiSemuaTerbaca();
            aturPenghitung(qc, h.unread_count);
            // C-29: jumlah yang terpengaruh diumumkan.
            setPengumuman(h.ditandai === 0 ? "Tidak ada notifikasi yang belum dibaca." : `${String(h.ditandai)} notifikasi ditandai terbaca.`);
            await qc.invalidateQueries({ queryKey: [...KUNCI_NOTIFIKASI, "list"] });
        } catch {
            setPengumuman("Notifikasi belum dapat ditandai terbaca. Coba lagi.");
        } finally {
            setSibuk(false);
        }
    };

    const tersaring = pencarian.jenis !== undefined || pencarian.tampilan === "belum";
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-text-heading">Notifikasi</h1>
                    <p className="text-base text-text-secondary">
                        {aliran.unread === null || arsip ? "Pemberitahuan untuk Anda." : aliran.unread === 0 ? "Seluruh notifikasi sudah dibaca." : `${String(aliran.unread)} notifikasi belum dibaca.`}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link to="/profil/notifikasi" className="inline-flex min-h-control-md items-center rounded-md px-4 text-base font-medium text-text-link hover:text-text-link-hover">
                        Preferensi Notifikasi
                    </Link>
                    {!arsip && (
                        <Tombol varian="secondary" ikon="centang" sibuk={sibuk} disabled={aliran.unread === 0} onClick={() => void tandaiSemua()}>
                            Tandai semua terbaca
                        </Tombol>
                    )}
                </div>
            </header>
            <p role="status" className="sr-only">
                {pengumuman}
            </p>

            {aliran.alasan !== null && (
                <Peringatan varian="info" judul="Pembaruan otomatis tiap 60 detik">
                    {aliran.alasan}
                </Peringatan>
            )}

            <section aria-label="Saringan notifikasi" className="grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-2">
                <Pilihan
                    label="Jenis"
                    kosong="Semua jenis"
                    value={pencarian.jenis ?? ""}
                    opsi={KELOMPOK.map((k) => ({ nilai: k, label: LABEL_KELOMPOK_NOTIFIKASI[k] }))}
                    onChange={(e) => ubah({ jenis: e.target.value === "" ? undefined : (e.target.value as Kelompok) })}
                />
                <Pilihan
                    label="Tampilkan"
                    value={pencarian.tampilan ?? ""}
                    opsi={[
                        { nilai: "", label: "Semua notifikasi aktif" },
                        { nilai: "belum", label: "Belum dibaca" },
                        { nilai: "arsip", label: "Arsip (lebih dari 90 hari)" },
                    ]}
                    onChange={(e) => ubah({ tampilan: e.target.value === "" ? undefined : (e.target.value as PencarianNotifikasi["tampilan"]) })}
                />
            </section>

            {kueri.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat notifikasi" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : kueri.data.data.length === 0 ? (
                <KeadaanKosong
                    judul={arsip ? "Arsip kosong" : tersaring ? "Tidak ada notifikasi yang cocok" : "Belum ada notifikasi"}
                    pesan={arsip ? "Notifikasi berumur lebih dari 90 hari akan tampil di sini." : tersaring ? "Ubah atau hapus saringan untuk melihat notifikasi lain." : "Pemberitahuan tentang pengajuan dan akun Anda akan muncul di sini."}
                    aksi={
                        tersaring || arsip ? (
                            <Tombol varian="secondary" onClick={() => onPencarian({ jenis: undefined, tampilan: undefined, page: undefined })}>
                                Tampilkan semua notifikasi aktif
                            </Tombol>
                        ) : undefined
                    }
                />
            ) : (
                <>
                    <ul aria-label={arsip ? "Arsip notifikasi" : "Daftar notifikasi"} className="overflow-hidden rounded-md border border-border-subtle">
                        {kueri.data.data.map((n) => (
                            <li key={n.id}>
                                <ItemNotifikasi n={n} kiniMs={Date.now()} arsip={arsip} onBuka={(x) => void buka(x)} />
                            </li>
                        ))}
                    </ul>
                    {kueri.data.meta.total_pages > 1 && (
                        <nav aria-label="Halaman notifikasi" className="flex items-center justify-between gap-3 text-sm text-text-secondary tabular-nums">
                            <Tombol varian="secondary" disabled={page <= 1} onClick={() => onPencarian({ page: page - 1 === 1 ? undefined : page - 1 })}>
                                Sebelumnya
                            </Tombol>
                            <p>
                                Halaman {page} dari {kueri.data.meta.total_pages}
                            </p>
                            <Tombol varian="secondary" disabled={page >= kueri.data.meta.total_pages} onClick={() => onPencarian({ page: page + 1 })}>
                                Berikutnya
                            </Tombol>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}
