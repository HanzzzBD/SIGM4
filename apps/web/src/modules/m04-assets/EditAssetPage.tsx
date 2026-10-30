// P-19 Ubah Aset (UX §6, §7.1 C; FR-04.3 langkah 1–4; PR-02-46, keputusan 93e/93f). Atribut deskriptif;
// lokasi lewat Mutasi (FR-04.4), kategori & kode tetap. Data perolehan hanya bila server mengirimnya
// (BR-073). Kondisi berubah → alasan wajib (BR-007), Hilang → rujukan wajib (BR-012); semua dalam satu
// PUT atomik. Batal dengan perubahan belum tersimpan meminta konfirmasi (UX-04).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LABEL_KONDISI_ASET } from "@sigm4/schemas";
import type { AssetDetail } from "@sigm4/schemas";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { ApiError } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, KotakCentang, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import { KepalaHalaman } from "../../shared/ui/visual";
import type { Sumber } from "./form-aset";
import { LABEL_SUMBER, SUMBER, angkaAtauNull, galatIsian, penggunaAktifQuery, teksAtauNull, ubahAset } from "./form-aset";
import { KONDISI, detailAsetQuery } from "./katalog";

const isianDari = (d: AssetDetail) => ({
    nama: d.nama,
    merek: d.merek ?? "",
    model: d.model ?? "",
    nomorSeri: d.nomor_seri ?? "",
    tahun: String(d.tahun_perolehan),
    pinjam: d.dapat_dipinjam,
    siswa: d.boleh_dipinjam_siswa,
    pj: d.penanggung_jawab?.id ?? "",
    sumber: (d.sumber_perolehan ?? "PEMBELIAN") as Sumber,
    nilai: d.nilai_perolehan === null || d.nilai_perolehan === undefined ? "" : String(Number(d.nilai_perolehan)),
    kondisi: d.kondisi as string,
    alasan: "",
    refJenis: "",
    refId: "",
});
type IsianUbah = ReturnType<typeof isianDari>;

/** Pemeriksaan klien selaras dengan aturan server (SDD-FE-05). */
export function periksaUbah(f: IsianUbah, kondisiLama: string): Readonly<Record<string, string>> {
    const g: Record<string, string> = {};
    if (f.nama.trim() === "") g["nama"] = "Nama aset wajib diisi.";
    if (!/^\d{4}$/.test(f.tahun) || Number(f.tahun) < 1900 || Number(f.tahun) > 2100) g["tahun_perolehan"] = "Isi tahun empat digit, 1900–2100.";
    if (f.siswa && !f.pinjam) g["boleh_dipinjam_siswa"] = "Boleh dipinjam siswa menuntut aset dapat dipinjam.";
    if (f.kondisi !== kondisiLama && f.alasan.trim() === "") g["alasan"] = "Alasan perubahan kondisi wajib diisi.";
    if (f.kondisi === "HILANG" && f.kondisi !== kondisiLama && (f.refJenis.trim() === "" || !/^[1-9]\d*$/.test(f.refId))) g["referensi_jenis"] = "Kondisi Hilang wajib merujuk sesi stock opname atau berita acara kehilangan.";
    return g;
}

export default function EditAssetPage({ id, onSelesai }: { readonly id: string; readonly onSelesai: () => void }) {
    const kueri = useQuery(detailAsetQuery(id));
    if (kueri.isPending) return <KeadaanMemuat baris={8} label="Memuat data aset" />;
    if (kueri.isError) {
        if (kueri.error instanceof ApiError && kueri.error.status === 404) return <KeadaanKosong judul="Aset tidak ditemukan" pesan="Aset ini tidak ada atau tidak dapat Anda ubah." />;
        return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    }
    if (kueri.data.dihapuskan) return <KeadaanKosong judul="Aset telah dihapuskan" pesan="Aset yang sudah dihapuskan tidak dapat diubah; riwayatnya tetap dapat dilihat." />;
    return <Formulir d={kueri.data} onSelesai={onSelesai} />;
}

function Formulir({ d, onSelesai }: { readonly d: AssetDetail; readonly onSelesai: () => void }) {
    const can = useCan();
    const qc = useQueryClient();
    const pengguna = useQuery({ ...penggunaAktifQuery, enabled: can("user.view") });
    const awal = isianDari(d);
    const [f, setF] = useState(awal);
    const [galat, setGalat] = useState<Readonly<Record<string, string>>>({});
    const [umum, setUmum] = useState<string | null>(null);
    const [sibuk, setSibuk] = useState(false);
    const [konfirmasiBatal, setKonfirmasiBatal] = useState(false);
    const atur = <K extends keyof IsianUbah>(k: K, v: IsianUbah[K]) => setF((l) => ({ ...l, [k]: v }));
    const berubah = JSON.stringify(f) !== JSON.stringify(awal);
    const finansial = d.sumber_perolehan !== undefined;
    const kondisiBerubah = f.kondisi !== d.kondisi;

    const kirim = async (e: SyntheticEvent) => {
        e.preventDefault();
        const g = periksaUbah(f, d.kondisi);
        setGalat(g);
        setUmum(null);
        if (Object.keys(g).length > 0) return;
        setSibuk(true);
        try {
            await ubahAset(d.id, {
                nama: f.nama.trim(),
                merek: teksAtauNull(f.merek),
                model: teksAtauNull(f.model),
                nomor_seri: teksAtauNull(f.nomorSeri),
                tahun_perolehan: Number(f.tahun),
                dapat_dipinjam: f.pinjam,
                boleh_dipinjam_siswa: f.siswa,
                penanggung_jawab_id: f.pj === "" ? null : Number(f.pj),
                ...(finansial ? { sumber_perolehan: f.sumber, nilai_perolehan: angkaAtauNull(f.nilai) } : {}),
                ...(kondisiBerubah ? { kondisi: f.kondisi, alasan: f.alasan.trim(), ...(f.kondisi === "HILANG" ? { referensi_jenis: f.refJenis.trim(), referensi_id: Number(f.refId) } : {}) } : {}),
            });
            await qc.invalidateQueries({ queryKey: ["assets"] });
            onSelesai();
        } catch (err) {
            const p = galatIsian(err);
            setGalat(p.isian);
            setUmum(p.umum);
        } finally {
            setSibuk(false);
        }
    };

    return (
        <form noValidate onSubmit={(e) => void kirim(e)} className="flex max-w-prose flex-col gap-6">
            <KepalaHalaman judul="Ubah Aset" ikon="aset" accent="accent-blue" identitas={[d.kode_barang, d.nama]} info={{ judul: "Tentang Ubah Aset", isi: `Kategori ${d.kategori.nama} dan kode aset tetap. Lokasi diubah lewat Mutasi Lokasi.` }} />
            {umum !== null && <Peringatan varian="error">{umum}</Peringatan>}
            <Isian label="Nama aset" required value={f.nama} galat={galat["nama"]} onChange={(e) => atur("nama", e.target.value)} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Isian label="Merek" value={f.merek} galat={galat["merek"]} onChange={(e) => atur("merek", e.target.value)} />
                <Isian label="Model" value={f.model} galat={galat["model"]} onChange={(e) => atur("model", e.target.value)} />
                <Isian label="Nomor seri" value={f.nomorSeri} galat={galat["nomor_seri"]} onChange={(e) => atur("nomorSeri", e.target.value)} />
                <Isian label="Tahun perolehan" required inputMode="numeric" value={f.tahun} galat={galat["tahun_perolehan"]} onChange={(e) => atur("tahun", e.target.value)} />
                {finansial && <Pilihan label="Sumber perolehan" required value={f.sumber} opsi={SUMBER.map((s) => ({ nilai: s, label: LABEL_SUMBER[s] }))} onChange={(e) => atur("sumber", e.target.value as Sumber)} />}
                {finansial && <Isian label="Nilai perolehan (Rp)" inputMode="decimal" value={f.nilai} galat={galat["nilai_perolehan"]} onChange={(e) => atur("nilai", e.target.value)} />}
            </div>
            {can("user.view") && (
                <Pilihan
                    label="Penanggung jawab"
                    kosong="Tanpa penanggung jawab"
                    value={f.pj}
                    opsi={[...(pengguna.data ?? []), ...(d.penanggung_jawab !== null && !(pengguna.data ?? []).some((u) => u.id === d.penanggung_jawab?.id) ? [d.penanggung_jawab] : [])].map((u) => ({ nilai: u.id, label: u.nama }))}
                    onChange={(e) => atur("pj", e.target.value)}
                />
            )}
            <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-medium text-text-primary">Kelayakan pinjam</legend>
                <KotakCentang label="Dapat dipinjam" checked={f.pinjam} onCheckedChange={(v) => setF((l) => ({ ...l, pinjam: v, siswa: v ? l.siswa : false }))} />
                <KotakCentang label="Boleh dipinjam siswa" checked={f.siswa} disabled={!f.pinjam} onCheckedChange={(v) => atur("siswa", v)} />
                {galat["boleh_dipinjam_siswa"] !== undefined && <p className="text-sm text-error-base">{galat["boleh_dipinjam_siswa"]}</p>}
            </fieldset>
            {can("asset.update_condition") && (
                <fieldset className="flex flex-col gap-3 rounded-md border border-border-subtle p-4">
                    <legend className="px-1 text-sm font-medium text-text-primary">Kondisi</legend>
                    <Pilihan label="Kondisi" value={f.kondisi} opsi={KONDISI.map((k) => ({ nilai: k, label: LABEL_KONDISI_ASET[k] }))} onChange={(e) => atur("kondisi", e.target.value)} />
                    {kondisiBerubah && (
                        <div className="flex flex-col gap-2">
                            <label htmlFor="alasan-kondisi" className="text-sm font-medium text-text-primary">
                                Alasan perubahan kondisi<span className="font-regular text-text-secondary"> (wajib)</span>
                            </label>
                            <textarea
                                id="alasan-kondisi"
                                rows={3}
                                maxLength={500}
                                value={f.alasan}
                                aria-invalid={galat["alasan"] !== undefined || undefined}
                                aria-describedby={galat["alasan"] !== undefined ? "alasan-kondisi-galat" : undefined}
                                onChange={(e) => atur("alasan", e.target.value)}
                                className="rounded-sm border border-border-strong bg-surface-default px-4 py-3 text-base text-text-primary"
                            />
                            {galat["alasan"] !== undefined && (
                                <p id="alasan-kondisi-galat" className="text-sm text-error-base">
                                    {galat["alasan"]}
                                </p>
                            )}
                        </div>
                    )}
                    {kondisiBerubah && f.kondisi === "HILANG" && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Isian label="Jenis rujukan (sesi opname / berita acara)" required value={f.refJenis} galat={galat["referensi_jenis"]} onChange={(e) => atur("refJenis", e.target.value)} />
                            <Isian label="Nomor id rujukan" required inputMode="numeric" value={f.refId} galat={galat["referensi_id"]} onChange={(e) => atur("refId", e.target.value)} />
                        </div>
                    )}
                    {(f.kondisi === "RUSAK_BERAT" || f.kondisi === "HILANG") && kondisiBerubah && <p className="text-sm text-text-secondary">Aset akan berstatus Tidak Tersedia dan tidak dapat direservasi maupun dipinjam.</p>}
                </fieldset>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <Tombol type="submit" sibuk={sibuk}>
                    Simpan perubahan
                </Tombol>
                <Tombol varian="tertiary" onClick={() => (berubah ? setKonfirmasiBatal(true) : onSelesai())}>
                    Batal
                </Tombol>
            </div>
            {konfirmasiBatal && (
                <DialogKonfirmasi buka onTutup={() => setKonfirmasiBatal(false)} judul="Buang perubahan?" labelAksi="Buang perubahan" varian="danger" onKonfirmasi={onSelesai}>
                    Perubahan yang belum disimpan akan hilang.
                </DialogKonfirmasi>
            )}
        </form>
    );
}
