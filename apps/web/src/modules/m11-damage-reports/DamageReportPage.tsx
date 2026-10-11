// P-40 Lapor Kerusakan (UX §6, F-16; FR-11.1 langkah 1–5, A1, A2, A4; BR-044; FR-07.4 A2; PR-03-32). Objek aset
// atau ruangan (terisi dari `?aset=` / `?ruang=`, mis. dari P-18 atau P-31 "Perlu Perhatian"); bila objek sudah
// punya tiket terbuka, formulir berganti menjadi "Tambahkan informasi" ke tiket itu (A1) — bukan duplikat.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import type { DamageReportOpen } from "@sigm4/schemas";
import { ApiError, api } from "../../shared/api";
import { useCan, useSesi } from "../../shared/auth";
import { Isian, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { Urgensi } from "./api";
import { LABEL_STATUS, LABEL_URGENSI, URGENSI, cariAset, laporkan, ruanganQuery, tambahCatatan, tiketTerbuka } from "./api";
import type { FotoTerpilih } from "./foto";
import { PemilihFoto } from "./foto";

export interface AwalLaporan {
    readonly aset?: string | undefined;
    readonly ruang?: string | undefined;
    readonly reservasi?: string | undefined;
}
type Objek = { readonly jenis: "ASET" | "RUANGAN"; readonly id: string; readonly label: string };

const galatDari = (e: unknown): { readonly isian: Readonly<Record<string, string>>; readonly umum: string | null } =>
    e instanceof ApiError ? { isian: Object.fromEntries(e.details.map((d) => [d.field, d.message])), umum: e.details.length === 0 ? e.message : null } : { isian: {}, umum: "Laporan belum terkirim. Coba lagi." };

function TeksArea({ id, label, value, onChange, galat }: { readonly id: string; readonly label: string; readonly value: string; readonly onChange: (v: string) => void; readonly galat?: string | undefined }) {
    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={id} className="text-sm font-medium text-text-primary">
                {label}
                <span className="font-regular text-text-secondary"> (wajib)</span>
            </label>
            <textarea id={id} rows={4} maxLength={2000} value={value} aria-invalid={galat !== undefined || undefined} aria-describedby={galat !== undefined ? `${id}-galat` : undefined} onChange={(e) => onChange(e.target.value)} className="rounded-sm border border-border-strong bg-surface-default px-4 py-3 text-base text-text-primary" />
            {galat !== undefined && (
                <p id={`${id}-galat`} className="text-sm text-error-base">
                    {galat}
                </p>
            )}
        </div>
    );
}

/** FR-11.1 A1: tiket terbuka atas objek → tambah keterangan + 0–5 foto ke tiket itu. */
export function TambahInformasi({ tiket, bisaBuka, onBuka, diDetail = false, onTerkirim }: { readonly tiket: Pick<DamageReportOpen, "id" | "nomor" | "status" | "urgensi">; readonly bisaBuka: boolean; readonly onBuka: (id: string) => void; readonly diDetail?: boolean; readonly onTerkirim?: () => void }) {
    const [ket, setKet] = useState("");
    const [foto, setFoto] = useState<readonly FotoTerpilih[]>([]);
    const [galat, setGalat] = useState<Readonly<Record<string, string>>>({});
    const [umum, setUmum] = useState<string | null>(null);
    const [sibuk, setSibuk] = useState(false);
    const [selesai, setSelesai] = useState(false);
    const kirim = async (e: SyntheticEvent) => {
        e.preventDefault();
        if (ket.trim() === "") return setGalat({ keterangan: "Keterangan wajib diisi." });
        setSibuk(true);
        try {
            await tambahCatatan(tiket.id, { keterangan: ket.trim(), foto_file_ids: foto.map((f) => f.fileId) });
            if (diDetail) {
                setKet("");
                setFoto([]);
                setGalat({});
                onTerkirim?.();
            } else setSelesai(true);
        } catch (err) {
            const g = galatDari(err);
            setGalat(g.isian);
            setUmum(g.umum);
        } finally {
            setSibuk(false);
        }
    };
    if (selesai)
        return (
            <Peringatan varian="success" judul={`Informasi ditambahkan ke laporan ${tiket.nomor}`} aksi={bisaBuka ? <Tombol varian="secondary" className="self-start" onClick={() => onBuka(tiket.id)}>Lihat laporan</Tombol> : undefined}>
                Petugas sarana prasarana akan melihatnya saat menindaklanjuti laporan.
            </Peringatan>
        );
    return (
        <form noValidate onSubmit={(e) => void kirim(e)} className="flex flex-col gap-4">
            {!diDetail && (
            <Peringatan varian="info" judul={`Sudah ada laporan terbuka: ${tiket.nomor}`}>
                <span className="flex flex-wrap items-center gap-2">
                    <Lencana varian="neutral">{LABEL_STATUS[tiket.status]}</Lencana>
                    <Lencana varian="neutral">{`Urgensi ${LABEL_URGENSI[tiket.urgensi]}`}</Lencana>
                </span>
                Tambahkan informasi Anda ke laporan tersebut alih-alih membuat laporan baru.
            </Peringatan>
            )}
            {umum !== null && <Peringatan varian="error">{umum}</Peringatan>}
            <TeksArea id="keterangan-tambahan" label="Informasi tambahan" value={ket} onChange={setKet} galat={galat["keterangan"]} />
            <PemilihFoto maks={5} foto={foto} onFoto={setFoto} label="Foto tambahan (tidak wajib, paling banyak 5)" galat={galat["foto_file_ids"]} />
            <Tombol type="submit" className="self-start" sibuk={sibuk}>
                Tambahkan informasi
            </Tombol>
        </form>
    );
}

export default function DamageReportPage({ awal, onSelesai }: { readonly awal: AwalLaporan; readonly onSelesai: (id: string) => void }) {
    const can = useCan();
    const sesi = useSesi();
    const ruangan = useQuery({ ...ruanganQuery, enabled: can("location.view") });
    const asetAwal = useQuery({
        queryKey: ["assets", awal.aset ?? "", "label-kerusakan"],
        enabled: awal.aset !== undefined,
        retry: false,
        queryFn: async () => ((await api.get(`/assets/${awal.aset ?? ""}`)).data as { data: { kode_barang: string; nama: string } }).data,
    });
    const [pilihan, setPilihan] = useState<Objek | null>(null);
    const objek: Objek | null =
        pilihan ??
        (awal.aset !== undefined
            ? { jenis: "ASET", id: awal.aset, label: asetAwal.data === undefined ? `Aset #${awal.aset}` : `${asetAwal.data.nama} (${asetAwal.data.kode_barang})` }
            : awal.ruang !== undefined
              ? { jenis: "RUANGAN", id: awal.ruang, label: ruangan.data?.find((r) => r.id === awal.ruang)?.nama ?? `Ruangan #${awal.ruang}` }
              : null);
    const [jenis, setJenis] = useState<"ASET" | "RUANGAN">(awal.ruang !== undefined ? "RUANGAN" : "ASET");
    const [kata, setKata] = useState("");
    const [hasilCari, setHasilCari] = useState<readonly { readonly id: string; readonly kode_barang: string; readonly nama: string }[] | null>(null);
    const terbuka = useQuery({
        queryKey: ["damage-reports", "open", objek?.jenis, objek?.id],
        enabled: objek !== null,
        staleTime: 0,
        queryFn: () => tiketTerbuka(objek?.jenis === "ASET" ? { asset_id: objek.id } : { room_id: objek?.id }),
    });
    const [deskripsi, setDeskripsi] = useState("");
    const [urgensi, setUrgensi] = useState<Urgensi | "">("");
    const [foto, setFoto] = useState<readonly FotoTerpilih[]>([]);
    const [galat, setGalat] = useState<Readonly<Record<string, string>>>({});
    const [umum, setUmum] = useState<string | null>(null);
    const [sibuk, setSibuk] = useState(false);
    // FR-07.4 A2: tautan reservasi hanya untuk ruangan reservasi itu sendiri (keputusan 25c).
    const reservasi = awal.reservasi !== undefined && objek?.jenis === "RUANGAN" && objek.id === awal.ruang ? awal.reservasi : undefined;

    const kirim = async (e: SyntheticEvent) => {
        e.preventDefault();
        const g: Record<string, string> = {};
        if (objek === null) g["objek"] = "Pilih aset atau ruangan yang rusak.";
        if (deskripsi.trim() === "") g["deskripsi"] = "Deskripsi kerusakan wajib diisi.";
        if (urgensi === "") g["urgensi"] = "Pilih tingkat urgensi.";
        // BR-044: minimal satu foto bagi laporan pengguna.
        if (foto.length === 0) g["foto_file_ids"] = "Unggah minimal satu foto kerusakan.";
        setGalat(g);
        setUmum(null);
        if (Object.keys(g).length > 0 || objek === null || urgensi === "") return;
        setSibuk(true);
        try {
            const t = await laporkan({
                ...(objek.jenis === "ASET" ? { asset_id: Number(objek.id) } : { room_id: Number(objek.id) }),
                deskripsi: deskripsi.trim(),
                urgensi,
                foto_file_ids: foto.map((f) => f.fileId),
                ...(reservasi === undefined ? {} : { reservation_id: Number(reservasi) }),
            });
            onSelesai(t.id);
        } catch (err) {
            const p = galatDari(err);
            setGalat(p.isian);
            setUmum(p.umum);
            // Balapan A1: tiket terbuka muncul sesudah pemeriksaan — tampilkan jalur tambah informasi.
            void terbuka.refetch();
        } finally {
            setSibuk(false);
        }
    };

    return (
        <div className="flex max-w-prose flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-text-heading">Lapor Kerusakan</h1>
                <p className="text-base text-text-secondary">Laporkan aset atau ruangan yang rusak beserta foto. Petugas sarana prasarana akan menindaklanjutinya.</p>
            </header>

            <section aria-labelledby="judul-objek" className="flex flex-col gap-3">
                <h2 id="judul-objek" className="text-lg font-semibold text-text-primary">
                    Objek yang rusak
                </h2>
                {objek !== null ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-default p-3">
                        <span className="text-base text-text-primary">
                            {objek.jenis === "ASET" ? "Aset" : "Ruangan"}: {objek.label}
                        </span>
                        {pilihan !== null && (
                            <Tombol varian="tertiary" onClick={() => setPilihan(null)}>
                                Ganti objek
                            </Tombol>
                        )}
                    </div>
                ) : (
                    <>
                        {can("location.view") && (
                            <Pilihan
                                label="Jenis objek"
                                value={jenis}
                                opsi={[
                                    { nilai: "ASET", label: "Aset" },
                                    { nilai: "RUANGAN", label: "Ruangan" },
                                ]}
                                onChange={(e) => setJenis(e.target.value as "ASET" | "RUANGAN")}
                            />
                        )}
                        {jenis === "RUANGAN" && can("location.view") ? (
                            <Pilihan label="Ruangan" kosong="Pilih ruangan" value="" galat={galat["objek"] ?? galat["room_id"]} opsi={(ruangan.data ?? []).map((r) => ({ nilai: r.id, label: r.nama }))} onChange={(e) => setPilihan({ jenis: "RUANGAN", id: e.target.value, label: ruangan.data?.find((r) => r.id === e.target.value)?.nama ?? "" })} />
                        ) : (
                            <div className="flex flex-col gap-2">
                                <form
                                    className="flex items-end gap-2"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (kata.trim() !== "") void cariAset(kata.trim()).then(setHasilCari);
                                    }}
                                >
                                    <div className="flex-1">
                                        <Isian label="Cari aset (kode, nama, nomor seri)" type="search" value={kata} galat={galat["objek"] ?? galat["asset_id"]} onChange={(e) => setKata(e.target.value)} />
                                    </div>
                                    <Tombol type="submit" varian="secondary">
                                        Cari
                                    </Tombol>
                                </form>
                                {hasilCari !== null && (
                                    <ul aria-label="Hasil pencarian aset" className="flex flex-col rounded-md border border-border-subtle bg-surface-default">
                                        {hasilCari.length === 0 && <li className="p-3 text-base text-text-secondary">Tidak ada aset yang cocok.</li>}
                                        {hasilCari.map((a) => (
                                            <li key={a.id} className="border-b border-border-subtle last:border-b-0">
                                                <button type="button" onClick={() => setPilihan({ jenis: "ASET", id: a.id, label: `${a.nama} (${a.kode_barang})` })} className="flex min-h-touch w-full items-center px-3 text-left text-base text-text-primary hover:bg-neutral-50">
                                                    <span className="font-mono">{a.kode_barang}</span>&nbsp;· {a.nama}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </>
                )}
            </section>

            {objek !== null && terbuka.data !== undefined && terbuka.data !== null ? (
                <TambahInformasi tiket={terbuka.data} bisaBuka={terbuka.data.milik_sendiri || sesi.permissions["damage.view"] === "all"} onBuka={onSelesai} />
            ) : (
                <form noValidate onSubmit={(e) => void kirim(e)} className="flex flex-col gap-4">
                    {umum !== null && <Peringatan varian="error">{umum}</Peringatan>}
                    {reservasi !== undefined && <Peringatan varian="info">Laporan ini akan tertaut ke reservasi ruangan yang baru selesai digunakan.</Peringatan>}
                    <TeksArea id="deskripsi-kerusakan" label="Deskripsi kerusakan" value={deskripsi} onChange={setDeskripsi} galat={galat["deskripsi"]} />
                    <Pilihan label="Tingkat urgensi" required kosong="Pilih urgensi" value={urgensi} galat={galat["urgensi"]} opsi={URGENSI.map((u) => ({ nilai: u, label: LABEL_URGENSI[u] }))} onChange={(e) => setUrgensi(e.target.value as Urgensi | "")} />
                    <PemilihFoto maks={5} foto={foto} onFoto={setFoto} label="Foto kerusakan (wajib, 1–5)" galat={galat["foto_file_ids"]} />
                    <Tombol type="submit" className="self-start" sibuk={sibuk} disabled={objek === null}>
                        Kirim laporan
                    </Tombol>
                </form>
            )}
        </div>
    );
}
