// P-71 Kalender Akademik (UX §6 `/pengaturan/kalender-akademik`; Lampiran E.2, AC-YR-01/02; PR-01-24). Terbaca
// `setting.view`, diubah `setting.manage` (keputusan pemilik produk 11 Okt, sejalan 36d). Onboarding: tanpa tahun
// ajaran, formulir tahun pertama langsung tampil (otomatis aktif, AC-YR-01). Sesudah tahun aktif berganti, tautan
// Kenaikan Kelas Massal (P-64) baru ditampilkan SESUDAH cache bersama `['academic-years']` disegarkan.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useCan } from "../../shared/auth";
import { jalurDrilldown } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, KotakCentang, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { IsianTahun, JenisLibur, Libur, TahunAjaran } from "./api";
import {
    JENIS_LIBUR,
    LABEL_JENIS_LIBUR,
    LABEL_SEMESTER,
    NAMA_HARI,
    aktifkanTahun,
    buatLibur,
    buatTahun,
    galatIsian,
    hapusLibur,
    hariKerjaQuery,
    liburQuery,
    pesanGalat,
    segarkanTahun,
    simpanHariKerja,
    tahunQuery,
    tanggalId,
    ubahLibur,
    ubahTahun,
} from "./api";
import { NavPengaturan } from "./NavPengaturan";

const KARTU = "flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4";

function FormTahun({ awal, judul, keterangan, onSelesai, onBatal, onSibuk }: { readonly awal?: TahunAjaran | undefined; readonly judul: string; readonly keterangan?: string; readonly onSelesai: (t: TahunAjaran, penyunting: TahunAjaran | "baru") => void; readonly onBatal?: () => void; readonly onSibuk?: (sibuk: boolean) => void }) {
    const queryClient = useQueryClient();
    const smt = (n: "GANJIL" | "GENAP") => awal?.semester.find((s) => s.nama === n);
    const [isi, setIsi] = useState({
        nama: awal?.nama ?? "",
        mulai: awal?.tanggal_mulai ?? "",
        selesai: awal?.tanggal_selesai ?? "",
        ganjilMulai: smt("GANJIL")?.tanggal_mulai ?? "",
        ganjilSelesai: smt("GANJIL")?.tanggal_selesai ?? "",
        genapMulai: smt("GENAP")?.tanggal_mulai ?? "",
        genapSelesai: smt("GENAP")?.tanggal_selesai ?? "",
    });
    const [kurang, setKurang] = useState(false);
    const simpan = useMutation({
        mutationFn: (body: IsianTahun) => (awal === undefined ? buatTahun(body) : ubahTahun(awal.id, body)),
        onSuccess: async (t) => {
            await segarkanTahun(queryClient);
            onSelesai(t, awal ?? "baru");
        },
    });
    useEffect(() => {
        onSibuk?.(simpan.isPending);
        return () => onSibuk?.(false);
    }, [simpan.isPending, onSibuk]);
    const g = galatIsian(simpan.error);
    const ubah = (k: keyof typeof isi) => (e: { target: { value: string } }) => setIsi((x) => ({ ...x, [k]: e.target.value }));
    function kirim(e: FormEvent): void {
        e.preventDefault();
        if (Object.values(isi).some((v) => v.trim() === "")) return setKurang(true);
        simpan.mutate({
            nama: isi.nama.trim(),
            tanggal_mulai: isi.mulai,
            tanggal_selesai: isi.selesai,
            semester: [
                { nama: "GANJIL", tanggal_mulai: isi.ganjilMulai, tanggal_selesai: isi.ganjilSelesai },
                { nama: "GENAP", tanggal_mulai: isi.genapMulai, tanggal_selesai: isi.genapSelesai },
            ],
        });
    }
    const off = simpan.isPending;
    return (
        <form noValidate onSubmit={kirim} aria-labelledby="judul-form-tahun" className={KARTU}>
            <h2 id="judul-form-tahun" className="text-lg font-semibold text-text-heading">{judul}</h2>
            {keterangan !== undefined && <p className="text-base text-text-secondary">{keterangan}</p>}
            {kurang && <Peringatan varian="error">Lengkapi nama, rentang tahun ajaran, dan kedua semester.</Peringatan>}
            {simpan.isError && <Peringatan varian="error" judul="Tahun ajaran belum tersimpan">{g.umum ?? Object.values(g.isian).join(" ")}</Peringatan>}
            <Isian label="Nama tahun ajaran" required maxLength={50} placeholder="2026/2027" value={isi.nama} disabled={off} onChange={ubah("nama")} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Isian label="Tanggal mulai" type="date" required value={isi.mulai} disabled={off} onChange={ubah("mulai")} />
                <Isian label="Tanggal selesai" type="date" required value={isi.selesai} disabled={off} onChange={ubah("selesai")} />
                <Isian label="Semester Ganjil mulai" type="date" required value={isi.ganjilMulai} disabled={off} onChange={ubah("ganjilMulai")} />
                <Isian label="Semester Ganjil selesai" type="date" required value={isi.ganjilSelesai} disabled={off} onChange={ubah("ganjilSelesai")} />
                <Isian label="Semester Genap mulai" type="date" required value={isi.genapMulai} disabled={off} onChange={ubah("genapMulai")} />
                <Isian label="Semester Genap selesai" type="date" required value={isi.genapSelesai} disabled={off} onChange={ubah("genapSelesai")} />
            </div>
            <div className="flex flex-wrap gap-3">
                <Tombol type="submit" sibuk={off}>Simpan tahun ajaran</Tombol>
                {onBatal !== undefined && <Tombol varian="secondary" disabled={off} onClick={onBatal}>Batal</Tombol>}
            </div>
        </form>
    );
}

function HariLibur({ tahun, bolehUbah }: { readonly tahun: readonly TahunAjaran[]; readonly bolehUbah: boolean }) {
    const queryClient = useQueryClient();
    const [tahunId, setTahunId] = useState(() => (tahun.find((t) => t.is_active) ?? tahun[0])?.id ?? "");
    const semua = useQuery(liburQuery);
    // Tahun terpilih + hari libur berlaku umum (academic_year_id null), urut tanggal.
    const libur = { ...semua, data: semua.data?.filter((l) => l.academic_year_id === null || l.academic_year_id === tahunId).sort((a, b) => a.tanggal.localeCompare(b.tanggal)) };
    const [sunting, setSunting] = useState<Libur | "baru" | null>(null);
    const [hapus, setHapus] = useState<Libur | null>(null);
    const [isi, setIsi] = useState<{ tanggal: string; nama: string; jenis: JenisLibur | "" }>({ tanggal: "", nama: "", jenis: "" });
    const [kurang, setKurang] = useState(false);
    const segar = () => queryClient.invalidateQueries({ queryKey: ["holidays"] });
    const simpan = useMutation({
        // Penyunting yang dikirim ikut dibawa: penutupan sesudah sukses hanya berlaku bagi penyunting itu.
        mutationFn: (v: { readonly penyunting: Libur | "baru" }) => {
            // Hari libur berlaku umum tetap umum saat diubah; yang baru menempel pada tahun terpilih.
            const academic_year_id = v.penyunting !== "baru" && v.penyunting.academic_year_id === null ? null : Number(tahunId);
            const body = { tanggal: isi.tanggal, nama: isi.nama.trim(), jenis: isi.jenis as JenisLibur, academic_year_id };
            return v.penyunting === "baru" ? buatLibur(body) : ubahLibur(v.penyunting.id, body);
        },
        onSuccess: async (_h, v) => {
            await segar();
            setSunting((s) => (s === v.penyunting ? null : s));
        },
    });
    const buang = useMutation({ mutationFn: (id: string) => hapusLibur(id), onSuccess: async () => { await segar(); setHapus(null); } });
    // Selama simpan/hapus berjalan, pemilih tahun dan aksi hari libur lain dikunci.
    const terkunci = simpan.isPending || buang.isPending;
    const buka = (l: Libur | "baru") => {
        setSunting(l);
        setKurang(false);
        simpan.reset();
        setIsi(l === "baru" ? { tanggal: "", nama: "", jenis: "" } : { tanggal: l.tanggal.slice(0, 10), nama: l.nama, jenis: l.jenis });
    };
    return (
        <section aria-labelledby="judul-libur" className={KARTU}>
            <h2 id="judul-libur" className="text-lg font-semibold text-text-heading">Hari libur</h2>
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                    <Pilihan label="Tahun ajaran" value={tahunId} opsi={tahun.map((t) => ({ nilai: t.id, label: t.is_active ? `${t.nama} (aktif)` : t.nama }))} disabled={terkunci} onChange={(e) => { setTahunId(e.target.value); setSunting(null); }} />
                </div>
                {bolehUbah && sunting === null && <Tombol varian="secondary" disabled={terkunci} onClick={() => buka("baru")}>Tambah hari libur</Tombol>}
            </div>
            {sunting !== null && (
                <form
                    noValidate
                    aria-label={sunting === "baru" ? "Tambah hari libur" : "Ubah hari libur"}
                    onSubmit={(e) => { e.preventDefault(); if (isi.tanggal === "" || isi.nama.trim() === "" || isi.jenis === "") return setKurang(true); if (sunting !== null) simpan.mutate({ penyunting: sunting }); }}
                    className="grid grid-cols-1 gap-3 rounded-md border border-border-strong p-4 md:grid-cols-3"
                >
                    {kurang && <div className="md:col-span-3"><Peringatan varian="error">Tanggal, nama, dan jenis hari libur wajib diisi.</Peringatan></div>}
                    {simpan.isError && <div className="md:col-span-3"><Peringatan varian="error">{pesanGalat(simpan.error)}</Peringatan></div>}
                    <Isian label="Tanggal" type="date" required value={isi.tanggal} disabled={simpan.isPending} onChange={(e) => setIsi((x) => ({ ...x, tanggal: e.target.value }))} />
                    <Isian label="Nama hari libur" required maxLength={150} value={isi.nama} disabled={simpan.isPending} onChange={(e) => setIsi((x) => ({ ...x, nama: e.target.value }))} />
                    <Pilihan label="Jenis" required kosong="Pilih jenis" value={isi.jenis} disabled={simpan.isPending} opsi={JENIS_LIBUR.map((j) => ({ nilai: j, label: LABEL_JENIS_LIBUR[j] }))} onChange={(e) => setIsi((x) => ({ ...x, jenis: e.target.value as JenisLibur | "" }))} />
                    <div className="flex flex-wrap gap-3 md:col-span-3">
                        <Tombol type="submit" sibuk={simpan.isPending}>Simpan hari libur</Tombol>
                        <Tombol varian="secondary" disabled={simpan.isPending} onClick={() => setSunting(null)}>Batal</Tombol>
                    </div>
                </form>
            )}
            {libur.isPending ? (
                <KeadaanMemuat baris={3} label="Memuat hari libur" />
            ) : libur.isError ? (
                <KeadaanGalat galat={semua.error} onCobaLagi={() => void semua.refetch()} />
            ) : (libur.data ?? []).length === 0 ? (
                <p className="text-base text-text-secondary">Belum ada hari libur pada tahun ajaran ini.</p>
            ) : (
                <ul className="flex flex-col divide-y divide-border-subtle">
                    {(libur.data ?? []).map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <span className="text-base text-text-primary">
                                {tanggalId(l.tanggal)} — {l.nama} <Lencana varian="neutral">{LABEL_JENIS_LIBUR[l.jenis]}</Lencana>{l.academic_year_id === null && <> <Lencana varian="info">Berlaku umum</Lencana></>}
                            </span>
                            {bolehUbah && (
                                <span className="flex gap-2">
                                    <Tombol varian="tertiary" disabled={terkunci} onClick={() => buka(l)} aria-label={`Ubah ${l.nama}`}>Ubah</Tombol>
                                    <Tombol varian="tertiary" disabled={terkunci} onClick={() => setHapus(l)} aria-label={`Hapus ${l.nama}`}>Hapus</Tombol>
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            <DialogKonfirmasi buka={hapus !== null} onTutup={() => { setHapus(null); buang.reset(); }} judul={`Hapus hari libur ${hapus?.nama ?? ""}?`} labelAksi="Hapus" varian="danger" sibuk={buang.isPending} galat={buang.isError ? pesanGalat(buang.error) : undefined} onKonfirmasi={() => { if (hapus !== null) buang.mutate(hapus.id); }}>
                Tanggal ini kembali dihitung sebagai hari kerja bila jatuh pada hari kerja sekolah.
            </DialogKonfirmasi>
        </section>
    );
}

function HariKerja({ bolehUbah }: { readonly bolehUbah: boolean }) {
    const queryClient = useQueryClient();
    const kueri = useQuery(hariKerjaQuery);
    const [draf, setDraf] = useState<Record<number, boolean> | null>(null);
    const simpan = useMutation({
        mutationFn: simpanHariKerja,
        onSuccess: (data) => {
            queryClient.setQueryData(hariKerjaQuery.queryKey, data);
            setDraf(null);
        },
    });
    if (kueri.isPending) return <KeadaanMemuat baris={2} label="Memuat hari kerja" />;
    if (kueri.isError) return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    const nilai = draf ?? Object.fromEntries(kueri.data.map((h) => [h.hari, h.aktif]));
    const berubah = draf !== null && kueri.data.some((h) => draf[h.hari] !== h.aktif);
    return (
        <section aria-labelledby="judul-hari-kerja" className={KARTU}>
            <h2 id="judul-hari-kerja" className="text-lg font-semibold text-text-heading">Hari kerja sekolah</h2>
            <div className="flex flex-wrap gap-4">
                {NAMA_HARI.map((n, i) => (
                    <KotakCentang key={n} label={n} checked={nilai[i + 1] === true} disabled={!bolehUbah || simpan.isPending} onCheckedChange={(v) => setDraf({ ...nilai, [i + 1]: v })} />
                ))}
            </div>
            {simpan.isError && <Peringatan varian="error">{pesanGalat(simpan.error)}</Peringatan>}
            {bolehUbah && (
                <div>
                    <Tombol disabled={!berubah} sibuk={simpan.isPending} onClick={() => simpan.mutate(NAMA_HARI.map((_n, i) => ({ hari: i + 1, aktif: nilai[i + 1] === true })))}>Simpan hari kerja</Tombol>
                </div>
            )}
        </section>
    );
}

export default function CalendarPage() {
    const can = useCan();
    const bolehUbah = can("setting.manage");
    const queryClient = useQueryClient();
    const kueri = useQuery(tahunQuery);
    const [form, setForm] = useState<TahunAjaran | "baru" | null>(null);
    const [aktifkan, setAktifkan] = useState<TahunAjaran | null>(null);
    const [pesan, setPesan] = useState<string | null>(null);
    const [lanjutKenaikan, setLanjutKenaikan] = useState(false);
    // Selama formulir tahun menyimpan, pembuka penyunting lain dikunci; sukses hanya menutup penyunting yang dikirim.
    const [sibukForm, setSibukForm] = useState(false);
    const aktivasi = useMutation({
        mutationFn: (id: string) => aktifkanTahun(id),
        onSuccess: async (t) => {
            // AC-YR-02: pemilih tahun ajaran P-64 harus melihat tahun aktif baru sebelum tautannya ditawarkan.
            await segarkanTahun(queryClient);
            setAktifkan(null);
            setPesan(`Tahun ajaran ${t.nama} kini aktif.`);
            setLanjutKenaikan(true);
        },
    });
    const kenaikan = can("user.update") ? jalurDrilldown("P-64") : null;

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-text-heading">Kalender Akademik</h1>
                <p className="text-base text-text-secondary">Tahun ajaran, semester, hari libur, dan hari kerja sekolah. Tepat satu tahun ajaran aktif.</p>
            </header>
            <NavPengaturan aktif="P-71" />
            {!bolehUbah && <Peringatan varian="info">Anda dapat membaca kalender akademik, tetapi hanya Administrator (izin setting.manage) yang dapat mengubahnya.</Peringatan>}
            {pesan !== null && (
                <Peringatan varian="success" aksi={lanjutKenaikan && kenaikan !== null ? <a href={kenaikan} className="inline-flex min-h-control-md items-center rounded-md border border-border-strong px-4 text-base font-medium text-text-primary hover:bg-neutral-50">Lanjut ke Kenaikan Kelas Massal</a> : undefined}>
                    {pesan}
                </Peringatan>
            )}
            {kueri.isPending ? (
                <KeadaanMemuat baris={4} label="Memuat tahun ajaran" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : kueri.data.length === 0 ? (
                bolehUbah ? (
                    <FormTahun judul="Buat tahun ajaran pertama" keterangan="Tahun ajaran pertama otomatis menjadi tahun ajaran aktif. Kenaikan kelas, hari libur, dan perhitungan hari kerja memakainya." onSelesai={(t) => setPesan(`Tahun ajaran ${t.nama} dibuat dan aktif.`)} />
                ) : (
                    <KeadaanKosong judul="Belum ada tahun ajaran" pesan="Administrator perlu membuat tahun ajaran pertama." />
                )
            ) : (
                <>
                    <section aria-labelledby="judul-tahun" className={KARTU}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 id="judul-tahun" className="text-lg font-semibold text-text-heading">Tahun ajaran</h2>
                            {bolehUbah && form === null && <Tombol varian="secondary" disabled={sibukForm} onClick={() => { setForm("baru"); setPesan(null); }}>Tambah tahun ajaran</Tombol>}
                        </div>
                        <ul className="flex flex-col divide-y divide-border-subtle">
                            {kueri.data.map((t) => (
                                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                                    <div className="flex flex-col gap-1">
                                        <span className="flex items-center gap-2 text-base font-medium text-text-primary">
                                            {t.nama} {t.is_active && <Lencana varian="success">Aktif</Lencana>}
                                        </span>
                                        <span className="text-sm text-text-secondary">{tanggalId(t.tanggal_mulai)} – {tanggalId(t.tanggal_selesai)}</span>
                                        {t.semester.map((s) => (
                                            <span key={s.id} className="text-sm text-text-secondary">Semester {LABEL_SEMESTER[s.nama]}: {tanggalId(s.tanggal_mulai)} – {tanggalId(s.tanggal_selesai)}</span>
                                        ))}
                                    </div>
                                    {bolehUbah && (
                                        <span className="flex flex-wrap gap-2">
                                            <Tombol varian="tertiary" disabled={sibukForm} aria-label={`Ubah ${t.nama}`} onClick={() => { setForm(t); setPesan(null); }}>Ubah</Tombol>
                                            {!t.is_active && <Tombol varian="secondary" disabled={sibukForm} onClick={() => setAktifkan(t)}>Jadikan aktif</Tombol>}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                    {form !== null && bolehUbah && (
                        <FormTahun
                            key={form === "baru" ? "baru" : form.id}
                            awal={form === "baru" ? undefined : form}
                            judul={form === "baru" ? "Tambah tahun ajaran" : `Ubah ${form.nama}`}
                            onBatal={() => setForm(null)}
                            onSibuk={setSibukForm}
                            onSelesai={(t, penyunting) => { setForm((f) => (f === penyunting ? null : f)); setPesan(`Tahun ajaran ${t.nama} tersimpan.`); setLanjutKenaikan(false); }}
                        />
                    )}
                    <HariLibur tahun={kueri.data} bolehUbah={bolehUbah} />
                </>
            )}
            <HariKerja bolehUbah={bolehUbah} />
            <DialogKonfirmasi
                buka={aktifkan !== null}
                onTutup={() => { setAktifkan(null); aktivasi.reset(); }}
                judul={`Jadikan ${aktifkan?.nama ?? ""} tahun ajaran aktif?`}
                labelAksi="Jadikan aktif"
                sibuk={aktivasi.isPending}
                galat={aktivasi.isError ? pesanGalat(aktivasi.error) : undefined}
                onKonfirmasi={() => { if (aktifkan !== null) aktivasi.mutate(aktifkan.id); }}
            >
                Tahun ajaran yang sekarang aktif akan dinonaktifkan. Sesudahnya, lanjutkan dengan Kenaikan Kelas Massal untuk menetapkan kelas siswa pada tahun ajaran baru.
            </DialogKonfirmasi>
        </div>
    );
}
