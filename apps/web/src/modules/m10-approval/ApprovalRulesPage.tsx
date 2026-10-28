// P-68 Approval Rules (FR-10.1, UX §6 P-68): daftar aturan per jenis pengajuan beserta
// prioritasnya, urut sesuai RE-04 (prioritas terbesar, seri → id terkecil). Aturan bawaan
// tampil sebagai baris terkunci — konstanta kode, bukan baris basis data (BR-036, RE-06).
// Tautan ke editor hanya bagi pemegang `approval_rule.manage` (PM-04); server tetap memeriksa.

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { JENIS_PENGAJUAN, LABEL_JENIS_PENGAJUAN, labelEnum } from "@sigm4/schemas";
import { Can, useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Lencana, Peringatan } from "../../shared/ui/primitives";
import { kueriAturan } from "./api";
import type { AturanTersimpan } from "./api";

/** Jumlah predikat pada pohon D.1; `{}` = 0 (selalu cocok). */
export function jumlahSyarat(k: unknown): number {
    if (typeof k !== "object" || k === null) return 0;
    const o = k as { conditions?: unknown; field?: unknown };
    if (Array.isArray(o.conditions)) return o.conditions.reduce((n: number, a) => n + jumlahSyarat(a), 0);
    return typeof o.field === "string" ? 1 : 0;
}

/** RE-04 per jenis pengajuan. */
export const urutkan = (a: readonly AturanTersimpan[]): AturanTersimpan[] =>
    [...a].sort((x, y) => JENIS_PENGAJUAN.indexOf(x.jenis_pengajuan) - JENIS_PENGAJUAN.indexOf(y.jenis_pengajuan) || y.prioritas - x.prioritas || x.id - y.id);

const TH = "sticky top-0 bg-surface-subtle px-4 py-3 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";

export default function ApprovalRulesPage({ disimpan }: { readonly disimpan?: number | undefined }) {
    const aturan = useQuery(kueriAturan);
    const kelola = useCan()("approval_rule.manage");
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-semibold text-text-heading">Approval Rules</h1>
                <Can permission="approval_rule.manage">
                    <Link to="/approval-rules/$id" params={{ id: "baru" }} className="inline-flex min-h-control-md items-center rounded-md bg-teal-600 px-4 text-base font-medium text-text-inverse hover:bg-teal-700">
                        Buat aturan
                    </Link>
                </Can>
            </header>
            {disimpan !== undefined && <Peringatan varian="success">{`Approval rule #${String(disimpan)} tersimpan dan berlaku pada pengajuan berikutnya. Instance yang sedang berjalan tetap memakai snapshot lama.`}</Peringatan>}
            {aturan.isPending ? (
                <KeadaanMemuat label="Memuat approval rule" baris={6} />
            ) : aturan.isError ? (
                <KeadaanGalat galat={aturan.error} onCobaLagi={() => void aturan.refetch()} />
            ) : (
                <div className="overflow-x-auto rounded-md border border-border-subtle bg-surface-default">
                    <table className="w-full border-collapse tabular-nums">
                        <caption className="sr-only">Approval rule per jenis pengajuan, urut prioritas; aturan bawaan di baris terakhir</caption>
                        <thead>
                            <tr>
                                {["Aturan", "Jenis pengajuan", "Prioritas", "Kondisi", "Langkah", "Versi", "Status"].map((k) => (
                                    <th key={k} scope="col" className={TH}>
                                        {k}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {urutkan(aturan.data).map((a) => {
                                const n = jumlahSyarat(a.kondisi);
                                return (
                                    <tr key={a.id} className="hover:bg-neutral-50">
                                        <th scope="row" className={`${TD} text-left font-medium`}>
                                            {kelola ? (
                                                <Link to="/approval-rules/$id" params={{ id: String(a.id) }} className="text-text-link hover:text-text-link-hover">
                                                    {`Aturan #${String(a.id)}`}
                                                </Link>
                                            ) : (
                                                `Aturan #${String(a.id)}`
                                            )}
                                        </th>
                                        <td className={TD}>{labelEnum(LABEL_JENIS_PENGAJUAN, a.jenis_pengajuan)}</td>
                                        <td className={`${TD} text-right`}>{a.prioritas}</td>
                                        <td className={TD}>{n === 0 ? "Selalu cocok" : `${String(n)} syarat`}</td>
                                        <td className={`${TD} text-right`}>{a.steps.length}</td>
                                        <td className={`${TD} text-right`}>{a.versi}</td>
                                        <td className={TD}>
                                            <Lencana varian={a.status_aktif ? "success" : "neutral"}>{a.status_aktif ? "Aktif" : "Nonaktif"}</Lencana>
                                        </td>
                                    </tr>
                                );
                            })}
                            <tr className="bg-surface-subtle">
                                <th scope="row" className={`${TD} text-left font-medium`}>
                                    Aturan bawaan
                                </th>
                                <td className={TD}>Semua jenis</td>
                                <td className={`${TD} text-right`}>—</td>
                                <td className={TD}>Bila tidak ada aturan yang cocok</td>
                                <td className={TD}>1 · Petugas Sarana Prasarana, SLA 24 jam</td>
                                <td className={`${TD} text-right`}>—</td>
                                <td className={TD}>
                                    <Lencana varian="neutral">Terkunci</Lencana>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
