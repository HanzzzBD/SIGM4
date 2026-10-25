import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { FineDetail, LoanCheckinBody, LoanCheckoutBody } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, Notice, Screen, SectionHeading, StatusBadge, Toggle, tokens as t } from "../../shared/ui";
import { dateWib, rangeLabel, rupiah } from "../../shared/wib";
import { checkin, checkout, fineAction, loadBorrowers, loadLoan, loadReady, previewReturn, resolveUnit } from "./api";
import { CONDITION_LABEL, RETURN_CONDITIONS, checkinBody, checkoutBody, fineActionBody, fineActions, needsConditionNote, needsSubstitutionReason } from "./model";
import type { DirectLoan, FineAction, HandoverUnit, ReturnRow } from "./model";
import { Photos } from "./DetailScreens";
import { EvidencePhotos, SignaturePad, UnitCode } from "./evidence";

/** Kunci idempoten per isian: ketuk ganda dengan isian sama tidak menghasilkan dua transaksi (ID-01). */
function useIntent() { const ref = useRef<{ body: string; key: string } | null>(null); return (body: unknown) => { const text = JSON.stringify(body); if (ref.current?.body !== text) ref.current = { body: text, key: randomUUID() }; return ref.current.key; }; }
const offlineNotice = "Transaksi memerlukan koneksi dan tidak pernah diantrekan (MOB-OFF-05).";

/** MS-50 — padanan P-33: reservasi aset yang siap diserahkan hari ini; peminjaman langsung bagi `loan.direct`. */
export function HandoverQueueScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, permitted = Object.hasOwn(permissions, "loan.manage");
    const [page, setPage] = useState(1);
    const resource = useResource(`${account}:ready:${page}`, useCallback((signal: AbortSignal) => permitted ? loadReady(api, page, signal) : Promise.resolve(null), [api, page, permitted]));
    if (!permitted) return <Screen title="Antrean Serah Terima"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin mengelola peminjaman."/></Screen>;
    return <Screen title="Antrean Serah Terima" subtitle="Reservasi aset yang sudah disetujui dan dijadwalkan hari ini. Verifikasi unit fisik sebelum menyerahkan.">
        {Object.hasOwn(permissions, "loan.direct") && <Button icon="plus" title="Peminjaman langsung" secondary onPress={() => router.push("/peminjaman/serah-terima/langsung" as "/scan")}/>}
        {resource.loading && <Label tone="muted">Memuat antrean…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {resource.data?.data.length === 0 && <EmptyState illustration="success" title="Tidak ada yang menunggu" description="Reservasi yang dijadwalkan hari ini akan muncul di sini."/>}
        {resource.data?.data.map((r) => <EntityCard key={r.id} icon="handshake" title={r.peminjam.nama} meta={[r.nomor, rangeLabel(r.waktu_mulai, r.waktu_selesai)]} statuses={[{ label: r.lokasi_penggunaan ?? "Lokasi belum diisi", tone: "info" }]} value={`${r.unit.length}`} onPress={() => router.push(`/peminjaman/serah-terima/${r.id}` as "/scan")}/>)}
        {resource.data && resource.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= resource.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
    </Screen>;
}

const fresh = (allocated?: string, expected?: string): HandoverUnit => ({ key: randomUUID(), ...(allocated ? { allocated } : {}), ...(expected ? { expected } : {}), code: "", resolved: null, reason: "", photos: [], condition: "BAIK", note: "" });
/** MS-10 — Serah Terima (FR-09.1, UX §7.6.6): pindai/verifikasi unit, kondisi + foto, penerima, tanda tangan, tinjau, Serahkan. */
export function HandoverScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const direct = id === "langsung";
    const { state, api, offlineOnly } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, permitted = Object.hasOwn(permissions, direct ? "loan.direct" : "loan.manage") && (direct || /^[1-9]\d*$/.test(id));
    const [units, setUnits] = useState<HandoverUnit[] | null>(direct ? [fresh()] : null);
    const ready = useResource(`${account}:ready-one:${id}`, useCallback(async (signal: AbortSignal) => {
        if (!permitted || direct) return null;
        const row = (await loadReady(api, 1, signal, id)).data.find((r) => r.id === id) ?? null;
        if (row) { setUnits((u) => u ?? row.unit.map((x) => fresh(x.asset_id, x.kode_barang))); setRecipient((v) => v || row.peminjam.nama); }
        return row;
    }, [api, id, permitted, direct]));
    const [recipient, setRecipient] = useState(""), [proxy, setProxy] = useState(false), [signature, setSignature] = useState<number | null>(null);
    const [directLoan, setDirectLoan] = useState<DirectLoan>({ borrower: "", dueDate: dateWib(Date.now()), dueTime: "17:00", purpose: "", location: "", reason: "" }), [who, setWho] = useState("");
    const borrowers = useResource(`${account}:borrowers:${who}`, useCallback((signal: AbortSignal) => direct && permitted ? loadBorrowers(api, who, signal) : Promise.resolve(null), [api, who, direct, permitted]));
    const [review, setReview] = useState<LoanCheckoutBody | null>(null), [verifying, setVerifying] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const intent = useIntent();
    if (!permitted) return <Screen title="Serah Terima"><EmptyState illustration="noAccess" title="Tidak dapat dibuka" description="Anda tidak memiliki izin atau tautan reservasi tidak sah."/></Screen>;
    const row = ready.data, list = units ?? [];
    const update = (key: string, patch: Partial<HandoverUnit>) => setUnits((old) => (old ?? []).map((u) => u.key === key ? { ...u, ...patch } : u));
    const verify = async (u: HandoverUnit) => { setVerifying(u.key); setError(null); try { const found = await resolveUnit(api, u.code.trim()); update(u.key, { resolved: found, condition: found.kondisi === "RUSAK_RINGAN" ? "RUSAK_RINGAN" : "BAIK" }); } catch (e) { setError(e instanceof Error ? e.message : "Kode tidak dapat diverifikasi."); } finally { setVerifying(null); } };
    const toReview = () => { const result = checkoutBody({ reservationId: direct ? null : id, direct: direct ? directLoan : null, units: list, recipient, proxy, signature }); if ("error" in result) setError(result.error); else { setError(null); setReview(result.body); } };
    const send = async () => { if (!review || busy) return; setBusy(true); setError(null); try { const loan = await checkout(api, review, intent(review)); router.replace(`/peminjaman/${loan.id}` as "/scan"); } catch (e) { setError(e instanceof Error ? e.message : "Serah terima gagal. Coba lagi dengan isian yang sama."); } finally { setBusy(false); } };
    return <Screen title={direct ? "Peminjaman Langsung" : "Serah Terima"} subtitle="Tanggung jawab tetap pada peminjam meski diwakilkan (BR-033). Foto dan tanda tangan diunggah lebih dulu; transaksi tidak tercatat tanpanya."
        footer={review ? <View style={styles.row}><View style={styles.flex}><Button icon="arrowLeft" title="Kembali" secondary disabled={busy} onPress={() => setReview(null)}/></View><View style={styles.flex}><Button icon="handshake" title="Serahkan" busy={busy} disabled={offlineOnly} onPress={() => void send()}/></View></View> : <Button icon="arrowRight" title="Tinjau serah terima" disabled={offlineOnly || verifying !== null} onPress={toReview}/>}>
        {offlineOnly && <Notice message={offlineNotice}/>}{error && <Notice message={error}/>}
        {ready.loading && !direct && <Label tone="muted">Memuat reservasi…</Label>}{ready.error && <Notice message={ready.error}/>}
        {!direct && ready.data === null && !ready.loading && !ready.error && <Notice tone="info" message="Reservasi ini tidak ada di antrean serah terima hari ini."/>}
        {review ? <>
            <EntityCard icon="handshake" title={direct ? borrowers.data?.data.find((b) => b.id === directLoan.borrower)?.nama ?? "Peminjam" : row?.peminjam.nama ?? ""} meta={[`Diterima ${recipient}${proxy ? " (kuasa)" : ""}`, `Jatuh tempo ${formatTime(review.langsung?.tanggal_jatuh_tempo ?? row?.waktu_selesai ?? "")}`]} value={`${review.unit.length}`}/>
            {list.map((u) => <Label key={u.key}>{u.resolved?.kode_barang} · {CONDITION_LABEL[u.condition]} · {u.photos.length} foto{u.reason ? ` · Substitusi: ${u.reason}` : ""}</Label>)}
            <Notice tone="info" message="Tarif denda dan batas yang berlaku disimpan untuk peminjaman ini."/>
        </> : <>
            {direct ? <Card>
                <Notice tone="info" message="Peminjaman langsung melewati persetujuan; alasan dicatat dalam jejak kepatuhan."/>
                <Input icon="search" label="Cari peminjam" value={who} onChangeText={setWho}/>
                {borrowers.data && <Chips label="Peminjam aktif" value={directLoan.borrower} options={borrowers.data.data.map((b) => ({ value: b.id, label: `${b.nama} · ${b.role}` }))} onChange={(v) => { setDirectLoan({ ...directLoan, borrower: v }); setRecipient(borrowers.data?.data.find((b) => b.id === v)?.nama ?? recipient); }}/>}
                <View style={styles.row}><View style={styles.flex}><DateField label="Jatuh tempo" value={directLoan.dueDate} min={dateWib(Date.now())} onChange={(v) => setDirectLoan({ ...directLoan, dueDate: v })}/></View><View style={styles.time}><Input label="Jam" value={directLoan.dueTime} maxLength={5} onChangeText={(v) => setDirectLoan({ ...directLoan, dueTime: v })}/></View></View>
                <Input label="Keperluan" value={directLoan.purpose} maxLength={1000} onChangeText={(v) => setDirectLoan({ ...directLoan, purpose: v })}/>
                <Input label="Lokasi penggunaan" value={directLoan.location} maxLength={200} onChangeText={(v) => setDirectLoan({ ...directLoan, location: v })}/>
                <Input label="Alasan peminjaman langsung" value={directLoan.reason} maxLength={500} onChangeText={(v) => setDirectLoan({ ...directLoan, reason: v })}/>
            </Card> : row && <EntityCard icon="calendarCheck" title={row.peminjam.nama} meta={[row.nomor, `Jatuh tempo ${formatTime(row.waktu_selesai)}`]}/>}
            {list.map((u, i) => <Card key={u.key}>
                <Text style={styles.strong}>Unit {i + 1}{u.expected ? ` · alokasi ${u.expected}` : ""}</Text>
                <UnitCode label="Kode aset atau QR" value={u.code} disabled={verifying === u.key} onChange={(code) => update(u.key, { code, resolved: null, photos: [] })}/>
                <Button icon="check" title="Verifikasi unit" secondary compact busy={verifying === u.key} disabled={!u.code.trim() || verifying !== null} onPress={() => void verify(u)}/>
                {u.resolved && <StatusBadge label={u.resolved.layak ? `${u.resolved.kode_barang} layak` : "Unit tidak layak atau masih dipinjam"} tone={u.resolved.layak ? "success" : "error"}/>}
                {needsSubstitutionReason(u) && <><Notice tone="info" message="Unit berbeda dari alokasi; substitusi hanya untuk kategori yang sama."/><Input label="Alasan substitusi" value={u.reason} maxLength={500} onChangeText={(reason) => update(u.key, { reason })}/></>}
                <Chips label="Kondisi awal" value={u.condition} options={[{ value: "BAIK", label: "Baik" }, { value: "RUSAK_RINGAN", label: "Rusak Ringan" }]} onChange={(condition) => update(u.key, { condition })}/>
                {needsConditionNote(u) && <Input label="Catatan kondisi awal" value={u.note} maxLength={500} onChangeText={(note) => update(u.key, { note })}/>}
                <EvidencePhotos api={api} label="Foto kondisi awal" ids={u.photos} disabled={!u.resolved?.layak} onChange={(photos) => update(u.key, { photos })}/>
                {direct && list.length > 1 && <Button icon="close" title="Hapus unit" secondary compact onPress={() => setUnits(list.filter((x) => x.key !== u.key))}/>}
            </Card>)}
            {direct && list.length < 100 && <Button icon="plus" title="Tambah unit" secondary onPress={() => setUnits([...list, fresh()])}/>}
            <Toggle label="Diwakilkan kepada penerima kuasa" value={proxy} onChange={setProxy}/>
            <Input label={proxy ? "Nama penerima kuasa" : "Nama penerima"} value={recipient} maxLength={200} onChangeText={setRecipient}/>
            <SignaturePad api={api} disabled={offlineOnly} onSaved={setSignature}/>
        </>}
    </Screen>;
}

/** MS-11 — Pengembalian (FR-09.2, UX §7.6.6): pembanding kondisi awal, kondisi kembali, foto, pratinjau denda, Konfirmasi. */
export function ReturnScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { state, api, offlineOnly } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permitted = state.kind === "READY" && Object.hasOwn(state.session.permissions, "loan.manage") && /^[1-9]\d*$/.test(id);
    const [rows, setRows] = useState<ReturnRow[] | null>(null);
    const loan = useResource(`${account}:loan-return:${id}`, useCallback(async (signal: AbortSignal) => {
        if (!permitted) return null; const l = await loadLoan(api, id, signal);
        setRows((r) => r ?? l.unit.filter((u) => u.status_kembali === "BELUM_KEMBALI").map((u) => ({ id: u.id, selected: true, code: "", condition: "BAIK", photos: [], note: "", negligence: false })));
        return l;
    }, [api, id, permitted]));
    const [review, setReview] = useState<{ body: LoanCheckinBody; preview: Awaited<ReturnType<typeof previewReturn>> } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [done, setDone] = useState(false);
    const intent = useIntent();
    if (!permitted) return <Screen title="Pengembalian"><EmptyState illustration="noAccess" title="Tidak dapat dibuka" description="Anda tidak memiliki izin mengelola peminjaman."/></Screen>;
    const l = loan.data, list = rows ?? [], update = (rowId: string, patch: Partial<ReturnRow>) => setRows(list.map((r) => r.id === rowId ? { ...r, ...patch } : r));
    const inspect = async () => { const result = checkinBody(list); if ("error" in result) { setError(result.error); return; } setBusy(true); setError(null); try { setReview({ body: result.body, preview: await previewReturn(api, id, result.body) }); } catch (e) { setError(e instanceof Error ? e.message : "Pengembalian belum dapat ditinjau."); } finally { setBusy(false); } };
    const send = async () => { if (!review || busy) return; setBusy(true); setError(null); try { await checkin(api, id, review.body, intent(review.body)); setDone(true); } catch (e) { setError(e instanceof Error ? e.message : "Pengembalian gagal. Coba lagi dengan isian yang sama."); } finally { setBusy(false); } };
    if (done) return <Screen title="Pengembalian"><EmptyState illustration="success" title="Pengembalian tercatat" description="Kondisi dan ketersediaan unit telah diperbarui."/><Button icon="arrowRight" title="Buka detail peminjaman" onPress={() => router.replace(`/peminjaman/${id}` as "/scan")}/></Screen>;
    return <Screen title={l ? `Pengembalian ${l.nomor}` : "Pengembalian"} subtitle="Unit yang tidak dipilih tetap tercatat sebagai peminjaman aktif. Denda dihitung dan ditampilkan sebelum konfirmasi."
        footer={review ? <View style={styles.row}><View style={styles.flex}><Button icon="arrowLeft" title="Kembali" secondary disabled={busy} onPress={() => setReview(null)}/></View><View style={styles.flex}><Button icon="check" title="Konfirmasi pengembalian" busy={busy} disabled={offlineOnly} onPress={() => void send()}/></View></View> : <Button icon="arrowRight" title="Tinjau pengembalian" busy={busy} disabled={offlineOnly} onPress={() => void inspect()}/>}>
        {offlineOnly && <Notice message={offlineNotice}/>}{error && <Notice message={error}/>}
        {loan.loading && <Label tone="muted">Memuat peminjaman…</Label>}{loan.error && <Notice message={loan.error}/>}
        {l && <EntityCard icon="handHelping" title={l.peminjam.nama} meta={[`Dipinjam ${formatTime(l.tanggal_pinjam)}`, `Jatuh tempo ${formatTime(l.tanggal_jatuh_tempo)}`]}/>}
        {review ? <>{review.preview.unit.map((p) => { const u = l?.unit.find((x) => x.id === p.loan_item_id); return <Card key={p.loan_item_id}>
            <Text style={styles.strong}>{u?.kode_barang} · {u?.nama}</Text>
            <Label>{p.hari_terlambat > 0 ? `${p.hari_terlambat} hari × ${rupiah(p.tarif_per_hari)} = ${rupiah(p.sebelum_cap)}` : "Tepat waktu"}</Label>
            {p.denda !== p.sebelum_cap && <Label tone="muted">Batas maksimum diterapkan: {rupiah(p.denda)}</Label>}
            {(p.ganti_rugi !== null || p.menunggu_penetapan) && <StatusBadge label={p.menunggu_penetapan ? "Ganti rugi menunggu penetapan" : `Ganti rugi ${rupiah(p.ganti_rugi)}`} tone="warning"/>}
        </Card>; })}<Notice tone="info" message="Kondisi rusak membuat tiket kerusakan secara otomatis (BR-032)."/></> : l && list.map((r) => { const u = l.unit.find((x) => x.id === r.id)!; return <Card key={r.id}>
            <Toggle label={`${u.kode_barang} · ${u.nama}`} value={r.selected} onChange={(selected) => update(r.id, { selected })}/>
            {r.selected && <>
                <Label tone="muted">Kondisi awal {CONDITION_LABEL[u.kondisi_awal] ?? u.kondisi_awal} — pembanding serah terima:</Label><Photos photos={u.foto_awal} label={`Kondisi awal ${u.kode_barang}`}/>
                <UnitCode label="Verifikasi kode atau QR" value={r.code} onChange={(code) => update(r.id, { code })}/>
                <Chips label="Kondisi kembali" value={r.condition} options={RETURN_CONDITIONS} onChange={(condition) => update(r.id, { condition, negligence: condition === "RUSAK_BERAT" && r.negligence })}/>
                {r.condition === "RUSAK_BERAT" && <Toggle label="Kerusakan akibat kelalaian peminjam" value={r.negligence} onChange={(negligence) => update(r.id, { negligence })}/>}
                <Input label={r.condition !== "BAIK" || r.negligence ? "Catatan pengembalian (wajib)" : "Catatan pengembalian (opsional)"} value={r.note} multiline maxLength={1000} onChangeText={(note) => update(r.id, { note })}/>
                <EvidencePhotos api={api} label="Foto kondisi akhir" ids={r.photos} onChange={(photos) => update(r.id, { photos })}/>
            </>}
        </Card>; })}
    </Screen>;
}

/** Aksi kewajiban MS-53 bagi petugas berwenang; tampil hanya sesuai flag `aksi` dari server (FR-09.4). */
export function FineActions({ fine, reload }: { fine: FineDetail; reload: () => void }) {
    const { api, offlineOnly } = useAuth(); const actions = fineActions(fine.aksi), pending = fine.usulan.find((p) => p.status === "MENUNGGU");
    const [action, setAction] = useState<FineAction | null>(null), [input, setInput] = useState({ date: dateWib(Date.now()), proof: "", reason: "", amount: "" });
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false), intent = useIntent();
    if (actions.length === 0) return null;
    const label = actions.find((a) => a.action === action)?.label ?? "";
    const send = async () => {
        if (!action || busy) return; const result = fineActionBody(action, input); if ("error" in result) { setError(result.error); return; }
        setBusy(true); setError(null);
        try { await fineAction(api, fine.id, action, result.body, intent({ action, body: result.body }), pending?.id); setAction(null); setSaved(true); reload(); }
        catch (e) { setError(e instanceof Error ? e.message : "Perubahan kewajiban belum tersimpan."); } finally { setBusy(false); }
    };
    return <><SectionHeading title="Kelola kewajiban"/>{saved && <Notice tone="success" message="Perubahan kewajiban tercatat."/>}
        {actions.map((a) => <Button key={a.action} title={a.label} secondary={a.action !== "pay"} disabled={offlineOnly} onPress={() => { setError(null); setInput({ date: dateWib(Date.now()), proof: "", reason: "", amount: fine.sisa ?? "" }); setAction(a.action); }}/>)}
        <BottomSheet visible={action !== null} onClose={() => setAction(null)} title={`${label}?`}><View style={styles.sheet}>
            <Label>{fine.kode_barang} · {fine.nomor_peminjaman} · Sisa {rupiah(fine.sisa)}</Label>
            {action === "pay" ? <><Label tone="muted">Konfirmasi setelah pembayaran luring diterima.</Label><DateField label="Tanggal pembayaran" value={input.date} onChange={(date) => setInput({ ...input, date })}/><Input label="Nomor bukti pembayaran" value={input.proof} maxLength={100} onChangeText={(proof) => setInput({ ...input, proof })}/></>
                : <>{(action === "approve" || action === "reject") && pending && <Label>Usulan {rupiah(pending.jumlah)} oleh {pending.pengusul}: {pending.alasan}</Label>}
                    {(action === "waive-compensation" || action === "propose") && <Input label={action === "propose" ? "Nilai penggantian (rupiah)" : "Nilai yang dibebaskan (rupiah)"} value={input.amount} keyboardType="decimal-pad" onChangeText={(amount) => setInput({ ...input, amount })}/>}
                    {action === "reopen" && <Label tone="muted">Sisa kewajiban aktif kembali dan dapat memblokir pengajuan baru.</Label>}
                    <Input label="Alasan atau catatan" value={input.reason} multiline maxLength={1000} onChangeText={(reason) => setInput({ ...input, reason })}/></>}
            {error && <Notice message={error}/>}<Button icon="check" title={label} busy={busy} onPress={() => void send()}/>
        </View></BottomSheet>
    </>;
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: t.space.sm, alignItems: "center" }, flex: { flex: 1, minWidth: 0 }, time: { width: t.size.avatar * 2 }, strong: { fontSize: t.font.body, fontWeight: "600", color: t.color.heading }, sheet: { padding: t.space.md, gap: t.space.md } });
