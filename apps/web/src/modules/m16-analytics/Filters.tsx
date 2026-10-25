import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AnalyticsQuery, AnalyticsType } from "@sigm4/schemas";
import { Isian, Pilihan, KotakCentang, Tombol } from "../../shared/ui/primitives";
import { KeadaanGalat } from "../../shared/states";
import { analyticsOptionsQuery } from "./api";
import { useSesi } from "../../shared/auth";
import { analyticsCacheScope } from "./cache-scope";
export function AnalyticsFilters({ jenis, query, supported, period, onApply }: { readonly jenis: AnalyticsType; readonly query: AnalyticsQuery; readonly supported: readonly string[]; readonly period?: { tanggal_mulai: string; tanggal_selesai: string } | undefined; readonly onApply: (q: AnalyticsQuery) => void }) {
    const source = analyticsOptionsQuery(jenis), options = useQuery({ ...source, queryKey: [...source.queryKey, ...analyticsCacheScope(useSesi())] });
    const [draft, setDraft] = useState({ start: query.tanggal_mulai ?? period?.tanggal_mulai ?? "", end: query.tanggal_selesai ?? period?.tanggal_selesai ?? "", room: String(query.room_id ?? ""), category: String(query.category_id ?? ""), unit: String(query.work_unit_id ?? ""), role: query.requester_role ?? "", compare: query.bandingkan === "true" });
    const [error, setError] = useState("");
    const dictionary = (key: "rooms" | "categories" | "units" | "roles") => (options.data?.[key] ?? []).map(o => ({ nilai: o.id, label: o.nama }));
    return <form aria-label="Filter analitik" onSubmit={e => {
        e.preventDefault();
        const start = draft.start || period?.tanggal_mulai, end = draft.end || period?.tanggal_selesai;
        if (!!start !== !!end || start && end && start > end) { setError("Isi kedua tanggal dengan urutan yang benar."); return; }
        setError(""); onApply({ page: 1, per_page: query.per_page, bandingkan: draft.compare ? "true" : "false", ...(start && end ? { tanggal_mulai: start, tanggal_selesai: end } : {}), ...(draft.room ? { room_id: Number(draft.room) } : {}), ...(draft.category ? { category_id: Number(draft.category) } : {}), ...(draft.unit ? { work_unit_id: Number(draft.unit) } : {}), ...(draft.role ? { requester_role: draft.role } : {}) });
    }} className="grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-2 lg:grid-cols-3">
        <Isian label="Tanggal mulai (WIB)" type="date" value={draft.start || period?.tanggal_mulai || ""} onChange={e => setDraft({ ...draft, start: e.target.value })} />
        <Isian label="Tanggal selesai (WIB)" type="date" value={draft.end || period?.tanggal_selesai || ""} onChange={e => setDraft({ ...draft, end: e.target.value })} />
        {supported.includes("room_id") && <Pilihan label="Lokasi" kosong="Semua lokasi dalam cakupan" opsi={dictionary("rooms")} value={draft.room} onChange={e => setDraft({ ...draft, room: e.target.value })} />}
        {supported.includes("category_id") && <Pilihan label="Kategori" kosong="Semua kategori dalam cakupan" opsi={dictionary("categories")} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} />}
        {supported.includes("work_unit_id") && <Pilihan label="Unit kerja pemohon" kosong="Semua unit dalam cakupan" opsi={dictionary("units")} value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} />}
        {supported.includes("requester_role") && <Pilihan label="Role pemohon" kosong="Semua role dalam cakupan" opsi={dictionary("roles")} value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} />}
        <div className="flex flex-wrap items-center gap-3 md:col-span-2 lg:col-span-3"><KotakCentang label="Bandingkan dengan periode sebelumnya" checked={draft.compare} onCheckedChange={v => setDraft({ ...draft, compare: !!v })} /><Tombol type="submit">Terapkan filter</Tombol><p className="text-sm text-text-secondary">Tampilan maksimal 366 hari; ekspor maksimal 5 tahun.</p></div>
        {error && <p role="alert" className="text-error-base md:col-span-2 lg:col-span-3">{error}</p>}
        {options.isError && <div className="md:col-span-2 lg:col-span-3"><KeadaanGalat galat={options.error} onCobaLagi={() => void options.refetch()} /></div>}
    </form>;
}
