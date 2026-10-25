import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, Notice, Screen, SectionHeading, tokens as t } from "../../shared/ui";
import { dateWib, longDate } from "../../shared/wib";
import { workOrderStatuses } from "./model";
import { dueTone, formFromSchedule, loadOptions, loadSchedule, loadScheduleAssets, loadScheduleOrders, loadSchedules, saveSchedule, scheduleAction, scheduleBody } from "./schedules";
import type { ScheduleForm } from "./schedules";

const useKey = () => { const r = useRef<{ b: string; k: string } | null>(null); return (b: unknown) => { const s = JSON.stringify(b); if (r.current?.b !== s) r.current = { b: s, k: randomUUID() }; return r.current.k; }; };
const denied = <Screen title="Jadwal Pemeliharaan"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin mengelola jadwal pemeliharaan."/></Screen>;

/** Isian jadwal di C-36: cakupan aset/kategori, interval, mulai, teknisi bawaan, checklist (FR-12.2). */
function ScheduleSheet({ initial, id, visible, onClose, onSaved }: { initial: ScheduleForm; id?: string; visible: boolean; onClose: () => void; onSaved: (id: string) => void }) {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const [f, setF] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), key = useKey();
    const opts = useResource(`${account}:schedule-options`, useCallback((s: AbortSignal) => visible ? loadOptions(api, s) : Promise.resolve(null), [api, visible]));
    const assets = useResource(`${account}:schedule-assets:${f.category}`, useCallback((s: AbortSignal) => visible && f.scope === "aset" && f.category && !id ? loadScheduleAssets(api, f.category, s) : Promise.resolve(null), [api, visible, f.scope, f.category, id]));
    const set = (p: Partial<ScheduleForm>) => { setError(null); setF({ ...f, ...p }); };
    const save = async () => { const r = scheduleBody(f); if ("error" in r) { setError(r.error); return; } setBusy(true); setError(null); try { const s = await saveSchedule(api, r.body, key(r.body), id); onSaved(s.id); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "Jadwal belum tersimpan."); } finally { setBusy(false); } };
    return <BottomSheet visible={visible} full onClose={onClose} title={id ? "Ubah jadwal" : "Tambah jadwal"}><View style={{ padding: t.space.md, gap: t.space.md }}>
        <Input label="Nama jadwal" value={f.nama} maxLength={200} onChangeText={(v) => set({ nama: v })}/>
        {!id && <Chips label="Cakupan" value={f.scope} options={[{ value: "kategori", label: "Satu kategori" }, { value: "aset", label: "Satu aset" }]} onChange={(v) => set({ scope: v, asset: "" })}/>}
        {opts.data && !id && <Chips label="Kategori" value={f.category} options={opts.data.categories.map((c) => ({ value: c.id, label: c.nama }))} onChange={(v) => set({ category: v, asset: "", interval: f.interval || String(opts.data?.categories.find((c) => c.id === v)?.interval_preventif_hari ?? "") })}/>}
        {f.scope === "aset" && !id && (assets.data ? <Chips label="Aset" value={f.asset} options={assets.data.map((a) => ({ value: a.id, label: `${a.kode_barang} · ${a.nama}` }))} onChange={(v) => set({ asset: v })}/> : <Label tone="muted">Pilih kategori untuk memuat aset.</Label>)}
        <Input label="Interval (hari)" value={f.interval} keyboardType="number-pad" onChangeText={(v) => set({ interval: v.replace(/\D/g, "") })}/>
        <DateField label="Mulai" value={f.start} onChange={(v) => set({ start: v })}/>
        {opts.data && <Chips label="Teknisi bawaan" value={f.technician} options={opts.data.technicians.map((x) => ({ value: x.id, label: x.nama }))} onChange={(v) => set({ technician: v })}/>}
        <Input label="Checklist (satu butir per baris)" value={f.checklist} multiline onChangeText={(v) => set({ checklist: v })}/>
        {error && <Notice message={error}/>}<Button icon="check" title="Simpan jadwal" busy={busy} onPress={() => void save()}/>
    </View></BottomSheet>;
}

/** MS-63 — padanan P-45: jadwal aktif/nonaktif dan jatuh tempo terdekat. */
export function ScheduleListScreen() {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "", permitted = state.kind === "READY" && Object.hasOwn(state.session.permissions, "maintenance.manage");
    const [status, setStatus] = useState("AKTIF"), [days, setDays] = useState(""), [page, setPage] = useState(1), [adding, setAdding] = useState(false);
    const list = useResource(`${account}:schedules:${status}:${days}:${page}`, useCallback((s: AbortSignal) => permitted ? loadSchedules(api, { page, status, days }, s) : Promise.resolve(null), [api, page, status, days, permitted]));
    if (!permitted) return denied;
    const today = dateWib(Date.now());
    return <Screen title="Jadwal Pemeliharaan" subtitle="Jadwal preventif membuat work order otomatis saat jatuh tempo.">
        <Button icon="plus" title="Tambah jadwal" onPress={() => setAdding(true)}/>
        <Chips label="Status" value={status} options={[{ value: "AKTIF", label: "Aktif" }, { value: "NONAKTIF", label: "Nonaktif" }, { value: "", label: "Semua" }]} onChange={(v) => { setStatus(v); setPage(1); }}/>
        <Chips label="Jatuh tempo" value={days} options={[{ value: "", label: "Semua" }, { value: "7", label: "≤ 7 hari" }, { value: "30", label: "≤ 30 hari" }]} onChange={(v) => { setDays(v); setPage(1); }}/>
        {list.loading && <Label tone="muted">Memuat jadwal…</Label>}{list.error && <Notice message={list.error}/>}
        {list.data?.data.length === 0 && <EmptyState illustration="empty" title="Tidak ada jadwal" description="Ubah saringan atau tambah jadwal baru."/>}
        {list.data?.data.map((s) => <EntityCard key={s.id} icon="calendarClock" title={s.nama} meta={[s.nama_aset ?? s.nama_kategori ?? "", `Setiap ${s.interval_hari} hari`]} statuses={[s.status === "NONAKTIF" ? { label: "Nonaktif", tone: "pending" } : { label: s.jatuh_tempo_berikutnya ? `Jatuh tempo ${s.jatuh_tempo_berikutnya}` : "Belum terjadwal", tone: dueTone(s.jatuh_tempo_berikutnya, today) }]} onPress={() => router.push(`/jadwal-pemeliharaan/${s.id}` as "/scan")}/>)}
        {list.data && list.data.meta.total_pages > 1 && <View style={{ flexDirection: "row", gap: t.space.sm, alignItems: "center" }}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{list.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= list.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
        <ScheduleSheet visible={adding} initial={{ nama: "", scope: "kategori", category: "", asset: "", interval: "", start: dateWib(Date.now()), technician: "", checklist: "" }} onClose={() => setAdding(false)} onSaved={(id) => router.push(`/jadwal-pemeliharaan/${id}` as "/scan")}/>
    </Screen>;
}

/** MS-64 — padanan P-46: rincian, checklist, WO turunan; ubah, lewati, nonaktifkan beralasan (FR-12.2 A2/A3). */
export function ScheduleDetailScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permitted = /^[1-9]\d*$/.test(id) && state.kind === "READY" && Object.hasOwn(state.session.permissions, "maintenance.manage");
    const s = useResource(`${account}:schedule:${id}`, useCallback((sig: AbortSignal) => permitted ? loadSchedule(api, id, sig) : Promise.resolve(null), [api, id, permitted]));
    const orders = useResource(`${account}:schedule-orders:${id}`, useCallback((sig: AbortSignal) => permitted ? loadScheduleOrders(api, id, sig) : Promise.resolve(null), [api, id, permitted]));
    const [action, setAction] = useState<"skip" | "deactivate" | null>(null), [editing, setEditing] = useState(false), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), key = useKey();
    if (!permitted) return denied;
    const d = s.data;
    const act = async () => { if (!action) return; setBusy(true); setError(null); try { await scheduleAction(api, id, action, reason, key({ action, reason })); setAction(null); s.reload(); orders.reload(); } catch (e) { setError(e instanceof Error ? e.message : "Perubahan belum tersimpan."); } finally { setBusy(false); } };
    return <Screen title={d?.nama ?? "Detail Jadwal"}>
        {s.loading && <Label tone="muted">Memuat jadwal…</Label>}{s.error && <Notice message={s.error}/>}
        {d && <>
            <EntityCard icon="calendarClock" title={d.nama} meta={[d.nama_aset ?? d.nama_kategori ?? "", `Setiap ${d.interval_hari} hari · ${d.nama_teknisi ?? "teknisi bawaan"}`]} statuses={[d.status === "NONAKTIF" ? { label: "Nonaktif", tone: "pending" } : { label: d.jatuh_tempo_berikutnya ? `Berikutnya ${longDate(d.jatuh_tempo_berikutnya)}` : "Belum terjadwal", tone: dueTone(d.jatuh_tempo_berikutnya, dateWib(Date.now())) }]}/>
            {d.status === "AKTIF" && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }}><Button icon="settings" title="Ubah" compact secondary onPress={() => setEditing(true)}/><Button icon="arrowRight" title="Lewati kemunculan" compact secondary onPress={() => { setReason(""); setError(null); setAction("skip"); }}/><Button icon="close" title="Nonaktifkan" compact secondary onPress={() => { setReason(""); setError(null); setAction("deactivate"); }}/></View>}
            <SectionHeading title={`Checklist (${d.checklist.length})`}/><Card>{d.checklist.map((c, i) => <Label key={i}>{i + 1}. {c}</Label>)}</Card>
            <SectionHeading title="Work order dari jadwal ini"/>
            {orders.data?.length === 0 && <Label tone="muted">Belum ada work order yang dibuat.</Label>}
            {orders.data?.map((o) => <EntityCard key={o.id} icon="wrench" title={o.nomor} meta={[`Target ${o.target_selesai}`]} statuses={[{ label: (workOrderStatuses as Readonly<Record<string, string>>)[o.status] ?? o.status, tone: o.status === "SELESAI" ? "success" : o.menunggu_ketersediaan_aset ? "warning" : "info" }]} onPress={() => router.push(`/work-order/${o.id}` as "/scan")}/>)}
            <ScheduleSheet visible={editing} id={d.id} initial={formFromSchedule(d)} onClose={() => setEditing(false)} onSaved={() => s.reload()}/>
        </>}
        <BottomSheet visible={action !== null} onClose={() => setAction(null)} title={action === "skip" ? "Lewati kemunculan berikutnya?" : "Nonaktifkan jadwal?"}><View style={{ padding: t.space.md, gap: t.space.md }}>
            <Label>{action === "skip" ? "Jatuh tempo bergeser satu interval; tidak ada work order untuk kemunculan ini." : "Tidak ada work order baru yang dibuat dari jadwal ini."}</Label>
            <Input label="Alasan" value={reason} multiline maxLength={2000} onChangeText={setReason}/>{error && <Notice message={error}/>}
            <Button icon="check" title={action === "skip" ? "Lewati" : "Nonaktifkan"} busy={busy} disabled={!reason.trim()} onPress={() => void act()}/>
        </View></BottomSheet>
    </Screen>;
}
