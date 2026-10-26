import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { DisposalDetail } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, Notice, Screen, SectionHeading, Toggle, tokens as t } from "../../shared/ui";
import { AttachmentField, scanLabel, scanTone } from "../../shared/upload/AttachmentField";
import { dateWib, rupiah } from "../../shared/wib";
import { actions, actionsFor, canCancel, canExecute, canReinstate, canRevise, conditions, disposalBody, disposalReportUrl, disposalWrite, executeBody, formFromCandidate, formFromDetail, loadCandidates, loadDisposal, loadDisposalOptions, loadDisposals, reasons, selectCandidate, statuses, statusTones } from "./model";
import type { DisposalForm } from "./model";

const id = (v: string | undefined) => v && /^[1-9]\d*$/.test(v) ? v : "";
const useSession = () => { const { api, state } = useAuth(); return { api, user: state.kind === "READY" ? state.session.user : { id: "", role_kode: "" }, perms: state.kind === "READY" ? state.session.permissions : {} }; };
const denied = (title: string) => <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin membuka halaman ini."/></Screen>;
const useKey = () => { const r = useRef<{ b: string; k: string } | null>(null); return (b: unknown) => { const s = JSON.stringify(b); if (r.current?.b !== s) r.current = { b: s, k: randomUUID() }; return r.current.k; }; };

/** MS-71 — padanan P-55: tab Usulan/Arsip, cari, saringan status; ekspor arsip ke PR-07-31 (keputusan 22). */
export function DisposalListScreen() {
    const { api, user, perms } = useSession(), permitted = Object.hasOwn(perms, "disposal.view");
    const [tab, setTab] = useState<"USULAN" | "ARSIP">("USULAN"), [q, setQ] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
    const r = useResource(`${user.id}:disposals:${tab}:${q}:${status}:${page}`, useCallback((s: AbortSignal) => permitted ? loadDisposals(api, { tab, page, q, status }, s) : Promise.resolve(null), [api, tab, page, q, status, permitted]));
    if (!permitted) return denied("Penghapusan Aset");
    return <Screen title="Penghapusan Aset" subtitle="Usulkan penonaktifan permanen dan telusuri berita acara pelaksanaannya." {...(Object.hasOwn(perms, "disposal.create") ? { footer: <Button icon="plus" title="Buat usulan penghapusan" onPress={() => router.push("/penghapusan/baru" as "/scan")}/> } : {})}>
        <Chips label="Daftar" value={tab} options={[{ value: "USULAN", label: "Usulan" }, { value: "ARSIP", label: "Arsip" }]} onChange={(v) => { setTab(v); setStatus(""); setPage(1); }}/>
        <Input icon="search" label="Cari nomor, kode, atau nama aset" value={q} onChangeText={(v) => { setQ(v); setPage(1); }}/>
        {tab === "USULAN" && <Chips label="Status" value={status} options={[{ value: "", label: "Semua" }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} onChange={(v) => { setStatus(v); setPage(1); }}/>}
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat penghapusan…</Label>}
        {tab === "ARSIP" && r.data && <Card><Label strong>Total dihapuskan: {r.data.ringkasan.unit} unit</Label><Label tone="muted">Nilai perolehan {rupiah(r.data.ringkasan.nilai)}</Label></Card>}
        {r.data?.data.map((d) => <EntityCard key={d.id} icon="archiveX" title={d.nomor} meta={[reasons[d.alasan], `${d.jumlah_aset} aset diusulkan · ${d.jumlah_disetujui} disetujui`, d.tanggal_pelaksanaan ? `Pelaksanaan ${d.tanggal_pelaksanaan} · ${d.pelaksana ?? ""}` : null]} value={rupiah(d.total_nilai)} statuses={[{ label: statuses[d.status], tone: statusTones[d.status] }]} onPress={() => router.push(`/penghapusan/${d.id}` as "/scan")}/>)}
        {r.data && !r.data.data.length && <EmptyState illustration="empty" title="Belum ada penghapusan" description="Buat usulan atau ubah saringan daftar."/>}
        {r.data && r.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{r.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= r.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
    </Screen>;
}

/** MS-72 — padanan P-56: pilih kandidat, data pendukung dibekukan saat diajukan; revisi usulan Perlu Revisi (FR-21.1). */
export function DisposalFormScreen() {
    const params = useLocalSearchParams<{ id?: string; aset?: string }>(), editId = id(params.id), source = id(params.aset), { api, user, perms } = useSession(), permitted = Object.hasOwn(perms, "disposal.create");
    const [f, setF] = useState<DisposalForm | null>(editId ? null : { reason: "RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI", justification: "", action: "DIMUSNAHKAN", items: [], files: [] });
    const [q, setQ] = useState(""), [page, setPage] = useState(1), [kind, setKind] = useState<"PENDUKUNG" | "KEHILANGAN">("PENDUKUNG"), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), key = useKey();
    const existing = useResource(`${user.id}:disposal-edit:${editId}`, useCallback((s: AbortSignal) => permitted && editId ? loadDisposal(api, editId, s) : Promise.resolve(null), [api, editId, permitted]));
    const sourced = useResource(`${user.id}:disposal-source:${source}`, useCallback((s: AbortSignal) => permitted && source && !editId ? loadCandidates(api, { page: 1, asset_id: Number(source) }, s) : Promise.resolve(null), [api, source, editId, permitted]));
    const candidates = useResource(`${user.id}:disposal-candidates:${q}:${page}`, useCallback((s: AbortSignal) => permitted && !editId ? loadCandidates(api, { page, ...(q.trim() ? { q: q.trim() } : {}) }, s) : Promise.resolve(null), [api, q, page, editId, permitted]));
    useEffect(() => { if (existing.data) setF(formFromDetail(existing.data)); }, [existing.data]);
    useEffect(() => { const a = sourced.data?.data[0]; if (a && a.penghalang.length === 0) setF((old) => old && formFromCandidate(old, a)); }, [sourced.data]);
    if (!permitted) return denied(editId ? "Revisi Usulan Penghapusan" : "Buat Usulan Penghapusan");
    if (!f) return <Screen title="Revisi Usulan Penghapusan">{existing.error ? <Notice message={existing.error}/> : <Label tone="muted">Memuat usulan…</Label>}</Screen>;
    const set = (p: Partial<DisposalForm>) => { setError(null); setF({ ...f, ...p }); };
    const pick = (i: DisposalForm["items"][number], p: Partial<DisposalForm["items"][number]>) => set({ items: f.items.map((x) => x.asset.id === i.asset.id ? { ...x, ...p } : x) });
    const save = async () => { const r = disposalBody(f); if ("error" in r) { setError(r.error); return; } setBusy(true); setError(null); try { const d = await disposalWrite(api, editId ? `/asset-disposals/${editId}` : "/asset-disposals", r.body, key(r.body), editId ? "put" : "post"); router.replace(`/penghapusan/${d.id}` as "/scan"); } catch (e) { setError(e instanceof Error ? e.message : "Usulan belum tersimpan. Coba lagi dengan isian yang sama."); } finally { setBusy(false); } };
    const proofs = f.files.filter((x) => x.jenis === "KEHILANGAN" && x.scan_status === "CLEAN");
    return <Screen title={editId ? "Revisi Usulan Penghapusan" : "Buat Usulan Penghapusan"} subtitle="Pengajuan membekukan data pendukung dan memblokir pemesanan sampai usulan ditutup." footer={<Button icon="send" title={editId ? "Ajukan ulang" : "Ajukan usulan"} busy={busy} disabled={!f.items.length || !f.justification.trim()} onPress={() => void save()}/>}>
        {error && <Notice message={error}/>}
        {!editId && <><SectionHeading title="Pilih kandidat aset"/><Input icon="search" label="Cari kode atau nama" value={q} onChangeText={(v) => { setQ(v); setPage(1); }}/>
            {candidates.error && <Notice message={candidates.error}/>}
            {candidates.data?.data.map((a) => <View key={a.id} style={styles.block}><Toggle label={`${a.kode_barang} · ${a.nama}`} value={f.items.some((i) => i.asset.id === a.id)} disabled={busy || a.penghalang.length > 0} onChange={(on) => set({ items: on ? [...f.items, selectCandidate(a)] : f.items.filter((i) => i.asset.id !== a.id) })}/><Label tone="muted">{conditions[a.kondisi]} · {a.lokasi} · {rupiah(a.nilai_perolehan)}</Label>{a.penghalang.length > 0 && <Notice tone="info" message={a.penghalang.join("; ")}/>}</View>)}
            {candidates.data && candidates.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{candidates.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= candidates.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}</>}
        <SectionHeading title={`Usulan (${f.items.length} aset)`}/>
        <Chips label="Alasan penghapusan" value={f.reason} disabled={busy} options={(Object.keys(reasons) as (keyof typeof reasons)[]).map((value) => ({ value, label: reasons[value] }))} onChange={(reason) => set({ reason, action: actionsFor(reason).includes(f.action) ? f.action : actionsFor(reason)[0]! })}/>
        <Input label="Justifikasi" value={f.justification} multiline maxLength={4000} onChangeText={(justification) => set({ justification })}/>
        <Chips label="Usulan tindak lanjut" value={f.action} disabled={busy} options={actionsFor(f.reason).map((value) => ({ value, label: actions[value] }))} onChange={(action) => set({ action })}/>
        {f.items.map((i) => <Card key={i.asset.id}><EntityCard icon="package" title={`${i.asset.kode_barang} · ${i.asset.nama}`} meta={[`${conditions[i.asset.kondisi]} · ${i.asset.kategori} · ${i.asset.lokasi}`, `Tahun ${i.asset.tahun_perolehan} · umur ${i.asset.umur_tahun} th${i.asset.umur_teknis === null ? "" : ` / teknis ${i.asset.umur_teknis} th`}`, `${i.asset.jumlah_work_order} work order · biaya ${rupiah(i.asset.biaya_pemeliharaan)}`]} value={rupiah(i.asset.nilai_perolehan)}/>
            {i.asset.garansi.length > 0 && <><Notice tone="info" message={`Masih bergaransi: ${i.asset.garansi.map((g) => `${g.nama_berkas} hingga ${g.garansi_selesai}`).join(", ")}`}/><Toggle label="Lanjutkan meski bergaransi" value={i.warranty} disabled={busy} onChange={(warranty) => pick(i, { warranty })}/><Input label="Alasan melanjutkan" value={i.warrantyReason} maxLength={2000} onChangeText={(warrantyReason) => pick(i, { warrantyReason })}/></>}
            {i.asset.kondisi === "HILANG" && !i.asset.loss_session_id && <Chips label="Berita acara kehilangan" value={i.proof} disabled={busy} options={proofs.map((x) => ({ value: String(x.file_id), label: x.nama_berkas }))} onChange={(proof) => pick(i, { proof })}/>}
        </Card>)}
        <Chips label="Jenis lampiran berikutnya" value={kind} options={[{ value: "PENDUKUNG", label: "Pendukung" }, { value: "KEHILANGAN", label: "Berita acara kehilangan" }]} onChange={setKind}/>
        <AttachmentField api={api} label="Lampiran pendukung" kind="DISPOSAL_ATTACHMENT" files={f.files} max={20} disabled={busy} onChange={(files) => set({ files: files.map((x) => ({ ...x, jenis: f.files.find((o) => o.file_id === x.file_id)?.jenis ?? kind })) })}/>
        {f.files.length > 0 && <Label tone="muted">{f.files.map((x) => `${x.nama_berkas}: ${x.jenis === "KEHILANGAN" ? "kehilangan" : "pendukung"}`).join(" · ")}</Label>}
    </Screen>;
}

function ExecutionPanel({ d, busy, onSubmit }: { d: DisposalDetail; busy: boolean; onSubmit: (body: unknown) => void }) {
    const { api } = useSession(), today = dateWib(Date.now());
    const [date, setDate] = useState(today), [action, setAction] = useState(d.tindak_lanjut_fisik), [witnesses, setWitnesses] = useState(""), [note, setNote] = useState(""), [photos, setPhotos] = useState<Parameters<typeof executeBody>[1]["photos"][number][]>([]), [error, setError] = useState<string | null>(null), [confirm, setConfirm] = useState<unknown>(null);
    return <Card><Label strong>Catat pelaksanaan fisik</Label>{d.alasan === "HILANG" && <Notice tone="info" message="Pencatatan administratif aset Hilang memakai bukti kehilangan atau opname yang disetujui pada usulan."/>}
        <DateField label="Tanggal pelaksanaan" value={date} onChange={setDate}/>
        <Chips label="Tindak lanjut aktual" value={action} disabled={busy} options={actionsFor(d.alasan).map((value) => ({ value, label: actions[value] }))} onChange={setAction}/>
        <Input label="Nama saksi (satu per baris)" value={witnesses} multiline maxLength={2000} onChangeText={setWitnesses}/>
        <Input label="Catatan (opsional)" value={note} maxLength={2000} onChangeText={setNote}/>
        <AttachmentField api={api} label={d.alasan === "HILANG" ? "Foto bukti (opsional)" : "Foto bukti pelaksanaan (wajib)"} kind="DISPOSAL_EXECUTION_PHOTO" documents={false} files={photos} max={10} disabled={busy} onChange={setPhotos}/>
        {error && <Notice message={error}/>}
        <Button icon="archiveX" title="Catat pelaksanaan dan hapuskan aset" disabled={busy} onPress={() => { const r = executeBody(d, { date, action, witnesses, photos, note }); if ("error" in r) setError(r.error); else { setError(null); setConfirm(r.body); } }}/>
        <BottomSheet visible={confirm !== null} onClose={() => setConfirm(null)} title="Eksekusi penghapusan aset?"><View style={styles.sheet}><Label>{d.jumlah_disetujui} aset yang disetujui dikeluarkan dari inventaris aktif. Berita acara diterbitkan dari data pelaksanaan ini.</Label><Button icon="check" title="Eksekusi penghapusan" busy={busy} onPress={() => { onSubmit(confirm); setConfirm(null); }}/></View></BottomSheet>
    </Card>;
}

function ReinstatePanel({ item, rooms, busy, onSubmit }: { item: DisposalDetail["items"][number]; rooms: readonly { id: string; nama: string }[]; busy: boolean; onSubmit: (body: unknown) => void }) {
    const [room, setRoom] = useState(item.room_id_sekarang), [condition, setCondition] = useState<"BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT">("BAIK"), [reason, setReason] = useState("");
    return <View style={styles.block}><Label strong>Pulihkan {item.snapshot.kode_barang}</Label><Chips label="Lokasi pemulihan" value={room} disabled={busy} options={rooms.map((r) => ({ value: r.id, label: r.nama }))} onChange={setRoom}/><Chips label="Kondisi ditemukan" value={condition} disabled={busy} options={[{ value: "BAIK", label: "Baik" }, { value: "RUSAK_RINGAN", label: "Rusak Ringan" }, { value: "RUSAK_BERAT", label: "Rusak Berat" }]} onChange={setCondition}/><Input label="Alasan pemulihan" value={reason} maxLength={2000} onChangeText={setReason}/><Button icon="refresh" title="Pulihkan aset" compact secondary busy={busy} disabled={!room || !reason.trim()} onPress={() => onSubmit({ alasan: reason.trim(), room_id: Number(room), kondisi: condition })}/><Label tone="muted">Kode dan UUID dipertahankan; berita acara penghapusan lama tetap tersedia.</Label></View>;
}

/** MS-73 — padanan P-57: data pendukung, keputusan ke MS-54 (keputusan 20), eksekusi bersaksi & berfoto, berita acara, pemulihan (FR-21.x). */
export function DisposalDetailScreen() {
    const params = useLocalSearchParams<{ id: string }>(), did = id(params.id), { api, user, perms } = useSession(), permitted = !!did && Object.hasOwn(perms, "disposal.view");
    const [version, setVersion] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [cancel, setCancel] = useState(false), [reason, setReason] = useState(""), key = useKey();
    const r = useResource(`${user.id}:disposal:${did}:${version}`, useCallback((s: AbortSignal) => permitted ? loadDisposal(api, did, s) : Promise.resolve(null), [api, did, permitted, version]));
    const d = r.data, reinstatable = !!d && d.items.some((i) => canReinstate(d, i, user, perms));
    const opts = useResource(`${user.id}:disposal-options`, useCallback((s: AbortSignal) => reinstatable ? loadDisposalOptions(api, s) : Promise.resolve(null), [api, reinstatable]));
    if (!permitted) return denied("Detail Usulan Penghapusan");
    const write = async (path: string, body: unknown = {}) => { setBusy(true); setError(null); try { await disposalWrite(api, path, body, key([path, body])); setCancel(false); setVersion((v) => v + 1); } catch (e) { setError(e instanceof Error ? e.message : "Tindakan belum tersimpan."); } finally { setBusy(false); } };
    return <Screen title={d ? `Usulan ${d.nomor}` : "Detail Usulan Penghapusan"} subtitle="Persetujuan belum menghapuskan aset; petugas mencatat pelaksanaan setelah persetujuan akhir.">
        {r.loading && <Label tone="muted">Memuat usulan…</Label>}{r.error && <Notice message={r.error}/>}{error && <Notice message={error}/>}
        {d && <>
            <EntityCard icon="archiveX" title={d.nomor} meta={[`${reasons[d.alasan]} · ${actions[d.tindak_lanjut_fisik]}`, `Pengusul ${d.pengusul}`, `${d.jumlah_aset} diusulkan · ${d.jumlah_disetujui} disetujui`]} value={rupiah(d.total_nilai)} statuses={[{ label: statuses[d.status], tone: statusTones[d.status] }]}/>
            <Label>{d.justifikasi}</Label>{d.catatan && <Notice tone="info" message={d.catatan}/>}
            <View style={styles.wrap}>
                {canRevise(d, user, perms) && <Button icon="settings" title="Revisi dan ajukan ulang" compact onPress={() => router.push(`/penghapusan/${d.id}/ubah` as "/scan")}/>}
                {d.approval_instance_id && Object.hasOwn(perms, "approval.view") && <Button icon="badgeCheck" title={d.status === "MENUNGGU_PERSETUJUAN" ? "Buka keputusan" : "Linimasa persetujuan"} compact secondary onPress={() => router.push(`/persetujuan/${d.approval_instance_id}` as "/scan")}/>}
                <Button icon="refresh" title="Muat ulang" compact secondary onPress={() => setVersion((v) => v + 1)}/>
            </View>
            <SectionHeading title="Data pendukung aset"/>
            {d.items.map((i) => <Card key={i.id}><EntityCard icon="package" title={`${i.snapshot.kode_barang} · ${i.snapshot.nama}`} meta={[`${i.snapshot.kategori} · ${i.snapshot.lokasi} · ${conditions[i.snapshot.kondisi]}`, `Tahun ${i.snapshot.tahun_perolehan} · ${i.snapshot.jumlah_work_order} work order · biaya ${rupiah(i.snapshot.biaya_pemeliharaan)}`, i.keterangan ? `Keterangan: ${i.keterangan}` : null]} value={rupiah(i.snapshot.nilai_perolehan)} statuses={[i.disetujui === null ? { label: "Belum diputuskan", tone: "pending" } : i.disetujui ? { label: "Disetujui", tone: "success" } : { label: "Ditolak", tone: "error" }, ...(i.executed_at ? [{ label: "Dihapuskan", tone: "info" as const }] : []), ...(i.reinstated_at ? [{ label: "Dipulihkan", tone: "success" as const }] : [])]} {...(Object.hasOwn(perms, "asset.view") ? { onPress: () => router.push(`/aset/${i.asset_id}` as "/scan") } : {})}/>
                {i.snapshot.garansi.length > 0 && <Label tone="muted">Konfirmasi garansi: {i.alasan_garansi}</Label>}
                {canReinstate(d, i, user, perms) && <ReinstatePanel item={i} rooms={opts.data?.rooms ?? []} busy={busy} onSubmit={(b) => void write(`/assets/${i.asset_id}/reinstate`, b)}/>}
            </Card>)}
            <SectionHeading title="Lampiran dan bukti pelaksanaan"/>
            {[...d.lampiran, ...d.foto_pelaksanaan.map((f) => ({ ...f, nama_berkas: "Foto pelaksanaan", jenis: "FOTO" }))].map((f) => <EntityCard key={f.file_id} icon="fileText" title={f.nama_berkas} statuses={[{ label: scanLabel(f.status), tone: scanTone(f.status) }]} {...(f.url ? { onPress: () => { void Linking.openURL(f.url!).catch(() => undefined); } } : {})}/>)}
            {d.lampiran.length + d.foto_pelaksanaan.length === 0 && <Label tone="muted">Tidak ada berkas tertaut.</Label>}
            {canExecute(d, perms) && <ExecutionPanel key={d.id} d={d} busy={busy} onSubmit={(b) => void write(`/asset-disposals/${d.id}/execute`, b)}/>}
            {d.status === "SELESAI" && <Card><Label>Pelaksanaan {d.tanggal_pelaksanaan} · {d.pelaksana} · Saksi: {d.saksi?.join(", ")}</Label>
                <Button icon="fileText" title="Buka berita acara PDF" secondary onPress={() => { void disposalReportUrl(api, d.id).then((u) => Linking.openURL(u)).catch((e: unknown) => setError(e instanceof Error ? e.message : "Berita acara belum dapat dibuka.")); }}/>
                {d.report_status === "GAGAL" && Object.hasOwn(perms, "disposal.execute") && <Button icon="refresh" title="Buat ulang berita acara" secondary busy={busy} onPress={() => void write(`/asset-disposals/${d.id}/report/retry`)}/>}
                {d.report_status === "MENUNGGU" && <Notice tone="info" message="Berita acara sedang disiapkan."/>}</Card>}
            {canCancel(d, user, perms) && <Button icon="close" title="Batalkan usulan" secondary onPress={() => { setReason(""); setCancel(true); }}/>}
        </>}
        <BottomSheet visible={cancel} onClose={() => { if (!busy) setCancel(false); }} title="Batalkan usulan penghapusan?"><View style={styles.sheet}><Label>Blokir pemesanan dilepas. Usulan dan linimasa keputusan tetap menjadi arsip.</Label><Input label="Alasan pembatalan" value={reason} multiline maxLength={2000} onChangeText={setReason}/>{error && <Notice message={error}/>}<Button icon="check" title="Batalkan usulan" busy={busy} disabled={!reason.trim()} onPress={() => void write(`/asset-disposals/${d!.id}/cancel`, { alasan: reason.trim() })}/></View></BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, block: { gap: t.space.xs }, sheet: { padding: t.space.md, gap: t.space.md } });
