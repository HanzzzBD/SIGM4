// P-74 Detail Entri Log (UX §6 `/activity-log/{id}`; FR-18.2 langkah 4 & AC; PR-01-25). Metadata entri dan tabel dua
// kolom Sebelum/Sesudah berlabel Bahasa Indonesia; baris yang berubah DISOROT (latar + teks "Berubah", bukan warna saja);
// nilai bersarang tampil sebagai daftar berlabel, bukan JSON mentah. Entitas terdampak bertaut bila halamannya terdaftar.

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { jalurTerdaftar } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Lencana, Tombol, gabung } from "../../shared/ui/primitives";
import type { Entri } from "./api";
import { entriQuery, pelaku, waktuWib } from "./api";
import type { StatusKode } from "./perbandingan";
import { LABEL_STATUS_KODE, bandingkan, labelField, labelNilai } from "./perbandingan";

const TH = "bg-surface-subtle px-4 py-2 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-2 align-top text-base text-text-primary";
const SOROT = "bg-warning-subtle";
const VARIAN_KODE: Record<StatusKode, "success" | "error" | "warning" | "neutral"> = { DITAMBAHKAN: "success", DICABUT: "error", DIUBAH: "warning", TETAP: "neutral" };

/**
 * Nama entitas SEBAGAIMANA DITULIS pemanggil `AuditLogger` (`entitas: "…"`) → halamannya; ditautkan hanya bila
 * halaman itu terdaftar di build ini. Master data tanpa halaman detail menuju halaman daftarnya.
 */
const HALAMAN_ENTITAS: Readonly<Record<string, (id: string) => string>> = {
    users: (id) => `/pengguna/${id}`,
    roles: (id) => `/role/${id}`,
    assets: (id) => `/aset/${id}`,
    damage_reports: (id) => `/kerusakan/${id}`,
    reservations: (id) => `/reservasi/${id}`,
    approval_instances: (id) => `/persetujuan/${id}`,
    approval_rules: (id) => `/approval-rules/${id}`,
    activity_logs: (id) => `/activity-log/${id}`,
    work_units: () => "/pengaturan/unit-kerja",
    academic_years: () => "/pengaturan/kalender-akademik",
    holidays: () => "/pengaturan/kalender-akademik",
    work_days: () => "/pengaturan/kalender-akademik",
    system_settings: () => "/pengaturan",
};

/** Nilai apa pun sebagai teks atau daftar berlabel (objek → pasangan label/nilai, larik → butir). */
function Nilai({ kunci, nilai, entitas }: { readonly kunci: string; readonly nilai: unknown; readonly entitas: string | null }): ReactNode {
    if (Array.isArray(nilai)) {
        if (nilai.length === 0) return "—";
        return (
            <ul className="flex list-disc flex-col gap-1 pl-5">
                {nilai.map((x, i) => <li key={i}><Nilai kunci={kunci} nilai={x} entitas={entitas} /></li>)}
            </ul>
        );
    }
    if (typeof nilai === "object" && nilai !== null) {
        const pasangan = Object.entries(nilai as Record<string, unknown>);
        if (pasangan.length === 0) return "—";
        return (
            <dl className="flex flex-col gap-1">
                {pasangan.map(([k, v]) => (
                    <div key={k} className="flex flex-wrap gap-x-2">
                        <dt className="text-sm text-text-secondary">{labelField(k)}:</dt>
                        <dd><Nilai kunci={k} nilai={v} entitas={entitas} /></dd>
                    </div>
                ))}
            </dl>
        );
    }
    return <span className="break-words">{labelNilai(kunci, nilai, entitas)}</span>;
}

const Berubah = () => <Lencana varian="warning">Berubah</Lencana>;

function Perbandingan({ e }: { readonly e: Entri }) {
    const p = bandingkan(e.nilai_sebelum, e.nilai_sesudah);
    if (p.jenis === "kosong") return <p className="text-base text-text-secondary">Tidak ada perubahan nilai yang tercatat untuk entri ini.</p>;
    const kepala = (pertama: string, akhir: string) => (
        <thead>
            <tr>
                <th scope="col" className={TH}>{pertama}</th>
                <th scope="col" className={TH}>Sebelum</th>
                <th scope="col" className={TH}>Sesudah</th>
                <th scope="col" className={TH}>{akhir}</th>
            </tr>
        </thead>
    );
    return (
        <div className="overflow-auto border border-border-subtle bg-surface-default">
            <table className="w-full border-collapse">
                <caption className="sr-only">Perbandingan nilai sebelum dan sesudah</caption>
                {p.jenis === "objek" && (
                    <>
                        {kepala("Field", "Perubahan")}
                        <tbody>
                            {p.baris.map((b) => (
                                <tr key={b.kunci} className={gabung(b.berubah && SOROT)}>
                                    <th scope="row" className={`${TD} text-left font-medium`}>{b.label}</th>
                                    <td className={TD}><Nilai kunci={b.kunci} nilai={b.sebelum} entitas={e.entitas} /></td>
                                    <td className={TD}><Nilai kunci={b.kunci} nilai={b.sesudah} entitas={e.entitas} /></td>
                                    <td className={TD}>{b.berubah ? <Berubah /> : <span className="text-sm text-text-secondary">Tetap</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </>
                )}
                {p.jenis === "kode" && (
                    <>
                        {kepala("Kode", "Status")}
                        <tbody>
                            {p.baris.map((b) => (
                                <tr key={b.kode} className={gabung(b.status !== "TETAP" && SOROT)}>
                                    <th scope="row" className={`${TD} text-left font-mono text-sm font-medium`}>{b.kode}</th>
                                    <td className={TD}>{b.sebelum === undefined ? "—" : <Nilai kunci="" nilai={Object.fromEntries(Object.entries(b.sebelum).filter(([k]) => k !== "kode"))} entitas={e.entitas} />}</td>
                                    <td className={TD}>{b.sesudah === undefined ? "—" : <Nilai kunci="" nilai={Object.fromEntries(Object.entries(b.sesudah).filter(([k]) => k !== "kode"))} entitas={e.entitas} />}</td>
                                    <td className={TD}><Lencana varian={VARIAN_KODE[b.status]}>{LABEL_STATUS_KODE[b.status]}</Lencana></td>
                                </tr>
                            ))}
                        </tbody>
                    </>
                )}
                {p.jenis === "nilai" && (
                    <>
                        {kepala("Field", "Perubahan")}
                        <tbody>
                            <tr className={gabung(p.berubah && SOROT)}>
                                <th scope="row" className={`${TD} text-left font-medium`}>Nilai</th>
                                <td className={TD}><Nilai kunci="" nilai={p.sebelum} entitas={e.entitas} /></td>
                                <td className={TD}><Nilai kunci="" nilai={p.sesudah} entitas={e.entitas} /></td>
                                <td className={TD}>{p.berubah ? <Berubah /> : <span className="text-sm text-text-secondary">Tetap</span>}</td>
                            </tr>
                        </tbody>
                    </>
                )}
            </table>
        </div>
    );
}

function Baris({ label, children }: { readonly label: string; readonly children: ReactNode }) {
    return (
        <div className="grid grid-cols-1 gap-1 border-t border-border-subtle py-2 sm:grid-cols-3">
            <dt className="text-sm text-text-secondary">{label}</dt>
            <dd className="break-words text-base text-text-primary sm:col-span-2">{children}</dd>
        </div>
    );
}

/** Hanya URL daftar P-73 di aplikasi ini yang diterima sebagai tujuan kembali (bukan detail lain, bukan situs luar). */
export const kembaliSah = (k: string | undefined): string => (k !== undefined && /^\/activity-log(\?|$)/.test(k) ? k : "/activity-log");

export default function ActivityLogDetailPage({ id, kembali }: { readonly id: string; readonly kembali?: string | undefined }) {
    const navigate = useNavigate();
    const kueri = useQuery(entriQuery(id));
    // Kembali ke P-73 yang membuka entri ini — saringan, halaman, dan potretnya utuh (UX §6 exit point).
    const keDaftar = () => void navigate({ href: kembaliSah(kembali) });
    if (kueri.isPending) return <KeadaanMemuat baris={8} label="Memuat entri log" />;
    if (kueri.isError) return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    const e = kueri.data;
    const tautan = e.entitas !== null && e.entitas_id !== null ? HALAMAN_ENTITAS[e.entitas]?.(e.entitas_id) : undefined;
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-text-heading">Detail Entri Log</h1>
                    <p className="font-mono text-sm text-text-secondary">{e.aksi} · {waktuWib(e.waktu)}</p>
                </div>
                <Tombol varian="secondary" onClick={keDaftar}>Kembali ke Activity Log</Tombol>
            </header>
            <section aria-labelledby="judul-meta" className="rounded-md border border-border-subtle bg-surface-default p-4">
                <h2 id="judul-meta" className="mb-2 text-lg font-semibold text-text-heading">Entri</h2>
                <dl>
                    <Baris label="Waktu">{waktuWib(e.waktu)}</Baris>
                    <Baris label="Pelaku">{pelaku(e)}</Baris>
                    <Baris label="Role"><span className="font-mono">{e.role ?? "—"}</span></Baris>
                    <Baris label="Modul"><span className="font-mono">{e.modul}</span></Baris>
                    <Baris label="Aksi"><span className="font-mono">{e.aksi}</span></Baris>
                    <Baris label="Entitas">
                        {e.entitas === null ? "—" : tautan !== undefined && jalurTerdaftar(tautan) ? <a href={tautan} className="text-text-link hover:text-text-link-hover">{`${e.entitas} #${e.entitas_id ?? ""}`}</a> : <span className="font-mono">{`${e.entitas}${e.entitas_id === null ? "" : ` #${e.entitas_id}`}`}</span>}
                    </Baris>
                    <Baris label="Hasil"><Lencana varian={e.hasil === "SUKSES" ? "success" : "error"}>{e.hasil === "SUKSES" ? "Sukses" : "Gagal"}</Lencana></Baris>
                    {e.keterangan !== null && <Baris label="Keterangan">{e.keterangan}</Baris>}
                    <Baris label="Alamat IP"><span className="font-mono">{e.ip ?? "—"}</span></Baris>
                    <Baris label="Perangkat (user agent)">{e.user_agent ?? "—"}</Baris>
                    <Baris label="ID permintaan"><span className="font-mono">{e.request_id ?? "—"}</span></Baris>
                </dl>
            </section>
            <section aria-labelledby="judul-banding" className="flex flex-col gap-3">
                <h2 id="judul-banding" className="text-lg font-semibold text-text-heading">Perubahan nilai</h2>
                <Perbandingan e={e} />
            </section>
        </div>
    );
}
