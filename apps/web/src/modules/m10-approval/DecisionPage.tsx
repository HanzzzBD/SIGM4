// P-38 Detail Keputusan (UX §7.6.4; FR-10.2 langkah 3–7, A1, A5, A6; FR-10.3; PR-02-44). Konteks di
// atas, tombol keputusan melekat di bawah (PATTERNS "Tinjau lalu putuskan"). Konteks objek diberikan
// pemanggil per jenis (keputusan 92c) — M-10 tak mengenal modul pengaju. Keputusan hanya ditawarkan
// bila pengajuan ada di kotak masuk pemanggil (pemutus sah ditentukan server, SDD-APR-16); server
// tetap menolak (NFR-S-05). Setujui Sebagian tidak dirender: hanya Pengadaan/Penghapusan (UX §7.6.4).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { LABEL_STATUS_INSTANCE_APPROVAL, labelEnum } from "@sigm4/schemas";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../../shared/api";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Lencana, Peringatan, Tombol } from "../../shared/ui/primitives";
import { LinimasaPersetujuan, riwayatApprovalQuery, waktuWib } from "./linimasa";
import type { Keputusan } from "./persetujuan";
import { KUNCI_PENDING, labelPengajuan, pemutusLain, pendingQuery, putuskan, teksSisaSla } from "./persetujuan";

/** BR-042: catatan wajib bila menolak atau meminta revisi; opsional saat menyetujui. */
const AKSI: Record<Keputusan, { readonly label: string; readonly judul: string; readonly isi: string; readonly alasan?: string; readonly varian: "primary" | "danger" }> = {
    DISETUJUI: { label: "Setujui", judul: "Setujui pengajuan ini?", isi: "Bila masih ada langkah berikutnya, pengajuan diteruskan ke approver berikutnya; bila ini langkah terakhir, pemohon diberi tahu bahwa pengajuan disetujui.", varian: "primary" },
    DITOLAK: { label: "Tolak", judul: "Tolak pengajuan ini?", isi: "Penolakan langsung mengakhiri alur persetujuan dan pemohon menerima alasannya.", alasan: "Alasan penolakan", varian: "danger" },
    PERLU_REVISI: { label: "Perlu Revisi", judul: "Minta revisi?", isi: "Pemohon menyunting lalu mengajukan ulang; persetujuan dimulai lagi dari langkah pertama.", alasan: "Catatan revisi", varian: "primary" },
};

export default function DecisionPage({ id, konteks, onSelesai }: { readonly id: number; readonly konteks: (jenis: string, referensiId: number) => ReactNode; readonly onSelesai: (label: string) => void }) {
    const qc = useQueryClient();
    const riwayat = useQuery(riwayatApprovalQuery(id));
    // Kotak masuk = sumber "boleh memutus" (pemutus sah + langkah yang dilihat, keputusan 69).
    const kotak = useQuery(pendingQuery(1, 100));
    const [aksi, setAksi] = useState<Keputusan | null>(null);
    const [sibuk, setSibuk] = useState(false);
    const [galat, setGalat] = useState<string | undefined>(undefined);
    const [kalah, setKalah] = useState<{ readonly nama: string; readonly pada: string | null } | null>(null);
    const kunci = useRef<string | null>(null);
    const judul = useRef<HTMLHeadingElement>(null);
    useEffect(() => judul.current?.focus(), [id]);

    if (riwayat.isPending) return <KeadaanMemuat baris={8} label="Memuat detail pengajuan" />;
    if (riwayat.isError) {
        // FR-17.1 A1: objek rujukan deep link sudah tak ada → P-09; di luar hak → P-08 (SDD-AUTH-08).
        if (riwayat.error instanceof ApiError && riwayat.error.status === 404) return <Navigate to="/data-tidak-tersedia" replace />;
        if (riwayat.error instanceof ApiError && riwayat.error.status === 403) return <Navigate to="/tidak-punya-akses" replace />;
        return <KeadaanGalat galat={riwayat.error} onCobaLagi={() => void riwayat.refetch()} />;
    }
    const d = riwayat.data;
    const label = labelPengajuan(d.jenis_pengajuan, d.referensi_id);
    const item = kotak.data?.data.find((p) => p.instance_id === id);
    const bolehPutus = d.status === "MENUNGGU" && item !== undefined && kalah === null;
    const langkahAktif = d.langkah.find((l) => l.status === "AKTIF");

    const kirim = async (keputusan: Keputusan, catatan: string) => {
        if (item === undefined) return;
        setSibuk(true);
        setGalat(undefined);
        kunci.current ??= crypto.randomUUID();
        try {
            await putuskan(id, { urutan: item.urutan, keputusan, catatan: catatan === "" ? null : catatan }, kunci.current);
            void qc.invalidateQueries({ queryKey: KUNCI_PENDING });
            onSelesai(label);
        } catch (g) {
            const lain = pemutusLain(g);
            if (lain !== null) {
                // RE-09: tampilkan SIAPA dan KAPAN, lalu arahkan ke linimasa yang mutakhir.
                setKalah(lain);
                setAksi(null);
                void qc.invalidateQueries({ queryKey: KUNCI_PENDING });
                void riwayat.refetch();
            } else {
                // BR-043 / FR-10.2 A5 dan galat lain: penyebab dari server, bukan galat generik.
                setGalat(g instanceof Error ? g.message : "Keputusan belum tersimpan. Coba lagi.");
            }
        } finally {
            kunci.current = null;
            setSibuk(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 pb-16">
            <header className="flex flex-col gap-2">
                <h1 ref={judul} tabIndex={-1} className="text-2xl font-semibold text-text-heading outline-none">
                    {label}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-base text-text-secondary">
                    <Lencana varian={d.status === "DISETUJUI" ? "success" : d.status === "DITOLAK" ? "error" : d.status === "PERLU_REVISI" ? "warning" : "neutral"}>{labelEnum(LABEL_STATUS_INSTANCE_APPROVAL, d.status)}</Lencana>
                    <span>
                        Diajukan {d.pemohon?.nama ?? "—"} · {waktuWib(d.dibuat_pada)}
                    </span>
                    {langkahAktif?.sla != null && <Lencana varian={langkahAktif.sla.terlambat ? "error" : "neutral"}>{teksSisaSla(langkahAktif.sla)}</Lencana>}
                </div>
            </header>

            {kalah !== null && (
                <Peringatan varian="warning" judul="Pengajuan sudah diputuskan approver lain">
                    Diputuskan oleh {kalah.nama}
                    {kalah.pada !== null && ` pada ${waktuWib(kalah.pada)}`}. Linimasa di bawah sudah diperbarui.
                </Peringatan>
            )}
            {d.status === "MENUNGGU" && !kotak.isPending && item === undefined && kalah === null && (
                <Peringatan varian="info">Langkah aktif pengajuan ini bukan wewenang Anda saat ini, sehingga keputusan tidak dapat diambil dari sini.</Peringatan>
            )}

            <section aria-labelledby="judul-konteks" className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-default p-6">
                <h2 id="judul-konteks" className="text-lg font-semibold text-text-primary">
                    Pengajuan
                </h2>
                {konteks(d.jenis_pengajuan, d.referensi_id)}
            </section>

            <section aria-labelledby="judul-riwayat-pemohon" className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-default p-6">
                <h2 id="judul-riwayat-pemohon" className="text-lg font-semibold text-text-primary">
                    Riwayat pemohon & ketersediaan objek
                </h2>
                <p className="text-base text-text-secondary">Belum tersedia. Ketersediaan objek tetap diperiksa sistem saat Anda menyetujui.</p>
            </section>

            <LinimasaPersetujuan instanceId={id} />

            {bolehPutus && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface-default p-4">
                    <div className="mx-auto flex max-w-xl flex-wrap justify-end gap-3">
                        <Tombol varian="secondary" onClick={() => setAksi("PERLU_REVISI")}>
                            Perlu Revisi
                        </Tombol>
                        <Tombol varian="danger" onClick={() => setAksi("DITOLAK")}>
                            Tolak
                        </Tombol>
                        <Tombol onClick={() => setAksi("DISETUJUI")}>Setujui</Tombol>
                    </div>
                </div>
            )}

            {aksi !== null && (
                <DialogKonfirmasi
                    key={aksi}
                    buka
                    onTutup={() => {
                        setAksi(null);
                        setGalat(undefined);
                    }}
                    judul={AKSI[aksi].judul}
                    labelAksi={AKSI[aksi].label}
                    varian={AKSI[aksi].varian}
                    {...(AKSI[aksi].alasan === undefined ? {} : { labelAlasan: AKSI[aksi].alasan })}
                    sibuk={sibuk}
                    galat={galat}
                    onKonfirmasi={(catatan) => void kirim(aksi, catatan)}
                >
                    {AKSI[aksi].isi}
                </DialogKonfirmasi>
            )}
        </div>
    );
}
