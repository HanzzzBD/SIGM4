import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { CHAT_TOOL_LABELS, ChatDetailResponseSchema, ChatMonitorResponseSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { ExportButtons } from "../../shared/export/ExportButtons";
import { shareFromApi } from "../../shared/export/share";
import { formatTime } from "../../shared/time";
import { dateWib } from "../../shared/wib";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, Notice, Screen, SectionHeading, StatusBadge, tokens as t } from "../../shared/ui";
import { CODE_STATUS, actor, compare, filterParams, loadLog, loadLogs, loadLogUsers, valueLabel } from "./model";
import type { Entry, LogFilter } from "./model";

const useSession = () => { const { api, state } = useAuth(); const perms = state.kind === "READY" ? state.session.permissions : {}; return { api, account: state.kind === "READY" ? state.session.user.id : "", role: state.kind === "READY" ? state.session.user.role_kode : "", can: (p: string) => Object.hasOwn(perms, p) }; };
const denied = (title: string) => <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin membuka halaman ini."/></Screen>;

/** MS-88 — padanan P-73: saringan rentang tanggal, pengguna, modul, aksi, entitas; ekspor XLSX (`activity_log.export`). */
export function ActivityLogScreen() {
    const params = useLocalSearchParams<{ entitas?: string; entitas_id?: string }>(), { api, account, can } = useSession();
    const [draft, setDraft] = useState<LogFilter>({ entitas: params.entitas, entitas_id: params.entitas_id }), [filter, setFilter] = useState<LogFilter>(draft), [page, setPage] = useState(1), [open, setOpen] = useState(!!params.entitas);
    const r = useResource(`${account}:logs:${JSON.stringify(filter)}:${page}`, useCallback((s: AbortSignal) => can("activity_log.view") ? loadLogs(api, filter, page, s) : Promise.resolve(null), [api, filter, page, account]));
    const users = useResource(`${account}:log-users`, useCallback((s: AbortSignal) => open && can("user.view") ? loadLogUsers(api, s) : Promise.resolve(null), [api, open, account]));
    if (!can("activity_log.view")) return denied("Activity Log");
    const apply = () => { setPage(1); setFilter({ ...draft }); };
    return <Screen title="Activity Log" subtitle="Jejak audit seluruh operasi tulis. Membuka detail entri ikut tercatat.">
        <Button icon={open ? "chevronDown" : "search"} title={open ? "Tutup saringan" : "Saring log"} compact secondary onPress={() => setOpen(!open)}/>
        {open && <Card><DateField label="Dari tanggal" value={draft.dari ?? ""} onChange={(dari) => setDraft({ ...draft, dari })}/><DateField label="Sampai tanggal" value={draft.sampai ?? ""} onChange={(sampai) => setDraft({ ...draft, sampai })}/>
            {users.data && <Chips label="Pengguna" value={draft.user ?? ""} options={[{ value: "", label: "Semua pengguna" }, ...users.data.map((u) => ({ value: u.id, label: u.nama }))]} onChange={(user) => setDraft({ ...draft, user: user || undefined })}/>}
            <Input label="Modul (mis. m04-assets)" value={draft.modul ?? ""} autoCapitalize="none" onChangeText={(modul) => setDraft({ ...draft, modul })}/><Input label="Jenis aksi (mis. ASSET_UPDATED)" value={draft.aksi ?? ""} autoCapitalize="characters" onChangeText={(aksi) => setDraft({ ...draft, aksi })}/>
            <View style={styles.row}><View style={styles.flex}><Input label="Entitas" value={draft.entitas ?? ""} autoCapitalize="none" onChangeText={(entitas) => setDraft({ ...draft, entitas })}/></View><View style={styles.flex}><Input label="ID entitas" value={draft.entitas_id ?? ""} keyboardType="number-pad" onChangeText={(entitas_id) => setDraft({ ...draft, entitas_id })}/></View></View>
            <View style={styles.row}><View style={styles.flex}><Button icon="search" title="Terapkan" compact onPress={apply}/></View><View style={styles.flex}><Button icon="close" title="Hapus saringan" compact secondary onPress={() => { setDraft({}); setFilter({}); setPage(1); }}/></View></View></Card>}
        {can("activity_log.export") && <ExportButtons formats={["xlsx"]} label="Ekspor log" onExport={(format) => shareFromApi(api, "/activity-logs/export", filterParams(filter), `activity-logs-${dateWib(Date.now())}`, format)}/>}
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat activity log…</Label>}
        {r.data?.data.map((e) => <EntityCard key={e.id} icon="history" title={e.aksi} meta={[`${actor(e)}${e.role ? ` · ${e.role}` : ""}`, `${e.modul}${e.entitas ? ` · ${e.entitas}${e.entitas_id ? ` #${e.entitas_id}` : ""}` : ""}`, formatTime(e.waktu)]} statuses={[{ label: e.hasil === "SUKSES" ? "Sukses" : "Gagal", tone: e.hasil === "SUKSES" ? "success" : "error" }]} onPress={() => router.push(`/activity-log/${e.id}` as "/scan")}/>)}
        {r.data && !r.data.data.length && <EmptyState illustration="empty" title="Tidak ada entri" description="Ubah saringan atau rentang tanggal."/>}
        {r.data && r.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{r.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= r.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
    </Screen>;
}

function Changes({ e }: { e: Entry }) {
    const c = compare(e.nilai_sebelum, e.nilai_sesudah);
    if (c.kind === "empty") return <Label tone="muted">Entri ini tidak menyimpan nilai sebelum/sesudah.</Label>;
    if (c.kind === "value") return <Card><Label>Sebelum: {valueLabel("", c.before, e.entitas)}</Label><Label>Sesudah: {valueLabel("", c.after, e.entitas)}</Label></Card>;
    if (c.kind === "code") return <>{c.rows.map((r) => <EntityCard key={r.code} icon="keyRound" title={r.code} meta={[r.before ? `Sebelum: ${Object.entries(r.before).filter(([k]) => k !== "kode").map(([k, v]) => `${k} ${valueLabel(k, v, e.entitas)}`).join(", ")}` : null, r.after ? `Sesudah: ${Object.entries(r.after).filter(([k]) => k !== "kode").map(([k, v]) => `${k} ${valueLabel(k, v, e.entitas)}`).join(", ")}` : null]} statuses={[{ label: CODE_STATUS[r.status], tone: r.status === "TETAP" ? "pending" : r.status === "DICABUT" ? "error" : "info" }]}/>)}</>;
    return <>{c.rows.map((r) => <View key={r.key} style={[styles.diff, r.changed && styles.changed]}><Label strong>{r.label}</Label><Label tone="muted">Sebelum: {valueLabel(r.key, r.before, e.entitas)}</Label><Label>Sesudah: {valueLabel(r.key, r.after, e.entitas)}</Label>{r.changed && <StatusBadge label="Berubah" tone="info"/>}</View>)}</>;
}
/** MS-89 — padanan P-74: identitas pelaku, konteks permintaan, dan perbandingan sebelum/sesudah (FR-18.2). */
export function ActivityLogDetailScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(), { api, account, can } = useSession(), valid = /^[1-9]\d*$/.test(id) && can("activity_log.view");
    const r = useResource(`${account}:log:${id}`, useCallback((s: AbortSignal) => valid ? loadLog(api, id, s) : Promise.resolve(null), [api, id, valid]));
    if (!valid) return denied("Detail Entri Log");
    const e = r.data;
    return <Screen title={e?.aksi ?? "Detail Entri Log"} subtitle="Pembukaan detail ini tercatat sebagai ACTIVITY_LOG_VIEWED.">
        {r.loading && <Label tone="muted">Memuat entri log…</Label>}{r.error && <Notice message={r.error}/>}
        {e && <><EntityCard icon="history" title={e.aksi} meta={[formatTime(e.waktu), e.modul]} statuses={[{ label: e.hasil === "SUKSES" ? "Sukses" : "Gagal", tone: e.hasil === "SUKSES" ? "success" : "error" }]}/>
            <Card><Label>Pelaku: {actor(e)}{e.role ? ` · ${e.role}` : ""}</Label><Label>Entitas: {e.entitas ?? "—"}{e.entitas_id ? ` #${e.entitas_id}` : ""}</Label>{e.keterangan && <Label>Keterangan: {e.keterangan}</Label>}<Label tone="muted">Alamat IP: {e.ip ?? "—"}</Label><Label tone="muted">Perangkat: {e.user_agent ?? "—"}</Label><Label tone="muted">ID permintaan: {e.request_id ?? "—"}</Label></Card>
            <SectionHeading title="Perubahan"/><Changes e={e}/></>}
    </Screen>;
}

function Restriction({ id }: { id: string }) {
    const { api } = useSession(), [blocked, setBlocked] = useState<boolean | null>(null), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [done, setDone] = useState<string | null>(null), key = useRef<{ b: string; k: string } | null>(null);
    const send = async () => { const body = { blocked: blocked!, alasan: reason.trim() }, b = JSON.stringify(body); if (key.current?.b !== b) key.current = { b, k: randomUUID() }; setBusy(true); setError(null); try { await api.post(`/chat/reports/${id}/access`, body, { headers: { "Idempotency-Key": key.current.k } }); setDone(blocked ? "Akses chatbot akun ini dibatasi." : "Akses chatbot akun ini dipulihkan."); setBlocked(null); key.current = null; } catch (e) { setError(e instanceof Error ? e.message : "Akses belum diperbarui."); } finally { setBusy(false); } };
    return <><View style={styles.row}><View style={styles.flex}><Button icon="circleX" title="Batasi akses" compact secondary onPress={() => { setReason(""); setError(null); setBlocked(true); }}/></View><View style={styles.flex}><Button icon="checkCircle" title="Pulihkan akses" compact secondary onPress={() => { setReason(""); setError(null); setBlocked(false); }}/></View></View>{done && <Notice tone="success" message={done}/>}
        <BottomSheet visible={blocked !== null} onClose={() => { if (!busy) setBlocked(null); }} title={blocked ? "Batasi akses chatbot?" : "Pulihkan akses chatbot?"}><View style={styles.sheet}><Label>Keputusan berlaku pada pemilik sesi yang mengizinkan berbagi laporan. Modul lain tetap tersedia.</Label><Input label="Alasan" value={reason} multiline maxLength={500} onChangeText={setReason}/>{error && <Notice message={error}/>}<Button icon="check" title={blocked ? "Batasi akses" : "Pulihkan akses"} busy={busy} disabled={!reason.trim()} onPress={() => void send()}/></View></BottomSheet></>;
}
function Reported({ id }: { id: string }) {
    const { api, account, role, can } = useSession(), [pages, setPages] = useState<string[]>([""]);
    const r = useResource(`${account}:chat-report:${id}:${pages.join(",")}`, useCallback(async (s: AbortSignal) => { const out = []; for (const before of pages) out.push(ChatDetailResponseSchema.parse((await api.get(`/chat/reports/${id}`, { params: before ? { before } : {}, signal: s })).data).data); return out; }, [api, id, pages]));
    const first = r.data?.[0], last = r.data?.at(-1);
    return <Card>{r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat laporan…</Label>}
        {first && <><Label strong>{first.session.judul}</Label>{role === "R-01" && can("setting.manage") && <Restriction id={id}/>}{first.report_note && <Label>Laporan pengguna: {first.report_note}</Label>}
            {last?.has_more && <Button icon="refresh" title="Muat pesan sebelumnya" compact secondary onPress={() => setPages([...pages, last.messages[0]?.id ?? ""])}/>}
            {[...(r.data ?? [])].reverse().flatMap((p) => p.messages).map((m) => <Label key={m.id}>{m.peran === "USER" ? "Pengguna" : "Asisten"}: {m.isi}</Label>)}</>}
    </Card>;
}
/** MS-90 — padanan P-75: statistik 30 hari tanpa isi & pengenal pengguna, sesi dilaporkan atas izin pengguna (FR-19.2). */
export function ChatMonitorScreen() {
    const { api, account, can } = useSession(), [selected, setSelected] = useState<string | null>(null), [version, setVersion] = useState(0);
    const r = useResource(`${account}:chat-monitor:${version}`, useCallback(async (s: AbortSignal) => can("chat.monitor") ? ChatMonitorResponseSchema.parse((await api.get("/chat/monitor", { signal: s })).data).data : null, [api, version, account]));
    if (!can("chat.monitor")) return denied("Monitoring Chatbot");
    const d = r.data;
    return <Screen title="Monitoring Chatbot" subtitle="Statistik 30 hari terakhir tanpa isi pertanyaan dan pengenal pengguna.">
        <Button icon="refresh" title="Muat ulang" compact secondary onPress={() => setVersion((v) => v + 1)}/>
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat statistik…</Label>}
        {d && <>
            <Card><Label strong>Pemakaian dan kualitas</Label><Label>{d.messages} pesan · {d.failures} gagal · {d.positive} membantu · {d.negative} kurang membantu</Label><Label tone="muted">Token masukan {d.input_tokens} · keluaran {d.output_tokens} · cache {d.cached_tokens} · pemikiran {d.thought_tokens}</Label><Label tone="muted">Rasio cache {(d.chat_cache_read_ratio * 100).toFixed(1)}% · rata-rata respons {(d.average_latency_ms / 1000).toFixed(2)} detik</Label>
                <View style={styles.wrap}><StatusBadge label={`AI: ${d.llm_status}`} tone="info"/><StatusBadge label={d.quota_alarm ? "Kuota melewati ambang" : "Kuota aman"} tone={d.quota_alarm ? "warning" : "success"}/></View></Card>
            <Card><Label strong>Kategori pertanyaan</Label>{Object.entries(d.tool_counts).map(([name, n]) => <Label key={name}>{CHAT_TOOL_LABELS[name] ?? "Pemeriksaan lainnya"}: {n}</Label>)}</Card>
            <Card><Label strong>Evaluasi terakhir</Label>{d.latest_evaluation ? <Label>{d.latest_evaluation.mode}: {(d.latest_evaluation.accuracy * 100).toFixed(1)}% · {d.latest_evaluation.critical_failures} kebocoran kritis · {d.latest_evaluation.total} kasus{d.latest_evaluation.mode === "CONTRACT" ? ". Uji kontrak belum membuktikan akurasi model." : ""}</Label> : <Label tone="muted">Evaluasi model belum tersedia.</Label>}</Card>
            <SectionHeading title="Sesi dilaporkan dengan izin pengguna"/>
            {d.reports.length ? d.reports.map((s) => <EntityCard key={s.id} icon="messageCircle" title={s.judul} onPress={() => setSelected(selected === s.id ? null : s.id)}/>) : <Label tone="muted">Belum ada sesi yang diizinkan berbagi.</Label>}
            {selected && <Reported key={selected} id={selected}/>}
        </>}
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, flex: { flex: 1 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, diff: { gap: t.space.xs, padding: t.space.sm, borderRadius: t.radius.md, backgroundColor: t.color.surface }, changed: { backgroundColor: t.color.infoSoft }, sheet: { padding: t.space.md, gap: t.space.md } });
