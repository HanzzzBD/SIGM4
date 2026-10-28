import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { DokumenAset } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { pickAndUploadDocument } from "../../shared/upload/document";
import type { UploadedDocument } from "../../shared/upload/document";
import { formatTime } from "../../shared/time";
import { BottomSheet, Button, Chips, DateField, EmptyState, EntityCard, Input, Label, Notice, Screen, StatusBadge, tokens as t } from "../../shared/ui";
import type { StatusTone } from "../../shared/ui";
import { dateWib } from "../../shared/wib";
import { detachDocument, documentUrl, linkDocument, loadAllDocuments, loadAssetDocuments } from "./api";
import { DOC_TYPES, warranty } from "./model";
import type { DocType } from "./model";

const SCAN: Readonly<Record<DokumenAset["scan_status"], { label: string; tone: StatusTone }>> = { PENDING: { label: "Sedang diperiksa", tone: "pending" }, CLEAN: { label: "Siap dibuka", tone: "success" }, INFECTED: { label: "Ditolak pemindai", tone: "error" }, FAILED: { label: "Pemeriksaan gagal", tone: "error" } };
const typeLabel = (jenis: string) => DOC_TYPES.find((d) => d.value === jenis)?.label ?? jenis;
function useOpen(setError: (e: string | null) => void) {
    const { api } = useAuth();
    return (assetId: string, doc: DokumenAset) => { if (doc.scan_status !== "CLEAN") { setError("Dokumen dapat dibuka setelah lolos pemeriksaan."); return; } void documentUrl(api, assetId, doc.id).then((url) => Linking.openURL(url)).catch(() => setError("Dokumen belum dapat dibuka. Coba lagi.")); };
}

/** MS-39 — padanan P-26: dokumen lintas aset dengan penanda garansi (FR-06.1). */
export function DocumentsScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permitted = state.kind === "READY" && Object.hasOwn(state.session.permissions, "asset_document.view");
    const [q, setQ] = useState(""), [jenis, setJenis] = useState(""), [garansi, setGaransi] = useState(""), [page, setPage] = useState(1), [error, setError] = useState<string | null>(null), open = useOpen(setError);
    const list = useResource(`${account}:docs:${q}:${jenis}:${garansi}:${page}`, useCallback((s: AbortSignal) => permitted ? loadAllDocuments(api, { q, jenis, garansi, page }, s) : Promise.resolve(null), [api, q, jenis, garansi, page, permitted]));
    if (!permitted) return <Screen title="Dokumen Aset"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat dokumen aset."/></Screen>;
    const today = dateWib(Date.now());
    return <Screen title="Dokumen Aset" subtitle="Faktur, garansi, sertifikat, manual, dan berita acara. Unggah dokumen dari layar dokumen sebuah aset.">
        <Input icon="search" label="Cari" value={q} onChangeText={(v) => { setQ(v); setPage(1); }} placeholder="Nama berkas atau kode aset"/>
        <Chips label="Jenis" value={jenis} options={[{ value: "", label: "Semua" }, ...DOC_TYPES]} onChange={(v) => { setJenis(v); setPage(1); }}/>
        <Chips label="Garansi" value={garansi} options={[{ value: "", label: "Semua" }, { value: "AKTIF", label: "Aktif" }, { value: "BERAKHIR_30_HARI", label: "Berakhir ≤30 hari" }, { value: "BERAKHIR", label: "Berakhir" }]} onChange={(v) => { setGaransi(v); setPage(1); }}/>
        {error && <Notice message={error}/>}{list.loading && <Label tone="muted">Memuat dokumen…</Label>}{list.error && <Notice message={list.error}/>}
        {list.data?.data.length === 0 && <EmptyState illustration="empty" title="Tidak ada dokumen" description="Ubah kata kunci atau saringan."/>}
        {list.data?.data.map((d) => { const w = warranty(d, today); return <EntityCard key={`${d.id}${d.aset.id}`} icon="fileText" title={d.nama_berkas} meta={[`${typeLabel(d.jenis)} · ${d.aset.kode_barang}`, d.aset.nama]} statuses={[SCAN[d.scan_status], ...(w ? [w] : [])]} onPress={() => open(d.aset.id, d)}/>; })}
        {list.data && list.data.meta.total_pages > 1 && <View style={{ flexDirection: "row", gap: t.space.sm, alignItems: "center" }}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{list.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= list.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
    </Screen>;
}

/** Dokumen satu aset: buka, unggah dari penyimpanan ponsel, lepaskan (FR-06.1; `asset_document.manage`). */
export function AssetDocumentsScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const perms = state.kind === "READY" ? state.session.permissions : {}, permitted = /^[1-9]\d*$/.test(id) && Object.hasOwn(perms, "asset_document.view"), manage = Object.hasOwn(perms, "asset_document.manage");
    const list = useResource(`${account}:asset-docs:${id}`, useCallback((s: AbortSignal) => permitted ? loadAssetDocuments(api, id, s) : Promise.resolve(null), [api, id, permitted]));
    const [file, setFile] = useState<UploadedDocument | null>(null), [jenis, setJenis] = useState<DocType>("FAKTUR"), [note, setNote] = useState(""), [from, setFrom] = useState(""), [until, setUntil] = useState("");
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [remove, setRemove] = useState<DokumenAset | null>(null), open = useOpen(setError);
    if (!permitted) return <Screen title="Dokumen"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat dokumen aset."/></Screen>;
    const run = async (action: () => Promise<void>) => { setBusy(true); setError(null); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Dokumen belum tersimpan."); } finally { setBusy(false); } };
    const pick = () => run(async () => { const f = await pickAndUploadDocument(api, "ASSET_DOCUMENT"); if (f) { setFile(f); setNote(""); setFrom(""); setUntil(""); } });
    const save = () => run(async () => {
        if (!file) return; if (jenis === "GARANSI" && (!from || !until || until < from)) throw new Error("Isi tanggal mulai dan selesai garansi.");
        await linkDocument(api, id, { file_id: file.file_id, jenis, nama_berkas: file.nama_berkas, keterangan: note.trim() || null, ...(jenis === "GARANSI" ? { garansi_mulai: from, garansi_selesai: until } : {}), asset_ids_tambahan: [] });
        setFile(null); list.reload();
    });
    const today = dateWib(Date.now());
    return <Screen title="Dokumen Aset" subtitle="Berkas PDF, JPG, PNG, DOCX, atau XLSX hingga 10 MB. Dokumen dapat dibuka setelah lolos pemeriksaan keamanan.">
        {error && <Notice message={error}/>}
        {manage && <Button icon="plus" title="Unggah dokumen" busy={busy && !file} onPress={() => void pick()}/>}
        {list.loading && <Label tone="muted">Memuat dokumen…</Label>}{list.error && <Notice message={list.error}/>}
        {list.data?.length === 0 && <EmptyState illustration="empty" title="Belum ada dokumen" description="Dokumen aset ini akan tampil di sini."/>}
        {list.data?.map((d) => { const w = warranty(d, today); return <EntityCard key={d.id} icon="fileText" title={d.nama_berkas} meta={[typeLabel(d.jenis), formatTime(d.diunggah_pada)]} statuses={[SCAN[d.scan_status], ...(w ? [w] : [])]} onPress={() => manage ? setRemove(d) : open(id, d)}/>; })}
        <Button icon="package" title="Kembali ke aset" secondary onPress={() => router.replace(`/aset/${id}` as "/scan")}/>
        <BottomSheet visible={file !== null} full onClose={() => setFile(null)} title="Tautkan dokumen">{file && <View style={{ padding: t.space.md, gap: t.space.md }}>
            <StatusBadge label={`${file.nama_berkas} · ${SCAN[file.scan_status].label}`} tone={SCAN[file.scan_status].tone}/>
            <Chips label="Jenis dokumen" value={jenis} options={DOC_TYPES} onChange={setJenis}/>
            {jenis === "GARANSI" && <><DateField label="Garansi mulai" value={from} onChange={setFrom}/><DateField label="Garansi selesai" value={until} {...(from ? { min: from } : {})} onChange={setUntil}/></>}
            <Input label="Keterangan (opsional)" value={note} maxLength={1000} onChangeText={setNote}/>
            {error && <Notice message={error}/>}<Button icon="check" title="Simpan dokumen" busy={busy} onPress={() => void save()}/>
        </View>}</BottomSheet>
        <BottomSheet visible={remove !== null} onClose={() => setRemove(null)} title={remove?.nama_berkas ?? "Dokumen"}><View style={{ padding: t.space.md, gap: t.space.md }}>
            <Button icon="fileText" title="Buka dokumen" onPress={() => { if (remove) open(id, remove); setRemove(null); }}/>
            <Label tone="muted">Melepaskan hanya memutus tautan dari aset ini; dokumen yang dipakai aset lain tetap tersimpan.</Label>
            <Button icon="close" title="Lepaskan dari aset" secondary busy={busy} onPress={() => void run(async () => { if (remove) await detachDocument(api, id, remove.id); setRemove(null); list.reload(); })}/>
        </View></BottomSheet>
    </Screen>;
}
