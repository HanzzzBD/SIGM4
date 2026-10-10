// P-31 Detail Reservasi (UX §6, §7.2, §7.3; FR-07.3, FR-07.4, FR-10.3; PR-03-27, keputusan 17 log
// phase-03). Aksi yang ditawarkan berasal dari server (`aksi`) — diturunkan dari aturan endpoint
// tulisnya, jadi layar tak pernah menawarkan tombol yang pasti ditolak. Batalkan = dialog destruktif
// beralasan (§7.2, BR-025); Ubah jadwal & Ajukan Ulang = wizard P-29 terisi → pengajuan BARU (BR-024).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { HasilPenggunaan, ReservationDetail } from "@sigm4/schemas";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../shared/api";
import { useSesi } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, Kartu, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import { LinimasaPersetujuan, waktuWib } from "../m10-approval";
import { batalkanReservasi, catatPenggunaan, detailReservasiQuery } from "./api";
import { jamWib, tanggalPanjang, tanggalWib } from "./kalender";
import { LABEL_AKSI_RIWAYAT, LABEL_STATUS_RESERVASI, VARIAN_STATUS_RESERVASI } from "./status";

const LABEL_HASIL: Readonly<Record<HasilPenggunaan, string>> = { BAIK: "Baik", PERLU_PERHATIAN: "Perlu Perhatian", TIDAK_DIGUNAKAN: "Tidak Digunakan" };

const jadwal = (mulai: string, selesai: string) => `${tanggalPanjang(tanggalWib(new Date(mulai)))}, ${jamWib(mulai)}–${jamWib(selesai)} WIB`;

/** Pesan galat API yang ditulis server (Bab 17.2), atau kalimat umum. */
const pesanGalat = (e: unknown) => (e instanceof ApiError && e.message !== "" ? e.message : "Permintaan gagal. Coba lagi.");

function Baris({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 md:flex-row md:gap-4">
            <dt className="text-sm text-text-secondary md:w-48 md:shrink-0">{label}</dt>
            <dd className="text-base text-text-primary">{children}</dd>
        </div>
    );
}

function PencatatanPenggunaan({ d, onSelesai }: { readonly d: ReservationDetail; readonly onSelesai: () => void }) {
    const opsi: readonly HasilPenggunaan[] = [...(d.aksi.catat_penggunaan.kondisi ? (["BAIK", "PERLU_PERHATIAN"] as const) : []), ...(d.aksi.catat_penggunaan.tidak_digunakan ? (["TIDAK_DIGUNAKAN"] as const) : [])];
    const [hasil, setHasil] = useState<HasilPenggunaan | "">("");
    const [catatan, setCatatan] = useState("");
    const simpan = useMutation({ mutationFn: () => catatPenggunaan(d.id, hasil as HasilPenggunaan, catatan.trim() === "" ? null : catatan.trim()), onSuccess: onSelesai });
    return (
        <Kartu judul="Catat penggunaan ruangan">
            <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (hasil !== "") simpan.mutate();
                }}
            >
                <p className="text-sm text-text-secondary">
                    {d.aksi.catat_penggunaan.kondisi ? "Catat kondisi ruangan setelah kegiatan, atau tandai bila ruangan tidak digunakan." : "Kegiatan sedang berlangsung — ruangan dapat ditandai tidak digunakan; slotnya langsung dilepas."} Pencatatan
                    hanya sekali.
                </p>
                <Pilihan label="Hasil penggunaan" kosong="Pilih hasil" value={hasil} opsi={opsi.map((h) => ({ nilai: h, label: LABEL_HASIL[h] }))} onChange={(e) => setHasil(e.target.value as HasilPenggunaan | "")} />
                <Isian label="Catatan (tidak wajib)" maxLength={1000} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
                {simpan.isError && <Peringatan varian="error">{pesanGalat(simpan.error)}</Peringatan>}
                <Tombol type="submit" className="self-start" disabled={hasil === ""} sibuk={simpan.isPending}>
                    Simpan pencatatan
                </Tombol>
            </form>
        </Kartu>
    );
}

export default function ReservationDetailPage({
    id,
    terkirim = false,
    onUlang,
}: {
    readonly id: string;
    /** UXD-06: berpindah dari wizard setelah pengajuan terbentuk — nomornya ditampilkan sebagai bukti. */
    readonly terkirim?: boolean;
    /** Ubah jadwal / Ajukan Ulang: wizard P-29 terisi dari reservasi ini (BR-024, keputusan 17d). */
    readonly onUlang: (d: ReservationDetail) => void;
}) {
    const qc = useQueryClient();
    const sesi = useSesi();
    const kueri = useQuery(detailReservasiQuery(id));
    const [dialog, setDialog] = useState<"batal" | "ubah" | null>(null);
    const judul = useRef<HTMLHeadingElement>(null);
    const muatUlang = () => void qc.invalidateQueries({ queryKey: ["reservations"] });
    const batal = useMutation({
        mutationFn: (alasan: string) => batalkanReservasi(id, alasan),
        onSuccess: () => {
            const ubah = dialog === "ubah";
            setDialog(null);
            muatUlang();
            // "Ubah jadwal" = batalkan + pengajuan baru (BR-024): wizard dibuka setelah pembatalan berhasil.
            if (ubah && kueri.data !== undefined) onUlang(kueri.data);
        },
    });
    useEffect(() => judul.current?.focus(), [id]);

    if (kueri.isPending) return <KeadaanMemuat baris={8} label="Memuat detail reservasi" />;
    if (kueri.isError) {
        // SDD-AUTH-08: tak ada dan di luar hak lihat dijawab sama — layar tak membedakannya.
        if (kueri.error instanceof ApiError && kueri.error.status === 404)
            return (
                <KeadaanKosong
                    judul="Reservasi tidak ditemukan"
                    pesan="Reservasi ini tidak ada atau tidak dapat Anda lihat."
                    aksi={
                        <Link to="/reservasi" className="text-text-link hover:text-text-link-hover">
                            Kembali ke Daftar Reservasi
                        </Link>
                    }
                />
            );
        return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    }
    const d = kueri.data;
    // FR-07.3 A2: pembatal bukan pemohon → pemohon dinotifikasi (NT-08).
    const sepihak = d.pemohon.id !== String(sesi.user.id);
    const adaPencatatan = d.aksi.catat_penggunaan.kondisi || d.aksi.catat_penggunaan.tidak_digunakan;

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            <nav aria-label="Jejak">
                <Link to="/reservasi" className="text-sm text-text-link hover:text-text-link-hover">
                    Daftar Reservasi
                </Link>
                {d.induk !== null && (
                    <>
                        {" / "}
                        <Link to="/reservasi/$id" params={{ id: d.induk.id }} className="text-sm text-text-link hover:text-text-link-hover">
                            {d.induk.nomor}
                        </Link>
                    </>
                )}
            </nav>
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 ref={judul} tabIndex={-1} className="text-2xl font-semibold text-text-heading">
                        {d.nomor}
                    </h1>
                    <span className="self-start">
                        <Lencana varian={VARIAN_STATUS_RESERVASI[d.status]}>{LABEL_STATUS_RESERVASI[d.status]}</Lencana>
                    </span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {d.aksi.ubah_jadwal && (
                        <Tombol varian="secondary" onClick={() => setDialog("ubah")}>
                            Ubah jadwal
                        </Tombol>
                    )}
                    {d.aksi.ajukan_ulang && (
                        <Tombol varian="secondary" onClick={() => onUlang(d)}>
                            Ajukan Ulang
                        </Tombol>
                    )}
                    {d.aksi.batalkan && (
                        <Tombol varian="danger" onClick={() => setDialog("batal")}>
                            Batalkan
                        </Tombol>
                    )}
                </div>
            </header>

            {terkirim && (
                <Peringatan varian="success" judul={`Pengajuan terkirim — nomor ${d.nomor}`}>
                    Approver telah diberi tahu; slot ditahan sementara sampai diputuskan.
                </Peringatan>
            )}
            {d.status === "KEDALUWARSA" && (
                <Peringatan varian="warning" judul="Pengajuan kedaluwarsa">
                    Pengajuan belum diputuskan hingga batas waktu, sehingga slotnya dibebaskan.{d.aksi.ajukan_ulang && " Ajukan ulang bila ruangan masih diperlukan."}
                </Peringatan>
            )}

            <Kartu judul="Rincian">
                <dl className="flex flex-col gap-3">
                    <Baris label="Ruangan">{d.ruangan === null ? "—" : `${d.ruangan.nama} · ${d.ruangan.gedung}`}</Baris>
                    <Baris label="Jadwal">{jadwal(d.waktu_mulai, d.waktu_selesai)}</Baris>
                    <Baris label="Kegiatan">{`${d.nama_kegiatan ?? "—"}${d.jenis_kegiatan === null ? "" : ` (${d.jenis_kegiatan})`}`}</Baris>
                    <Baris label="Jumlah peserta">{d.jumlah_peserta === null ? "—" : `${String(d.jumlah_peserta)} orang`}</Baris>
                    <Baris label="Pemohon">{d.pemohon.nama}</Baris>
                    <Baris label="Diajukan">{waktuWib(d.diajukan_pada)}</Baris>
                    {d.keperluan !== null && <Baris label="Keperluan">{d.keperluan}</Baris>}
                    {d.kebutuhan_tambahan !== null && <Baris label="Kebutuhan tambahan">{d.kebutuhan_tambahan}</Baris>}
                    {d.keterangan !== null && <Baris label="Keterangan">{d.keterangan}</Baris>}
                </dl>
            </Kartu>

            {d.tanggal.length > 0 && (
                <Kartu judul={`Tanggal reservasi berulang (${String(d.tanggal.length)})`}>
                    <ul className="flex flex-col gap-2">
                        {d.tanggal.map((t) => (
                            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                                <span className="flex flex-col">
                                    <Link to="/reservasi/$id" params={{ id: t.id }} className="font-medium text-text-link hover:text-text-link-hover">
                                        {t.nomor}
                                    </Link>
                                    <span className="text-sm text-text-secondary">{jadwal(t.waktu_mulai, t.waktu_selesai)}</span>
                                </span>
                                <Lencana varian={VARIAN_STATUS_RESERVASI[t.status]}>{LABEL_STATUS_RESERVASI[t.status]}</Lencana>
                            </li>
                        ))}
                    </ul>
                </Kartu>
            )}

            {d.penggunaan !== null && (
                <Kartu judul="Penggunaan ruangan">
                    <dl className="flex flex-col gap-3">
                        <Baris label="Hasil">{d.penggunaan.kondisi_ruangan === null ? "Tidak digunakan" : LABEL_HASIL[d.penggunaan.kondisi_ruangan]}</Baris>
                        {d.penggunaan.catatan !== null && <Baris label="Catatan">{d.penggunaan.catatan}</Baris>}
                        <Baris label="Dicatat">{`${d.penggunaan.dicatat_oleh ?? "—"} · ${waktuWib(d.penggunaan.dicatat_pada)}`}</Baris>
                    </dl>
                </Kartu>
            )}
            {adaPencatatan && <PencatatanPenggunaan key={d.id} d={d} onSelesai={muatUlang} />}

            {d.approval_instance_id !== null && <LinimasaPersetujuan instanceId={d.approval_instance_id} />}

            <section aria-labelledby="judul-riwayat" className="flex flex-col gap-3">
                <h2 id="judul-riwayat" className="text-lg font-semibold text-text-primary">
                    Riwayat perubahan
                </h2>
                {d.riwayat.length === 0 ? (
                    <p className="text-base text-text-secondary">Belum ada riwayat.</p>
                ) : (
                    <ol className="flex flex-col gap-2">
                        {d.riwayat.map((r, i) => (
                            <li key={`${r.waktu}-${String(i)}`} className="flex flex-col gap-1 border-l-2 border-border-subtle pl-3">
                                <p className="text-base text-text-primary">
                                    <span className="font-medium">{LABEL_AKSI_RIWAYAT[r.aksi] ?? r.aksi}</span>
                                    {r.status !== null && ` — ${LABEL_STATUS_RESERVASI[r.status as keyof typeof LABEL_STATUS_RESERVASI] ?? r.status}`}
                                    {r.nomor !== null && r.nomor !== d.nomor && ` · ${r.nomor}`}
                                </p>
                                <p className="text-sm text-text-secondary">
                                    {r.pelaku ?? "Sistem"} · {waktuWib(r.waktu)}
                                </p>
                                {r.keterangan !== null && <p className="rounded-sm bg-surface-subtle p-2 text-base text-text-primary">{r.keterangan}</p>}
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <DialogKonfirmasi
                buka={dialog !== null}
                onTutup={() => {
                    setDialog(null);
                    batal.reset();
                }}
                judul={dialog === "ubah" ? `Ubah jadwal ${d.nomor}?` : `Batalkan reservasi ${d.nomor}?`}
                labelAksi={dialog === "ubah" ? "Batalkan & ajukan jadwal baru" : "Batalkan reservasi"}
                varian="danger"
                labelAlasan="Alasan pembatalan"
                sibuk={batal.isPending}
                galat={batal.isError ? pesanGalat(batal.error) : undefined}
                onKonfirmasi={(alasan) => batal.mutate(alasan)}
            >
                {dialog === "ubah"
                    ? "Perubahan jadwal = pembatalan + pengajuan baru (BR-024): reservasi ini dibatalkan dan slotnya dibebaskan, lalu formulir pengajuan baru terbuka terisi data yang sama untuk dipilih jadwalnya."
                    : `Slot ${d.tanggal.length > 0 ? "seluruh tanggal yang belum dimulai " : ""}dibebaskan dan langsung dapat dipesan pengguna lain.${sepihak ? ` ${d.pemohon.nama} (pemohon) dinotifikasi beserta alasan ini.` : ""}`}
            </DialogKonfirmasi>
        </div>
    );
}
