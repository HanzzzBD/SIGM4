import { useCallback, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { MobileApiError } from "../../shared/api/client";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, ListRow, Notice, Screen, StatusBadge, Toggle, tokens as t } from "../../shared/ui";
import { dateWib } from "../../shared/wib";
import { createAssets, deleteCategory, loadAsset, loadCategories, loadInventory, loadMovementDocument, loadTree, loadUsers, moveAssets, movementDownload, roomChoices, saveCategory, updateAsset } from "./api";
import type { Category } from "./api";
import { CONDITIONS, CONDITION_LABEL, CONDITION_TONE, EMPTY_FORM, SOURCES, STATUSES, STATUS_LABEL, STATUS_TONE, createBody, formFromAsset, formProblems, moveBody, updateBody } from "./model";
import type { AssetForm } from "./model";

const usePerms = () => { const { state } = useAuth(); const p = state.kind === "READY" ? state.session.permissions : {}; return { p, can: (x: string) => Object.hasOwn(p, x), account: state.kind === "READY" ? state.session.user.id : "" }; };
const denied = (title: string, text = "Anda tidak memiliki izin untuk layar ini.") => <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description={text}/></Screen>;
const apiMessage = (e: unknown, fallback: string) => e instanceof MobileApiError && e.details.length > 0 ? e.details.map((d) => d.message).join(" ") : e instanceof Error ? e.message : fallback;

/** MS-33 — padanan P-15: katalog bersaring; pilih banyak untuk Mutasi Lokasi; impor tampil ↗ web (MOB-SCP-03). */
export function InventoryScreen() {
    const { api } = useAuth(); const { can, account } = usePerms(); const params = useLocalSearchParams<{ kategori?: string }>();
    const [q, setQ] = useState(""), [kondisi, setKondisi] = useState(""), [status, setStatus] = useState(""), [kategori, setKategori] = useState(params.kategori ?? ""), [page, setPage] = useState(1);
    const [selecting, setSelecting] = useState(false), [picked, setPicked] = useState<string[]>([]), [web, setWeb] = useState(false);
    const permitted = can("asset.view");
    const cats = useResource(`${account}:asset-cats`, useCallback((s: AbortSignal) => permitted ? loadCategories(api, s) : Promise.resolve(null), [api, permitted]));
    const list = useResource(`${account}:inventory:${q}:${kondisi}:${status}:${kategori}:${page}`, useCallback((s: AbortSignal) => permitted ? loadInventory(api, { q, kondisi, status, kategori, page }, s) : Promise.resolve(null), [api, q, kondisi, status, kategori, page, permitted]));
    if (!permitted) return denied("Inventaris Aset");
    const reset = () => setPage(1);
    return <Screen title="Inventaris Aset" footer={selecting ? <View style={styles.row}><View style={styles.flex}><Button title="Batal" secondary onPress={() => { setSelecting(false); setPicked([]); }}/></View><View style={styles.flex}><Button icon="arrowRight" title={`Mutasi ${picked.length}`} disabled={picked.length === 0} onPress={() => router.push(`/aset/mutasi?ids=${picked.join(",")}` as "/scan")}/></View></View> : undefined}>
        {can("asset.create") && <View style={styles.row}><View style={styles.flex}><Button icon="plus" title="Tambah aset" onPress={() => router.push("/aset/baru" as "/scan")}/></View><View style={styles.flex}><Button icon="externalLink" title="Impor (web)" secondary onPress={() => setWeb(true)}/></View></View>}
        {can("asset.update") && !selecting && <Button icon="mapPin" title="Pilih untuk mutasi lokasi" secondary onPress={() => setSelecting(true)}/>}
        <Input icon="search" label="Cari" value={q} onChangeText={(v) => { setQ(v); reset(); }} placeholder="Kode, nama, atau nomor seri"/>
        <Chips label="Kondisi" value={kondisi} options={[{ value: "", label: "Semua" }, ...CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABEL[c] }))]} onChange={(v) => { setKondisi(v); reset(); }}/>
        <Chips label="Status" value={status} options={[{ value: "", label: "Semua" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} onChange={(v) => { setStatus(v); reset(); }}/>
        {cats.data && cats.data.length > 0 && <Chips label="Kategori" value={kategori} options={[{ value: "", label: "Semua" }, ...cats.data.map((c) => ({ value: c.id, label: c.nama }))]} onChange={(v) => { setKategori(v); reset(); }}/>}
        {list.loading && <Label tone="muted">Memuat aset…</Label>}{list.error && <><Notice message={list.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={list.reload}/></>}
        {list.data?.data.length === 0 && <EmptyState illustration="empty" title="Tidak ada aset" description="Ubah kata kunci atau saringan."/>}
        {list.data?.data.map((a) => { const on = picked.includes(a.id); return <EntityCard key={a.id} icon={on ? "checkCircle" : "package"} title={a.nama} meta={[a.kode_barang, `${a.lokasi.ruang} · ${a.lokasi.gedung}`]} statuses={[{ label: CONDITION_LABEL[a.kondisi], tone: CONDITION_TONE[a.kondisi] }, { label: STATUS_LABEL[a.status], tone: STATUS_TONE[a.status] }]} onPress={() => selecting ? setPicked(on ? picked.filter((x) => x !== a.id) : picked.length < 50 ? [...picked, a.id] : picked) : router.push(`/aset/${a.id}` as "/scan")}/>; })}
        {list.data && list.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{list.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= list.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
        <BottomSheet visible={web} onClose={() => setWeb(false)} title="Impor aset"><View style={styles.sheet}><Label>Impor massal berkas CSV/XLSX hanya tersedia di web sekolah (MOB-SCP-02).</Label><Button icon="externalLink" title="Buka di web sekolah" onPress={() => { const origin = process.env.EXPO_PUBLIC_APP_URL ?? ""; if (origin.startsWith("https://")) void Linking.openURL(`${new URL(origin).origin}/aset/impor`).catch(() => undefined); setWeb(false); }}/></View></BottomSheet>
    </Screen>;
}

/** MS-34 — padanan P-16 + P-19: daftar (n unit sekaligus) atau ubah satu PUT atomik; kondisi beralasan (FR-04.1, FR-04.3). */
export function AssetFormScreen() {
    const { id, ruangan } = useLocalSearchParams<{ id?: string; ruangan?: string }>(); const editing = id !== undefined;
    const { api } = useAuth(); const { can, account } = usePerms();
    const permitted = editing ? can("asset.update") && /^[1-9]\d*$/.test(id) : can("asset.create");
    const [form, setForm] = useState<AssetForm | null>(editing ? null : { ...EMPTY_FORM, room: ruangan && /^[1-9]\d*$/.test(ruangan) ? ruangan : "", tahun: dateWib(Date.now()).slice(0, 4) });
    const detail = useResource(`${account}:asset-edit:${id ?? ""}`, useCallback(async (s: AbortSignal) => { if (!editing || !permitted) return null; const d = await loadAsset(api, id!, s); setForm((f) => f ?? formFromAsset(d)); return d; }, [api, id, editing, permitted]));
    const cats = useResource(`${account}:asset-cats`, useCallback((s: AbortSignal) => permitted ? loadCategories(api, s) : Promise.resolve(null), [api, permitted]));
    const tree = useResource(`${account}:tree`, useCallback((s: AbortSignal) => permitted && !editing && can("location.view") ? loadTree(api, s) : Promise.resolve(null), [api, permitted, editing]));
    const users = useResource(`${account}:users-active`, useCallback((s: AbortSignal) => permitted && can("user.view") ? loadUsers(api, s) : Promise.resolve(null), [api, permitted]));
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [created, setCreated] = useState<{ id: string; kode_barang: string }[] | null>(null);
    if (!permitted) return denied(editing ? "Ubah Aset" : "Tambah Aset");
    const f = form, d = detail.data, financial = editing ? d?.sumber_perolehan !== undefined : true;
    if (!f) return <Screen title="Ubah Aset">{detail.error ? <Notice message={detail.error}/> : <Label tone="muted">Memuat aset…</Label>}</Screen>;
    const set = (patch: Partial<AssetForm>) => { setError(null); setForm({ ...f, ...patch }); };
    const problems = formProblems(f, editing ? { create: false, oldCondition: d?.kondisi ?? f.kondisi } : { create: true });
    const save = async () => {
        if (problems.length > 0) { setError(problems.join(" ")); return; } setBusy(true); setError(null);
        try { if (editing) { await updateAsset(api, id!, updateBody(f, { kondisi: d!.kondisi, financial })); router.replace(`/aset/${id}` as "/scan"); } else setCreated(await createAssets(api, createBody(f))); }
        catch (e) { setError(apiMessage(e, "Data belum tersimpan. Coba lagi.")); } finally { setBusy(false); }
    };
    if (created) return <Screen title="Aset Terdaftar"><EmptyState illustration="success" title={`${created.length} unit terdaftar`} description="Kode barang terbentuk otomatis; cetak label QR melalui web."/>{created.map((c) => <ListRow key={c.id} icon="package" title={c.kode_barang} onPress={() => router.replace(`/aset/${c.id}` as "/scan")}/>)}<Button icon="plus" title="Tambah aset lain" secondary onPress={() => { setCreated(null); setForm({ ...EMPTY_FORM, room: f.room, category: f.category, tahun: f.tahun }); }}/></Screen>;
    return <Screen title={editing ? "Ubah Aset" : "Tambah Aset"} subtitle={editing ? "Kategori dan lokasi tidak diubah di sini; pindahkan aset lewat Mutasi Lokasi." : "Jumlah unit lebih dari satu membentuk unit terpisah dengan kode barang berurutan."} footer={<Button icon="check" title={editing ? "Simpan perubahan" : "Daftarkan aset"} busy={busy} onPress={() => void save()}/>}>
        {error && <Notice message={error}/>}
        <Input label="Nama aset" value={f.nama} maxLength={200} onChangeText={(v) => set({ nama: v })}/>
        {!editing && cats.data && <Chips label="Kategori" value={f.category} options={cats.data.map((c) => ({ value: c.id, label: c.nama }))} onChange={(v) => set({ category: v })}/>}
        <Input label="Merek (opsional)" value={f.merek} maxLength={100} onChangeText={(v) => set({ merek: v })}/>
        <Input label="Model (opsional)" value={f.model} maxLength={100} onChangeText={(v) => set({ model: v })}/>
        <Input label="Nomor seri (opsional)" value={f.seri} maxLength={100} onChangeText={(v) => set({ seri: v })}/>
        <Input label="Tahun perolehan" value={f.tahun} keyboardType="number-pad" maxLength={4} onChangeText={(v) => set({ tahun: v.replace(/\D/g, "") })}/>
        {financial && <><Chips label="Sumber perolehan" value={f.sumber} options={SOURCES} onChange={(v) => set({ sumber: v })}/><Input label="Nilai perolehan (Rp, opsional)" value={f.nilai} keyboardType="decimal-pad" onChangeText={(v) => set({ nilai: v })}/></>}
        {!editing && (tree.data ? <Chips label="Ruangan" value={f.room} options={roomChoices(tree.data)} onChange={(v) => set({ room: v })}/> : <Label tone="muted">{can("location.view") ? "Memuat ruangan…" : "Izin melihat lokasi diperlukan untuk memilih ruangan."}</Label>)}
        {!editing && <Input label="Jumlah unit" value={f.jumlah} keyboardType="number-pad" onChangeText={(v) => set({ jumlah: v.replace(/\D/g, "") })}/>}
        {(!editing || can("asset.update_condition")) && <Chips label="Kondisi" value={f.kondisi} options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABEL[c] }))} onChange={(v) => set({ kondisi: v })}/>}
        {editing && d && f.kondisi !== d.kondisi && <><Input label="Alasan perubahan kondisi" value={f.alasan} multiline maxLength={1000} onChangeText={(v) => set({ alasan: v })}/>{f.kondisi === "HILANG" && <><Input label="Jenis rujukan (sesi opname / berita acara)" value={f.refJenis} onChangeText={(v) => set({ refJenis: v })}/><Input label="Nomor id rujukan" value={f.refId} keyboardType="number-pad" onChangeText={(v) => set({ refId: v.replace(/\D/g, "") })}/></>}</>}
        <Toggle label="Dapat dipinjam" value={f.pinjam} onChange={(v) => set({ pinjam: v, siswa: v && f.siswa })}/>
        <Toggle label="Boleh dipinjam siswa" value={f.siswa} disabled={!f.pinjam} onChange={(v) => set({ siswa: v })}/>
        {users.data && <Chips label="Penanggung jawab (opsional)" value={f.pj} options={[{ value: "", label: "Belum ditetapkan" }, ...users.data.map((u) => ({ value: u.id, label: u.nama }))]} onChange={(v) => set({ pj: v })}/>}
    </Screen>;
}

/** MS-35 — padanan P-20: 1–50 aset ke ruangan tujuan beralasan; berita acara dibangkitkan server (FR-04.4). */
export function MovementScreen() {
    const { ids } = useLocalSearchParams<{ ids?: string }>(); const { api } = useAuth(); const { can, account } = usePerms();
    const assets = (ids ?? "").split(",").filter((x) => /^[1-9]\d*$/.test(x)).slice(0, 50);
    const permitted = can("asset.update") && can("location.view");
    const tree = useResource(`${account}:tree`, useCallback((s: AbortSignal) => permitted ? loadTree(api, s) : Promise.resolve(null), [api, permitted]));
    const users = useResource(`${account}:users-active`, useCallback((s: AbortSignal) => permitted && can("user.view") ? loadUsers(api, s) : Promise.resolve(null), [api, permitted]));
    const [room, setRoom] = useState(""), [date, setDate] = useState(dateWib(Date.now())), [reason, setReason] = useState(""), [pj, setPj] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [receipt, setReceipt] = useState<string | null>(null);
    const doc = useResource(`${account}:move-doc:${receipt ?? ""}`, useCallback((s: AbortSignal) => receipt && can("asset_movement_document.view") ? loadMovementDocument(api, receipt, s) : Promise.resolve(null), [api, receipt]));
    if (!permitted) return denied("Mutasi Lokasi", "Mutasi memerlukan izin mengubah aset dan melihat lokasi.");
    const send = async () => { const r = moveBody({ assets, room, date, reason, pj }); if ("error" in r) { setError(r.error); return; } setBusy(true); setError(null); try { setReceipt((await moveAssets(api, r.body)).id); } catch (e) { setError(apiMessage(e, "Mutasi belum tersimpan.")); } finally { setBusy(false); } };
    if (receipt) return <Screen title="Mutasi Tercatat"><EmptyState illustration="success" title={`${assets.length} aset dipindahkan`} description="Berita acara mutasi sedang disiapkan server."/>
        {doc.data && <StatusBadge label={doc.data.status === "SIAP" ? "Berita acara siap" : doc.data.status === "GAGAL" ? "Berita acara gagal dibuat" : "Berita acara diproses"} tone={doc.data.status === "SIAP" ? "success" : doc.data.status === "GAGAL" ? "error" : "pending"}/>}
        {doc.data?.status === "SIAP" && <Button icon="fileText" title="Buka berita acara" onPress={() => { void movementDownload(api, receipt).then((x) => Linking.openURL(x.url)).catch(() => setError("Berita acara belum dapat dibuka.")); }}/>}
        {doc.data && doc.data.status !== "SIAP" && doc.data.status !== "GAGAL" && <Button icon="refresh" title="Periksa lagi" secondary onPress={doc.reload}/>}{error && <Notice message={error}/>}
        <Button icon="arrowLeft" title="Kembali ke inventaris" secondary onPress={() => router.replace("/aset" as "/scan")}/></Screen>;
    return <Screen title="Mutasi Lokasi" footer={<Button icon="mapPin" title={`Pindahkan ${assets.length} aset`} busy={busy} disabled={assets.length === 0} onPress={() => void send()}/>}>
        {error && <Notice message={error}/>}{assets.length === 0 && <Notice tone="info" message="Pilih aset dari Inventaris lebih dulu."/>}
        <Card><Label>{assets.length} aset terpilih</Label></Card>
        {tree.data ? <Chips label="Ruangan tujuan" value={room} options={roomChoices(tree.data)} onChange={setRoom}/> : <Label tone="muted">Memuat ruangan…</Label>}
        <DateField label="Tanggal mutasi" value={date} onChange={setDate}/>
        <Input label="Alasan mutasi" value={reason} multiline maxLength={500} onChangeText={setReason}/>
        {users.data && <Chips label="Penanggung jawab baru (opsional)" value={pj} options={[{ value: "", label: "Tidak diubah" }, ...users.data.map((u) => ({ value: u.id, label: u.nama }))]} onChange={setPj}/>}
    </Screen>;
}

/** MS-36 — padanan P-21: kategori bertingkat dengan umur teknis & interval preventif (FR-04.5). */
export function CategoryScreen() {
    const { api } = useAuth(); const { can, account } = usePerms(); const permitted = can("category.manage");
    const cats = useResource(`${account}:asset-cats-full`, useCallback((s: AbortSignal) => permitted ? loadCategories(api, s) : Promise.resolve(null), [api, permitted]));
    const [edit, setEdit] = useState<{ id: string | null; nama: string; kode: string; parent: string; umur: string; interval: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    if (!permitted) return denied("Kategori Aset");
    const open = (c?: Category) => { setError(null); setEdit({ id: c?.id ?? null, nama: c?.nama ?? "", kode: c?.kode ?? "", parent: c?.parent_id ?? "", umur: c?.umur_teknis_tahun?.toString() ?? "", interval: c?.interval_preventif_hari?.toString() ?? "" }); };
    const run = async (action: () => Promise<void>) => { setBusy(true); setError(null); try { await action(); setEdit(null); cats.reload(); } catch (e) { setError(apiMessage(e, "Kategori belum tersimpan.")); } finally { setBusy(false); } };
    const num = (v: string) => v.trim() === "" ? null : Number(v);
    const name = (id: string | null) => cats.data?.find((c) => c.id === id)?.nama;
    return <Screen title="Kategori Aset" subtitle="Interval preventif membentuk jadwal pemeliharaan; kategori yang dipakai aset tidak dapat dihapus.">
        <Button icon="plus" title="Tambah kategori" onPress={() => open()}/>
        {cats.loading && <Label tone="muted">Memuat kategori…</Label>}{cats.error && <Notice message={cats.error}/>}
        {cats.data?.map((c) => <EntityCard key={c.id} icon="tags" title={c.nama} meta={[c.kode, c.parent_id ? `Induk ${name(c.parent_id) ?? c.parent_id}` : "Kategori utama"]} statuses={c.interval_preventif_hari ? [{ label: `Preventif ${c.interval_preventif_hari} hari`, tone: "info" }] : []} onPress={() => open(c)}/>)}
        {cats.data && <Button icon="search" title="Lihat inventaris per kategori" secondary onPress={() => router.push("/aset" as "/scan")}/>}
        <BottomSheet visible={edit !== null} full onClose={() => setEdit(null)} title={edit?.id ? "Ubah kategori" : "Tambah kategori"}>{edit && <View style={styles.sheet}>
            <Input label="Nama" value={edit.nama} maxLength={100} onChangeText={(v) => setEdit({ ...edit, nama: v })}/><Input label="Kode" value={edit.kode} maxLength={30} autoCapitalize="characters" onChangeText={(v) => setEdit({ ...edit, kode: v })}/>
            <Chips label="Induk" value={edit.parent} options={[{ value: "", label: "Tanpa induk" }, ...(cats.data ?? []).filter((c) => c.id !== edit.id).map((c) => ({ value: c.id, label: c.nama }))]} onChange={(v) => setEdit({ ...edit, parent: v })}/>
            <Input label="Umur teknis (tahun, opsional)" value={edit.umur} keyboardType="number-pad" onChangeText={(v) => setEdit({ ...edit, umur: v.replace(/\D/g, "") })}/><Input label="Interval preventif (hari, opsional)" value={edit.interval} keyboardType="number-pad" onChangeText={(v) => setEdit({ ...edit, interval: v.replace(/\D/g, "") })}/>
            {error && <Notice message={error}/>}
            <Button icon="check" title="Simpan kategori" busy={busy} disabled={!edit.nama.trim() || !edit.kode.trim()} onPress={() => void run(() => saveCategory(api, edit.id, { nama: edit.nama.trim(), kode: edit.kode.trim(), parent_id: edit.parent ? Number(edit.parent) : null, umur_teknis_tahun: num(edit.umur), interval_preventif_hari: num(edit.interval) }))}/>
            {edit.id && <Button icon="close" title="Hapus kategori" secondary disabled={busy} onPress={() => void run(() => deleteCategory(api, edit.id!))}/>}
        </View>}</BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", gap: t.space.sm, alignItems: "center" }, flex: { flex: 1, minWidth: 0 }, sheet: { padding: t.space.md, gap: t.space.md }, strong: { fontSize: t.font.body, fontWeight: "600", color: t.color.heading } });
