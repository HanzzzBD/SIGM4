// P-72 Unit Kerja (UX §6 `/pengaturan/unit-kerja`; Lampiran E.3, WU-01…03; PR-01-24). Terbaca `setting.view`,
// diubah `setting.manage`. Tidak ada hapus (WU-02): nonaktifkan beralasan dialog; galat server tampil apa adanya.
// Setiap mutasi menyegarkan SELURUH cache `['work-units']` — pemilih kelas/unit M-02 (P-60, P-61, P-64) ikut.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { IsianUnit, JenisUnit, SaringanUnit, StatusUnit, Unit } from "./api";
import { JENIS_UNIT, LABEL_JENIS_UNIT, LABEL_STATUS_UNIT, STATUS_UNIT, buatUnit, daftarUnitQuery, galatIsian, pesanGalat, segarkanUnit, ubahStatusUnit, ubahUnit } from "./api";
import { NavPengaturan } from "./NavPengaturan";

const TH = "sticky top-0 h-header-table bg-surface-subtle px-4 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";

function FormUnit({ awal, onSelesai, onBatal, onSibuk }: { readonly awal?: Unit | undefined; readonly onSelesai: (u: Unit, penyunting: Unit | "baru") => void; readonly onBatal: () => void; readonly onSibuk: (sibuk: boolean) => void }) {
    const queryClient = useQueryClient();
    const [nama, setNama] = useState(awal?.nama ?? "");
    const [kode, setKode] = useState(awal?.kode ?? "");
    const [jenis, setJenis] = useState<JenisUnit | "">(awal?.jenis ?? "");
    const [lokal, setLokal] = useState<Record<string, string>>({});
    const simpan = useMutation({
        mutationFn: (body: IsianUnit) => (awal === undefined ? buatUnit(body) : ubahUnit(awal.id, body)),
        onSuccess: async (u) => {
            await segarkanUnit(queryClient);
            onSelesai(u, awal ?? "baru");
        },
    });
    useEffect(() => {
        onSibuk(simpan.isPending);
        return () => onSibuk(false);
    }, [simpan.isPending, onSibuk]);
    const server = simpan.error === null ? { isian: {} as Readonly<Record<string, string>>, umum: null } : galatIsian(simpan.error);
    const g = (k: string) => lokal[k] ?? server.isian[k];
    function kirim(e: FormEvent): void {
        e.preventDefault();
        const kurang: Record<string, string> = {};
        if (nama.trim() === "") kurang["nama"] = "Nama unit wajib diisi.";
        if (kode.trim() === "") kurang["kode"] = "Kode unit wajib diisi.";
        if (jenis === "") kurang["jenis"] = "Jenis unit wajib dipilih.";
        setLokal(kurang);
        if (Object.keys(kurang).length > 0 || jenis === "") return;
        // Ubah: kepala unit dipertahankan (PUT pengganti penuh — field yang tak dikirim menjadi null).
        simpan.mutate({ nama: nama.trim(), kode: kode.trim(), jenis, ...(awal === undefined ? {} : { kepala_unit_id: awal.kepala_unit_id === null ? null : Number(awal.kepala_unit_id) }) });
    }
    const off = simpan.isPending;
    return (
        <form noValidate onSubmit={kirim} aria-labelledby="judul-form-unit" className="flex flex-col gap-4 rounded-md border border-border-strong bg-surface-default p-4 shadow-1">
            <h2 id="judul-form-unit" className="text-lg font-semibold text-text-heading">{awal === undefined ? "Tambah unit kerja" : `Ubah ${awal.nama}`}</h2>
            {server.umum !== null && <Peringatan varian="error" judul="Unit kerja belum tersimpan">{server.umum}</Peringatan>}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Isian label="Nama unit" required maxLength={150} value={nama} galat={g("nama")} disabled={off} onChange={(e) => setNama(e.target.value)} />
                <Isian label="Kode unit" required maxLength={100} value={kode} galat={g("kode")} disabled={off} onChange={(e) => setKode(e.target.value)} />
                <Pilihan label="Jenis" required kosong="Pilih jenis" value={jenis} galat={g("jenis")} disabled={off} opsi={JENIS_UNIT.map((j) => ({ nilai: j, label: LABEL_JENIS_UNIT[j] }))} onChange={(e) => setJenis(e.target.value as JenisUnit | "")} />
            </div>
            <div className="flex flex-wrap gap-3">
                <Tombol type="submit" sibuk={off}>Simpan unit kerja</Tombol>
                <Tombol varian="secondary" disabled={off} onClick={onBatal}>Batal</Tombol>
            </div>
        </form>
    );
}

export default function WorkUnitPage({ saringan, onSaringan }: { readonly saringan: SaringanUnit; readonly onSaringan: (s: Partial<SaringanUnit>) => void }) {
    const can = useCan();
    const bolehUbah = can("setting.manage");
    const queryClient = useQueryClient();
    const page = saringan.page ?? 1;
    const kueri = useQuery(daftarUnitQuery(saringan));
    const [form, setForm] = useState<Unit | "baru" | null>(null);
    const [status, setStatus] = useState<Unit | null>(null);
    const [pesan, setPesan] = useState<string | null>(null);
    // Selama formulir menyimpan, pembuka penyunting lain dikunci; sukses hanya menutup penyunting yang dikirim.
    const [sibukForm, setSibukForm] = useState(false);
    const ganti = useMutation({
        mutationFn: (u: Unit) => ubahStatusUnit(u.id, u.status === "AKTIF" ? "NONAKTIF" : "AKTIF"),
        onSuccess: async (u) => {
            await segarkanUnit(queryClient);
            setStatus(null);
            setPesan(`Unit ${u.nama} kini ${LABEL_STATUS_UNIT[u.status].toLowerCase()}.`);
        },
    });
    const ubah = (s: Partial<SaringanUnit>) => onSaringan({ ...s, page: undefined });
    // Halaman di luar jangkauan (baris terakhir dinonaktifkan dalam saringan, atau tautan lama) → halaman terakhir yang ada.
    const totalHalaman = kueri.data?.meta.total_pages;
    useEffect(() => {
        if (totalHalaman !== undefined && page > totalHalaman) onSaringan({ page: totalHalaman > 1 ? totalHalaman : undefined });
    }, [page, totalHalaman, onSaringan]);
    const tersaring = saringan.jenis !== undefined || saringan.status !== undefined;

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-text-heading">Unit Kerja</h1>
                    <p className="text-base text-text-secondary">Master unit kerja dan kelas. Unit tidak dihapus — nonaktifkan bila tidak dipakai lagi.</p>
                </div>
                {bolehUbah && form === null && <Tombol disabled={sibukForm} onClick={() => { setForm("baru"); setPesan(null); }}>Tambah unit kerja</Tombol>}
            </header>
            <NavPengaturan aktif="P-72" />
            {!bolehUbah && <Peringatan varian="info">Anda dapat membaca unit kerja, tetapi hanya Administrator (izin setting.manage) yang dapat mengubahnya.</Peringatan>}
            {pesan !== null && <Peringatan varian="success">{pesan}</Peringatan>}
            {form !== null && bolehUbah && (
                <FormUnit key={form === "baru" ? "baru" : form.id} awal={form === "baru" ? undefined : form} onBatal={() => setForm(null)} onSibuk={setSibukForm} onSelesai={(u, penyunting) => { setForm((f) => (f === penyunting ? null : f)); setPesan(`Unit ${u.nama} tersimpan.`); }} />
            )}
            <section aria-label="Saringan unit kerja" className="grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-2">
                <Pilihan label="Jenis" kosong="Semua jenis" value={saringan.jenis ?? ""} opsi={JENIS_UNIT.map((j) => ({ nilai: j, label: LABEL_JENIS_UNIT[j] }))} onChange={(e) => ubah({ jenis: e.target.value === "" ? undefined : (e.target.value as JenisUnit) })} />
                <Pilihan label="Status" kosong="Semua status" value={saringan.status ?? ""} opsi={STATUS_UNIT.map((s) => ({ nilai: s, label: LABEL_STATUS_UNIT[s] }))} onChange={(e) => ubah({ status: e.target.value === "" ? undefined : (e.target.value as StatusUnit) })} />
            </section>
            {kueri.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat unit kerja" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : kueri.data.data.length === 0 ? (
                <KeadaanKosong judul={tersaring ? "Tidak ada unit yang cocok" : "Belum ada unit kerja"} pesan={tersaring ? "Ubah atau hapus saringan." : "Unit kerja dan kelas yang ditambahkan akan muncul di sini."} />
            ) : (
                <>
                    <div className="overflow-auto border border-border-subtle bg-surface-default">
                        <table className="w-full border-collapse">
                            <caption className="sr-only">Daftar unit kerja</caption>
                            <thead>
                                <tr>
                                    {["Nama", "Kode", "Jenis", "Status", ...(bolehUbah ? ["Aksi"] : [])].map((k) => <th key={k} scope="col" className={TH}>{k}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {kueri.data.data.map((u) => (
                                    <tr key={u.id}>
                                        <th scope="row" className={`${TD} text-left font-medium`}>{u.nama}</th>
                                        <td className={`${TD} font-mono`}>{u.kode}</td>
                                        <td className={TD}>{LABEL_JENIS_UNIT[u.jenis]}</td>
                                        <td className={TD}><Lencana varian={u.status === "AKTIF" ? "success" : "neutral"}>{LABEL_STATUS_UNIT[u.status]}</Lencana></td>
                                        {bolehUbah && (
                                            <td className={TD}>
                                                <span className="flex flex-wrap gap-2">
                                                    <Tombol varian="tertiary" disabled={sibukForm} aria-label={`Ubah ${u.nama}`} onClick={() => { setForm(u); setPesan(null); }}>Ubah</Tombol>
                                                    <Tombol varian="secondary" disabled={sibukForm} onClick={() => setStatus(u)} aria-label={`${u.status === "AKTIF" ? "Nonaktifkan" : "Aktifkan"} ${u.nama}`}>{u.status === "AKTIF" ? "Nonaktifkan" : "Aktifkan"}</Tombol>
                                                </span>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {kueri.data.meta.total_pages > 1 && (
                        <nav aria-label="Halaman unit kerja" className="flex items-center justify-between gap-3 text-sm text-text-secondary tabular-nums">
                            <Tombol varian="secondary" disabled={page <= 1} onClick={() => onSaringan({ page: page - 1 === 1 ? undefined : page - 1 })}>Sebelumnya</Tombol>
                            <span>Halaman {page} dari {kueri.data.meta.total_pages}</span>
                            <Tombol varian="secondary" disabled={page >= kueri.data.meta.total_pages} onClick={() => onSaringan({ page: page + 1 })}>Berikutnya</Tombol>
                        </nav>
                    )}
                </>
            )}
            <DialogKonfirmasi
                buka={status !== null}
                onTutup={() => { setStatus(null); ganti.reset(); }}
                judul={status?.status === "AKTIF" ? `Nonaktifkan ${status.nama}?` : `Aktifkan ${status?.nama ?? ""}?`}
                labelAksi={status?.status === "AKTIF" ? "Nonaktifkan" : "Aktifkan"}
                varian={status?.status === "AKTIF" ? "danger" : "primary"}
                sibuk={ganti.isPending}
                galat={ganti.isError ? pesanGalat(ganti.error) : undefined}
                onKonfirmasi={() => { if (status !== null) ganti.mutate(status); }}
            >
                {status?.status === "AKTIF" ? "Unit nonaktif tidak dapat dipilih untuk pengguna atau kelas baru; penugasan yang sudah ada tetap tersimpan." : "Unit dapat dipilih kembali untuk pengguna dan kelas."}
            </DialogKonfirmasi>
        </div>
    );
}
