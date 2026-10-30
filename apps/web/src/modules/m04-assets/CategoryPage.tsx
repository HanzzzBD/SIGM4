// P-21 Kategori Aset (UX §6; FR-04.5 langkah 1–3, A1–A4, AC; PR-02-46). Pohon dua tingkat (induk → sub),
// umur teknis dan interval preventif; tambah/ubah lewat satu formulir, hapus lewat dialog konfirmasi.
// Kategori terpakai/berisi subkategori ditolak server dan pesannya ditampilkan apa adanya (FR-04.5 A2/A3).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, Peringatan, Pilihan, Tombol, gabung } from "../../shared/ui/primitives";
import { KartuEntitas, KepalaHalaman, PengalihTampilan, useTampilanDaftar } from "../../shared/ui/visual";
import type { KategoriLengkap } from "./form-aset";
import { KUNCI_KATEGORI, angkaAtauNull, galatIsian, hapusKategori, kategoriLengkapQuery, simpanKategori } from "./form-aset";

const TH = "sticky top-0 h-header-table bg-surface-subtle px-4 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";
const KOSONG = { nama: "", kode: "", induk: "", umur: "", interval: "" };
type Isi = typeof KOSONG;
const dari = (k: KategoriLengkap): Isi => ({ nama: k.nama, kode: k.kode, induk: k.parent_id ?? "", umur: k.umur_teknis_tahun === null ? "" : String(k.umur_teknis_tahun), interval: k.interval_preventif_hari === null ? "" : String(k.interval_preventif_hari) });

/** Selaras skema server (SDD-FE-05): bilangan bulat positif atau kosong. */
export function periksaKategori(f: Isi): Readonly<Record<string, string>> {
    const g: Record<string, string> = {};
    if (f.nama.trim() === "") g["nama"] = "Nama kategori wajib diisi.";
    if (f.kode.trim() === "") g["kode"] = "Kode kategori wajib diisi.";
    for (const [k, kunci] of [["umur", "umur_teknis_tahun"], ["interval", "interval_preventif_hari"]] as const) if (f[k].trim() !== "" && !/^[1-9]\d*$/.test(f[k].trim())) g[kunci] = "Isi bilangan bulat lebih dari nol, atau kosongkan.";
    return g;
}

export default function CategoryPage() {
    const qc = useQueryClient();
    const kueri = useQuery(kategoriLengkapQuery);
    const [tampilan, setTampilan] = useTampilanDaftar("P-21");
    const [edit, setEdit] = useState<string | null>(null);
    const [f, setF] = useState<Isi>(KOSONG);
    const [galat, setGalat] = useState<Readonly<Record<string, string>>>({});
    const [umum, setUmum] = useState<string | null>(null);
    const [pesan, setPesan] = useState<string | null>(null);
    const [sibuk, setSibuk] = useState(false);
    const [hapus, setHapus] = useState<KategoriLengkap | null>(null);
    const [galatHapus, setGalatHapus] = useState<string | undefined>(undefined);

    if (kueri.isPending) return <KeadaanMemuat baris={6} label="Memuat kategori aset" />;
    if (kueri.isError) return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    const semua = kueri.data;
    const induk = semua.filter((k) => k.parent_id === null);
    const atur = (k: keyof Isi, v: string) => setF((l) => ({ ...l, [k]: v }));
    const mulai = (k: KategoriLengkap | null) => {
        setEdit(k?.id ?? null);
        setF(k === null ? KOSONG : dari(k));
        setGalat({});
        setUmum(null);
    };

    const kirim = async (e: SyntheticEvent) => {
        e.preventDefault();
        const g = periksaKategori(f);
        setGalat(g);
        setUmum(null);
        setPesan(null);
        if (Object.keys(g).length > 0) return;
        setSibuk(true);
        try {
            await simpanKategori(edit, { nama: f.nama.trim(), kode: f.kode.trim(), parent_id: f.induk === "" ? null : Number(f.induk), umur_teknis_tahun: angkaAtauNull(f.umur), interval_preventif_hari: angkaAtauNull(f.interval) });
            setPesan(edit === null ? `Kategori ${f.nama.trim()} ditambahkan.` : `Kategori ${f.nama.trim()} diperbarui.`);
            mulai(null);
            await qc.invalidateQueries({ queryKey: KUNCI_KATEGORI });
        } catch (err) {
            const p = galatIsian(err);
            setGalat(p.isian);
            setUmum(p.umum);
        } finally {
            setSibuk(false);
        }
    };

    const konfirmasiHapus = async () => {
        if (hapus === null) return;
        setSibuk(true);
        setGalatHapus(undefined);
        try {
            await hapusKategori(hapus.id);
            setPesan(`Kategori ${hapus.nama} dihapus.`);
            setHapus(null);
            await qc.invalidateQueries({ queryKey: KUNCI_KATEGORI });
        } catch (err) {
            // FR-04.5 A2/A3: kategori terpakai aset atau berisi subkategori — alasan dari server.
            setGalatHapus(galatIsian(err).umum ?? Object.values(galatIsian(err).isian)[0] ?? "Kategori belum dapat dihapus.");
        } finally {
            setSibuk(false);
        }
    };

    const aksi = (k: KategoriLengkap) => (
        <div className="flex gap-2">
            <Tombol varian="secondary" aria-label={`Ubah kategori ${k.nama}`} onClick={() => mulai(k)}>
                Ubah
            </Tombol>
            <Tombol varian="tertiary" aria-label={`Hapus kategori ${k.nama}`} onClick={() => setHapus(k)}>
                Hapus
            </Tombol>
        </div>
    );
    const umur = (k: KategoriLengkap) => (k.umur_teknis_tahun === null ? "—" : `${String(k.umur_teknis_tahun)} tahun`);
    const interval = (k: KategoriLengkap) => (k.interval_preventif_hari === null ? "—" : `${String(k.interval_preventif_hari)} hari`);
    // Urutan pohon dua tingkat dipertahankan pada kedua tampilan: induk lalu subkategorinya.
    const urut = induk.flatMap((k) => [k, ...semua.filter((s) => s.parent_id === k.id)]);
    const namaInduk = (k: KategoriLengkap) => semua.find((s) => s.id === k.parent_id)?.nama;

    return (
        <div className="flex flex-col gap-6">
            <KepalaHalaman judul="Kategori Aset" ikon="kategori" accent="accent-blue" info={{ judul: "Tentang Kategori Aset", isi: "Dua tingkat: kategori induk dan subkategori. Interval preventif dipakai jadwal pemeliharaan." }} aksi={<PengalihTampilan nilai={tampilan} onUbah={setTampilan} />} />
            {pesan !== null && <Peringatan varian="success">{pesan}</Peringatan>}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <section aria-labelledby="judul-daftar-kategori" className="flex flex-col gap-3 lg:col-span-2">
                    <h2 id="judul-daftar-kategori" className="text-lg font-semibold text-text-primary">
                        Daftar kategori
                    </h2>
                    {semua.length === 0 ? (
                        <KeadaanKosong judul="Belum ada kategori" pesan="Tambahkan kategori pertama melalui formulir." />
                    ) : tampilan === "kartu" ? (
                        <ul aria-label="Daftar kategori aset" className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {urut.map((k) => (
                                <li key={k.id} className="flex flex-col gap-2">
                                    <KartuEntitas judul={k.nama} href={`/aset?kategori=${k.id}`} ikon="kategori" meta={[k.kode, namaInduk(k) === undefined ? "Kategori utama" : `Sub dari ${namaInduk(k) ?? ""}`]} status={[{ label: `Preventif ${interval(k)}`, varian: "neutral" }]} />
                                    {aksi(k)}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="overflow-auto border border-border-subtle bg-surface-default">
                            <table className="w-full border-collapse">
                                <caption className="sr-only">Daftar kategori aset</caption>
                                <thead>
                                    <tr>
                                        {["Nama", "Kode", "Umur teknis", "Interval preventif", "Aksi"].map((h) => (
                                            <th key={h} scope="col" className={TH}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {urut.map((k) => (
                                        <tr key={k.id} className="h-row">
                                            <th scope="row" className={gabung(TD, "text-left font-medium", k.parent_id !== null && "pl-8")}>
                                                {k.nama}
                                            </th>
                                            <td className={`${TD} font-mono text-sm`}>{k.kode}</td>
                                            <td className={`${TD} tabular-nums`}>{umur(k)}</td>
                                            <td className={`${TD} tabular-nums`}>{interval(k)}</td>
                                            <td className={TD}>{aksi(k)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
                <form noValidate onSubmit={(e) => void kirim(e)} aria-labelledby="judul-form-kategori" className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4">
                    <h2 id="judul-form-kategori" className="text-lg font-semibold text-text-primary">
                        {edit === null ? "Tambah kategori" : "Ubah kategori"}
                    </h2>
                    {umum !== null && <Peringatan varian="error">{umum}</Peringatan>}
                    <Isian label="Nama" required value={f.nama} galat={galat["nama"]} onChange={(e) => atur("nama", e.target.value)} />
                    <Isian label="Kode" required value={f.kode} galat={galat["kode"]} onChange={(e) => atur("kode", e.target.value)} />
                    {/* FR-04.5 AC: dua tingkat — hanya kategori induk yang dapat menjadi induk. */}
                    <Pilihan label="Induk" kosong="Tanpa induk (kategori utama)" value={f.induk} galat={galat["parent_id"]} opsi={induk.filter((k) => k.id !== edit).map((k) => ({ nilai: k.id, label: k.nama }))} onChange={(e) => atur("induk", e.target.value)} />
                    <Isian label="Umur teknis (tahun)" inputMode="numeric" value={f.umur} galat={galat["umur_teknis_tahun"]} onChange={(e) => atur("umur", e.target.value)} />
                    <Isian label="Interval preventif (hari)" inputMode="numeric" value={f.interval} galat={galat["interval_preventif_hari"]} onChange={(e) => atur("interval", e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                        <Tombol type="submit" sibuk={sibuk}>
                            {edit === null ? "Tambah kategori" : "Simpan perubahan"}
                        </Tombol>
                        {edit !== null && (
                            <Tombol varian="tertiary" onClick={() => mulai(null)}>
                                Batal ubah
                            </Tombol>
                        )}
                    </div>
                </form>
            </div>
            {hapus !== null && (
                <DialogKonfirmasi buka onTutup={() => setHapus(null)} judul={`Hapus kategori ${hapus.nama}?`} labelAksi="Hapus kategori" varian="danger" sibuk={sibuk} galat={galatHapus} onKonfirmasi={() => void konfirmasiHapus()}>
                    Kategori yang masih dipakai aset atau memiliki subkategori tidak dapat dihapus.
                </DialogKonfirmasi>
            )}
        </div>
    );
}
