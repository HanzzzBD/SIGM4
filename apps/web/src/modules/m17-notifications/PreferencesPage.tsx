// P-78 Preferensi Notifikasi (UX §7.6.8; FR-17.3; UXD-05; keputusan 81; PR-02-43). Enam kelompok ×
// dua kanal; kelompok yang tak relevan bagi pengguna tidak dirender — disaring klien (keputusan
// 81d) dari permission `/me`, bukan role (SDD-FE-04). Kelompok wajib tampil terkunci beserta
// alasannya (FR-17.3 A1); push bergantung in-app (keputusan 81c). Berlaku seketika setelah disimpan.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LABEL_KELOMPOK_NOTIFIKASI } from "@sigm4/schemas";
import { useState } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { KotakCentang, Peringatan, Tombol } from "../../shared/ui/primitives";
import type { Kelompok, Preferensi } from "./api";
import { preferensiQuery, simpanPreferensi } from "./api";

/**
 * Relevansi kelompok (keputusan PR-02-43, UX §7.6.8): permission penerima/pengaju menurut kolom
 * Penerima indeks notifikasi. Akun & Sistem selalu relevan (NT-38a, NT-40: "pengguna terkait").
 */
export const PERMISSION_KELOMPOK: Readonly<Record<Kelompok, readonly string[] | null>> = {
    PERSETUJUAN: ["approval.decide", "reservation.create", "loan.extend", "procurement.create", "disposal.create", "material.request"],
    RESERVASI_PEMINJAMAN: ["reservation.view", "loan.view"],
    DENDA_KEWAJIBAN: ["fine.view"],
    KERUSAKAN_PERAWATAN: ["damage.create", "damage.view", "workorder.view"],
    OPNAME_PENGADAAN: ["audit.view", "procurement.view", "disposal.view", "material.request"],
    AKUN_SISTEM: null,
};

type Isian = Readonly<Record<Kelompok, { readonly in_app: boolean; readonly push: boolean }>>;
const keIsian = (d: readonly Preferensi[]) => Object.fromEntries(d.map((p) => [p.jenis, { in_app: p.in_app, push: p.push }])) as Isian;

export default function PreferencesPage() {
    const can = useCan();
    const kueri = useQuery(preferensiQuery);
    if (kueri.isPending) return <KeadaanMemuat baris={6} label="Memuat preferensi notifikasi" />;
    if (kueri.isError) return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    const relevan = kueri.data.filter((p) => PERMISSION_KELOMPOK[p.jenis]?.some(can) ?? true);
    return <Formulir daftar={relevan} />;
}

function Formulir({ daftar }: { readonly daftar: readonly Preferensi[] }) {
    const qc = useQueryClient();
    const [isian, setIsian] = useState<Isian>(() => keIsian(daftar));
    const [status, setStatus] = useState<{ readonly varian: "success" | "error"; readonly pesan: string } | null>(null);
    const [sibuk, setSibuk] = useState(false);
    const atur = (k: Kelompok, kanal: "in_app" | "push", v: boolean) => {
        setStatus(null);
        // Push bergantung in-app: mematikan in-app ikut mematikan push (SDD-08 §4.5, keputusan 81c).
        setIsian((l) => ({ ...l, [k]: kanal === "in_app" ? { in_app: v, push: v ? l[k].push : false } : { ...l[k], push: v } }));
    };
    const simpan = async () => {
        setSibuk(true);
        try {
            const kirim = daftar.filter((p) => !p.terkunci).map((p) => ({ jenis: p.jenis, ...isian[p.jenis] }));
            qc.setQueryData(preferensiQuery.queryKey, await simpanPreferensi(kirim));
            setStatus({ varian: "success", pesan: "Preferensi disimpan dan langsung berlaku." });
        } catch {
            setStatus({ varian: "error", pesan: "Preferensi belum tersimpan. Periksa koneksi lalu coba lagi." });
        } finally {
            setSibuk(false);
        }
    };
    return (
        <div className="flex max-w-prose flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-text-heading">Preferensi Notifikasi</h1>
                <p className="text-base text-text-secondary">Pilih kanal untuk setiap kelompok notifikasi. Push dikirim ke aplikasi mobile; tanpa notifikasi dalam aplikasi, push tidak dikirim.</p>
            </header>
            <ul className="flex flex-col rounded-md border border-border-subtle bg-surface-default">
                {daftar.map((p) => {
                    const nilai = p.terkunci ? { in_app: true, push: true } : isian[p.jenis];
                    const label = LABEL_KELOMPOK_NOTIFIKASI[p.jenis];
                    return (
                        <li key={p.jenis} className="flex flex-col gap-2 border-b border-border-subtle p-4 last:border-b-0">
                            <h2 className="text-base font-medium text-text-primary">{label}</h2>
                            <p className="text-sm text-text-secondary">
                                {p.terkunci
                                    ? "Wajib — seluruh notifikasi di kelompok ini menyangkut keputusan atas pengajuan, sehingga tidak dapat dimatikan."
                                    : "Sebagian notifikasi di kelompok ini wajib dan tetap terkirim meskipun kanalnya dimatikan."}
                            </p>
                            <div className="flex flex-wrap gap-x-6">
                                <KotakCentang label={`Dalam aplikasi — ${label}`} checked={nilai.in_app} disabled={p.terkunci} onCheckedChange={(v) => atur(p.jenis, "in_app", v)} />
                                <KotakCentang label={`Push — ${label}`} checked={nilai.push} disabled={p.terkunci || !nilai.in_app} onCheckedChange={(v) => atur(p.jenis, "push", v)} />
                            </div>
                        </li>
                    );
                })}
            </ul>
            {status !== null && <Peringatan varian={status.varian}>{status.pesan}</Peringatan>}
            <div className="flex flex-wrap items-center gap-3">
                <Tombol sibuk={sibuk} onClick={() => void simpan()}>
                    Simpan preferensi
                </Tombol>
                <Link to="/notifikasi" className="inline-flex min-h-control-md items-center px-4 text-base font-medium text-text-link hover:text-text-link-hover">
                    Kembali ke Notifikasi
                </Link>
            </div>
        </div>
    );
}
