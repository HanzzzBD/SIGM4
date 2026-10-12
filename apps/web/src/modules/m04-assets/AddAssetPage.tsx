// P-16 Tambah Aset (UX §6, §7.1 C; FR-04.1 langkah 2–6, A1, A4; PR-02-46). Mendaftarkan 1–N unit sekaligus;
// hasilnya daftar unit berkode unik + jalan ke Cetak Label QR (P-24) bila terdaftar. Label di atas isian,
// "wajib" tertulis, galat server per isian (`error.details`), tombol nonaktif selama permintaan berjalan.

import { useQuery } from "@tanstack/react-query";
import { LABEL_KONDISI_ASET } from "@sigm4/schemas";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useCan } from "../../shared/auth";
import { jalurTerdaftar } from "../../shared/navigasi";
import { Isian, KotakCentang, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { AsetDibuat, Sumber } from "./form-aset";
import { LABEL_SUMBER, SUMBER, angkaAtauNull, daftarkanAset, galatIsian, penggunaAktifQuery, teksAtauNull } from "./form-aset";
import { KONDISI, kategoriQuery, ruanganQuery } from "./katalog";

const AWAL = { nama: "", kategori: "", ruangan: "", merek: "", model: "", nomorSeri: "", tahun: "", sumber: "PEMBELIAN" as Sumber, nilai: "", kondisi: "BAIK", pinjam: true, siswa: false, pj: "", jumlah: "1" };

/** Pemeriksaan klien yang sama dengan skema server (SDD-FE-05) — server tetap pemutus. */
export function periksaAsetBaru(f: typeof AWAL): Readonly<Record<string, string>> {
    const g: Record<string, string> = {};
    if (f.nama.trim() === "") g["nama"] = "Nama aset wajib diisi.";
    if (f.kategori === "") g["category_id"] = "Pilih kategori.";
    if (f.ruangan === "") g["room_id"] = "Pilih ruangan.";
    if (!/^\d{4}$/.test(f.tahun) || Number(f.tahun) < 1900 || Number(f.tahun) > 2100) g["tahun_perolehan"] = "Isi tahun empat digit, 1900–2100.";
    const n = Number(f.jumlah);
    if (!Number.isInteger(n) || n < 1 || n > 500) g["jumlah_unit"] = "Jumlah unit 1 sampai 500.";
    // Nomor seri mengidentifikasi satu unit fisik (BR-003).
    if (n > 1 && f.nomorSeri.trim() !== "") g["nomor_seri"] = "Nomor seri hanya untuk satu unit — kosongkan bila mendaftarkan lebih dari satu.";
    if (f.siswa && !f.pinjam) g["boleh_dipinjam_siswa"] = "Boleh dipinjam siswa menuntut aset dapat dipinjam.";
    if (f.nilai.trim() !== "" && !(Number(f.nilai) >= 0)) g["nilai_perolehan"] = "Nilai perolehan berupa angka rupiah, tidak negatif.";
    return g;
}

export default function AddAssetPage({ initialRoom }: { readonly initialRoom?: string | undefined }) {
    const can = useCan();
    const kategori = useQuery(kategoriQuery);
    const ruangan = useQuery({ ...ruanganQuery, enabled: can("location.view") });
    const pengguna = useQuery({ ...penggunaAktifQuery, enabled: can("user.view") });
    const [f, setF] = useState(() => ({ ...AWAL, ruangan: initialRoom ?? "" }));
    const [galat, setGalat] = useState<Readonly<Record<string, string>>>({});
    const [umum, setUmum] = useState<string | null>(null);
    const [sibuk, setSibuk] = useState(false);
    const [hasil, setHasil] = useState<readonly AsetDibuat[] | null>(null);
    const atur = <K extends keyof typeof AWAL>(k: K, v: (typeof AWAL)[K]) => setF((l) => ({ ...l, [k]: v }));

    const kirim = async (e: SyntheticEvent) => {
        e.preventDefault();
        const g = periksaAsetBaru(f);
        setGalat(g);
        setUmum(null);
        if (Object.keys(g).length > 0) return;
        setSibuk(true);
        try {
            setHasil(
                await daftarkanAset({
                    nama: f.nama.trim(),
                    category_id: Number(f.kategori),
                    merek: teksAtauNull(f.merek),
                    model: teksAtauNull(f.model),
                    nomor_seri: teksAtauNull(f.nomorSeri),
                    tahun_perolehan: Number(f.tahun),
                    sumber_perolehan: f.sumber,
                    nilai_perolehan: angkaAtauNull(f.nilai),
                    room_id: Number(f.ruangan),
                    kondisi: f.kondisi,
                    dapat_dipinjam: f.pinjam,
                    boleh_dipinjam_siswa: f.siswa,
                    penanggung_jawab_id: f.pj === "" ? null : Number(f.pj),
                    jumlah_unit: Number(f.jumlah),
                }),
            );
        } catch (err) {
            const p = galatIsian(err);
            setGalat(p.isian);
            setUmum(p.umum);
        } finally {
            setSibuk(false);
        }
    };

    if (hasil !== null) {
        const ids = hasil.map((a) => a.id).join(",");
        return (
            <div className="flex max-w-prose flex-col gap-6">
                <h1 className="text-2xl font-semibold text-text-heading">Aset terdaftar</h1>
                <Peringatan varian="success">{hasil.length === 1 ? "1 unit aset berhasil didaftarkan." : `${String(hasil.length)} unit aset berhasil didaftarkan, masing-masing berkode dan ber-QR unik.`}</Peringatan>
                <ul aria-label="Unit yang terbentuk" className="flex flex-col rounded-md border border-border-subtle bg-surface-default">
                    {hasil.map((a) => (
                        <li key={a.id} className="border-b border-border-subtle p-4 last:border-b-0">
                            {jalurTerdaftar(`/aset/${a.id}`) ? (
                                <a href={`/aset/${a.id}`} className="font-mono text-text-link hover:text-text-link-hover">
                                    {a.kode_barang}
                                </a>
                            ) : (
                                <span className="font-mono">{a.kode_barang}</span>
                            )}{" "}
                            · {a.nama}
                        </li>
                    ))}
                </ul>
                <div className="flex flex-wrap gap-3">
                    {can("asset.qr_print") && jalurTerdaftar("/label-qr") && (
                        <a href={`/label-qr?aset=${ids}`} className="inline-flex min-h-control-md items-center rounded-md bg-teal-600 px-4 text-base font-medium text-text-inverse hover:bg-teal-700">
                            Cetak Label QR
                        </a>
                    )}
                    <Tombol varian="secondary" onClick={() => setHasil(null)}>
                        Tambah aset lain
                    </Tombol>
                    <a href={jalurTerdaftar("/aset") ? "/aset" : "/"} className="inline-flex min-h-control-md items-center px-4 text-base font-medium text-text-link hover:text-text-link-hover">
                        Kembali ke Inventaris
                    </a>
                </div>
            </div>
        );
    }

    const jumlahLebih = Number(f.jumlah) > 1;
    return (
        <form noValidate onSubmit={(e) => void kirim(e)} className="flex max-w-prose flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-text-heading">Tambah Aset</h1>
                <p className="text-base text-text-secondary">Daftarkan satu atau beberapa unit sekaligus. Kode aset dan QR dibuat otomatis untuk setiap unit.</p>
            </header>
            {umum !== null && <Peringatan varian="error">{umum}</Peringatan>}
            <Isian label="Nama aset" required value={f.nama} galat={galat["nama"]} onChange={(e) => atur("nama", e.target.value)} />
            <div className="flex flex-col gap-2">
                <Pilihan label="Kategori" required kosong="Pilih kategori" value={f.kategori} galat={galat["category_id"]} opsi={(kategori.data ?? []).map((k) => ({ nilai: k.id, label: k.nama }))} onChange={(e) => atur("kategori", e.target.value)} />
                {/* FR-04.1 A4: kategori belum ada → kelola kategori. */}
                {can("category.manage") && jalurTerdaftar("/kategori-aset") && (
                    <a href="/kategori-aset" className="self-start text-sm text-text-link hover:text-text-link-hover">
                        Kategori belum ada? Kelola kategori aset
                    </a>
                )}
            </div>
            <Pilihan label="Ruangan" required kosong="Pilih ruangan" value={f.ruangan} galat={galat["room_id"]} opsi={(ruangan.data ?? []).map((r) => ({ nilai: r.id, label: r.nama }))} onChange={(e) => atur("ruangan", e.target.value)} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Isian label="Merek" value={f.merek} galat={galat["merek"]} onChange={(e) => atur("merek", e.target.value)} />
                <Isian label="Model" value={f.model} galat={galat["model"]} onChange={(e) => atur("model", e.target.value)} />
                <Isian label="Tahun perolehan" required inputMode="numeric" value={f.tahun} galat={galat["tahun_perolehan"]} onChange={(e) => atur("tahun", e.target.value)} />
                <Isian label="Jumlah unit" required type="number" min={1} max={500} value={f.jumlah} galat={galat["jumlah_unit"]} onChange={(e) => atur("jumlah", e.target.value)} />
                <Isian label="Nomor seri" value={f.nomorSeri} disabled={jumlahLebih} galat={galat["nomor_seri"]} {...(jumlahLebih ? { bantuan: "Tidak tersedia untuk lebih dari satu unit." } : {})} onChange={(e) => atur("nomorSeri", e.target.value)} />
                <Pilihan label="Kondisi awal" required value={f.kondisi} opsi={KONDISI.filter((k) => k !== "HILANG").map((k) => ({ nilai: k, label: LABEL_KONDISI_ASET[k] }))} onChange={(e) => atur("kondisi", e.target.value)} />
                <Pilihan label="Sumber perolehan" required value={f.sumber} opsi={SUMBER.map((s) => ({ nilai: s, label: LABEL_SUMBER[s] }))} onChange={(e) => atur("sumber", e.target.value as Sumber)} />
                <Isian label="Nilai perolehan (Rp)" inputMode="decimal" value={f.nilai} galat={galat["nilai_perolehan"]} onChange={(e) => atur("nilai", e.target.value)} />
            </div>
            {can("user.view") && <Pilihan label="Penanggung jawab" kosong="Tanpa penanggung jawab" value={f.pj} opsi={(pengguna.data ?? []).map((u) => ({ nilai: u.id, label: u.nama }))} onChange={(e) => atur("pj", e.target.value)} />}
            <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-medium text-text-primary">Kelayakan pinjam</legend>
                <KotakCentang label="Dapat dipinjam" checked={f.pinjam} onCheckedChange={(v) => setF((l) => ({ ...l, pinjam: v, siswa: v ? l.siswa : false }))} />
                <KotakCentang label="Boleh dipinjam siswa" checked={f.siswa} disabled={!f.pinjam} onCheckedChange={(v) => atur("siswa", v)} />
                {galat["boleh_dipinjam_siswa"] !== undefined && <p className="text-sm text-error-base">{galat["boleh_dipinjam_siswa"]}</p>}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
                <Tombol type="submit" sibuk={sibuk}>
                    Daftarkan aset
                </Tombol>
                <a href={jalurTerdaftar("/aset") ? "/aset" : "/"} className="inline-flex min-h-control-md items-center px-4 text-base font-medium text-text-link hover:text-text-link-hover">
                    Batal
                </a>
            </div>
        </form>
    );
}
