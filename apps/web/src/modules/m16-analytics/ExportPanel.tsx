import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCan, useSesi } from "../../shared/auth";
import { analyticsCacheScope } from "./cache-scope";
import { KeadaanGalat } from "../../shared/states";
import { Tombol, Pilihan } from "../../shared/ui/primitives";
import { ApiError } from "../../shared/api";
import { requestExport, exportListQuery, assetExportListQuery, exportStatusQuery, downloadExport } from "./api";
import type { ReportExport } from "@sigm4/schemas";
const labels: Record<ReportExport["status"], string> = { MENUNGGU: "Menunggu diproses", BERJALAN: "Sedang diproses", SIAP: "Siap diunduh", GAGAL: "Gagal", KEDALUWARSA: "Kedaluwarsa", DIBATALKAN: "Dibatalkan" };
export function ReportExportPanel({ path, jenis, filter, exportId }: { readonly path: string; readonly jenis: string; readonly filter: unknown; readonly exportId?: string | undefined }) {
    const can = useCan(), scope = analyticsCacheScope(useSesi());
    return can(jenis === "assets" ? "asset.export" : "report.export") ? <ExportPanel key={JSON.stringify(scope)} path={path} jenis={jenis} filter={filter} exportId={exportId} /> : null;
}
function ExportPanel({ path, jenis, filter, exportId }: { readonly path: string; readonly jenis: string; readonly filter: unknown; readonly exportId?: string | undefined }) {
    const listQuery = jenis === "assets" ? assetExportListQuery : exportListQuery;
    const scope = analyticsCacheScope(useSesi()), cache = useQueryClient(), history = useQuery({ ...listQuery, queryKey: [...listQuery.queryKey, ...scope] }), statusQuery = exportStatusQuery(exportId, jenis), notified = useQuery({ ...statusQuery, queryKey: [...statusQuery.queryKey, ...scope] });
    const [format, setFormat] = useState<"XLSX" | "PDF">("XLSX"), [created, setCreated] = useState<ReportExport>(), [intent, setIntent] = useState<{ body: unknown; key: string } | null>(null);
    const create = useMutation({ mutationFn: async () => { const attempt = intent ?? { body: { format, filter }, key: crypto.randomUUID() }; setIntent(attempt); return requestExport(path, attempt.body, attempt.key); }, onSuccess: job => { setIntent(null); setCreated(job); void cache.invalidateQueries({ queryKey: ["report-exports"] }); }, onError: e => { if (e instanceof ApiError && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status) && e.kode !== "REQUEST_IN_PROGRESS") setIntent(null); } });
    const download = useMutation({ mutationFn: (id: string) => downloadExport(id, jenis), onSuccess: data => { const link = document.createElement("a"); link.href = data.url; link.download = data.nama_berkas; link.rel = "noopener noreferrer"; link.click(); } });
    const jobs = (history.data ?? []).filter(j => j.jenis === jenis), focus = notified.data ?? created;
    const rows = focus && !jobs.some(j => j.id === focus.id) ? [focus, ...jobs] : jobs;
    return <section aria-label={jenis === "assets" ? "Ekspor katalog aset" : "Ekspor laporan"} className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-default p-4">
        <div className="flex flex-wrap items-end gap-3"><Pilihan label="Format ekspor" value={format} opsi={[{ nilai: "XLSX", label: "XLSX — maksimal 100.000 baris" }, { nilai: "PDF", label: "PDF — maksimal 5.000 baris" }]} onChange={e => setFormat(e.target.value as "XLSX" | "PDF")} disabled={create.isPending || !!intent} /><Tombol varian="secondary" sibuk={create.isPending} onClick={() => create.mutate()}>{intent ? "Ulangi pengiriman ekspor" : "Ekspor seluruh hasil filter"}</Tombol></div>
        <p className="text-sm text-text-secondary">Ekspor diproses di latar belakang. Anda mendapat notifikasi saat file siap. File berlaku 24 jam; hasil yang melebihi batas harus difilter ulang.</p>
        {intent && create.isError && <p className="text-sm text-text-secondary">Pengiriman sebelumnya belum terkonfirmasi. Pengulangan memakai filter saat ekspor pertama diajukan.</p>}
        {create.isError && <div role="alert"><KeadaanGalat galat={create.error} onCobaLagi={() => create.mutate()} /></div>}{download.isError && <KeadaanGalat galat={download.error} onCobaLagi={() => { if (download.variables) download.mutate(download.variables); }} />}
        {exportId && notified.isError && <KeadaanGalat galat={notified.error} onCobaLagi={() => void notified.refetch()} />}
        {history.isError && <KeadaanGalat galat={history.error} onCobaLagi={() => void history.refetch()} />}
        {rows.length > 0 && <ul aria-label="Riwayat ekspor" className="flex flex-col gap-2">{rows.map(j => <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2"><div><p className="text-sm text-text-primary">{j.judul} {j.format} · #{j.id}</p><p role="status" className="text-sm text-text-secondary">{labels[j.status]}{j.jumlah_baris === null ? "" : ` · ${j.jumlah_baris.toLocaleString("id-ID")} baris`}{j.pesan_galat ? ` — ${j.pesan_galat}` : ""}</p></div>{j.status === "SIAP" && <Tombol varian="secondary" sibuk={download.isPending && download.variables === j.id} onClick={() => download.mutate(j.id)}>Unduh {j.format} #{j.id}</Tombol>}</li>)}</ul>}
    </section>;
}
