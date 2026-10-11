// P-41 Detail Tiket Kerusakan (UX §6, §7.5, F-16; FR-11.2 langkah 1–5, A1, A3; FR-11.1 A1; FR-07.4 A2;
// PR-03-32). Deskripsi, foto (tertunda ditandai), peringatan garansi aktif (BR-052), catatan tambahan,
// reservasi asal. Verifikasi/Tolak sebagai drawer bertautan `?aksi=verifikasi` (UXD-02): Buat Work Order
// (→ Diverifikasi), Perbaikan Ringan (catatan wajib), Tolak (alasan wajib, terlihat pelapor); kondisi aset
// opsional bagi pemegang `asset.update_condition` (A1). 404 = tak ada atau di luar scope (SDD-AUTH-08).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, SyntheticEvent } from "react";
import type { DamageReportDetail } from "@sigm4/schemas";
import { ApiError } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { jalurTerdaftar } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Kartu, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import { LABEL_STATUS, LABEL_URGENSI, TERBUKA, VARIAN_STATUS, VARIAN_URGENSI, detailQuery, verifikasi, waktuWib } from "./api";
import { TambahInformasi } from "./DamageReportPage";

const KEPUTUSAN = [
    { nilai: "TINDAK_LANJUT", label: "Buat Work Order (tindak lanjut)" },
    { nilai: "PERBAIKAN_RINGAN", label: "Perbaikan ringan langsung — tiket selesai" },
    { nilai: "TOLAK", label: "Tolak laporan" },
] as const;
type Keputusan = (typeof KEPUTUSAN)[number]["nilai"];
const TANGGAL = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", dateStyle: "long" });

function Baris({ label, children }: { readonly label: string; readonly children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="text-sm font-medium text-text-secondary sm:w-1/3 sm:shrink-0">{label}</dt>
            <dd className="text-base text-text-primary">{children}</dd>
        </div>
    );
}

function Foto({ f }: { readonly f: DamageReportDetail["foto"][number] }) {
    if (f.url !== null) return <img src={f.url} alt={`Foto kerusakan ${String(f.urutan)}`} className="aspect-square w-full rounded-sm border border-border-subtle object-cover" />;
    const teks = f.status === "BELUM_TERUNGGAH" ? "Unggahan tertunda" : f.status === "INFECTED" ? "Ditolak pemindai" : "Sedang diperiksa";
    return <div className="flex aspect-square w-full items-center justify-center rounded-sm border border-dashed border-border-strong p-2 text-center text-sm text-text-secondary">{teks}</div>;
}

/** Drawer verifikasi (FR-11.2 langkah 3–4). */
function PanelVerifikasi({ d, onTutup, onSelesai }: { readonly d: DamageReportDetail; readonly onTutup: () => void; readonly onSelesai: (pesan: string) => void }) {
    const can = useCan();
    const [keputusan, setKeputusan] = useState<Keputusan | "">("");
    const [catatan, setCatatan] = useState("");
    const [kondisi, setKondisi] = useState("");
    const [alasanKondisi, setAlasanKondisi] = useState("");
    const [galat, setGalat] = useState<string | null>(null);
    const [sibuk, setSibuk] = useState(false);
    const judul = useRef<HTMLHeadingElement>(null);
    useEffect(() => judul.current?.focus(), []);
    const catatanWajib = keputusan === "TOLAK" || keputusan === "PERBAIKAN_RINGAN";
    const kirim = async (e: SyntheticEvent) => {
        e.preventDefault();
        if (keputusan === "") return setGalat("Pilih tindak lanjut.");
        if (catatanWajib && catatan.trim() === "") return setGalat(keputusan === "TOLAK" ? "Alasan penolakan wajib diisi." : "Catatan perbaikan wajib diisi.");
        setSibuk(true);
        setGalat(null);
        try {
            const h = await verifikasi(d.id, {
                keputusan,
                ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
                ...(kondisi === "" ? {} : { kondisi_aset: { kondisi: kondisi as "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT", ...(alasanKondisi.trim() === "" ? {} : { alasan: alasanKondisi.trim() }) } }),
            });
            onSelesai(`Laporan ${h.nomor} kini ${LABEL_STATUS[h.status as keyof typeof LABEL_STATUS]}.`);
        } catch (err) {
            setGalat(err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Verifikasi belum tersimpan. Coba lagi.");
        } finally {
            setSibuk(false);
        }
    };
    return (
        <section aria-labelledby="judul-verifikasi" role="dialog" aria-modal="false" className="flex flex-col gap-4 rounded-md border border-border-strong bg-surface-default p-4 shadow-1">
            <h2 ref={judul} tabIndex={-1} id="judul-verifikasi" className="text-lg font-semibold text-text-heading outline-none">
                Verifikasi laporan {d.nomor}
            </h2>
            <form noValidate onSubmit={(e) => void kirim(e)} className="flex flex-col gap-4">
                <Pilihan label="Tindak lanjut" required kosong="Pilih tindak lanjut" value={keputusan} opsi={KEPUTUSAN.map((k) => ({ nilai: k.nilai, label: k.label }))} onChange={(e) => setKeputusan(e.target.value as Keputusan | "")} />
                <div className="flex flex-col gap-2">
                    <label htmlFor="catatan-verifikasi" className="text-sm font-medium text-text-primary">
                        {keputusan === "TOLAK" ? "Alasan penolakan (terlihat oleh pelapor)" : "Catatan"}
                        <span className="font-regular text-text-secondary">{catatanWajib ? " (wajib)" : " (tidak wajib)"}</span>
                    </label>
                    <textarea id="catatan-verifikasi" rows={3} maxLength={1000} value={catatan} onChange={(e) => setCatatan(e.target.value)} className="rounded-sm border border-border-strong bg-surface-default px-4 py-3 text-base text-text-primary" />
                </div>
                {d.objek.jenis === "ASET" && can("asset.update_condition") && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Pilihan
                            label="Kondisi aset (tidak wajib)"
                            kosong="Tidak diubah"
                            value={kondisi}
                            opsi={[
                                { nilai: "BAIK", label: "Baik" },
                                { nilai: "RUSAK_RINGAN", label: "Rusak Ringan" },
                                { nilai: "RUSAK_BERAT", label: "Rusak Berat — aset tidak tersedia" },
                            ]}
                            onChange={(e) => setKondisi(e.target.value)}
                        />
                        {kondisi !== "" && (
                            <div className="flex flex-col gap-2">
                                <label htmlFor="alasan-kondisi" className="text-sm font-medium text-text-primary">
                                    Alasan perubahan kondisi
                                </label>
                                <input id="alasan-kondisi" value={alasanKondisi} maxLength={500} onChange={(e) => setAlasanKondisi(e.target.value)} className="min-h-control-md rounded-sm border border-border-strong bg-surface-default px-4 text-base text-text-primary" />
                            </div>
                        )}
                    </div>
                )}
                {galat !== null && <Peringatan varian="error">{galat}</Peringatan>}
                <div className="flex flex-wrap gap-2">
                    <Tombol type="submit" varian={keputusan === "TOLAK" ? "danger" : "primary"} sibuk={sibuk}>
                        {keputusan === "TOLAK" ? "Tolak laporan" : "Simpan verifikasi"}
                    </Tombol>
                    <Tombol varian="tertiary" onClick={onTutup}>
                        Batal
                    </Tombol>
                </div>
            </form>
        </section>
    );
}

export default function DamageDetailPage({ id, aksi, onAksi }: { readonly id: string; readonly aksi?: "verifikasi" | undefined; readonly onAksi: (a: "verifikasi" | undefined) => void }) {
    const can = useCan();
    const qc = useQueryClient();
    const kueri = useQuery(detailQuery(id));
    const [pesan, setPesan] = useState<string | null>(null);
    const judul = useRef<HTMLHeadingElement>(null);
    useEffect(() => judul.current?.focus(), [id]);

    if (kueri.isPending) return <KeadaanMemuat baris={8} label="Memuat laporan kerusakan" />;
    if (kueri.isError) {
        if (kueri.error instanceof ApiError && kueri.error.status === 404) return <KeadaanKosong judul="Laporan tidak ditemukan" pesan="Laporan ini tidak ada atau tidak dapat Anda lihat." />;
        return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    }
    const d = kueri.data;
    const muatUlang = () => void qc.invalidateQueries({ queryKey: ["damage-reports"] });
    const bisaVerifikasi = can("damage.verify") && d.status === "DILAPORKAN";
    const terbuka = TERBUKA.has(d.status);
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 ref={judul} tabIndex={-1} className="text-2xl font-semibold text-text-heading outline-none">
                        Laporan <span className="font-mono">{d.nomor}</span>
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                        <Lencana varian={VARIAN_STATUS[d.status]}>{LABEL_STATUS[d.status]}</Lencana>
                        <Lencana varian={VARIAN_URGENSI[d.urgensi]}>{`Urgensi ${LABEL_URGENSI[d.urgensi]}`}</Lencana>
                    </div>
                </div>
                {bisaVerifikasi && aksi !== "verifikasi" && <Tombol onClick={() => onAksi("verifikasi")}>Verifikasi</Tombol>}
            </header>

            {pesan !== null && <Peringatan varian="success">{pesan}</Peringatan>}
            {/* BR-052 / FR-11.2 A3: perbaikan diajukan ke penjamin. */}
            {d.garansi !== null && d.garansi.length > 0 && (
                <Peringatan varian="warning" judul="Aset masih dalam masa garansi">
                    Ajukan perbaikan ke penjamin. Dokumen: {d.garansi.map((g) => `${g.nama_berkas} (berlaku sampai ${TANGGAL.format(new Date(g.garansi_selesai))})`).join(", ")}.
                </Peringatan>
            )}
            {bisaVerifikasi && aksi === "verifikasi" && (
                <PanelVerifikasi
                    d={d}
                    onTutup={() => onAksi(undefined)}
                    onSelesai={(p) => {
                        setPesan(p);
                        onAksi(undefined);
                        muatUlang();
                    }}
                />
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col gap-6 lg:col-span-2">
                    <Kartu judul="Laporan">
                        <dl className="flex flex-col gap-3">
                            <Baris label="Objek">
                                {d.objek.jenis === "ASET" && jalurTerdaftar(`/aset/${d.objek.id}`) ? (
                                    <a href={`/aset/${d.objek.id}`} className="text-text-link hover:text-text-link-hover">
                                        {d.objek.label}
                                    </a>
                                ) : (
                                    d.objek.label
                                )}
                                <span className="block text-sm text-text-secondary">{d.objek.lokasi}</span>
                            </Baris>
                            <Baris label="Deskripsi">{d.deskripsi}</Baris>
                            <Baris label="Pelapor">{`${d.pelapor.nama} · ${waktuWib(d.dilaporkan_pada)}`}</Baris>
                            {d.reservasi !== null && (
                                <Baris label="Reservasi asal">
                                    {jalurTerdaftar(`/reservasi/${d.reservasi.id}`) ? (
                                        <a href={`/reservasi/${d.reservasi.id}`} className="font-mono text-text-link hover:text-text-link-hover">
                                            {d.reservasi.nomor}
                                        </a>
                                    ) : (
                                        <span className="font-mono">{d.reservasi.nomor}</span>
                                    )}
                                </Baris>
                            )}
                            {d.diverifikasi_pada !== null && <Baris label="Diverifikasi">{`${d.diverifikasi_oleh?.nama ?? "—"} · ${waktuWib(d.diverifikasi_pada)}`}</Baris>}
                            {d.catatan_verifikasi !== null && <Baris label={d.status === "DITOLAK" ? "Alasan penolakan" : "Catatan verifikasi"}>{d.catatan_verifikasi}</Baris>}
                        </dl>
                    </Kartu>
                    <section aria-labelledby="judul-catatan" className="flex flex-col gap-3">
                        <h2 id="judul-catatan" className="text-lg font-semibold text-text-primary">
                            Informasi tambahan
                        </h2>
                        {d.catatan.length === 0 ? (
                            <p className="text-base text-text-secondary">Belum ada informasi tambahan.</p>
                        ) : (
                            <ol className="flex flex-col gap-3">
                                {d.catatan.map((c) => (
                                    <li key={c.id} className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-default p-4">
                                        <p className="text-sm text-text-secondary">{`${c.penulis.nama} · ${waktuWib(c.dibuat_pada)}`}</p>
                                        <p className="text-base text-text-primary">{c.keterangan}</p>
                                        {c.foto.length > 0 && (
                                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                                                {c.foto.map((f) => (
                                                    <Foto key={f.file_id} f={f} />
                                                ))}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                        {terbuka && can("damage.create") && (
                            <TambahInformasi tiket={d} bisaBuka={false} onBuka={() => undefined} diDetail onTerkirim={() => {
                                setPesan("Informasi tambahan tersimpan.");
                                muatUlang();
                            }} />
                        )}
                    </section>
                </div>
                <section aria-labelledby="judul-foto" className="flex flex-col gap-3">
                    <h2 id="judul-foto" className="text-lg font-semibold text-text-primary">
                        Foto ({d.foto.length}){d.foto_tertunda > 0 && ` · ${String(d.foto_tertunda)} tertunda`}
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                        {d.foto.map((f) => (
                            <Foto key={f.file_id} f={f} />
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
