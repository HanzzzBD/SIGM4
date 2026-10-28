// P-25 Scan QR web (UX §6, F-22; FR-05.2 langkah 1–3, A1, A2, A4; UX-02; C-25; PR-03-28). Kamera + bingkai
// bidik; tombol/isian kode manual SELALU terlihat dan berada dalam urutan fokus. Hasil diumumkan lewat live
// region. Aksi kontekstual peminjaman/opname/WO belum ada modulnya — hasil membuka Detail Aset (UX-05).

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LABEL_KONDISI_ASET, LABEL_STATUS_ASET,parseMaterialQr } from "@sigm4/schemas";
import type { MaterialDetail } from "@sigm4/schemas";
import { ApiError } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { materialFromUuid } from "../m22-materials";
import { jalurTerdaftar } from "../../shared/navigasi";
import { Isian, Lencana, Peringatan, Tombol, gabung } from "../../shared/ui/primitives";
import type { AsetPindaian, AsetRingkas } from "./api";
import { asetDariKode, asetDariUuid, uuidDariQr, qrConfigurationQuery } from "./api";
import { usePemindai } from "./pemindai";

type Hasil = { readonly jenis: "pindai"; readonly aset: AsetPindaian } | { readonly jenis: "manual"; readonly aset: AsetRingkas };
const QR_ASING = "QR tidak dikenali. Masukkan kode aset secara manual.";

export default function ScanPage({ onBuka,onBukaBahan }: { readonly onBuka: (assetId: string) => void;readonly onBukaBahan:(id:string)=>void }) {
    const can=useCan();
    const configuration = useQuery(qrConfigurationQuery);
    const video = useRef<HTMLVideoElement>(null);
    const [hasil, setHasil] = useState<Hasil | null>(null);
    const [bahan,setBahan]=useState<MaterialDetail|null>(null);
    const [galat, setGalat] = useState<string | null>(null);
    const [sibuk, setSibuk] = useState(false);
    const [kode, setKode] = useState("");
    // Satu pembacaan diproses pada satu waktu — dekode berikutnya diabaikan sampai selesai.
    const memproses = useRef(false);
    const kamera = usePemindai(video, hasil !== null||bahan!==null, (isi) => void tangani(isi));
    const bisaBuka = (id: string) => jalurTerdaftar(`/aset/${id}`);

    async function tangani(isi: string) {
        if (memproses.current) return;
        if (!configuration.data) return;
        const origin = configuration.data.app_base_url;
        const materialUuid=parseMaterialQr(isi,origin),uuid=materialUuid?null:uuidDariQr(isi,origin);
        if (uuid === null&&materialUuid===null) return setGalat(QR_ASING);
        if(!can(materialUuid?"material.view":"asset.view"))return setGalat(materialUuid?"Anda tidak memiliki izin melihat bahan.":"Anda tidak memiliki izin melihat aset.");
        memproses.current = true;
        setSibuk(true);
        setGalat(null);
        try {
            if(materialUuid)setBahan(await materialFromUuid(materialUuid));
            else setHasil({ jenis: "pindai", aset: await asetDariUuid(uuid!) });
        } catch (e) {
            // FR-05.2 A1: QR asing, rusak, atau UUID yang sudah diregenerasi → 404 berpesan jelas.
            setGalat(e instanceof ApiError && e.status === 404 ? e.message : "Hasil scan belum dapat dimuat. Coba lagi.");
        } finally {
            memproses.current = false;
            setSibuk(false);
        }
    }

    async function cariManual() {
        if(!can("asset.view"))return setGalat("Anda tidak memiliki izin melihat aset.");
        if (kode.trim() === "") return setGalat("Isi kode aset.");
        setSibuk(true);
        setGalat(null);
        try {
            const a = await asetDariKode(kode);
            if (a === null) setGalat(`Aset berkode ${kode.trim()} tidak ditemukan.`);
            else setHasil({ jenis: "manual", aset: a });
        } catch {
            setGalat("Aset belum dapat dicari. Coba lagi.");
        } finally {
            setSibuk(false);
        }
    }

    return (
        <div className="flex max-w-prose flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-text-heading">Scan QR</h1>
                <p className="text-base text-text-secondary">Arahkan kamera ke label QR aset atau bahan. Bahan membuka saldo jenis bahan.</p>
            </header>
            {configuration.isPending && <p role="status">Menyiapkan pemindai QR…</p>}
            {configuration.isError && <Peringatan varian="error">Konfigurasi label QR belum dapat dimuat. <Tombol varian="secondary" onClick={() => void configuration.refetch()}>Coba lagi</Tombol></Peringatan>}
            <p role="status" aria-live="polite" className="sr-only">
                {bahan?`Terbaca: Bahan, ${bahan.nama}`:hasil === null ? "" : `Terbaca: ${hasil.aset.kode_barang}, ${hasil.aset.nama}`}
            </p>

            {hasil === null && bahan===null&& (kamera === "ditolak" || kamera === "tidak-didukung") && (
                <Peringatan varian="info" judul={kamera === "ditolak" ? "Izin kamera ditolak" : "Kamera tidak tersedia"}>
                    {kamera === "ditolak" ? "Izinkan akses kamera untuk situs ini di pengaturan peramban, lalu muat ulang halaman. Sementara itu, masukkan kode aset di bawah." : "Peramban ini tidak menyediakan akses kamera. Masukkan kode aset di bawah."}
                </Peringatan>
            )}
            {hasil === null && bahan===null&&kamera !== "ditolak" && kamera !== "tidak-didukung" && (
                <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-neutral-900">
                    <video ref={video} muted playsInline aria-label="Pratinjau kamera" className="absolute inset-0 size-full object-cover" />
                    <div aria-hidden className="absolute inset-0 bg-overlay" />
                    <div aria-hidden className={gabung("relative size-2/3 rounded-sm border-4", galat === null ? "border-teal-600" : "border-error-base")} />
                    <p className="absolute bottom-4 px-4 text-center text-base text-text-inverse">{kamera === "meminta" ? "Meminta akses kamera…" : "Arahkan kamera ke label QR"}</p>
                </div>
            )}

            {galat !== null && <Peringatan varian="error">{galat}</Peringatan>}
            {bahan&&<section aria-label="Hasil bahan" className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-default p-4"><h2 className="text-lg font-semibold">Bahan / {bahan.nama}</h2><p>Saldo total {bahan.saldo_total} {bahan.satuan.simbol}</p><p>{bahan.status==="AKTIF"?"Aktif":"Nonaktif"} / {bahan.kategori.nama}</p>{bahan.stok_menipis&&<Lencana varian="warning">Stok Menipis</Lencana>}<Tombol onClick={()=>onBukaBahan(bahan.id)}>Buka detail bahan</Tombol><Tombol varian="secondary" onClick={()=>setBahan(null)}>Pindai lagi</Tombol></section>}

            {hasil !== null && (
                <section aria-labelledby="judul-hasil" className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-default p-4">
                    <h2 id="judul-hasil" className="text-lg font-semibold text-text-primary">
                        <span className="font-mono">{hasil.aset.kode_barang}</span> · {hasil.aset.nama}
                    </h2>
                    {hasil.jenis === "pindai" && (
                        <>
                            {hasil.aset.dihapuskan && <Peringatan varian="warning">Aset tidak aktif — aksi transaksional tidak tersedia.</Peringatan>}
                            <p className="text-sm text-text-secondary">
                                {hasil.aset.kategori_nama} · {hasil.aset.lokasi.ruang} · {hasil.aset.lokasi.gedung}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Lencana varian="neutral">{LABEL_KONDISI_ASET[hasil.aset.kondisi]}</Lencana>
                                <Lencana varian="neutral">{LABEL_STATUS_ASET[hasil.aset.status]}</Lencana>
                            </div>
                        </>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {bisaBuka(hasil.aset.id) && <Tombol onClick={() => onBuka(hasil.aset.id)}>Buka detail aset</Tombol>}
                        <Tombol
                            varian="secondary"
                            onClick={() => {
                                setHasil(null);
                                setKode("");
                            }}
                        >
                            Pindai lagi
                        </Tombol>
                    </div>
                </section>
            )}

            {/* UX-02, FR-05.2 A1: input kode manual selalu terlihat dan dalam urutan fokus. */}
            {can("material.view")&&<a href="/bahan" className="text-text-link underline">Cari bahan berdasarkan nama</a>}
            {can("asset.view")&&<form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void cariManual();
                }}
            >
                <div className="flex-1">
                    <Isian label="Masukkan kode aset manual" value={kode} onChange={(e) => setKode(e.target.value)} />
                </div>
                <Tombol type="submit" varian="secondary" sibuk={sibuk}>
                    Cari
                </Tombol>
            </form>}
        </div>
    );
}
