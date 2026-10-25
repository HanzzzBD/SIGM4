import { ReportExportPanel } from "../m16-analytics";
// P-39 Laporan Kerusakan (UX §6, §7.4; FR-11.3 langkah 1–4, A1; PR-03-32, keputusan 20a & 22). Tiket per status
// lewat tab berjumlah, saringan & urutan di URL (SDD-FE-10), penanda pelanggaran SLA berupa lencana + teks
// (AC "ditandai visual yang jelas", bukan warna saja). Scope `own` = milik sendiri ditegakkan server (A1).
// Ekspor (`report.export`) menyusul bersama ekspor M-16 Phase 06 (keputusan 22c).

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";
import { useCan } from "../../shared/auth";
import { jalurTerdaftar } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Isian, KotakCentang, Lencana, Pilihan, Tombol, gabung } from "../../shared/ui/primitives";
import type { StatusTiket, Urgensi } from "./api";
import { LABEL_STATUS, LABEL_URGENSI, STATUS, URGENSI, VARIAN_STATUS, VARIAN_URGENSI, daftarQuery, ruanganQuery, waktuWib } from "./api";

export interface PencarianKerusakan {
    readonly ekspor?: string | undefined;
    readonly q?: string | undefined;
    readonly status?: StatusTiket | undefined;
    readonly urgensi?: Urgensi | undefined;
    readonly ruang?: string | undefined;
    readonly saya?: true | undefined;
    readonly sla?: true | undefined;
    readonly dari?: string | undefined;
    readonly sampai?: string | undefined;
    readonly urut?: "urgensi" | undefined;
    readonly page?: number | undefined;
}

const TH = "sticky top-0 h-header-table bg-surface-subtle px-4 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";

export default function DamageListPage({ pencarian, onPencarian }: { readonly pencarian: PencarianKerusakan; readonly onPencarian: (p: Partial<PencarianKerusakan>) => void }) {
    const can = useCan();
    const navigate = useNavigate();
    const page = pencarian.page ?? 1;
    const kueri = useQuery(
        daftarQuery({
            page,
            per_page: 25,
            urut: pencarian.urut ?? "dilaporkan",
            ...(pencarian.q === undefined ? {} : { q: pencarian.q }),
            ...(pencarian.status === undefined ? {} : { status: pencarian.status }),
            ...(pencarian.urgensi === undefined ? {} : { urgensi: pencarian.urgensi }),
            ...(pencarian.ruang === undefined ? {} : { room_id: Number(pencarian.ruang) }),
            ...(pencarian.saya === true ? { pelapor: "saya" as const } : {}),
            ...(pencarian.sla === true ? { melampaui_sla: "true" as const } : {}),
            ...(pencarian.dari === undefined ? {} : { dari: pencarian.dari }),
            ...(pencarian.sampai === undefined ? {} : { sampai: pencarian.sampai }),
        }),
    );
    const ruangan = useQuery({ ...ruanganQuery, enabled: can("location.view") });
    const [kata, setKata] = useState(pencarian.q ?? "");
    const ubah = (p: Partial<PencarianKerusakan>) => onPencarian({ ...p, page: undefined });
    const buka = (id: string) => void navigate({ href: `/kerusakan/${id}` });
    const tersaring = pencarian.q !== undefined || pencarian.urgensi !== undefined || pencarian.ruang !== undefined || pencarian.saya === true || pencarian.sla === true || pencarian.dari !== undefined || pencarian.sampai !== undefined;
    const jumlah = kueri.data?.meta.jumlah_per_status;
    const semua = jumlah === undefined ? undefined : STATUS.reduce((n, s) => n + (jumlah[s] ?? 0), 0);

    const tab = (s: StatusTiket | undefined, label: string, n: number | undefined) => {
        const aktif = pencarian.status === s;
        return (
            <button key={label} type="button" role="tab" aria-selected={aktif} onClick={() => ubah({ status: s })} className={gabung("inline-flex min-h-touch items-center gap-2 border-b-2 px-4 text-base font-medium", aktif ? "border-teal-600 text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}>
                {label}
                {n !== undefined && <span className="rounded-full bg-neutral-100 px-2 text-xs text-neutral-700 tabular-nums">{n}</span>}
            </button>
        );
    };

    const kosong: ReactNode = (
        <KeadaanKosong
            judul={tersaring || pencarian.status !== undefined ? "Tidak ada laporan yang cocok" : "Belum ada laporan kerusakan"}
            pesan={tersaring ? "Ubah atau hapus saringan untuk melihat laporan lain." : "Laporan kerusakan yang dibuat akan muncul di sini."}
            aksi={tersaring ? <Tombol varian="secondary" onClick={() => onPencarian({ q: undefined, urgensi: undefined, ruang: undefined, saya: undefined, sla: undefined, dari: undefined, sampai: undefined, page: undefined })}>Hapus saringan</Tombol> : undefined}
        />
    );

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-text-heading">Laporan Kerusakan</h1>
                    <p className="text-base text-text-secondary">Tiket kerusakan per status beserta penanda batas waktu tindak lanjut. Waktu dalam WIB.</p>
                </div>
                {can("damage.create") && jalurTerdaftar("/kerusakan/baru") && (
                    <a href="/kerusakan/baru" className="inline-flex min-h-control-md items-center rounded-md bg-teal-600 px-4 text-base font-medium text-text-inverse hover:bg-teal-700">
                        Lapor Kerusakan
                    </a>
                )}
            </header>
            <ReportExportPanel path="/damage-reports/export" jenis="damage-reports" filter={{ q: pencarian.q, status: pencarian.status, urgensi: pencarian.urgensi, room_id: pencarian.ruang ? Number(pencarian.ruang) : undefined, pelapor: pencarian.saya ? "saya" : undefined, melampaui_sla: pencarian.sla ? "true" : undefined, dari: pencarian.dari, sampai: pencarian.sampai, urut: pencarian.urut ?? "dilaporkan" }} exportId={pencarian.ekspor} />

            <div role="tablist" aria-label="Status laporan" className="flex flex-wrap border-b border-border-subtle">
                {tab(undefined, "Semua", semua)}
                {STATUS.map((s) => tab(s, LABEL_STATUS[s], jumlah?.[s]))}
            </div>

            <section aria-label="Saringan laporan" className="grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-2 lg:grid-cols-3">
                <form
                    className="flex items-end gap-2 md:col-span-2 lg:col-span-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        ubah({ q: kata.trim() === "" ? undefined : kata.trim() });
                    }}
                >
                    <div className="min-w-0 flex-1">
                        <Isian label="Cari nomor tiket atau kode aset" type="search" value={kata} onChange={(e) => setKata(e.target.value)} />
                    </div>
                    <Tombol type="submit" varian="secondary">
                        Cari
                    </Tombol>
                </form>
                <Pilihan label="Urgensi" kosong="Semua urgensi" value={pencarian.urgensi ?? ""} opsi={URGENSI.map((u) => ({ nilai: u, label: LABEL_URGENSI[u] }))} onChange={(e) => ubah({ urgensi: e.target.value === "" ? undefined : (e.target.value as Urgensi) })} />
                {can("location.view") && <Pilihan label="Lokasi" kosong="Semua lokasi" value={pencarian.ruang ?? ""} opsi={(ruangan.data ?? []).map((r) => ({ nilai: r.id, label: r.nama }))} onChange={(e) => ubah({ ruang: e.target.value === "" ? undefined : e.target.value })} />}
                <Pilihan
                    label="Urutkan"
                    value={pencarian.urut ?? ""}
                    opsi={[
                        { nilai: "", label: "Waktu lapor terbaru" },
                        { nilai: "urgensi", label: "Urgensi tertinggi" },
                    ]}
                    onChange={(e) => ubah({ urut: e.target.value === "" ? undefined : "urgensi" })}
                />
                <Isian label="Dari tanggal" type="date" value={pencarian.dari ?? ""} onChange={(e) => ubah({ dari: e.target.value === "" ? undefined : e.target.value })} />
                <Isian label="Sampai tanggal" type="date" value={pencarian.sampai ?? ""} onChange={(e) => ubah({ sampai: e.target.value === "" ? undefined : e.target.value })} />
                <div className="flex flex-col justify-end">
                    <KotakCentang label="Hanya laporan saya" checked={pencarian.saya === true} onCheckedChange={(v) => ubah({ saya: v ? true : undefined })} />
                    <KotakCentang label="Hanya yang melewati batas waktu" checked={pencarian.sla === true} onCheckedChange={(v) => ubah({ sla: v ? true : undefined })} />
                </div>
            </section>

            {kueri.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat laporan kerusakan" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : kueri.data.data.length === 0 ? (
                kosong
            ) : (
                <>
                    <div className="hidden overflow-auto border border-border-subtle bg-surface-default md:block">
                        <table className="w-full border-collapse">
                            <caption className="sr-only">Laporan kerusakan</caption>
                            <thead>
                                <tr>
                                    {["Nomor", "Objek", "Urgensi", "Status", "Pelapor", "Dilaporkan", "Batas waktu"].map((k) => (
                                        <th key={k} scope="col" className={TH}>
                                            {k}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {kueri.data.data.map((t) => (
                                    <tr key={t.id} className="h-row cursor-pointer hover:bg-neutral-50" onClick={() => buka(t.id)}>
                                        <th scope="row" className={`${TD} text-left font-medium`}>
                                            <a href={`/kerusakan/${t.id}`} className="font-mono text-text-link hover:text-text-link-hover" onClick={(e) => e.stopPropagation()}>
                                                {t.nomor}
                                            </a>
                                        </th>
                                        <td className={TD}>
                                            {t.objek.label}
                                            <span className="block text-sm text-text-secondary">{t.objek.lokasi}</span>
                                        </td>
                                        <td className={TD}>
                                            <Lencana varian={VARIAN_URGENSI[t.urgensi]}>{LABEL_URGENSI[t.urgensi]}</Lencana>
                                        </td>
                                        <td className={TD}>
                                            <Lencana varian={VARIAN_STATUS[t.status]}>{LABEL_STATUS[t.status]}</Lencana>
                                        </td>
                                        <td className={TD}>{t.pelapor.nama}</td>
                                        <td className={TD}>{waktuWib(t.dilaporkan_pada)}</td>
                                        <td className={TD}>{t.melampaui_sla ? <Lencana varian="error">Melewati batas waktu</Lencana> : t.batas_sla === null ? "—" : waktuWib(t.batas_sla)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <ul aria-label="Laporan kerusakan" className="flex flex-col gap-2 md:hidden">
                        {kueri.data.data.map((t) => (
                            <li key={t.id}>
                                <a href={`/kerusakan/${t.id}`} aria-label={`${t.nomor}, ${LABEL_STATUS[t.status]}, urgensi ${LABEL_URGENSI[t.urgensi]}${t.melampaui_sla ? ", melewati batas waktu" : ""}`} className="flex min-h-row-mobile flex-col gap-1 border border-border-subtle bg-surface-default p-3 hover:bg-neutral-50">
                                    <span className="flex items-start justify-between gap-2">
                                        <span className="font-mono font-medium text-text-link">{t.nomor}</span>
                                        <Lencana varian={VARIAN_STATUS[t.status]}>{LABEL_STATUS[t.status]}</Lencana>
                                    </span>
                                    <span className="text-base text-text-primary">{t.objek.label}</span>
                                    {t.melampaui_sla && <span className="self-start"><Lencana varian="error">Melewati batas waktu</Lencana></span>}
                                </a>
                            </li>
                        ))}
                    </ul>
                    {kueri.data.meta.total_pages > 1 && (
                        <nav aria-label="Halaman laporan" className="flex items-center justify-between gap-3 text-sm text-text-secondary tabular-nums">
                            <Tombol varian="secondary" disabled={page <= 1} onClick={() => onPencarian({ page: page - 1 === 1 ? undefined : page - 1 })}>
                                Sebelumnya
                            </Tombol>
                            <span>
                                Halaman {page} dari {kueri.data.meta.total_pages}
                            </span>
                            <Tombol varian="secondary" disabled={page >= kueri.data.meta.total_pages} onClick={() => onPencarian({ page: page + 1 })}>
                                Berikutnya
                            </Tombol>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}
