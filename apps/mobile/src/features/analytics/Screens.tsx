import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { ANALYTICS_TYPES } from "@sigm4/schemas";
import type { AnalyticsType, ReportExport } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { shareFromUrl } from "../../shared/export/share";
import { Button, Card, Chips, DateField, EmptyState, EntityCard, Label, MiniChart, Notice, Screen, SectionHeading, StatusBadge, Toggle, tokens as t } from "../../shared/ui";
import { chartValues, displayValue, drilldown, exportDownload, exportLabels, filterQuery, loadCatalog, loadExports, loadFilterOptions, loadReport, requestExport, rowLabel, running, summaryDelta } from "./model";
import type { FilterDraft } from "./model";

const descriptions: Readonly<Record<string, string>> = { "kondisi-aset": "Komposisi kondisi dan perubahan antarbulan.", "pemanfaatan-fasilitas": "Jam pemakaian ruangan dan aset dibandingkan kapasitasnya.", "biaya-pemeliharaan": "Biaya per kategori, aset, dan periode.", "tren-kerusakan": "Laporan kerusakan dan waktu penyelesaiannya.", "aktivitas-peminjaman": "Aktivitas peminjam, aset populer, dan keterlambatan.", "konsumsi-bahan": "Pemakaian bahan dan unit kerja peminta.", "kebutuhan-pengadaan": "Kandidat penggantian berdasarkan kondisi dan umur teknis.", "rekapitulasi-aset": "Daftar aset, lokasi, tahun, dan nilai sesuai izin." };
const useSession = () => { const { api, state } = useAuth(); const perms = state.kind === "READY" ? state.session.permissions : {}; return { api, account: state.kind === "READY" ? state.session.user.id : "", perms, can: (p: string) => Object.hasOwn(perms, p) }; };

/** MS-74 — padanan P-58: katalog laporan sesuai izin baca domain sumber (FR-16.x). */
export function AnalyticsListScreen() {
    const { api, account, can } = useSession(), permitted = can("report.view");
    const r = useResource(`${account}:analytics-catalog`, useCallback((s: AbortSignal) => permitted ? loadCatalog(api, s) : Promise.resolve(null), [api, permitted]));
    if (!permitted) return <Screen title="Statistik & Analitik"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat laporan."/></Screen>;
    return <Screen title="Statistik & Analitik" subtitle="Pilih laporan untuk perencanaan dan evaluasi sarana prasarana. Data mengikuti cakupan akses Anda.">
        {r.loading && <Label tone="muted">Memuat jenis laporan…</Label>}{r.error && <Notice message={r.error}/>}
        {r.data?.map((x) => <EntityCard key={x.jenis} icon="chartColumn" title={x.judul} meta={[descriptions[x.jenis]]} statuses={x.status === "SIAP" ? [] : [{ label: "Perhitungan belum tersedia", tone: "pending" }]} {...(x.status === "SIAP" ? { onPress: () => router.push(`/analitik/${x.jenis}` as "/scan") } : {})}/>)}
        {r.data && !r.data.length && <EmptyState illustration="empty" title="Belum ada laporan yang dapat diakses" description="Laporan memerlukan izin baca domain sumber."/>}
    </Screen>;
}

function ExportPanel({ jenis, filter }: { jenis: AnalyticsType; filter: Readonly<Record<string, unknown>> }) {
    const { api, account } = useSession(), [format, setFormat] = useState<"XLSX" | "PDF">("XLSX"), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [created, setCreated] = useState<ReportExport | null>(null), [version, setVersion] = useState(0), attempt = useRef<{ body: string; key: string } | null>(null);
    const jobs = useResource(`${account}:report-exports:${version}`, useCallback((s: AbortSignal) => loadExports(api, s), [api, version]));
    const rows = (jobs.data ?? []).filter((j) => j.jenis === jenis), list = created && !rows.some((j) => j.id === created.id) ? [created, ...rows] : rows;
    // Ekspor diproses latar belakang; status disegarkan berkala selama masih berjalan.
    useEffect(() => { if (!list.some(running)) return; const timer = setTimeout(() => setVersion((v) => v + 1), 3000); return () => clearTimeout(timer); }, [list]);
    const create = async () => { const body = { format, filter }, text = JSON.stringify(body); if (attempt.current?.body !== text) attempt.current = { body: text, key: randomUUID() }; setBusy(true); setError(null); try { setCreated(await requestExport(api, jenis, body, attempt.current.key)); attempt.current = null; setVersion((v) => v + 1); } catch (e) { setError(e instanceof Error ? e.message : "Ekspor belum diajukan. Coba lagi dengan filter yang sama."); } finally { setBusy(false); } };
    const save = async (j: ReportExport) => { setBusy(true); setError(null); try { const d = await exportDownload(api, j.id); await shareFromUrl(d.url, d.nama_berkas); } catch (e) { setError(e instanceof Error ? e.message : "Berkas belum dapat disimpan."); } finally { setBusy(false); } };
    return <Card><Label strong>Ekspor laporan</Label>
        <Chips label="Format" value={format} disabled={busy} options={[{ value: "XLSX", label: "XLSX (maks. 100.000 baris)" }, { value: "PDF", label: "PDF (maks. 5.000 baris)" }]} onChange={setFormat}/>
        <Button icon="fileText" title="Ekspor seluruh hasil filter" secondary busy={busy} onPress={() => void create()}/>
        <Label tone="muted">Diproses di latar belakang; berkas berlaku 24 jam dan disimpan lewat lembar bagikan perangkat.</Label>
        {error && <Notice message={error}/>}{jobs.error && <Notice message={jobs.error}/>}
        {list.map((j) => <View key={j.id} style={styles.row}><View style={styles.flex}><Label>{j.judul} {j.format} · #{j.id}</Label><Label tone="muted">{exportLabels[j.status]}{j.jumlah_baris === null ? "" : ` · ${j.jumlah_baris} baris`}{j.pesan_galat ? ` — ${j.pesan_galat}` : ""}</Label></View>{j.status === "SIAP" && <Button icon="arrowRight" title="Simpan" compact secondary disabled={busy} onPress={() => void save(j)}/>}</View>)}
    </Card>;
}

/** MS-75 — padanan P-59: filter, ringkasan + pembanding, Grafik Mini C-33, baris laporan, ekspor ke perangkat (keputusan 24). */
export function AnalyticsReportScreen() {
    const params = useLocalSearchParams<{ jenis: string }>(), jenis = (ANALYTICS_TYPES as readonly string[]).includes(params.jenis ?? "") ? params.jenis as AnalyticsType : null;
    const { api, account, can } = useSession(), permitted = !!jenis && can("report.view");
    const [draft, setDraft] = useState<FilterDraft>({ start: "", end: "", room: "", category: "", unit: "", role: "", compare: false }), [query, setQuery] = useState<Record<string, string | number>>({ bandingkan: "false" }), [page, setPage] = useState(1), [metric, setMetric] = useState(""), [error, setError] = useState<string | null>(null);
    const catalog = useResource(`${account}:analytics-catalog`, useCallback((s: AbortSignal) => permitted ? loadCatalog(api, s) : Promise.resolve(null), [api, permitted]));
    const selected = catalog.data?.find((x) => x.jenis === jenis), ready = selected?.status === "SIAP";
    const options = useResource(`${account}:analytics-options:${jenis}`, useCallback((s: AbortSignal) => ready ? loadFilterOptions(api, jenis!, s) : Promise.resolve(null), [api, jenis, ready]));
    const report = useResource(`${account}:analytics:${jenis}:${JSON.stringify(query)}:${page}`, useCallback((s: AbortSignal) => ready ? loadReport(api, jenis!, { ...query, page, per_page: 25 }, s) : Promise.resolve(null), [api, jenis, ready, query, page]));
    if (!permitted) return <Screen title="Laporan Analitik"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Laporan tidak dapat diakses dengan izin Anda."/></Screen>;
    const r = report.data?.report, columns = (r?.kolom ?? []).filter((c) => c.key !== "grup"), metrics = columns.filter((c) => c.tipe === "NUMBER" || c.tipe === "DECIMAL"), m = metrics.find((c) => c.key === metric) ?? metrics[0];
    const dict = (key: "rooms" | "categories" | "units" | "roles") => [{ value: "", label: "Semua" }, ...(options.data?.[key] ?? []).map((o) => ({ value: o.id, label: o.nama }))];
    const apply = () => { const q = filterQuery(draft, selected?.filter ?? []); if ("error" in q) { setError(q.error); return; } setError(null); setPage(1); setQuery(q.query); };
    return <Screen title={selected?.judul ?? "Laporan Analitik"} subtitle="Angka dan pilihan filter mengikuti cakupan akses Anda. Tanggal inklusif dalam WIB; tampilan maksimal 366 hari.">
        {catalog.error && <Notice message={catalog.error}/>}
        {catalog.data && !selected && <EmptyState illustration="noAccess" title="Laporan tidak dapat diakses" description="Izin baca domain sumber diperlukan."/>}
        {selected && !ready && <EmptyState illustration="empty" title="Perhitungan belum tersedia" description="Laporan ini tersedia setelah penyedia perhitungannya diaktifkan."/>}
        {ready && <>
            <Card><DateField label="Tanggal mulai" value={draft.start || r?.periode.tanggal_mulai || ""} onChange={(start) => setDraft({ ...draft, start })}/><DateField label="Tanggal selesai" value={draft.end || r?.periode.tanggal_selesai || ""} onChange={(end) => setDraft({ ...draft, end })}/>
                {selected.filter.includes("room_id") && <Chips label="Lokasi" value={draft.room} options={dict("rooms")} onChange={(room) => setDraft({ ...draft, room })}/>}
                {selected.filter.includes("category_id") && <Chips label="Kategori" value={draft.category} options={dict("categories")} onChange={(category) => setDraft({ ...draft, category })}/>}
                {selected.filter.includes("work_unit_id") && <Chips label="Unit kerja pemohon" value={draft.unit} options={dict("units")} onChange={(unit) => setDraft({ ...draft, unit })}/>}
                {selected.filter.includes("requester_role") && <Chips label="Role pemohon" value={draft.role} options={dict("roles")} onChange={(role) => setDraft({ ...draft, role })}/>}
                <Toggle label="Bandingkan dengan periode sebelumnya" value={draft.compare} onChange={(compare) => setDraft({ ...draft, compare })}/>
                {error && <Notice message={error}/>}<Button icon="search" title="Terapkan filter" compact onPress={apply}/></Card>
            {report.loading && <Label tone="muted">Menghitung laporan…</Label>}{report.error && <Notice message={report.error}/>}
            {r && report.data && <>
                <Label tone="muted">{r.periode.tanggal_mulai} s.d. {r.periode.tanggal_selesai}{r.pembanding ? ` · pembanding ${r.pembanding.periode.tanggal_mulai} s.d. ${r.pembanding.periode.tanggal_selesai}` : ""}</Label>
                <View style={styles.wrap}>{r.kolom_ringkasan.map((c) => { const delta = summaryDelta(r.ringkasan[c.key], r.pembanding?.ringkasan[c.key], c); return <Card key={c.key} style={styles.tile}><Label tone="muted">{c.label}</Label><Label strong>{displayValue(r.ringkasan[c.key], c)}</Label>{r.pembanding && <Label tone="muted">Sebelumnya {displayValue(r.pembanding.ringkasan[c.key], c)}{delta === null ? "" : ` · selisih ${displayValue(delta, c)}`}</Label>}</Card>; })}</View>
                {r.metodologi?.map((n) => <Label key={n} tone="muted">• {n}</Label>)}
                {report.data.data.length === 0 ? <EmptyState illustration="empty" title="Tidak ada data pada rentang ini" description="Ubah rentang tanggal atau filter."/> : <>
                    {m && <Card>{metrics.length > 1 && <Chips label="Indikator grafik" value={m.key} options={metrics.map((c) => ({ value: c.key, label: c.label }))} onChange={setMetric}/>}<MiniChart kind="bar" values={chartValues(report.data.data, m.key)} summary={`${m.label}: ${Math.min(20, report.data.data.length)} baris pertama halaman ini dari ${report.data.meta.total} grup.`}/></Card>}
                    <SectionHeading title={`Rincian (${report.data.meta.total} grup)`}/>
                    {report.data.data.map((row, i) => { const link = drilldown(jenis!, row, can); return <EntityCard key={String(row["grup"] ?? i)} title={rowLabel(row, columns)} meta={columns.slice(0, 4).map((c) => `${c.label}: ${displayValue(row[c.key], c)}`)} {...(m ? { value: displayValue(row[m.key], m) } : {})} {...(link ? { onPress: () => router.push(link as "/scan") } : {})}/>; })}
                    {report.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{report.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= report.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
                </>}
            </>}
            {can("report.export") ? <ExportPanel jenis={jenis!} filter={query}/> : <StatusBadge label="Ekspor memerlukan izin report.export" tone="pending"/>}
        </>}
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, flex: { flex: 1 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, tile: { flexGrow: 1, flexBasis: t.size.control * 3 } });
