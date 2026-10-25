import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { ProcurementDetail } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Card, Chips, EmptyState, EntityCard, Input, Label, Notice, Screen, SectionHeading, tokens as t } from "../../shared/ui";
import { AttachmentField, scanLabel } from "../../shared/upload/AttachmentField";
import { dateWib, rupiah } from "../../shared/wib";
import { canEdit, emptyForm, estimateTotal, formFromAsset, formFromDetail, loadProcurement, loadProcurementOptions, loadProcurements, loadSourceAsset, newItem, priorities, procurementBody, saveProcurement, statuses, statusTones } from "./model";
import type { ItemForm, ProcurementForm } from "./model";

const id = (v: string | undefined) => v && /^[1-9]\d*$/.test(v) ? v : "";
const useSession = () => { const { api, state } = useAuth(); return { api, account: state.kind === "READY" ? state.session.user.id : "", perms: state.kind === "READY" ? state.session.permissions : {} }; };
const denied = (title: string) => <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin membuka halaman ini."/></Screen>;

/** MS-67 — padanan P-51: daftar usulan sesuai scope, cari & saringan status (FR-14.1). */
export function ProcurementListScreen() {
    const { api, account, perms } = useSession(), permitted = Object.hasOwn(perms, "procurement.view");
    const [q, setQ] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
    const r = useResource(`${account}:procurements:${q}:${status}:${page}`, useCallback((s: AbortSignal) => permitted ? loadProcurements(api, { page, q, status }, s) : Promise.resolve(null), [api, page, q, status, permitted]));
    if (!permitted) return denied("Pengadaan");
    return <Screen title="Pengadaan" subtitle="Pantau usulan, persetujuan, dan penerimaan barang." {...(Object.hasOwn(perms, "procurement.create") ? { footer: <Button icon="plus" title="Buat usulan" onPress={() => router.push("/pengadaan/baru" as "/scan")}/> } : {})}>
        <Input icon="search" label="Cari nomor atau judul" value={q} onChangeText={(v) => { setQ(v); setPage(1); }}/>
        <Chips label="Status" value={status} options={[{ value: "", label: "Semua" }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} onChange={(v) => { setStatus(v); setPage(1); }}/>
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat usulan…</Label>}
        {r.data?.data.map((p) => <EntityCard key={p.id} icon="shoppingCart" title={p.judul} meta={[p.nomor, `${p.pengusul.nama} · ${p.unit_kerja ?? "Unit belum dipilih"}`, `${p.tahun_anggaran} · ${priorities[p.prioritas]}`]} value={rupiah(p.total_estimasi)} statuses={[{ label: statuses[p.status], tone: statusTones[p.status] }]} onPress={() => router.push(`/pengadaan/${p.id}` as "/scan")}/>)}
        {r.data && !r.data.data.length && <EmptyState illustration="empty" title="Tidak ada usulan" description="Sesuaikan saringan atau buat usulan pengadaan."/>}
        {r.data && r.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{r.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= r.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
    </Screen>;
}

function ItemCard({ i, index, options, onChange, onRemove, disabled }: { i: ItemForm; index: number; options: Awaited<ReturnType<typeof loadProcurementOptions>> | null; onChange: (p: Partial<ItemForm>) => void; onRemove: () => void; disabled: boolean }) {
    const materials = options?.materials ?? [];
    return <Card><Label strong>Barang {index + 1}</Label>
        {(options?.bahan_dapat_diusulkan ?? false) && <Chips label="Jenis" value={i.jenis} disabled={disabled} options={[{ value: "ASET", label: "Aset" }, { value: "BAHAN", label: "Bahan habis pakai" }]} onChange={(jenis) => onChange({ jenis, material_id: "", category_id: "", nama_barang: "", satuan: jenis === "ASET" ? "unit" : "" })}/>}
        {i.jenis === "BAHAN" ? <Chips label="Master bahan" value={i.material_id} disabled={disabled} options={materials.map((m) => ({ value: m.id, label: `${m.nama} (${m.satuan})` }))} onChange={(v) => { const m = materials.find((x) => x.id === v); onChange({ material_id: v, nama_barang: m?.nama ?? "", satuan: m?.satuan ?? "" }); }}/>
            : <><Input label="Nama barang" value={i.nama_barang} maxLength={200} editable={!disabled} onChangeText={(nama_barang) => onChange({ nama_barang })}/><Chips label="Kategori aset" value={i.category_id} disabled={disabled} options={(options?.categories ?? []).map((c) => ({ value: c.id, label: c.nama }))} onChange={(category_id) => onChange({ category_id })}/></>}
        <Input label="Spesifikasi" value={i.spesifikasi} multiline maxLength={5000} editable={!disabled} onChangeText={(spesifikasi) => onChange({ spesifikasi })}/>
        <View style={styles.row}><View style={styles.flex}><Input label="Jumlah" value={i.jumlah} keyboardType="number-pad" editable={!disabled} onChangeText={(jumlah) => onChange({ jumlah })}/></View><View style={styles.flex}><Input label="Satuan" value={i.satuan} maxLength={50} editable={!disabled && i.jenis === "ASET"} onChangeText={(satuan) => onChange({ satuan })}/></View></View>
        <Input label="Estimasi harga satuan (Rp)" value={i.harga} keyboardType="decimal-pad" editable={!disabled} onChangeText={(harga) => onChange({ harga })}/>
        <Input label="Keterangan (opsional)" value={i.keterangan} maxLength={2000} editable={!disabled} onChangeText={(keterangan) => onChange({ keterangan })}/>
        <Button icon="close" title={`Hapus barang ${index + 1}`} compact secondary disabled={disabled} onPress={onRemove}/>
    </Card>;
}

/** MS-68 — padanan P-52: buat atau sunting draf/Perlu Revisi; simpan draf atau ajukan (FR-14.1). `?aset=` membawa aset sumber. */
export function ProcurementFormScreen() {
    const params = useLocalSearchParams<{ id?: string; aset?: string }>(), editId = id(params.id), source = id(params.aset);
    const { api, account, perms } = useSession(), permitted = Object.hasOwn(perms, "procurement.create");
    const [f, setF] = useState<ProcurementForm | null>(editId ? null : emptyForm(dateWib(Date.now()).slice(0, 4), source)), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), attempt = useRef<{ body: string; key: string } | null>(null);
    const options = useResource(`${account}:procurement-options`, useCallback((s: AbortSignal) => permitted ? loadProcurementOptions(api, s) : Promise.resolve(null), [api, permitted]));
    const existing = useResource(`${account}:procurement-edit:${editId}`, useCallback((s: AbortSignal) => permitted && editId ? loadProcurement(api, editId, s) : Promise.resolve(null), [api, editId, permitted]));
    const asset = useResource(`${account}:procurement-source:${source}`, useCallback((s: AbortSignal) => permitted && source && !editId && Object.hasOwn(perms, "asset.view") ? loadSourceAsset(api, source, s) : Promise.resolve(null), [api, source, editId, permitted]));
    useEffect(() => { if (existing.data) setF(formFromDetail(existing.data)); }, [existing.data]);
    useEffect(() => { if (asset.data) setF((old) => old && formFromAsset(old, asset.data!)); }, [asset.data]);
    if (!permitted) return denied(editId ? "Sunting Usulan" : "Buat Usulan Pengadaan");
    if (!f) return <Screen title="Sunting Usulan">{existing.error ? <Notice message={existing.error}/> : <Label tone="muted">Memuat usulan…</Label>}</Screen>;
    const set = (p: Partial<ProcurementForm>) => { setError(null); setF({ ...f, ...p }); };
    const item = (index: number, p: Partial<ItemForm>) => set({ items: f.items.map((x, j) => j === index ? { ...x, ...p } : x) });
    const submit = async (mode: "DRAF" | "AJUKAN") => {
        const r = procurementBody(f, mode); if ("error" in r) { setError(r.error); return; }
        const body = JSON.stringify(r.body); if (attempt.current?.body !== body) attempt.current = { body, key: randomUUID() };
        setBusy(true); setError(null); try { const saved = await saveProcurement(api, editId || undefined, r.body, attempt.current.key); router.replace(`/pengadaan/${saved.id}` as "/scan"); } catch (e) { setError(e instanceof Error ? e.message : "Usulan belum tersimpan. Coba lagi dengan isian yang sama."); } finally { setBusy(false); }
    };
    const total = estimateTotal(f.items);
    return <Screen title={editId ? "Sunting Usulan" : "Buat Usulan Pengadaan"} subtitle="Isi kebutuhan barang dan alasannya. Total akhir dihitung sistem; lampiran dibuka setelah lolos pemeriksaan." footer={<View style={styles.row}><View style={styles.flex}><Button icon="send" title="Ajukan" busy={busy} onPress={() => void submit("AJUKAN")}/></View><View style={styles.flex}><Button title="Simpan draf" secondary disabled={busy} onPress={() => void submit("DRAF")}/></View></View>}>
        {error && <Notice message={error}/>}{options.error && <Notice message={options.error}/>}
        {asset.data && <EntityCard icon="package" title={`Aset sumber: ${asset.data.nama}`} meta={[`Kondisi ${asset.data.kondisi.toLowerCase().replaceAll("_", " ")}`]}/>}
        <Input label="Judul usulan" value={f.judul} maxLength={200} onChangeText={(judul) => set({ judul })}/>
        <Chips label="Unit kerja pengusul" value={f.unit} options={(options.data?.work_units ?? []).map((u) => ({ value: u.id, label: u.nama }))} onChange={(unit) => set({ unit })}/>
        <Input label="Tahun anggaran" value={f.tahun} keyboardType="number-pad" maxLength={4} onChangeText={(tahun) => set({ tahun })}/>
        <Chips label="Prioritas" value={f.prioritas} options={(Object.keys(priorities) as (keyof typeof priorities)[]).map((value) => ({ value, label: priorities[value] }))} onChange={(prioritas) => set({ prioritas })}/>
        <Input label="Justifikasi kebutuhan" value={f.justifikasi} multiline maxLength={10000} onChangeText={(justifikasi) => set({ justifikasi })}/>
        <SectionHeading title="Daftar barang"/>
        {f.items.map((i, index) => <ItemCard key={index} i={i} index={index} options={options.data} disabled={busy} onChange={(p) => item(index, p)} onRemove={() => set({ items: f.items.filter((_x, j) => j !== index) })}/>)}
        <Button icon="plus" title="Tambah barang" secondary disabled={busy || f.items.length >= 100} onPress={() => set({ items: [...f.items, newItem()] })}/>
        <Label strong>Total estimasi: {rupiah(Number.isFinite(total) ? total.toFixed(2) : "0")}</Label>
        <AttachmentField api={api} label="Lampiran pendukung" help="Brosur, foto kondisi barang, atau referensi harga." kind="PROCUREMENT_ATTACHMENT" files={f.lampiran} max={10} disabled={busy} onChange={(lampiran) => set({ lampiran })}/>
    </Screen>;
}

export function ProcurementContents({ d }: { d: ProcurementDetail }) {
    return <>
        <Card><Label strong>Kebutuhan pengadaan</Label><Label>{d.justifikasi || "Justifikasi belum diisi."}</Label><Label tone="muted">{d.pengusul.nama} · {d.unit_kerja ?? "Unit belum dipilih"} · {d.tahun_anggaran} · {priorities[d.prioritas]}</Label><Label strong>Total estimasi {rupiah(d.total_estimasi)}</Label></Card>
        <SectionHeading title="Barang diusulkan"/>
        {d.items.map((i) => <EntityCard key={i.id} icon={i.jenis === "BAHAN" ? "boxes" : "package"} title={i.nama_barang} meta={[i.kategori_nama ?? "Bahan", i.spesifikasi || "Spesifikasi belum dicantumkan", `Diusulkan ${i.jumlah_diusulkan} ${i.satuan} · disetujui ${i.jumlah_disetujui ?? "—"} · diterima ${i.jumlah_diterima}`]} value={rupiah(i.estimasi_harga_satuan)}/>)}
        <SectionHeading title="Lampiran pendukung"/>
        {d.lampiran.length === 0 ? <Label tone="muted">Tidak ada lampiran.</Label> : d.lampiran.map((f) => <EntityCard key={f.file_id} icon="fileText" title={f.nama_berkas} statuses={[{ label: scanLabel(f.status), tone: f.status === "CLEAN" ? "success" : f.status === "PENDING" ? "pending" : "error" }]} {...(f.url ? { onPress: () => { void Linking.openURL(f.url!).catch(() => undefined); } } : {})}/>)}
        {d.dukungan.length > 0 && <><SectionHeading title="Aset sejenis saat ini"/>{d.dukungan.map((c) => <Label key={c.category_id}>{c.nama}: {c.jumlah_aset} aset — {c.baik} Baik, {c.rusak_ringan} Rusak Ringan, {c.rusak_berat} Rusak Berat; {c.dipinjam} dipinjam.</Label>)}</>}
    </>;
}

/** MS-69 — padanan P-53: isi usulan, riwayat persetujuan (ke MS-54), riwayat penerimaan; sunting draf (FR-14.1, FR-14.2). */
export function ProcurementDetailScreen() {
    const params = useLocalSearchParams<{ id: string }>(), pid = id(params.id), { api, account, perms } = useSession();
    const [version, setVersion] = useState(0), permitted = !!pid && Object.hasOwn(perms, "procurement.view");
    const r = useResource(`${account}:procurement:${pid}:${version}`, useCallback((s: AbortSignal) => permitted ? loadProcurement(api, pid, s) : Promise.resolve(null), [api, pid, permitted, version]));
    if (!permitted) return denied("Detail Usulan");
    const d = r.data;
    return <Screen title={d ? d.nomor : "Detail Usulan"} subtitle="Keputusan diberikan approver lewat Detail Keputusan; aset dan stok terbentuk saat penerimaan dicatat.">
        {r.loading && <Label tone="muted">Memuat usulan…</Label>}{r.error && <Notice message={r.error}/>}
        {d && <>
            <EntityCard icon="shoppingCart" title={d.judul} meta={[d.nomor]} statuses={[{ label: statuses[d.status], tone: statusTones[d.status] }]}/>
            {d.alasan_penutupan && <Notice tone="info" message={`Usulan ditutup: ${d.alasan_penutupan}`}/>}
            <View style={styles.wrap}>
                {canEdit(d, account, perms) && <Button icon="settings" title="Sunting usulan" compact secondary onPress={() => router.push(`/pengadaan/${d.id}/ubah` as "/scan")}/>}
                {d.source_asset_id && Object.hasOwn(perms, "asset.view") && <Button icon="package" title="Aset sumber" compact secondary onPress={() => router.push(`/aset/${d.source_asset_id}` as "/scan")}/>}
                <Button icon="refresh" title="Muat ulang" compact secondary onPress={() => setVersion((v) => v + 1)}/>
            </View>
            <ProcurementContents d={d}/>
            {Object.hasOwn(perms, "approval.view") && d.approval_ids.length > 0 && <><SectionHeading title="Riwayat persetujuan"/>{d.approval_ids.slice().reverse().map((a) => <EntityCard key={a} icon="badgeCheck" title={`Persetujuan #${a}`} meta={[a === d.approval_instance_id && d.status === "MENUNGGU_PERSETUJUAN" ? "Langkah aktif — buka untuk memutuskan" : "Linimasa keputusan"]} onPress={() => router.push(`/persetujuan/${a}` as "/scan")}/>)}</>}
            <SectionHeading title="Riwayat penerimaan"/>
            {d.penerimaan.length === 0 ? <Label tone="muted">Belum ada penerimaan barang.</Label> : d.penerimaan.map((p) => <Card key={p.id}><Label strong>{p.nomor_dokumen} · {p.tanggal_terima}</Label><Label tone="muted">Diterima oleh {p.diterima_oleh}</Label>{p.catatan && <Label>{p.catatan}</Label>}
                {p.items.map((i) => { const item = d.items.find((x) => x.id === i.item_id); return <View key={i.id} style={styles.block}><Label>{item?.nama_barang}: {i.jumlah} {item?.satuan ?? "unit"} {i.status === "DITERIMA" ? "diterima" : "ditolak saat penerimaan"}{i.alasan ? ` — ${i.alasan}` : ""}</Label>{i.bahan && <Label tone="muted">Stok ditambahkan di {i.bahan.lokasi}; saldo {i.bahan.saldo_sesudah} {i.bahan.satuan}.</Label>}{i.assets.length > 0 && <View style={styles.wrap}>{i.assets.map((a) => <Button key={a.id} title={a.kode_barang} compact secondary onPress={() => router.push(`/aset/${a.id}` as "/scan")}/>)}</View>}</View>; })}
                {p.dokumen.map((f) => <Button key={f.file_id} icon="fileText" title={f.nama_berkas} compact secondary disabled={!f.url} onPress={() => { void Linking.openURL(f.url!).catch(() => undefined); }}/>)}
            </Card>)}
        </>}
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, flex: { flex: 1 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, block: { gap: t.space.xs } });
