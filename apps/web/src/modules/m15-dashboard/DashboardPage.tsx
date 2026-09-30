// P-12 Dashboard (FR-15.1, Bab 19, UX §8.2). Manifes dari server menentukan kartu —
// kartu di luar permission tidak ada di manifes, sehingga tidak pernah dirender (AC 4).
// Tiap kartu memuat mandiri dengan skeleton; galat satu kartu tidak menggagalkan kartu
// lain (19.1 A2). Rentang di URL (SDD-FE-10); muat ulang melewati cache server (19.1).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError } from "../../shared/api";
import { KUNCI_ME } from "../../shared/auth";
import { jalurDrilldown } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Ikon } from "../../shared/ui/icon";
import { Kartu, Tombol, gabung } from "../../shared/ui/primitives";
import { kueriKartu, kueriManifes } from "./api";
import type { KartuManifes } from "./api";
import { LABEL_RENTANG, RENTANG } from "./rentang";
import type { Rentang } from "./rentang";
import { PENAMPIL, sembunyikan, waktuWib } from "./penampil";

const ZONA: Record<1 | 2 | 3 | 4, string> = { 1: "Tindakan", 2: "Keadaan", 3: "Kecenderungan", 4: "Aksi Cepat" };

function KartuDashboard({ kartu, rentang, versi }: { readonly kartu: KartuManifes; readonly rentang: Rentang; readonly versi: number }) {
    const queryClient = useQueryClient();
    const q = useQuery(kueriKartu(kartu.id, rentang, versi));
    const tujuan = jalurDrilldown(kartu.drilldown);
    // Hak akses dicabut di tengah sesi: kartu hilang dan permission dimuat ulang (PM-04).
    const ditolak = q.error instanceof ApiError && q.error.status === 403;
    useEffect(() => {
        if (ditolak) void queryClient.invalidateQueries({ queryKey: KUNCI_ME });
    }, [ditolak, queryClient]);
    if (ditolak) return null;
    const isi = q.data?.isi as Record<string, unknown> | undefined;
    if (isi !== undefined && sembunyikan(kartu.id, isi)) return null;
    const tampil = PENAMPIL[kartu.id];
    return (
        <Kartu
            judul={kartu.judul}
            status={kartu.jenis === "PERINGATAN" ? "warning" : undefined}
            aksi={
                tujuan !== null && (
                    <a href={tujuan} className="text-sm text-text-link hover:text-text-link-hover" aria-label={`${kartu.judul}, buka daftar sumbernya`}>
                        Lihat
                    </a>
                )
            }
        >
            {q.isPending ? (
                <KeadaanMemuat label={`Memuat ${kartu.judul}`} />
            ) : q.isError ? (
                <KeadaanGalat galat={q.error} onCobaLagi={() => void q.refetch()} />
            ) : tampil === undefined ? (
                <p className="text-sm text-text-secondary">Kartu ini belum dapat ditampilkan oleh versi aplikasi ini.</p>
            ) : (
                <>
                    {tampil(isi ?? {}, kartu.judul)}
                    <p className="text-sm text-text-secondary">Diperbarui {waktuWib(q.data.diperbarui_pada)}</p>
                </>
            )}
        </Kartu>
    );
}

/** UX §8.5/10.2: Zona 3 diciutkan di bawah 768px — grafik mahal & jarang jadi alasan membuka aplikasi. */
function useLebar(): boolean {
    const [lebar, setLebar] = useState(() => typeof window === "undefined" || window.matchMedia?.("(min-width: 48rem)").matches !== false);
    useEffect(() => {
        const m = window.matchMedia?.("(min-width: 48rem)");
        if (m === undefined) return;
        const ubah = () => setLebar(m.matches);
        m.addEventListener("change", ubah);
        return () => m.removeEventListener("change", ubah);
    }, []);
    return lebar;
}

export default function DashboardPage({ rentang, onRentang }: { readonly rentang: Rentang; readonly onRentang: (r: Rentang) => void }) {
    const manifes = useQuery(kueriManifes);
    const [versi, setVersi] = useState(0);
    const lebar = useLebar();
    const zona = ([1, 2, 3, 4] as const).map((z) => ({ z, kartu: manifes.data?.kartu.filter((k) => k.zona === z) ?? [] })).filter((x) => x.kartu.length > 0);
    const adaBerperiode = manifes.data?.kartu.some((k) => k.berperiode) === true;

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <h1 className="text-2xl font-semibold text-text-heading">Dashboard</h1>
                <div className="flex flex-wrap items-end gap-3">
                    {adaBerperiode && (
                        <label className="flex flex-col gap-2 text-sm font-medium text-text-primary">
                            Rentang waktu
                            <select value={rentang} onChange={(e) => onRentang(e.target.value as Rentang)} className="min-h-control-md rounded-sm border border-border-strong bg-surface-default px-4 text-base">
                                {RENTANG.map((r) => (
                                    <option key={r} value={r}>
                                        {LABEL_RENTANG[r]}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    <Tombol varian="secondary" ikon="muatUlang" onClick={() => setVersi((v) => v + 1)}>
                        Muat ulang
                    </Tombol>
                </div>
            </header>
            {manifes.isPending ? (
                <KeadaanMemuat label="Memuat dashboard" baris={6} />
            ) : manifes.isError ? (
                <KeadaanGalat galat={manifes.error} onCobaLagi={() => void manifes.refetch()} />
            ) : zona.length === 0 ? (
                <KeadaanKosong judul="Belum ada ringkasan untuk peran Anda" pesan="Kartu dashboard akan tampil di sini begitu data yang relevan dengan peran Anda tersedia." aksi={<Tombol varian="secondary" ikon="muatUlang" onClick={() => void manifes.refetch()}>Muat ulang</Tombol>} />
            ) : (
                zona.map(({ z, kartu }) => {
                    const kisi = (
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {kartu.map((k) => (
                                <KartuDashboard key={k.id} kartu={k} rentang={rentang} versi={versi} />
                            ))}
                        </div>
                    );
                    return z === 3 ? (
                        <details key={z} open={lebar} className="flex flex-col gap-4">
                            <summary className={gabung("flex min-h-control-md cursor-pointer items-center gap-2 text-xl font-semibold text-text-heading")}>
                                <Ikon nama="chevron" />
                                {ZONA[z]}
                            </summary>
                            {kisi}
                        </details>
                    ) : (
                        <section key={z} aria-labelledby={`zona-${String(z)}`} className="flex flex-col gap-4">
                            <h2 id={`zona-${String(z)}`} className="text-xl font-semibold text-text-heading">
                                {ZONA[z]}
                            </h2>
                            {kisi}
                        </section>
                    );
                })
            )}
        </div>
    );
}
