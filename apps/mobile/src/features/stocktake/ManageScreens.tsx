import { useCallback, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { MaterialStocktakeItem, StocktakeItem, StocktakeNewFinding } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { ExportButtons } from "../../shared/export/ExportButtons";
import { shareFromApi, shareFromUrl } from "../../shared/export/share";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, MultiChips, Notice, ProgressRing, Screen, SectionHeading, StatusBadge, Toggle, tokens as t } from "../../shared/ui";
import { dateWib } from "../../shared/wib";
import { canApprove, finalizationBlockers, findingBody, itemActions, loadDifferences, loadFindings, loadMaterialDifferences, loadOptions, loadPhotos, loadSession, loadSessions, readyToSubmit, reconcileBody, reportUrl, sessionBody, sessionWrite } from "./manage";
import type { SessionForm } from "./manage";

const STATUS = { BERJALAN: "Berjalan", MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", SELESAI: "Selesai", DIBATALKAN: "Dibatalkan" } as const;
const RESULT: Readonly<Record<string, string>> = { BELUM_DIPERIKSA: "Belum Diperiksa", DITEMUKAN: "Ditemukan", SALAH_LOKASI: "Salah Lokasi", PERBEDAAN_KONDISI: "Perbedaan Kondisi", TIDAK_DITEMUKAN: "Tidak Ditemukan", DIPINJAM: "Dipinjam" };
const COND: Readonly<Record<string, string>> = { BAIK: "Baik", RUSAK_RINGAN: "Rusak Ringan", RUSAK_BERAT: "Rusak Berat", HILANG: "Hilang" };
type Diffs = Awaited<ReturnType<typeof loadDifferences>> | Awaited<ReturnType<typeof loadMaterialDifferences>>;
const useKey = () => { const r = useRef<{ b: string; k: string } | null>(null); return (b: unknown) => { const s = JSON.stringify(b); if (r.current?.b !== s) r.current = { b: s, k: randomUUID() }; return r.current.k; }; };

/** Mode pengelola MS-18 — padanan P-47: semua sesi berstatus, tombol Buat Sesi (MS-65), ketuk → Rekonsiliasi (MS-66). */
export function ManagerSessionList({ onMine }: { onMine?: (() => void) | undefined }) {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "", perms = state.kind === "READY" ? state.session.permissions : {};
    const [status, setStatus] = useState(""), [page, setPage] = useState(1), [version, setVersion] = useState(0);
    const r = useResource(`${account}:audit-sessions:${status}:${page}:${version}`, useCallback((sig: AbortSignal) => loadSessions(api, { page, status }, sig), [api, page, status, version]));
    return <Screen title="Stock Opname" subtitle="Daftar sesi opname beserta status dan progresnya. Rekonsiliasi dibuka setelah hasil difinalisasi." {...(Object.hasOwn(perms, "audit.manage") ? { footer: <Button icon="plus" title="Buat sesi opname" onPress={() => router.push("/opname/baru" as "/scan")}/> } : {})}>
        {onMine && <Toggle label="Hanya penugasan saya" value={false} onChange={onMine}/>}
        <Chips label="Status" value={status} options={[{ value: "", label: "Semua" }, ...Object.entries(STATUS).map(([value, label]) => ({ value, label }))]} onChange={(v) => { setStatus(v); setPage(1); }}/>
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat sesi…</Label>}
        {r.data?.data.map((s) => <View key={s.id} style={styles.row}><ProgressRing value={s.diperiksa} max={Math.max(1, s.target)} label={`${s.nama}: ${s.diperiksa} dari ${s.target} diperiksa`}/><View style={styles.flex}><EntityCard icon="clipboardCheck" title={s.nama} meta={[s.nomor, `${s.domain === "ASET" ? "Aset" : "Bahan"} · ${s.periode_mulai} – ${s.periode_selesai}`]} statuses={[{ label: STATUS[s.status], tone: s.status === "SELESAI" ? "success" : s.status === "MENUNGGU_PERSETUJUAN" ? "warning" : s.status === "DIBATALKAN" ? "pending" : "info" }]} onPress={() => router.push(`/opname/${s.id}/rekonsiliasi` as "/scan")}/></View></View>)}
        {r.data && !r.data.data.length && <EmptyState illustration="empty" title="Belum ada sesi" description="Tidak ada sesi opname pada saringan ini."/>}
        {r.data && r.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{r.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= r.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
        <Button icon="refresh" title="Muat ulang" secondary onPress={() => setVersion((v) => v + 1)}/>
    </Screen>;
}

/** MS-65 — padanan P-48: domain, periode, cakupan (sekolah/gedung/ruangan/kategori), pelaksana (FR-13.1). */
export function SessionCreateScreen() {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "", permitted = state.kind === "READY" && Object.hasOwn(state.session.permissions, "audit.manage");
    const today = dateWib(Date.now());
    const [f, setF] = useState<SessionForm>({ domain: "ASET", name: "", start: today, end: today, scope: "SEKOLAH", target: "", category: "", people: [] }), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), key = useKey();
    const opts = useResource(`${account}:stocktake-options`, useCallback((s: AbortSignal) => permitted ? loadOptions(api, s) : Promise.resolve(null), [api, permitted]));
    if (!permitted) return <Screen title="Buat Sesi Opname"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin membuat sesi opname."/></Screen>;
    const set = (p: Partial<SessionForm>) => { setError(null); setF({ ...f, ...p }); };
    const o = opts.data, choices = !o ? [] : f.scope === "GEDUNG" ? o.buildings : f.scope === "RUANGAN" ? o.rooms : f.scope === "KATEGORI" ? o.categories : [];
    const save = async () => { const r = sessionBody(f); if ("error" in r) { setError(r.error); return; } setBusy(true); setError(null); try { const s = await sessionWrite(api, "/audit-sessions", r.body, key(r.body)); router.replace(`/opname/${s.id}/rekonsiliasi` as "/scan"); } catch (e) { setError(e instanceof Error ? e.message : "Sesi belum tersimpan."); } finally { setBusy(false); } };
    return <Screen title="Buat Sesi Opname" subtitle="Satu sesi memeriksa satu domain. Target dan saldo/kondisi awal dibekukan saat sesi dibuat." footer={<Button icon="check" title="Buat sesi" busy={busy} onPress={() => void save()}/>}>
        {error && <Notice message={error}/>}{opts.error && <Notice message={opts.error}/>}
        <Chips label="Domain" value={f.domain} options={[{ value: "ASET", label: "Aset" }, { value: "BAHAN", label: "Bahan" }]} onChange={(v) => set({ domain: v, scope: v === "BAHAN" && f.scope === "KATEGORI" ? "SEKOLAH" : f.scope, category: "" })}/>
        <Input label="Nama sesi" value={f.name} maxLength={200} onChangeText={(v) => set({ name: v })}/>
        <DateField label="Periode mulai" value={f.start} min={today} onChange={(v) => set({ start: v, end: v > f.end ? v : f.end })}/><DateField label="Periode selesai" value={f.end} min={f.start} onChange={(v) => set({ end: v })}/>
        <Chips label="Cakupan" value={f.scope} options={[{ value: "SEKOLAH", label: "Seluruh sekolah" }, { value: "GEDUNG", label: "Gedung" }, { value: "RUANGAN", label: "Ruangan" }, ...(f.domain === "ASET" ? [{ value: "KATEGORI" as const, label: "Kategori" }] : [])]} onChange={(v) => set({ scope: v, target: "" })}/>
        {f.scope !== "SEKOLAH" && <Chips label="Pilih cakupan" value={f.target} options={choices.map((c) => ({ value: c.id, label: c.nama }))} onChange={(v) => set({ target: v })}/>}
        {f.domain === "ASET" && f.scope !== "KATEGORI" && o && <Chips label="Batasi kategori (opsional)" value={f.category} options={[{ value: "", label: "Semua kategori" }, ...o.categories.map((c) => ({ value: c.id, label: c.nama }))]} onChange={(v) => set({ category: v })}/>}
        {o && <MultiChips label="Pelaksana (1–20)" value={[...f.people]} options={o.people.map((p) => ({ value: p.id, label: p.nama }))} onChange={(v) => set({ people: v })}/>}
    </Screen>;
}

function ItemCard({ i, editable, busy, onSave }: { i: StocktakeItem; editable: boolean; busy: boolean; onSave: (action: string, note: string) => void }) {
    const actions = itemActions(i), [action, setAction] = useState(i.tindakan ?? actions[0].value), [note, setNote] = useState(i.keterangan ?? "");
    return <Card><EntityCard icon="package" title={i.nama} meta={[i.kode_barang, `Data: ${i.lokasi_sekarang || i.lokasi_sistem} · ${COND[i.kondisi_sekarang]}`]} statuses={[{ label: RESULT[i.hasil] ?? i.hasil, tone: i.hasil === "TIDAK_DITEMUKAN" ? "error" : "warning" }, ...(i.keterangan ? [{ label: "Berketerangan", tone: "success" as const }] : [])]}/>
        <Label tone="muted">Fisik: {i.lokasi_aktual ?? "tidak ditemukan"}{i.kondisi_aktual ? ` · ${COND[i.kondisi_aktual]}` : ""}</Label>
        {editable ? <><Chips label="Tindakan" value={action} options={actions} onChange={setAction}/><Input label="Keterangan" value={note} multiline maxLength={2000} onChangeText={setNote}/><Button icon="check" title="Simpan keterangan" compact busy={busy} disabled={!note.trim()} onPress={() => onSave(action, note)}/></> : i.keterangan && <Label>{i.keterangan}</Label>}
    </Card>;
}
function FindingCard({ f, editable, busy, rooms, categories, onSave }: { f: StocktakeNewFinding; editable: boolean; busy: boolean; rooms: readonly { id: string; nama: string }[]; categories: readonly { id: string; nama: string }[]; onSave: (body: unknown) => void }) {
    const p = f.pendaftaran, [v, setV] = useState({ name: p?.nama ?? f.deskripsi, category: String(p?.category_id ?? f.category_id), room: String(p?.room_id ?? f.room_id), condition: p?.kondisi ?? f.kondisi, year: p?.tahun_perolehan?.toString() ?? "", source: p?.sumber_perolehan ?? "LAINNYA", value: p?.nilai_perolehan?.toString() ?? "", note: p?.keterangan ?? "" }), [error, setError] = useState<string | null>(null);
    if (!editable) return <EntityCard icon="plus" title={`Temuan: ${p?.nama ?? f.deskripsi}`} meta={[p?.keterangan ?? "Data pendaftaran belum lengkap"]} statuses={[{ label: p ? "Lengkap" : "Belum lengkap", tone: p ? "success" : "warning" }]}/>;
    return <Card><Text style={styles.strong}>Temuan baru: {f.deskripsi}</Text>
        <Input label="Nama aset" value={v.name} onChangeText={(name) => setV({ ...v, name })}/><Chips label="Kategori" value={v.category} options={categories.map((c) => ({ value: c.id, label: c.nama }))} onChange={(category) => setV({ ...v, category })}/>
        <Chips label="Ruangan" value={v.room} options={rooms.map((r) => ({ value: r.id, label: r.nama }))} onChange={(room) => setV({ ...v, room })}/><Chips label="Kondisi" value={v.condition} options={Object.entries(COND).map(([value, label]) => ({ value: value as typeof v.condition, label }))} onChange={(condition) => setV({ ...v, condition })}/>
        <Input label="Tahun perolehan" value={v.year} keyboardType="number-pad" maxLength={4} onChangeText={(year) => setV({ ...v, year })}/><Chips label="Sumber" value={v.source} options={[{ value: "PEMBELIAN", label: "Pembelian" }, { value: "HIBAH", label: "Hibah" }, { value: "BANTUAN_PEMERINTAH", label: "Bantuan Pemerintah" }, { value: "SUMBANGAN", label: "Sumbangan" }, { value: "LAINNYA", label: "Lainnya" }]} onChange={(source) => setV({ ...v, source })}/>
        <Input label="Nilai perolehan (opsional)" value={v.value} keyboardType="decimal-pad" onChangeText={(value) => setV({ ...v, value })}/><Input label="Keterangan" value={v.note} multiline onChangeText={(note) => setV({ ...v, note })}/>
        {error && <Notice message={error}/>}<Button icon="check" title="Simpan temuan" compact busy={busy} onPress={() => { const r = findingBody(v); if ("error" in r) setError(r.error); else { setError(null); onSave(r.body); } }}/>
    </Card>;
}
function MaterialCard({ i, editable, busy, onSave }: { i: MaterialStocktakeItem; editable: boolean; busy: boolean; onSave: (note: string) => void }) {
    const [note, setNote] = useState(i.keterangan ?? "");
    return <Card><EntityCard icon="boxes" title={`${i.nama} / ${i.satuan_simbol}`} meta={[i.lokasi, `Snapshot ${i.saldo_sistem} · fisik ${i.jumlah_fisik ?? "—"}`]} statuses={[{ label: `Selisih ${i.selisih ?? "—"}`, tone: i.selisih ? "warning" : "success" }, ...(i.perlu_hitung_ulang ? [{ label: "Perlu hitung ulang", tone: "error" as const }] : [])]}/>
        {editable && i.selisih !== 0 ? <><Input label="Keterangan selisih" value={note} multiline maxLength={2000} onChangeText={setNote}/><Button icon="check" title="Simpan keterangan" compact busy={busy} disabled={!note.trim()} onPress={() => onSave(note)}/></> : i.keterangan && <Label>{i.keterangan}</Label>}
    </Card>;
}

/** MS-66 — padanan P-49/P-50: progres & finalisasi, rekonsiliasi selisih Aset/Bahan dan temuan baru, kirim, setujui/kembalikan (FR-13.3). */
export function ReconciliationScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const perms = state.kind === "READY" ? state.session.permissions : {}, can = (p: string) => Object.hasOwn(perms, p), valid = /^[1-9]\d*$/.test(id) && (can("audit.manage") || can("audit.approve"));
    const [version, setVersion] = useState(0), [page, setPage] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [dialog, setDialog] = useState<"submit" | "SETUJU" | "TOLAK" | "cancel" | null>(null), [note, setNote] = useState(""), key = useKey();
    const s = useResource(`${account}:audit:${id}:${version}`, useCallback((sig: AbortSignal) => valid ? loadSession(api, id, sig) : Promise.resolve(null), [api, id, valid, version]));
    const d = s.data, asset = d?.domain === "ASET";
    const items = useResource(`${account}:audit-diff:${id}:${page}:${version}:${d?.domain ?? ""}`, useCallback((sig: AbortSignal): Promise<Diffs | null> => !d ? Promise.resolve(null) : asset ? loadDifferences(api, id, page, sig) : loadMaterialDifferences(api, id, page, sig), [api, id, page, d, asset]));
    const findings = useResource(`${account}:audit-find:${id}:${version}:${asset}`, useCallback((sig: AbortSignal) => asset ? loadFindings(api, id, 1, sig) : Promise.resolve(null), [api, id, asset, version]));
    const opts = useResource(`${account}:stocktake-options`, useCallback((sig: AbortSignal) => asset && can("audit.manage") ? loadOptions(api, sig) : Promise.resolve(null), [api, asset]));
    const photos = useResource(`${account}:audit-photos:${id}:${version}`, useCallback((sig: AbortSignal) => valid ? loadPhotos(api, id, sig) : Promise.resolve(null), [api, id, valid, version]));
    if (!valid || state.kind !== "READY") return <Screen title="Rekonsiliasi Opname"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin meninjau rekonsiliasi."/></Screen>;
    const write = async (path: string, body: unknown = {}, method: "post" | "put" = "post") => { setBusy(true); setError(null); try { await sessionWrite(api, `/audit-sessions/${id}/${path}`, body, key([path, body]), method); setDialog(null); setVersion((v) => v + 1); } catch (e) { setError(e instanceof Error ? e.message : "Tindakan belum tersimpan."); } finally { setBusy(false); } };
    const editable = !!d && can("audit.manage") && d.status === "BERJALAN" && !!d.finalized_at, approval = d ? canApprove(d, state.session.user, perms) : "NO", blockers = d ? finalizationBlockers(d, dateWib(Date.now())) : [];
    return <Screen title={d ? `Rekonsiliasi ${d.nama}` : "Rekonsiliasi Opname"} subtitle="Penyesuaian lokasi, kondisi, saldo, dan pendaftaran temuan baru diterapkan setelah Pimpinan menyetujui.">
        {s.loading && <Label tone="muted">Memuat sesi…</Label>}{s.error && <Notice message={s.error}/>}{error && <Notice message={error}/>}
        {d && <>
            <View style={styles.row}><ProgressRing large value={d.diperiksa} max={Math.max(1, d.target)} label={`${d.diperiksa} dari ${d.target} diperiksa`}/><View style={styles.flex}><EntityCard icon="clipboardCheck" title={d.nama} meta={[d.nomor, `${d.periode_mulai} – ${d.periode_selesai}`]} statuses={[{ label: STATUS[d.status], tone: d.status === "SELESAI" ? "success" : d.status === "MENUNGGU_PERSETUJUAN" ? "warning" : d.status === "DIBATALKAN" ? "pending" : "info" }, { label: `${d.selisih} selisih`, tone: d.selisih ? "warning" : "success" }]}/></View></View>
            {d.catatan_keputusan && <Notice tone="info" message={`Catatan keputusan: ${d.catatan_keputusan}`}/>}
            {d.lokasi.map((l) => <View key={l.id} style={styles.row}><ProgressRing value={l.diperiksa} max={Math.max(1, l.target)} format="fraction" label={`${l.nama}: ${l.diperiksa} dari ${l.target}`}/><Text style={styles.flex}>{l.nama}</Text>{l.selesai && <StatusBadge label="Selesai" tone="success"/>}</View>)}
            {d.status === "BERJALAN" && !d.finalized_at && can("audit.manage") && <Card>{blockers.map((b) => <Label key={b} tone="muted">• {b}</Label>)}<Button icon="checkCircle" title="Finalisasi hasil pemeriksaan" busy={busy} disabled={blockers.length > 0} onPress={() => void write("finalize")}/></Card>}
            {d.finalized_at && <><SectionHeading title={asset ? "Selisih aset" : "Selisih bahan"}/>
                {items.data?.data.length === 0 && <Label tone="muted">Tidak ada selisih pada halaman ini.</Label>}
                {asset ? (items.data?.data as StocktakeItem[] | undefined)?.map((i) => <ItemCard key={`${i.id}:${i.keterangan ?? ""}`} i={i} editable={editable} busy={busy} onSave={(action, n) => { const r = reconcileBody(i, action, n); if ("error" in r) setError(r.error); else void write(`items/${i.id}/reconcile`, r.body, "put"); }}/>)
                    : (items.data?.data as MaterialStocktakeItem[] | undefined)?.map((i) => <MaterialCard key={`${i.id}:${i.revision}`} i={i} editable={editable} busy={busy} onSave={(n) => void write(`material-items/${i.id}/reconcile`, { keterangan: n.trim(), revision: i.revision }, "put")}/>)}
                {items.data && items.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{items.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= items.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
                {asset && (findings.data?.data.length ?? 0) > 0 && <><SectionHeading title="Temuan baru"/>{findings.data!.data.map((f) => <FindingCard key={`${f.id}:${f.keterangan ?? ""}`} f={f} editable={editable} busy={busy} rooms={opts.data?.rooms ?? []} categories={opts.data?.categories ?? []} onSave={(b) => void write(`findings/${f.id}`, b, "put")}/>)}</>}
            </>}
            {editable && <Card><Label>{d.belum_dilengkapi} selisih dan {d.temuan_belum_dilengkapi} temuan belum lengkap; {d.foto_tertunda} foto belum siap.</Label><Button icon="send" title="Kirim ke Pimpinan" disabled={busy || !readyToSubmit(d)} onPress={() => { setNote(""); setDialog("submit"); }}/></Card>}
            {approval === "SELF" && <Notice tone="info" message="Pembuat dan pelaksana tidak dapat menyetujui sesinya sendiri."/>}
            {approval === "YES" && <View style={styles.row}><View style={styles.flex}><Button icon="checkCircle" title="Setujui" onPress={() => { setNote(""); setDialog("SETUJU"); }}/></View><View style={styles.flex}><Button icon="arrowLeft" title="Kembalikan" secondary onPress={() => { setNote(""); setDialog("TOLAK"); }}/></View></View>}
            {d.finalized_at && <ExportButtons formats={["xlsx"]} label="Ekspor hasil" onExport={(format) => shareFromApi(api, `/audit-sessions/${id}/export`, {}, d.nomor, format)}/>}
            {d.status === "SELESAI" && <Button icon="arrowRight" title="Simpan berita acara PDF" secondary onPress={() => { void reportUrl(api, id).then((u) => shareFromUrl(u, `berita-acara-${d.nomor}.pdf`)).catch((e: unknown) => setError(e instanceof Error ? e.message : "Berita acara belum dapat disimpan.")); }}/>}
            {d.status === "SELESAI" && <Button icon="fileText" title="Buka berita acara PDF" secondary onPress={() => { void reportUrl(api, id).then((u) => Linking.openURL(u)).catch((e: unknown) => setError(e instanceof Error ? e.message : "Berita acara belum dapat dibuka.")); }}/>}
            {d.status === "SELESAI" && d.report_status === "GAGAL" && can("audit.manage") && <Button icon="refresh" title="Buat ulang berita acara" secondary busy={busy} onPress={() => void write("report/retry")}/>}
            {!["SELESAI", "DIBATALKAN"].includes(d.status) && can("audit.manage") && state.session.user.role_kode === "R-01" && <Button icon="close" title="Batalkan sesi" secondary onPress={() => { setNote(""); setDialog("cancel"); }}/>}
            {(photos.data?.length ?? 0) > 0 && <><SectionHeading title="Foto bukti"/>{photos.data!.map((p) => <EntityCard key={p.file_id} icon="fileText" title={`Foto ${p.item_id ? "selisih" : "temuan"}`} statuses={[{ label: p.status === "CLEAN" ? "Terverifikasi" : p.status === "PENDING" ? "Sedang diperiksa" : "Tidak dapat dipakai", tone: p.status === "CLEAN" ? "success" : p.status === "PENDING" ? "pending" : "error" }]} {...(p.url ? { onPress: () => { void Linking.openURL(p.url!).catch(() => undefined); } } : {})}/>)}</>}
        </>}
        <BottomSheet visible={dialog !== null} onClose={() => setDialog(null)} title={dialog === "submit" ? "Kirim ke Pimpinan?" : dialog === "SETUJU" ? "Setujui hasil opname?" : dialog === "TOLAK" ? "Kembalikan ke Petugas?" : "Batalkan sesi?"}><View style={styles.sheet}>
            <Label>{dialog === "SETUJU" ? "Penyesuaian diterapkan dan sesi selesai; tidak dapat diubah lagi." : dialog === "TOLAK" ? "Hasil tetap tersimpan dan Petugas dapat memperbaiki rekonsiliasi." : dialog === "cancel" ? "Hasil pemeriksaan tetap menjadi arsip; data tidak disesuaikan." : "Petugas tidak dapat mengubah hasil selama menunggu keputusan."}</Label>
            {dialog !== "submit" && <Input label={dialog === "cancel" ? "Alasan pembatalan" : "Catatan"} value={note} multiline maxLength={2000} onChangeText={setNote}/>}
            {error && <Notice message={error}/>}
            <Button icon="check" title="Konfirmasi" busy={busy} disabled={dialog !== "submit" && dialog !== "SETUJU" && !note.trim()} onPress={() => void (dialog === "submit" ? write("submit") : dialog === "cancel" ? write("cancel", { alasan: note }) : write("approve", { keputusan: dialog, ...(note.trim() ? { catatan: note.trim() } : {}) }))}/>
        </View></BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, flex: { flex: 1, minWidth: 0 }, strong: { fontSize: t.font.body, fontWeight: "600", color: t.color.heading }, sheet: { padding: t.space.md, gap: t.space.md } });
