import { useCallback, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { pickAndUploadDocument, recheckDocument } from "../../shared/upload/document";
import type { UploadedDocument } from "../../shared/upload/document";
import { formatTime } from "../../shared/time";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, ListRow, MiniChart, Notice, Screen, SectionHeading, StatusBadge, Toggle, tokens as t } from "../../shared/ui";
import { dateWib } from "../../shared/wib";
import { loadMaterial, loadOptions } from "./requests";
import { TX_LABEL, TX_TONE, adjustmentBody, categoryBody, deleteCategory, formFromMaterial, loadCategories, loadMaterials, loadReceipts, loadThreshold, loadTransactions, materialBody, operate, receiptBody, saveCategory, saveMaterial, setThreshold } from "./stock";
import type { MaterialForm } from "./stock";

const usePerms = () => { const { state } = useAuth(); const p = state.kind === "READY" ? state.session.permissions : {}; return { can: (x: string) => Object.hasOwn(p, x), account: state.kind === "READY" ? state.session.user.id : "" }; };
/** Satu kunci idempoten per isian (ID-01). */
function useKey() { const ref = useRef<{ body: string; key: string } | null>(null); return (body: unknown) => { const s = JSON.stringify(body); if (ref.current?.body !== s) ref.current = { body: s, key: randomUUID() }; return ref.current.key; }; }
const denied = (title: string) => <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin untuk layar ini."/></Screen>;
const openWeb = (path: string) => { const o = process.env.EXPO_PUBLIC_APP_URL ?? ""; if (o.startsWith("https://")) void Linking.openURL(`${new URL(o).origin}${path}`).catch(() => undefined); };

/** MS-40 — padanan P-80: daftar bahan, saldo total, stok menipis; cetak QR ↗ web (MOB-SCP-02). */
export function MaterialListScreen() {
    const { api } = useAuth(); const { can, account } = usePerms(); const permitted = can("material.view");
    const [q, setQ] = useState(""), [category, setCategory] = useState(""), [low, setLow] = useState(false), [page, setPage] = useState(1);
    const opts = useResource(`${account}:material-options`, useCallback((s: AbortSignal) => permitted ? loadOptions(api, s) : Promise.resolve(null), [api, permitted]));
    const list = useResource(`${account}:materials:${q}:${category}:${low}:${page}`, useCallback((s: AbortSignal) => permitted ? loadMaterials(api, { q, category_id: category, ...(low ? { stok: "MENIPIS" as const } : {}), page }, s) : Promise.resolve(null), [api, q, category, low, page, permitted]));
    if (!permitted) return denied("Bahan");
    return <Screen title="Bahan">
        <View style={styles.row}>{can("material.manage") && <View style={styles.flex}><Button icon="plus" title="Tambah bahan" onPress={() => router.push("/bahan/baru" as "/scan")}/></View>}{can("material.qr_print") && <View style={styles.flex}><Button icon="externalLink" title="Label QR (web)" secondary onPress={() => openWeb("/bahan")}/></View>}</View>
        <Input icon="search" label="Cari bahan" value={q} onChangeText={(v) => { setQ(v); setPage(1); }}/>
        {opts.data && <Chips label="Kategori" value={category} options={[{ value: "", label: "Semua" }, ...opts.data.categories.map((c) => ({ value: c.id, label: c.nama }))]} onChange={(v) => { setCategory(v); setPage(1); }}/>}
        <Toggle label="Hanya stok menipis" value={low} onChange={(v) => { setLow(v); setPage(1); }}/>
        {list.loading && <Label tone="muted">Memuat bahan…</Label>}{list.error && <Notice message={list.error}/>}
        {list.data?.data.length === 0 && <EmptyState illustration="empty" title="Tidak ada bahan" description="Ubah kata kunci atau saringan."/>}
        {list.data?.data.map((m) => <EntityCard key={m.id} icon="boxes" title={m.nama} meta={[m.kategori.nama, `Minimum ${m.stok_minimum} ${m.satuan.simbol}`]} statuses={[...(m.stok_menipis ? [{ label: "Stok menipis", tone: "warning" as const }] : []), ...(m.status === "NONAKTIF" ? [{ label: "Nonaktif", tone: "pending" as const }] : [])]} value={`${m.saldo_total} ${m.satuan.simbol}`} onPress={() => router.push(`/bahan/${m.id}` as "/scan")}/>)}
        {list.data && list.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{list.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= list.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
    </Screen>;
}

/** MS-41 — padanan P-81: master bahan tanpa saldo awal; satuan terkunci setelah ada transaksi (FR-22.1). */
export function MaterialFormScreen() {
    const { id } = useLocalSearchParams<{ id?: string }>(); const editing = id !== undefined; const { api } = useAuth(); const { can, account } = usePerms(); const permitted = can("material.manage") && (!editing || /^[1-9]\d*$/.test(id));
    const [form, setForm] = useState<MaterialForm | null>(editing ? null : { nama: "", category: "", unit: "", minimum: "0", room: "", note: "", active: true, students: false });
    const detail = useResource(`${account}:material-edit:${id ?? ""}`, useCallback(async (s: AbortSignal) => { if (!editing || !permitted) return null; const m = await loadMaterial(api, id!, s); setForm((f) => f ?? formFromMaterial(m)); return m; }, [api, id, editing, permitted]));
    const opts = useResource(`${account}:material-options`, useCallback((s: AbortSignal) => permitted ? loadOptions(api, s) : Promise.resolve(null), [api, permitted]));
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), key = useKey();
    if (!permitted) return denied(editing ? "Ubah Bahan" : "Tambah Bahan");
    if (!form || !opts.data) return <Screen title={editing ? "Ubah Bahan" : "Tambah Bahan"}>{detail.error || opts.error ? <Notice message={detail.error ?? opts.error ?? ""}/> : <Label tone="muted">Memuat…</Label>}</Screen>;
    const locked = detail.data?.satuan_terkunci ?? false, set = (p: Partial<MaterialForm>) => { setError(null); setForm({ ...form, ...p }); };
    const save = async () => { const r = materialBody(form, editing ? { lockedUnit: locked } : null); if ("error" in r) { setError(r.error); return; } setBusy(true); setError(null); try { const m = await saveMaterial(api, id, r.body, key(r.body)); router.replace(`/bahan/${m.id}` as "/scan"); } catch (e) { setError(e instanceof Error ? e.message : "Bahan belum tersimpan."); } finally { setBusy(false); } };
    return <Screen title={editing ? "Ubah Bahan" : "Tambah Bahan"} subtitle="Saldo awal selalu nol; tambahkan saldo lewat Catat Penerimaan. Satuan tidak dapat diubah setelah ada transaksi." footer={<Button icon="check" title="Simpan bahan" busy={busy} onPress={() => void save()}/>}>
        {error && <Notice message={error}/>}
        <Input label="Nama bahan" value={form.nama} maxLength={200} onChangeText={(v) => set({ nama: v })}/>
        <Chips label="Kategori" value={form.category} options={opts.data.categories.filter((c) => c.status === "AKTIF" || c.id === form.category).map((c) => ({ value: c.id, label: c.nama }))} onChange={(v) => set({ category: v })}/>
        {locked ? <ListRow icon="lock" title={`Satuan: ${detail.data?.satuan.nama}`} subtitle="Terkunci karena sudah ada transaksi"/> : <Chips label="Satuan" value={form.unit} options={opts.data.units.filter((u) => u.status === "AKTIF").map((u) => ({ value: u.id, label: `${u.nama} (${u.simbol})` }))} onChange={(v) => set({ unit: v })}/>}
        <Input label="Stok minimum" value={form.minimum} keyboardType="number-pad" onChangeText={(v) => set({ minimum: v.replace(/\D/g, "") })}/>
        <Chips label="Lokasi penyimpanan bawaan" value={form.room} options={opts.data.rooms.filter((r) => r.aktif || r.id === form.room).map((r) => ({ value: r.id, label: r.nama }))} onChange={(v) => set({ room: v })}/>
        <Input label="Keterangan (opsional)" value={form.note} multiline maxLength={2000} onChangeText={(v) => set({ note: v })}/>
        <Toggle label="Boleh diminta siswa" value={form.students} onChange={(v) => set({ students: v })}/>
        {editing && <Toggle label="Bahan aktif" value={form.active} onChange={(v) => set({ active: v })}/>}
    </Screen>;
}

/** MS-42 — padanan P-82: saldo per lokasi, kartu stok, penerimaan berdokumen, penyesuaian beralasan, ambang permintaan. */
export function MaterialDetailScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { api } = useAuth(); const { can, account } = usePerms(); const valid = /^[1-9]\d*$/.test(id) && can("material.view");
    const material = useResource(`${account}:material:${id}`, useCallback((s: AbortSignal) => valid ? loadMaterial(api, id, s) : Promise.resolve(null), [api, id, valid]));
    const [room, setRoom] = useState(""), [page, setPage] = useState(1), [version, setVersion] = useState(0);
    const tx = useResource(`${account}:material-tx:${id}:${room}:${page}:${version}`, useCallback((s: AbortSignal) => valid ? loadTransactions(api, id, page, room, s) : Promise.resolve(null), [api, id, page, room, valid, version]));
    const receipts = useResource(`${account}:material-receipts:${id}:${version}`, useCallback((s: AbortSignal) => valid ? loadReceipts(api, id, s) : Promise.resolve(null), [api, id, valid, version]));
    const threshold = useResource(`${account}:threshold:${id}:${version}`, useCallback((s: AbortSignal) => valid && can("setting.view") ? loadThreshold(api, id, s) : Promise.resolve(null), [api, id, valid]));
    const [mode, setMode] = useState<"receipts" | "adjustments" | "threshold" | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [done, setDone] = useState<string | null>(null), key = useKey();
    const [op, setOp] = useState({ room: "", qty: "", date: dateWib(Date.now()), doc: "", note: "", reason: "", direction: "KURANG" as "TAMBAH" | "KURANG", limit: "" }), [files, setFiles] = useState<UploadedDocument[]>([]);
    if (!valid) return denied("Detail Bahan");
    const m = material.data;
    const open = (next: NonNullable<typeof mode>) => { setError(null); setFiles([]); setOp({ room: m?.lokasi_bawaan.id ?? "", qty: "", date: dateWib(Date.now()), doc: "", note: "", reason: "", direction: "KURANG", limit: threshold.data?.batas_khusus?.toString() ?? "" }); setMode(next); };
    const run = async (a: () => Promise<void>) => { setBusy(true); setError(null); try { await a(); } catch (e) { setError(e instanceof Error ? e.message : "Transaksi belum tersimpan."); } finally { setBusy(false); } };
    const submit = () => run(async () => {
        if (mode === "threshold") { const batas = op.limit.trim() === "" ? null : Number(op.limit); const body = { batas }; await setThreshold(api, id, batas, key(body)); setDone("Ambang permintaan diperbarui."); }
        else { const r = mode === "receipts" ? receiptBody({ ...op, files }) : adjustmentBody(op, m?.saldo_lokasi.find((x) => x.room_id === op.room)?.saldo); if ("error" in r) throw new Error(r.error); await operate(api, id, mode!, r.body, key({ mode, b: r.body })); setDone(mode === "receipts" ? "Penerimaan tercatat di kartu stok." : "Penyesuaian tercatat di kartu stok."); }
        setMode(null); material.reload(); setVersion((v) => v + 1);
    });
    const rooms = m?.saldo_lokasi ?? [];
    return <Screen title={m?.nama ?? "Detail Bahan"}>
        {material.loading && <Label tone="muted">Memuat bahan…</Label>}{material.error && <Notice message={material.error}/>}{done && <Notice tone="success" message={done}/>}
        {m && <>
            <EntityCard icon="boxes" title={m.nama} meta={[m.kategori.nama, `Lokasi bawaan ${m.lokasi_bawaan.nama}`]} statuses={[m.stok_menipis ? { label: "Stok menipis", tone: "warning" } : { label: "Stok aman", tone: "success" }, ...(m.status === "NONAKTIF" ? [{ label: "Nonaktif", tone: "pending" as const }] : [])]} value={`${m.saldo_total} ${m.satuan.simbol}`}/>
            <View style={styles.wrap}>
                {can("material.receive") && m.status === "AKTIF" && <Button icon="plus" title="Catat penerimaan" compact onPress={() => open("receipts")}/>}
                {can("material.adjust") && <Button icon="settings" title="Penyesuaian saldo" compact secondary onPress={() => open("adjustments")}/>}
                {can("material.manage") && <Button icon="settings" title="Ubah" compact secondary onPress={() => router.push(`/bahan/${m.id}/ubah` as "/scan")}/>}
                {can("material.request") && m.status === "AKTIF" && <Button icon="clipboardList" title="Ajukan permintaan" compact secondary onPress={() => router.push(`/permintaan-bahan/baru?bahan=${m.id}` as "/scan")}/>}
            </View>
            {rooms.length > 0 && <Card><View style={styles.row}><MiniChart kind="bar" values={rooms.map((r) => r.saldo)} summary={`Saldo per lokasi: ${rooms.map((r) => `${r.lokasi} ${r.saldo}`).join(", ")}`}/><View style={styles.flex}>{rooms.slice(0, 3).map((r) => <Text key={r.room_id} numberOfLines={1} style={styles.meta}>{r.lokasi}: {r.saldo} {m.satuan.simbol}</Text>)}{rooms.length > 3 && <Text style={styles.meta}>+{rooms.length - 3} lokasi</Text>}</View></View></Card>}
            {threshold.data && <ListRow icon="settings" title={`Ambang permintaan: ${threshold.data.batas_efektif ?? "tanpa ambang"}`} subtitle={threshold.data.batas_khusus !== null ? "Ambang khusus bahan ini" : `Bawaan ${threshold.data.default_qty ?? "—"}`} {...(can("setting.manage") ? { onPress: () => open("threshold") } : {})}/>}
            <SectionHeading title="Kartu stok"/>
            <Chips label="Lokasi" value={room} options={[{ value: "", label: "Semua" }, ...rooms.map((r) => ({ value: r.room_id, label: r.lokasi }))]} onChange={(v) => { setRoom(v); setPage(1); }}/>
            {tx.error && <Notice message={tx.error}/>}{tx.data?.data.length === 0 && <EmptyState illustration="empty" title="Belum ada transaksi" description="Penerimaan, penyerahan, dan penyesuaian tercatat di sini."/>}
            {tx.data?.data.map((x) => <EntityCard key={x.id} icon="history" title={`${x.jumlah > 0 ? "+" : ""}${x.jumlah} ${m.satuan.simbol}`} meta={[x.lokasi, formatTime(x.created_at)]} statuses={[{ label: TX_LABEL[x.jenis], tone: TX_TONE[x.jenis] }]} value={`${x.saldo_sesudah}`}/>)}
            {tx.data && tx.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{tx.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= tx.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
            {(receipts.data?.data.length ?? 0) > 0 && <><SectionHeading title="Penerimaan terverifikasi"/>{receipts.data!.data.slice(0, 5).map((r) => <ListRow key={r.id} icon="fileText" title={`${r.nomor_dokumen} · ${r.jumlah} ${m.satuan.simbol}`} subtitle={`${r.lokasi} · ${r.tanggal_terima} · ${r.pelaksana}`}/>)}</>}
        </>}
        <BottomSheet visible={mode !== null} full onClose={() => setMode(null)} title={mode === "receipts" ? "Catat penerimaan" : mode === "adjustments" ? "Penyesuaian saldo" : "Ambang permintaan"}>{m && mode && <View style={styles.sheet}>
            {mode === "threshold" ? <><Input label="Ambang khusus (kosongkan = bawaan)" value={op.limit} keyboardType="number-pad" onChangeText={(v) => setOp({ ...op, limit: v.replace(/\D/g, "") })}/><Label tone="muted">Permintaan melebihi ambang memerlukan persetujuan (BR-086).</Label></> : <>
                <Chips label="Lokasi" value={op.room} options={mode === "receipts" ? [...new Map([[m.lokasi_bawaan.id, m.lokasi_bawaan.nama], ...rooms.map((r) => [r.room_id, r.lokasi] as [string, string])])].map(([value, label]) => ({ value, label })) : rooms.map((r) => ({ value: r.room_id, label: `${r.lokasi} · ${r.saldo}` }))} onChange={(v) => setOp({ ...op, room: v })}/>
                {mode === "adjustments" && <Chips label="Arah" value={op.direction} options={[{ value: "KURANG", label: "Kurangi" }, { value: "TAMBAH", label: "Tambah" }]} onChange={(v) => setOp({ ...op, direction: v })}/>}
                <Input label={`Jumlah (${m.satuan.simbol})`} value={op.qty} keyboardType="number-pad" onChangeText={(v) => setOp({ ...op, qty: v.replace(/\D/g, "") })}/>
                {mode === "receipts" ? <><DateField label="Tanggal terima" value={op.date} onChange={(v) => setOp({ ...op, date: v })}/><Input label="Nomor dokumen" value={op.doc} maxLength={200} onChangeText={(v) => setOp({ ...op, doc: v })}/><Input label="Catatan (opsional)" value={op.note} multiline maxLength={2000} onChangeText={(v) => setOp({ ...op, note: v })}/>
                    {files.map((f) => <StatusBadge key={f.file_id} label={`${f.nama_berkas} · ${f.scan_status === "CLEAN" ? "terverifikasi" : f.scan_status === "PENDING" ? "sedang diperiksa" : "ditolak"}`} tone={f.scan_status === "CLEAN" ? "success" : f.scan_status === "PENDING" ? "pending" : "error"}/>)}
                    <View style={styles.row}><View style={styles.flex}><Button icon="plus" title="Lampirkan dokumen" secondary busy={busy} disabled={files.length >= 10} onPress={() => void run(async () => { const f = await pickAndUploadDocument(api, "MATERIAL_RECEIPT_DOCUMENT"); if (f) setFiles((old) => [...old, f]); })}/></View>{files.some((f) => f.scan_status === "PENDING") && <View style={styles.flex}><Button icon="refresh" title="Periksa status" secondary disabled={busy} onPress={() => void run(async () => { const next = await Promise.all(files.map(async (f) => f.scan_status === "PENDING" ? { ...f, scan_status: await recheckDocument(api, f) } : f)); setFiles(next); })}/></View>}</View></>
                    : <Input label="Alasan penyesuaian" value={op.reason} multiline maxLength={2000} onChangeText={(v) => setOp({ ...op, reason: v })}/>}
            </>}
            {error && <Notice message={error}/>}<Button icon="check" title="Simpan" busy={busy} onPress={() => void submit()}/>
        </View>}</BottomSheet>
    </Screen>;
}

/** MS-43 — padanan P-83: kategori bahan terpisah dari kategori aset; hapus hanya yang belum dipakai. */
export function MaterialCategoryScreen() {
    const { api } = useAuth(); const { can, account } = usePerms(); const permitted = can("material.manage");
    const list = useResource(`${account}:material-cats`, useCallback((s: AbortSignal) => permitted ? loadCategories(api, s) : Promise.resolve(null), [api, permitted]));
    const [edit, setEdit] = useState<{ id: string | null; nama: string; kode: string; note: string; active: boolean } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), key = useKey();
    if (!permitted) return denied("Kategori Bahan");
    const run = async (a: () => Promise<void>) => { setBusy(true); setError(null); try { await a(); setEdit(null); list.reload(); } catch (e) { setError(e instanceof Error ? e.message : "Kategori belum tersimpan."); } finally { setBusy(false); } };
    return <Screen title="Kategori Bahan">
        <Button icon="plus" title="Tambah kategori" onPress={() => { setError(null); setEdit({ id: null, nama: "", kode: "", note: "", active: true }); }}/>
        {list.loading && <Label tone="muted">Memuat kategori…</Label>}{list.error && <Notice message={list.error}/>}
        {list.data?.map((c) => <EntityCard key={c.id} icon="folderTree" title={c.nama} meta={[c.kode, `${c.jumlah_bahan} bahan`]} statuses={c.status === "NONAKTIF" ? [{ label: "Nonaktif", tone: "pending" }] : []} onPress={() => { setError(null); setEdit({ id: c.id, nama: c.nama, kode: c.kode, note: c.keterangan ?? "", active: c.status === "AKTIF" }); }}/>)}
        <BottomSheet visible={edit !== null} full onClose={() => setEdit(null)} title={edit?.id ? "Ubah kategori" : "Tambah kategori"}>{edit && <View style={styles.sheet}>
            <Input label="Nama" value={edit.nama} maxLength={100} onChangeText={(v) => setEdit({ ...edit, nama: v })}/><Input label="Kode (huruf, angka, - atau _)" value={edit.kode} maxLength={30} autoCapitalize="characters" onChangeText={(v) => setEdit({ ...edit, kode: v })}/>
            <Input label="Keterangan (opsional)" value={edit.note} multiline maxLength={2000} onChangeText={(v) => setEdit({ ...edit, note: v })}/><Toggle label="Aktif" value={edit.active} onChange={(v) => setEdit({ ...edit, active: v })}/>
            {error && <Notice message={error}/>}
            <Button icon="check" title="Simpan kategori" busy={busy} onPress={() => void run(async () => { const r = categoryBody(edit); if ("error" in r) throw new Error(r.error); await saveCategory(api, edit.id, r.body, key(r.body)); })}/>
            {edit.id && <Button icon="close" title="Hapus kategori" secondary disabled={busy} onPress={() => void run(() => deleteCategory(api, edit.id!, key({ hapus: edit.id })))}/>}
        </View>}</BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", gap: t.space.sm, alignItems: "center" }, flex: { flex: 1, minWidth: 0 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, sheet: { padding: t.space.md, gap: t.space.md }, meta: { fontSize: t.font.small, color: t.color.muted } });
