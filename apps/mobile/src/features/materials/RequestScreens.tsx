import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, ListRow, Notice, Screen, SectionHeading, StatusBadge, Toggle, tokens as t } from "../../shared/ui";
import { REQUEST_LABEL, REQUEST_TONE, canCancel, cancelRequest, exceedsBalance, loadCatalog, loadMaterial, loadOptions, loadRequest, loadRequests, requestBody, rowsFromRequest, saveRequest } from "./requests";
import type { RequestRow } from "./requests";
import { canClose, canIssue, closeRequest, issuable, issueBody, issueLimit, issueRequest } from "./stock";
import { dateWib } from "../../shared/wib";

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
    return pages > 1 ? <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => onPage(page - 1)}/><Label tone="muted">{page}/{pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= pages} onPress={() => onPage(page + 1)}/></View> : null;
}
const noAccess = (title: string) => <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat bahan."/></Screen>;

/** MS-55 — padanan P-84: bahan aktif bersaldo; permintaan tidak menahan stok. */
export function MaterialCatalogScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, permitted = Object.hasOwn(permissions, "material.view");
    const [q, setQ] = useState(""), [category, setCategory] = useState(""), [page, setPage] = useState(1);
    const options = useResource(`${account}:material-options`, useCallback((signal: AbortSignal) => permitted ? loadOptions(api, signal) : Promise.resolve(null), [api, permitted]));
    const list = useResource(`${account}:material-catalog:${q}:${category}:${page}`, useCallback((signal: AbortSignal) => permitted ? loadCatalog(api, { page, ...(q.trim() ? { q: q.trim() } : {}), ...(category ? { category_id: category } : {}) }, signal) : Promise.resolve(null), [api, q, category, page, permitted]));
    if (!permitted) return noAccess("Katalog Bahan");
    return <Screen title="Katalog Bahan" subtitle="Saldo diperiksa kembali saat pengajuan dan penyerahan. Permintaan tidak menahan stok.">
        {Object.hasOwn(permissions, "material.view") && <Button icon="clipboardList" title="Permintaan saya" secondary onPress={() => router.push("/permintaan-bahan" as "/scan")}/>}
        <Input icon="search" label="Cari bahan" value={q} onChangeText={(v) => { setQ(v); setPage(1); }}/>
        {options.data && <Chips label="Kategori" value={category} options={[{ value: "", label: "Semua" }, ...options.data.categories.filter((c) => c.status === "AKTIF").map((c) => ({ value: c.id, label: c.nama }))]} onChange={(v) => { setCategory(v); setPage(1); }}/>}
        {list.loading && <Label tone="muted">Memuat bahan…</Label>}{list.error && <><Notice message={list.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={list.reload}/></>}
        {list.data?.data.length === 0 && <EmptyState illustration="empty" title="Tidak ada bahan bersaldo" description="Ubah kata kunci atau kategori."/>}
        {list.data?.data.map((m) => <EntityCard key={m.id} icon="boxes" title={m.nama} meta={[m.kategori.nama, m.lokasi_bawaan.nama]} statuses={m.stok_menipis ? [{ label: "Stok menipis", tone: "warning" }] : []} value={`${m.saldo_total} ${m.satuan.simbol}`} {...(Object.hasOwn(permissions, "material.request") ? { onPress: () => router.push(`/permintaan-bahan/baru?bahan=${m.id}` as "/scan") } : {})}/>)}
        <Pager page={page} pages={list.data?.meta.total_pages ?? 1} onPage={setPage}/>
    </Screen>;
}

function MaterialRow({ index, row, onChange, onRemove }: { index: number; row: RequestRow; onChange: (patch: Partial<RequestRow>) => void; onRemove?: () => void }) {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const [q, setQ] = useState("");
    const search = useResource(`${account}:material-pick:${q}`, useCallback((signal: AbortSignal) => row.material ? Promise.resolve(null) : loadCatalog(api, { page: 1, ...(q.trim() ? { q: q.trim() } : {}) }, signal), [api, q, row.material]));
    const detail = useResource(`${account}:material-row:${row.material}`, useCallback((signal: AbortSignal) => row.material ? loadMaterial(api, row.material, signal) : Promise.resolve(null), [api, row.material]));
    const m = detail.data, balance = m?.saldo_lokasi.find((s) => s.room_id === row.room)?.saldo;
    return <Card><Text style={styles.strong}>Baris {index + 1}</Text>
        {m ? <ListRow icon="boxes" title={m.nama} subtitle={`${m.kategori.nama} · satuan ${m.satuan.simbol}`} onPress={() => onChange({ material: "", room: "" })}/> : <>
            <Input icon="search" label="Cari bahan" value={q} onChangeText={setQ}/>
            {search.data && <Chips label="Bahan" value={row.material} options={search.data.data.map((x) => ({ value: x.id, label: x.nama }))} onChange={(material) => onChange({ material, room: "" })}/>}
        </>}
        {detail.error && <Notice message={detail.error}/>}
        {m && <Chips label="Lokasi bersaldo" value={row.room} options={m.saldo_lokasi.filter((s) => s.saldo > 0).map((s) => ({ value: s.room_id, label: `${s.lokasi} · ${s.saldo} ${m.satuan.simbol}` }))} onChange={(room) => onChange({ room })}/>}
        <Input label={`Jumlah${m ? ` (${m.satuan.simbol})` : ""}`} value={row.quantity} keyboardType="number-pad" onChangeText={(v) => onChange({ quantity: v.replace(/\D/g, "") })}/>
        {exceedsBalance(row.quantity, balance) && <StatusBadge label="Melebihi saldo lokasi saat ini" tone="warning"/>}
        {onRemove && <Button icon="close" title="Hapus baris" secondary compact onPress={onRemove}/>}
    </Card>;
}

/** MS-56 — padanan P-85: bahan, lokasi, jumlah, keperluan; ambang approval dievaluasi saat kirim (BR-086). `?revisi=` = siklus revisi. */
export function MaterialRequestFormScreen() {
    const params = useLocalSearchParams<{ bahan?: string; revisi?: string }>(); const revise = params.revisi && /^[1-9]\d*$/.test(params.revisi) ? params.revisi : undefined;
    const { state, api, offlineOnly } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permitted = state.kind === "READY" && Object.hasOwn(state.session.permissions, "material.request");
    const [rows, setRows] = useState<RequestRow[] | null>(revise ? null : [{ key: randomUUID(), material: params.bahan && /^[1-9]\d*$/.test(params.bahan) ? params.bahan : "", room: "", quantity: "1" }]), [purpose, setPurpose] = useState("");
    useResource(`${account}:request-revise:${revise ?? ""}`, useCallback(async (signal: AbortSignal) => { if (!revise) return null; const d = await loadRequest(api, revise, signal); setRows((r) => r ?? rowsFromRequest(d)); setPurpose((p) => p || d.keperluan); return d; }, [api, revise]));
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), key = useRef<{ body: string; key: string } | null>(null);
    if (!permitted) return <Screen title="Ajukan Permintaan Bahan"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin mengajukan permintaan bahan."/></Screen>;
    const list = rows ?? [];
    const save = async () => {
        const result = requestBody(purpose, list); if ("error" in result) { setError(result.error); return; }
        const text = JSON.stringify(result.body); if (key.current?.body !== text) key.current = { body: text, key: randomUUID() };
        setBusy(true); setError(null);
        try { const d = await saveRequest(api, result.body, key.current.key, revise); router.replace(`/permintaan-bahan/${d.id}` as "/scan"); }
        catch (e) { setError(e instanceof Error ? e.message : "Permintaan belum terkirim. Coba lagi dengan isian yang sama."); } finally { setBusy(false); }
    };
    return <Screen title={revise ? "Revisi Permintaan Bahan" : "Ajukan Permintaan Bahan"} subtitle="Jumlah memakai satuan master. Melebihi ambang per jenis bahan memerlukan persetujuan; pengajuan tidak menahan saldo." footer={<Button icon="send" title={revise ? "Kirim revisi" : "Ajukan permintaan"} busy={busy} disabled={offlineOnly || list.length === 0} onPress={() => void save()}/>}>
        {offlineOnly && <Notice message="Pengajuan memerlukan koneksi dan tidak akan diantrekan."/>}{error && <Notice message={error}/>}
        {list.map((row, i) => <MaterialRow key={row.key} index={i} row={row} onChange={(patch) => setRows(list.map((r) => r.key === row.key ? { ...r, ...patch } : r))} {...(list.length > 1 ? { onRemove: () => setRows(list.filter((r) => r.key !== row.key)) } : {})}/>)}
        {list.length < 100 && <Button icon="plus" title="Tambah baris" secondary onPress={() => setRows([...list, { key: randomUUID(), material: "", room: "", quantity: "1" }])}/>}
        <Input label="Keperluan" value={purpose} multiline maxLength={2000} onChangeText={setPurpose}/>
    </Screen>;
}

const TABS = [{ value: "AKTIF", label: "Aktif" }, { value: "SELESAI", label: "Selesai" }, { value: "SEMUA", label: "Semua" }] as const;
/** MS-57 — padanan P-86: permintaan tersaring scope role; tab menurut status (FR-22.4). */
export function MaterialRequestListScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, permitted = Object.hasOwn(permissions, "material.view");
    const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("AKTIF"), [mine, setMine] = useState(false), [page, setPage] = useState(1);
    const list = useResource(`${account}:material-requests:${tab}:${mine}:${page}`, useCallback((signal: AbortSignal) => permitted ? loadRequests(api, { tab, page, saya: mine }, signal) : Promise.resolve(null), [api, tab, mine, page, permitted]));
    if (!permitted) return noAccess("Permintaan Bahan");
    return <Screen title="Permintaan Bahan" subtitle="Persetujuan, sisa kebutuhan, dan riwayat penyerahan per permintaan.">
        {Object.hasOwn(permissions, "material.request") && <View style={styles.row}><View style={styles.flex}><Button icon="boxes" title="Katalog" secondary onPress={() => router.push("/katalog-bahan" as "/scan")}/></View><View style={styles.flex}><Button icon="plus" title="Ajukan" onPress={() => router.push("/permintaan-bahan/baru" as "/scan")}/></View></View>}
        <Chips label="Daftar" value={tab} options={TABS} onChange={(v) => { setTab(v); setPage(1); }}/>
        {permissions["material.view"] !== "own" && <Toggle label="Hanya permintaan saya" value={mine} onChange={(v) => { setMine(v); setPage(1); }}/>}
        {list.loading && <Label tone="muted">Memuat permintaan…</Label>}{list.error && <><Notice message={list.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={list.reload}/></>}
        {list.data?.data.length === 0 && <EmptyState illustration="empty" title="Belum ada permintaan" description="Permintaan pada daftar ini akan tampil di sini."/>}
        {list.data?.data.map((r) => <EntityCard key={r.id} icon="clipboardList" title={r.nomor} meta={[r.pemohon, r.keperluan]} statuses={[{ label: REQUEST_LABEL[r.status], tone: REQUEST_TONE[r.status] }]} value={`${r.jumlah_jenis}`} onPress={() => router.push(`/permintaan-bahan/${r.id}` as "/scan")}/>)}
        <Pager page={page} pages={list.data?.meta.total_pages ?? 1} onPage={setPage}/>
    </Screen>;
}

/** MS-58 — padanan P-87: baris, saldo terkini, siklus, penyerahan; revisi & batalkan bagi pemohon; penyerahan & tutup sisa bagi `material.issue` (FR-22.5). */
export function MaterialRequestDetailScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, valid = /^[1-9]\d*$/.test(id) && Object.hasOwn(permissions, "material.view");
    const detail = useResource(`${account}:material-request:${id}`, useCallback((signal: AbortSignal) => valid ? loadRequest(api, id, signal) : Promise.resolve(null), [api, id, valid]));
    const [cancel, setCancel] = useState<"cancel" | "close" | false>(false), [issue, setIssue] = useState<{ name: string; date: string; note: string; qty: Record<string, string> } | null>(null), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), key = useRef(randomUUID());
    if (!valid || state.kind !== "READY") return noAccess("Detail Permintaan Bahan");
    const d = detail.data;
    const confirm = async () => { if (!d || busy) return; setBusy(true); setError(null); try { if (cancel === "close") await closeRequest(api, d.id, reason, key.current); else await cancelRequest(api, d.id, reason, key.current); setCancel(false); detail.reload(); } catch (e) { setError(e instanceof Error ? e.message : "Perubahan belum tersimpan."); } finally { setBusy(false); } };
    const hand = async () => { if (!d || !issue || busy) return; const r = issueBody(d, issue); if ("error" in r) { setError(r.error); return; } setBusy(true); setError(null); try { await issueRequest(api, d.id, r.body, key.current); setIssue(null); detail.reload(); } catch (e) { setError(e instanceof Error ? e.message : "Penyerahan belum tersimpan."); } finally { setBusy(false); } };
    return <Screen title={d?.nomor ?? "Detail Permintaan Bahan"}>
        {detail.loading && <Label tone="muted">Memuat permintaan…</Label>}{detail.error && <><Notice message={detail.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={detail.reload}/></>}
        {d && <>
            <EntityCard icon="clipboardList" title={d.pemohon} meta={[d.keperluan, `Siklus ${d.revision}`]} statuses={[{ label: REQUEST_LABEL[d.status], tone: REQUEST_TONE[d.status] }]}/>
            {d.catatan_penutupan && <Notice tone="info" message={d.catatan_penutupan}/>}
            {d.status === "PERLU_REVISI" && d.pemohon_id === state.session.user.id && Object.hasOwn(permissions, "material.request") && <Button icon="refresh" title="Revisi permintaan" onPress={() => router.push(`/permintaan-bahan/baru?revisi=${d.id}` as "/scan")}/>}
            {canIssue(d, permissions) && issuable(d).length > 0 && <Button icon="handshake" title="Catat penyerahan" onPress={() => { setError(null); key.current = randomUUID(); setIssue({ name: d.pemohon, date: dateWib(Date.now()), note: "", qty: {} }); }}/>}
            {canClose(d, permissions) && <Button icon="checkCircle" title="Tutup sisa permintaan" secondary onPress={() => { setError(null); setReason(""); key.current = randomUUID(); setCancel("close"); }}/>}
            {canCancel(d, state.session.user, permissions) && <Button icon="close" title="Batalkan permintaan" secondary onPress={() => { setError(null); setReason(""); key.current = randomUUID(); setCancel("cancel"); }}/>}
            {d.approval_instance_id && Object.hasOwn(permissions, "approval.view") && <ListRow icon="badgeCheck" title="Linimasa persetujuan" onPress={() => router.push(`/persetujuan/${d.approval_instance_id}` as "/scan")}/>}
            <SectionHeading title="Rincian kebutuhan"/>
            {d.items.map((i) => <EntityCard key={i.id} icon="boxes" title={i.nama} meta={[i.lokasi, `saldo kini ${i.saldo_terkini} ${i.satuan}`]} statuses={i.jumlah_disetujui !== null ? [{ label: `Disetujui ${i.jumlah_disetujui}`, tone: i.jumlah_disetujui === 0 ? "error" : "success" }] : []} value={`${i.jumlah_diserahkan}/${i.jumlah_diminta}`}/>)}
            {d.penyerahan.length > 0 && <><SectionHeading title="Penyerahan"/>{d.penyerahan.map((p) => <Card key={p.id}><Text style={styles.strong}>{p.nama_penerima} · {p.tanggal_serah}</Text><Label tone="muted">Oleh {p.pelaksana}{p.catatan ? ` · ${p.catatan}` : ""}</Label>{p.items.map((x) => <Label key={x.item_id}>{d.items.find((i) => i.id === String(x.item_id))?.nama ?? "Bahan"}: {x.jumlah}</Label>)}</Card>)}</>}
            {d.cycles.length > 1 && <><SectionHeading title="Siklus pengajuan"/>{d.cycles.map((c) => <ListRow key={c.revision} icon="history" title={`Siklus ${c.revision}`} subtitle={formatTime(c.created_at)}/>)}</>}
        </>}
        <BottomSheet visible={cancel !== false} onClose={() => setCancel(false)} title={cancel === "close" ? "Tutup sisa permintaan?" : "Batalkan permintaan?"}><View style={styles.sheet}><Label>{cancel === "close" ? "Sisa yang belum diserahkan ditutup; penyerahan yang sudah tercatat tetap." : "Permintaan yang belum diserahkan dibatalkan dan tidak dapat dilanjutkan."}</Label><Input label={cancel === "close" ? "Alasan penutupan" : "Alasan pembatalan"} value={reason} multiline maxLength={2000} onChangeText={setReason}/>{error && <Notice message={error}/>}<Button icon="close" title={cancel === "close" ? "Tutup sisa" : "Batalkan permintaan"} busy={busy} disabled={!reason.trim()} onPress={() => void confirm()}/></View></BottomSheet>
        <BottomSheet visible={issue !== null} full onClose={() => setIssue(null)} title="Catat penyerahan">{d && issue && <View style={styles.sheet}>
            <Label tone="muted">Isi hanya jumlah yang diserahkan sekarang; sisa dapat diserahkan kemudian.</Label>
            <Input label="Nama penerima" value={issue.name} maxLength={200} onChangeText={(v) => setIssue({ ...issue, name: v })}/><DateField label="Tanggal serah" value={issue.date} onChange={(v) => setIssue({ ...issue, date: v > dateWib(Date.now()) ? dateWib(Date.now()) : v })}/>
            {issuable(d).map((i) => <Input key={i.id} label={`${i.nama} · ${i.lokasi} (maks ${issueLimit(i)} ${i.satuan})`} value={issue.qty[i.id] ?? ""} keyboardType="number-pad" onChangeText={(v) => setIssue({ ...issue, qty: { ...issue.qty, [i.id]: v.replace(/\D/g, "") } })}/>)}
            <Input label="Catatan (opsional)" value={issue.note} multiline maxLength={2000} onChangeText={(v) => setIssue({ ...issue, note: v })}/>
            {error && <Notice message={error}/>}<Button icon="handshake" title="Simpan penyerahan" busy={busy} onPress={() => void hand()}/>
        </View>}</BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", gap: t.space.sm, alignItems: "center" }, flex: { flex: 1, minWidth: 0 }, strong: { fontSize: t.font.body, fontWeight: "600", color: t.color.heading }, sheet: { padding: t.space.md, gap: t.space.md } });
