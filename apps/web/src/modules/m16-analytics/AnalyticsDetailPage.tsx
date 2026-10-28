import { useQuery } from "@tanstack/react-query";
import type { AnalyticsQuery, AnalyticsType } from "@sigm4/schemas";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { analyticsCatalogQuery, analyticsReportQuery } from "./api";
import { AnalyticsFilters } from "./Filters";
import { AnalyticsSummary } from "./Summary";
import { AnalyticsChart } from "./Chart";
import { AnalyticsTable } from "./ReportTable";
import { ReportExportPanel } from "./ExportPanel";
import { useSesi } from "../../shared/auth";
import { analyticsCacheScope } from "./cache-scope";
export default function AnalyticsDetailPage({ jenis, search, onSearch }: { readonly jenis: AnalyticsType; readonly search: AnalyticsQuery & { ekspor?: string | undefined }; readonly onSearch: (q: AnalyticsQuery) => void }) {
    const scope = analyticsCacheScope(useSesi()), catalog = useQuery({ ...analyticsCatalogQuery, queryKey: [...analyticsCatalogQuery.queryKey, ...scope] }), { ekspor, ...query } = search, selected = catalog.data?.find(r => r.jenis === jenis);
    const reportQuery = analyticsReportQuery(jenis, query), response = useQuery({ ...reportQuery, queryKey: [...reportQuery.queryKey, ...scope], enabled: selected?.status === "SIAP" });
    const report = response.data?.report, exportFilter = Object.fromEntries(Object.entries(query).filter(([key]) => key !== "page" && key !== "per_page"));
    return <div className="flex flex-col gap-6"><header><a href="/analitik" className="text-sm text-text-link hover:underline">Kembali ke Statistik & Analitik</a><h1 className="mt-3 text-2xl font-semibold text-text-heading">{selected?.judul ?? "Laporan Analitik"}</h1><p className="mt-2 text-base text-text-secondary">Angka dan pilihan filter mengikuti cakupan akses Anda. Tanggal inklusif dalam WIB.</p></header>
        {catalog.isPending ? <KeadaanMemuat label="Memuat laporan" /> : catalog.isError ? <KeadaanGalat galat={catalog.error} onCobaLagi={() => void catalog.refetch()} /> : !selected ? <KeadaanKosong judul="Laporan tidak dapat diakses" pesan="Izin baca domain sumber diperlukan." /> : selected.status === "BELUM_TERSEDIA" ? <KeadaanKosong judul="Perhitungan belum tersedia" pesan="Laporan ini akan tersedia setelah penyedia perhitungannya diaktifkan." /> : <>
            <AnalyticsFilters key={JSON.stringify(query)} jenis={jenis} query={query} supported={selected.filter} period={report?.periode} onApply={onSearch} />
            {response.isPending ? <KeadaanMemuat label="Menghitung laporan" /> : response.isError ? <KeadaanGalat galat={response.error} onCobaLagi={() => void response.refetch()} /> : <>
                <p className="text-sm text-text-secondary">{report!.periode.tanggal_mulai} s.d. {report!.periode.tanggal_selesai} · Dicetak {new Date(report!.dibuat_pada).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB{report!.pembanding ? ` · Pembanding ${report!.pembanding.periode.tanggal_mulai} s.d. ${report!.pembanding.periode.tanggal_selesai}` : ""}</p>
                <AnalyticsSummary report={report!} />
                {report!.metodologi?.length ? <ul aria-label="Catatan perhitungan" className="list-disc space-y-1 pl-5 text-sm text-text-secondary">{report!.metodologi.map(note => <li key={note}>{note}</li>)}</ul> : null}
                {response.data.data.length === 0 ? <KeadaanKosong judul="Tidak ada data pada rentang ini" pesan="Coba ubah rentang tanggal atau filter. Halaman di luar batas juga dapat kosong." /> : <><AnalyticsChart key={JSON.stringify(report!.kolom)} columns={report!.kolom} rows={response.data.data} total={response.data.meta.total} /><AnalyticsTable jenis={jenis} response={response.data} query={query} onChange={onSearch} /></>}
            </>}
            <ReportExportPanel path={`/analytics/${jenis}/export`} jenis={jenis} filter={exportFilter} exportId={ekspor} />
        </>}
    </div>;
}
