// P-24 Label QR (UX §6, F-05; FR-05.1 langkah 2–5, A1; PR-03-28). Pilih aset (dibawa `?aset=` dari P-16/P-18
// atau dicari) → pilih tata letak & elemen → unduh PDF (≤200 label) → tandai label terpasang. Cetak ulang
// memakai UUID yang sama (A1); regenerasi UUID bukan di sini (Administrator, P-18).

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Isian, KotakCentang, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import { KepalaHalaman } from "../../shared/ui/visual";
import type { AsetRingkas, TataLetak } from "./api";
import { LABEL_TATA_LETAK, MAKS_LABEL, TATA_LETAK, asetRingkasQuery, cariAsetQuery, cetakLabel, tandaiTerpasang } from "./api";

export default function LabelQrPage({ awal, belum = false }: { readonly awal: readonly string[]; readonly belum?: boolean }) {
    const qc = useQueryClient();
    const [pilihan, setPilihan] = useState<ReadonlyMap<string, AsetRingkas>>(new Map());
    const [kata, setKata] = useState("");
    const [cari, setCari] = useState("");
    const [tata, setTata] = useState<TataLetak>("A4_3X8");
    const [elemen, setElemen] = useState({ kode_aset: true, nama: true });
    const [sibuk, setSibuk] = useState<"cetak" | "tandai" | null>(null);
    const [status, setStatus] = useState<{ readonly varian: "success" | "error"; readonly pesan: string } | null>(null);
    const [page, setPage] = useState(1);
    const hasilCari = useQuery(cariAsetQuery(cari, belum, page));
    const awalan = useQueries({ queries: awal.slice(0, MAKS_LABEL).map((id) => asetRingkasQuery(id)) });

    // Aset bawaan URL masuk ke pilihan begitu termuat (sekali per id).
    const termuat = awalan.flatMap((q) => (q.data === undefined ? [] : [q.data]));
    const kunciTermuat = termuat.map((a) => a.id).join(",");
    useEffect(() => {
        if (termuat.length === 0) return;
        setPilihan((l) => {
            const baru = new Map(l);
            for (const a of termuat) if (!baru.has(a.id)) baru.set(a.id, a);
            return baru.size === l.size ? l : baru;
        });
        // Hanya bergantung pada himpunan id yang termuat, bukan identitas larik tiap render.
    }, [kunciTermuat]);

    const daftar = [...pilihan.values()];
    const penuh = daftar.length >= MAKS_LABEL;
    const tambah = (a: AsetRingkas) => setPilihan((l) => (l.has(a.id) || l.size >= MAKS_LABEL ? l : new Map(l).set(a.id, a)));
    const lepas = (id: string) =>
        setPilihan((l) => {
            const baru = new Map(l);
            baru.delete(id);
            return baru;
        });

    const unduh = async () => {
        setSibuk("cetak");
        setStatus(null);
        try {
            const { blob, nama } = await cetakLabel({ asset_ids: daftar.map((a) => Number(a.id)), tata_letak: tata, elemen });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = nama;
            a.click();
            URL.revokeObjectURL(url);
            setStatus({ varian: "success", pesan: `PDF ${String(daftar.length)} label diunduh. Setelah ditempel, tandai label sebagai terpasang.` });
        } catch {
            setStatus({ varian: "error", pesan: "PDF label belum dapat dibuat. Coba lagi beberapa saat lagi." });
        } finally {
            setSibuk(null);
        }
    };

    const tandai = async () => {
        setSibuk("tandai");
        setStatus(null);
        try {
            const n = await tandaiTerpasang(daftar.map((a) => Number(a.id)), true);
            setPilihan(new Map(daftar.map((a) => [a.id, { ...a, qr_terpasang: true }])));
            await qc.invalidateQueries({ queryKey: ["assets"] });
            setStatus({ varian: "success", pesan: n === 0 ? "Seluruh label sudah tercatat terpasang." : `${String(n)} aset ditandai berlabel QR.` });
        } catch {
            setStatus({ varian: "error", pesan: "Penandaan label belum tersimpan. Coba lagi." });
        } finally {
            setSibuk(null);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <KepalaHalaman judul="Label QR" ikon="qr" accent="accent-blue" info={{ judul: "Tentang Label QR", isi: `Susun lembar label untuk dicetak. Satu cetakan memuat hingga ${String(MAKS_LABEL)} label; mencetak ulang tidak mengubah QR.` }} />
            {status !== null && <Peringatan varian={status.varian}>{status.pesan}</Peringatan>}
            {belum && <div className="flex flex-col gap-3"><Peringatan varian="info">Menampilkan aset yang belum berlabel QR. Pilih aset yang akan dicetak.</Peringatan><nav aria-label="Halaman aset belum berlabel" className="flex flex-wrap items-center gap-3"><Tombol varian="secondary" disabled={page <= 1 || hasilCari.isFetching} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Tombol><span>Halaman {page}</span><Tombol varian="secondary" disabled={hasilCari.isFetching || (hasilCari.data?.length ?? 0) < 25} onClick={() => setPage((p) => p + 1)}>Berikutnya</Tombol></nav></div>}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <section aria-labelledby="judul-pilih" className="flex flex-col gap-4 lg:col-span-2">
                    <h2 id="judul-pilih" className="text-lg font-semibold text-text-primary">
                        Aset terpilih ({daftar.length}/{MAKS_LABEL})
                    </h2>
                    <form
                        className="flex items-end gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setCari(kata);
                            setPage(1);
                        }}
                    >
                        <div className="min-w-0 flex-1">
                            <Isian label="Cari aset untuk ditambahkan (kode, nama, nomor seri)" type="search" value={kata} onChange={(e) => setKata(e.target.value)} />
                        </div>
                        <Tombol type="submit" varian="secondary">
                            Cari
                        </Tombol>
                    </form>
                    {hasilCari.isError && <KeadaanGalat galat={hasilCari.error} onCobaLagi={() => void hasilCari.refetch()} />}
                    {hasilCari.isFetching && <KeadaanMemuat label="Memuat aset untuk label QR" />}
                    {hasilCari.data !== undefined && (
                        <ul aria-label="Hasil pencarian" className="flex flex-col rounded-md border border-border-subtle bg-surface-default">
                            {hasilCari.data.length === 0 && <li className="p-4 text-base text-text-secondary">Tidak ada aset yang cocok.</li>}
                            {hasilCari.data.map((a) => (
                                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-3 last:border-b-0">
                                    <span className="min-w-0 break-words">
                                        <span className="font-mono">{a.kode_barang}</span> · {a.nama}
                                    </span>
                                    <Tombol varian="secondary" disabled={pilihan.has(a.id) || penuh} aria-label={`Tambahkan ${a.kode_barang}`} onClick={() => tambah(a)}>
                                        {pilihan.has(a.id) ? "Terpilih" : "Tambahkan"}
                                    </Tombol>
                                </li>
                            ))}
                        </ul>
                    )}
                    {daftar.length === 0 ? (
                        <p className="text-base text-text-secondary">Belum ada aset terpilih. Cari aset di atas, atau buka halaman ini dari Detail Aset.</p>
                    ) : (
                        <ul aria-label="Aset terpilih" className="flex flex-col rounded-md border border-border-subtle bg-surface-default">
                            {daftar.map((a) => (
                                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-3 last:border-b-0">
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono">{a.kode_barang}</span> · {a.nama}
                                        <Lencana varian={a.qr_terpasang ? "success" : "neutral"}>{a.qr_terpasang ? "Label terpasang" : "Belum berlabel"}</Lencana>
                                    </span>
                                    <Tombol varian="tertiary" aria-label={`Lepas ${a.kode_barang}`} onClick={() => lepas(a.id)}>
                                        Lepas
                                    </Tombol>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
                <section aria-labelledby="judul-lembar" className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4">
                    <h2 id="judul-lembar" className="text-lg font-semibold text-text-primary">
                        Lembar label
                    </h2>
                    <Pilihan label="Tata letak" value={tata} opsi={TATA_LETAK.map((t) => ({ nilai: t, label: LABEL_TATA_LETAK[t] }))} onChange={(e) => setTata(e.target.value as TataLetak)} />
                    <fieldset className="flex flex-col gap-1">
                        <legend className="text-sm font-medium text-text-primary">Elemen label (QR selalu tercetak)</legend>
                        <KotakCentang label="Kode aset" checked={elemen.kode_aset} onCheckedChange={(v) => setElemen((l) => ({ ...l, kode_aset: v }))} />
                        <KotakCentang label="Nama aset" checked={elemen.nama} onCheckedChange={(v) => setElemen((l) => ({ ...l, nama: v }))} />
                    </fieldset>
                    <Tombol ikon="unduh" sibuk={sibuk === "cetak"} disabled={daftar.length === 0 || sibuk !== null} onClick={() => void unduh()}>
                        Unduh PDF
                    </Tombol>
                    <Tombol varian="secondary" sibuk={sibuk === "tandai"} disabled={daftar.length === 0 || sibuk !== null} onClick={() => void tandai()}>
                        Tandai label terpasang
                    </Tombol>
                </section>
            </div>
        </div>
    );
}
