// C-27 Linimasa Approval (FR-10.3; COMPONENTS C-27) atas `GET /approvals/{id}/history` — dipakai P-31
// (PR-03-27, keputusan 17c log phase-03) dan kelak P-38/P-53/P-57. Hak lihat milik server
// (`approval.view`, scope own): 403 → linimasa tidak ditampilkan sama sekali.

import { queryOptions, useQuery } from "@tanstack/react-query";
import { HistoryResponseSchema } from "@sigm4/schemas";
import type { LinimasaPersetujuan as Linimasa } from "@sigm4/schemas";
import { ApiError, api } from "../../shared/api";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Lencana, gabung } from "../../shared/ui/primitives";

export const riwayatApprovalQuery = (instanceId: number) =>
    queryOptions({
        queryKey: ["approvals", instanceId, "history"],
        queryFn: async () => HistoryResponseSchema.parse((await api.get(`/approvals/${String(instanceId)}/history`)).data).data,
        // 403/404 adalah jawaban, bukan gangguan: jangan diulang.
        retry: (n, e) => !(e instanceof ApiError && (e.status === 403 || e.status === 404)) && n < 2,
    });

type Langkah = Linimasa["langkah"][number];

const WAKTU = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
/** Selalu berpenanda WIB (C-27). */
export const waktuWib = (iso: string) => `${WAKTU.format(new Date(iso))} WIB`;

const LABEL: Record<Langkah["status"], string> = {
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
    PERLU_REVISI: "Perlu Revisi",
    DILEWATI: "Dilewati",
    AKTIF: "Menunggu",
    BELUM_AKTIF: "Belum aktif",
    TIDAK_DIJALANKAN: "Tidak dijalankan",
};

/** Penanda C-27: bentuk berbeda per status, bukan warna saja (NFR-AC-06); teks membawa statusnya. */
const PENANDA: Record<Langkah["status"], string> = {
    DISETUJUI: "bg-success-base border-success-base",
    DITOLAK: "bg-error-base border-error-base",
    PERLU_REVISI: "bg-warning-base border-warning-base",
    AKTIF: "border-4 border-teal-600 bg-surface-default",
    BELUM_AKTIF: "border border-neutral-300 bg-surface-default",
    DILEWATI: "border border-dashed border-neutral-400 bg-surface-default",
    TIDAK_DIJALANKAN: "border border-neutral-300 bg-surface-default",
};

const nama = (n: { nama: string | null } | null) => n?.nama ?? "Sistem";

function approver(l: Langkah): string {
    if (l.fallback) return "Approver cadangan";
    return l.approver.user?.nama ?? l.approver.role?.nama ?? "—";
}

function BarisLangkah({ l }: { readonly l: Langkah }) {
    const sisa = l.sla === null ? null : Math.max(0, Math.round(l.sla.sisa_menit_kerja / 60));
    return (
        <li className="relative flex gap-3 pb-4 last:pb-0">
            <span aria-hidden className={gabung("mt-1 size-4 shrink-0 rounded-full", PENANDA[l.status])} />
            <div className="flex flex-1 flex-col gap-1">
                <p className="font-medium text-text-primary">
                    Langkah {l.urutan} — {LABEL[l.status]}
                </p>
                <p className="text-sm text-text-secondary">
                    {l.diputuskan_oleh !== null ? nama(l.diputuskan_oleh) : approver(l)}
                    {l.atas_nama !== null && ` atas nama ${nama(l.atas_nama)}`}
                    {l.diputuskan_pada !== null && ` · ${waktuWib(l.diputuskan_pada)}`}
                </p>
                {l.eskalasi !== null && <p className="text-sm text-text-secondary">Dieskalasi {waktuWib(l.eskalasi.pada)}{l.eskalasi.dari !== null && ` dari ${nama(l.eskalasi.dari)}`}</p>}
                {l.alasan_dilewati !== null && <p className="text-sm text-text-secondary">{l.alasan_dilewati}</p>}
                {l.catatan !== null && <p className="rounded-sm bg-surface-subtle p-2 text-base text-text-primary">“{l.catatan}”</p>}
                {l.status === "AKTIF" && sisa !== null && (
                    <span className="self-start">
                        <Lencana varian={l.sla?.terlambat === true ? "error" : "neutral"}>{l.sla?.terlambat === true ? "Melewati SLA" : `Sisa SLA ${String(sisa)} jam kerja`}</Lencana>
                    </span>
                )}
            </div>
        </li>
    );
}

/** Tanpa hak lihat (403) → `null`: layar pemanggil tetap utuh tanpa bagian ini (SDD-AUTH-08). */
export function LinimasaPersetujuan({ instanceId }: { readonly instanceId: number }) {
    const kueri = useQuery(riwayatApprovalQuery(instanceId));
    if (kueri.isPending) return <KeadaanMemuat baris={3} label="Memuat linimasa persetujuan" />;
    if (kueri.isError) return kueri.error instanceof ApiError && (kueri.error.status === 403 || kueri.error.status === 404) ? null : <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    const d = kueri.data;
    return (
        <section aria-labelledby="judul-linimasa" className="flex flex-col gap-3">
            <h2 id="judul-linimasa" className="text-lg font-semibold text-text-primary">
                Linimasa persetujuan
            </h2>
            <ol className="flex flex-col">
                <li className="flex gap-3 pb-4">
                    <span aria-hidden className="mt-1 size-4 shrink-0 rounded-full border border-success-base bg-success-base" />
                    <div className="flex flex-col gap-1">
                        <p className="font-medium text-text-primary">Pengajuan dibuat</p>
                        <p className="text-sm text-text-secondary">
                            {nama(d.pemohon)} · {waktuWib(d.dibuat_pada)}
                        </p>
                    </div>
                </li>
                {d.langkah.map((l) => (
                    <BarisLangkah key={l.urutan} l={l} />
                ))}
            </ol>
            {d.ditolak_otomatis && <p className="text-sm text-text-secondary">Ditolak otomatis oleh Sistem karena eskalasi habis tanpa keputusan.</p>}
        </section>
    );
}
