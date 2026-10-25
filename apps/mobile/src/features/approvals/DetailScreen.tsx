import { useCallback, useMemo, useRef, useState } from "react";
import { AppState, Linking, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import { DecideResponseSchema, ProcurementApprovalSnapshotSchema } from "@sigm4/schemas";
import type { ApprovalDecision, LinimasaPersetujuan } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Button, Card, EntityCard, Input, Label, Notice, Screen, StatusBadge, tokens as t } from "../../shared/ui";
import { loadReview } from "./api";
import { approvalLabel, approvalConflict, approvalTone, decisionBlockers, DecisionAttempt, procurementDecision, slaLabel } from "./model";

const labels = { DISETUJUI: "Setujui", DITOLAK: "Tolak", PERLU_REVISI: "Perlu Revisi" } as const;
function Timeline({ history }: { history: LinimasaPersetujuan }) {
    const [open, setOpen] = useState(false);
    return <Card><Button title={open ? "Tutup linimasa persetujuan" : "Buka linimasa persetujuan"} secondary onPress={() => setOpen((value) => !value)} />{open && <><Label>Diajukan {formatTime(history.dibuat_pada)}</Label>{history.ditolak_otomatis && <Label>Penolakan otomatis oleh SYSTEM</Label>}{history.langkah.map((step) => <Card key={step.urutan}>
        <View style={styles.step}><Label strong>Langkah {step.urutan}</Label><StatusBadge label={approvalLabel(step.status)} tone={approvalTone(step.status)}/></View><Label>Approver: {step.approver.user?.nama ?? step.approver.role?.nama ?? "Belum tersedia"}{step.fallback ? " (fallback)" : ""}</Label>
        {step.diputuskan_oleh && <Label>Diputuskan oleh {step.diputuskan_oleh.nama ?? "SYSTEM"}{step.atas_nama ? ` atas nama ${step.atas_nama.nama ?? "approver"}` : ""}{step.diputuskan_pada ? ` · ${formatTime(step.diputuskan_pada)}` : ""}</Label>}
        {ProcurementApprovalSnapshotSchema.safeParse(step.rincian_keputusan).success && <Label>{ProcurementApprovalSnapshotSchema.parse(step.rincian_keputusan).items.map(item=>`${item.nama_barang}: ${item.jumlah_disetujui ?? "belum disetujui"} dari ${item.jumlah_diusulkan}`).join("; ")}</Label>}{step.catatan && <Label>Catatan: {step.catatan}</Label>}{step.alasan_dilewati && <Label>Alasan dilewati: {step.alasan_dilewati}</Label>}
        {step.eskalasi && <Label>Eskalasi {formatTime(step.eskalasi.pada)} dari {step.eskalasi.dari?.nama ?? "approver sebelumnya"}</Label>}{step.eskalasi_habis_pada && <Label>Eskalasi habis {formatTime(step.eskalasi_habis_pada)}</Label>}
        {step.sla && <Label>{slaLabel(step.sla)}{step.sla.deadline ? ` · ${formatTime(step.sla.deadline)}` : ""}</Label>}{step.durasi_menit_kerja !== null && <Label>Durasi {step.durasi_menit_kerja} menit kerja</Label>}
    </Card>)}{history.diselesaikan_pada && <Label>Selesai {formatTime(history.diselesaikan_pada)}</Label>}</>}</Card>;
}
export function ApprovalDetailScreen() {
    const { id: routeId } = useLocalSearchParams<{ id: string }>(); const id = Number(routeId);
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = useMemo(() => state.kind === "READY" ? state.session.permissions : {}, [state]);
    const permitted = Number.isSafeInteger(id) && id > 0 && Object.hasOwn(permissions, "approval.view");
    const load = useCallback((signal: AbortSignal) => permitted ? loadReview(api, id, permissions, signal) : Promise.resolve(null), [api, id, permissions, permitted]);
    const resource = useResource(`${account}:approval:${id}`, load);
    const signal = useRef<AbortController | null>(null);
    const [choice, setChoice] = useState<ApprovalDecision["keputusan"] | null>(null); const [note, setNote] = useState("");
    const [partial, setPartial] = useState(false), [quantities, setQuantities] = useState<Record<string,string>>({});
    const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [uncertain, setUncertain] = useState(false);
    const attempt = useMemo(() => new DecisionAttempt({
        authorize: async (current) => { const fresh = await loadReview(api, id, permissions, current); const reasons = decisionBlockers(fresh, permissions); if (reasons.length) throw new Error(reasons.join(" ")); },
        post: async (body, key, current) => DecideResponseSchema.parse((await api.post(`/approvals/${id}/decide`, body, { signal: current, headers: { "Idempotency-Key": key } })).data).data,
    }, randomUUID), [api, account, id, permissions]);
    useFocusEffect(useCallback(() => {
        signal.current = new AbortController(); setBusy(false); setUncertain(attempt.uncertain); setChoice(null); setNote(""); setPartial(false); setQuantities({});
        const listener = AppState.addEventListener("change", (next) => { if (next !== "active") { signal.current?.abort(); setChoice(null); } else if (signal.current?.signal.aborted) { signal.current = new AbortController(); setBusy(false); setUncertain(attempt.uncertain); } });
        return () => { signal.current?.abort(); listener.remove(); };
    }, [account, id, attempt]));
    const blockers = resource.data ? decisionBlockers(resource.data, permissions) : ["Seluruh konteks wajib harus selesai dimuat."];
    const send = async () => {
        const current = signal.current?.signal; const pending = resource.data?.pending;
        if (!current || current.aborted || (!attempt.body && (!choice || !pending))) return;
        setBusy(true); setMessage(null);
        try {
            const proposal = resource.data?.procurement;
            const body = attempt.body ?? (proposal ? procurementDecision(proposal, pending!.urutan, choice!, note, partial ? quantities : undefined) : { urutan: pending!.urutan, keputusan: choice!, catatan: note });
            const result = await attempt.send(body, current);
            if (current.aborted) return;
            setChoice(null); setNote(""); setMessage(`Keputusan tersimpan: ${approvalLabel(result.keputusan)}.`); resource.reload();
        } catch (error) {
            if (current.aborted) return;
            const conflict = approvalConflict(error);
            setMessage(conflict ? `Pengajuan sudah diputuskan oleh ${conflict.name}${conflict.at ? ` pada ${formatTime(conflict.at)}` : ""}. Muat ulang linimasa untuk melihat hasil terbaru.` : error instanceof Error ? error.message : "Keputusan belum dapat dikirim.");
            if (conflict) { setChoice(null); resource.reload(); }
        } finally { if (!current.aborted) { setBusy(false); setUncertain(attempt.uncertain); } }
    };
    return <Screen title="Detail Keputusan" subtitle="Tinjau konteks dan linimasa sebelum memutuskan. Keputusan dikirim ke server dan tidak diantrekan saat luring." action={<Button title="Kotak masuk" secondary disabled={busy} onPress={() => router.replace("/persetujuan" as "/scan")} />} footer={<>
        {uncertain ? <><Notice message="Hasil pengiriman belum pasti. Coba periksa dengan keputusan yang sama; jangan membuat keputusan baru." /><Button title="Periksa ulang keputusan" busy={busy} onPress={() => { void send(); }} /></> : <View style={styles.actions}>{(Object.keys(labels) as Array<keyof typeof labels>).map((decision) => <View key={decision} style={styles.action}><Button title={labels[decision]} secondary={decision !== "DISETUJUI"} disabled={!permitted || blockers.length > 0 || resource.loading || busy} onPress={() => { setNote(""); setPartial(false); setChoice(decision); }} /></View>)}{resource.data?.procurement && <View style={styles.action}><Button icon="checkCircle" title="Setujui Sebagian" secondary disabled={blockers.length > 0 || resource.loading || busy} onPress={() => {setPartial(true); setNote(""); setQuantities(Object.fromEntries(resource.data!.procurement!.items.map(item=>[item.id,String(item.jumlah_disetujui ?? item.jumlah_diusulkan)]))); setChoice("DISETUJUI");}} /></View>}</View>}
    </>}>
        {!permitted && <Notice message="Pengajuan tidak valid atau Anda tidak memiliki izin membaca persetujuan." />}
        {permitted && <><Button icon="refresh" title="Muat ulang konteks" secondary disabled={busy} onPress={resource.reload} />{resource.loading && <Label>Memuat konteks persetujuan...</Label>}{resource.error && <><Notice message={resource.error} /><Button icon="refresh" title="Coba lagi" onPress={resource.reload} /></>}
            {resource.data && <><EntityCard icon="badgeCheck" title={approvalLabel(resource.data.history.jenis_pengajuan)} meta={[`#${resource.data.history.instance_id}`, resource.data.history.pemohon.nama ?? "Nama belum tersedia"]} statuses={[{ label: approvalLabel(resource.data.history.status), tone: approvalTone(resource.data.history.status) }, ...(resource.data.pending && resource.data.pending.atas_nama_user_id !== null ? [{ label: "Delegasi", tone: "info" as const }] : [])]}/>{!resource.data.procurement && <Label tone="muted">Role, riwayat keterlambatan dan kewajiban: belum tersedia.</Label>}
                {resource.data.procurement && <Card><Label>{resource.data.procurement.nomor}: {resource.data.procurement.judul}</Label><Label>Role pemohon: {resource.data.procurement.pengusul.role_kode}</Label><Label>Unit: {resource.data.procurement.unit_kerja} / {resource.data.procurement.tahun_anggaran}</Label><Label>Justifikasi: {resource.data.procurement.justifikasi}</Label><Label>Total estimasi: Rp {resource.data.procurement.total_estimasi}</Label>{resource.data.procurement.items.map(item=><View key={item.id}><Label>{item.nama_barang}: {item.jumlah_diusulkan} {item.satuan}; disetujui {item.jumlah_disetujui ?? "belum diputuskan"}</Label><Label>{item.spesifikasi}</Label></View>)}{resource.data.procurement.lampiran.map(file=>file.url?<Button key={file.file_id} title={file.nama_berkas} secondary onPress={()=>{void Linking.openURL(file.url!).catch(()=>setMessage("Lampiran belum dapat dibuka."));}}/>:<Label key={file.file_id}>{file.nama_berkas}: menunggu pemeriksaan</Label>)}{resource.data.procurement.dukungan.map(category=><Label key={category.category_id}>{category.nama}: {category.jumlah_aset} aset; {category.rusak_berat} rusak berat; {category.dipinjam} dipinjam.</Label>)}</Card>}
                {resource.data.room && <Card><Label>{resource.data.room.nomor} · {resource.data.room.ruangan?.nama}</Label><Label>Kegiatan: {resource.data.room.nama_kegiatan ?? "Belum diisi"}</Label><Label>Jenis kegiatan: {resource.data.room.jenis_kegiatan ?? "Belum diisi"}</Label><Label>Peserta: {resource.data.room.jumlah_peserta ?? "Belum diisi"}</Label><Label>Keperluan: {resource.data.room.keperluan ?? "Belum diisi"}</Label><Label>Kebutuhan tambahan: {resource.data.room.kebutuhan_tambahan ?? "Tidak dicantumkan"}</Label><Label>Keterangan: {resource.data.room.keterangan ?? "Tidak dicantumkan"}</Label><Label>{formatTime(resource.data.room.waktu_mulai)} sampai {formatTime(resource.data.room.waktu_selesai)}</Label></Card>}
                {resource.data.availability && <Card><Label>Ketersediaan terkini</Label>{!resource.data.availability.resourceListed && <Notice message="Ruangan tidak ditemukan pada daftar ketersediaan." />}{resource.data.availability.dates.map((date, index) => <View key={index}><Label>{formatTime(date.start)} sampai {formatTime(date.end)}</Label><Label>{date.held ? "Slot pengajuan tercatat" : "Slot pengajuan belum terkonfirmasi"} · {date.conflicts} benturan{date.closed ? " · di luar waktu operasional" : ""}</Label></View>)}</Card>}
                {blockers.length > 0 && <Card><Label>Keputusan belum dapat dilakukan</Label>{blockers.map((reason) => <Notice key={reason} message={reason} />)}</Card>}<Timeline history={resource.data.history} />
            </>}
        </>}{message && <Notice message={message} />}
        <Modal visible={choice !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setChoice(null); }}><SafeAreaView style={styles.overlay} accessibilityViewIsModal><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialog}><View style={styles.dialogContent}><Card><Label>{choice ? `Konfirmasi: ${partial ? "Setujui Sebagian" : labels[choice]}` : "Konfirmasi keputusan"}</Label><Label>Pastikan Anda telah meninjau konteks dan linimasa pengajuan.</Label><Input label={choice === "DITOLAK" ? "Alasan penolakan (wajib)" : choice === "PERLU_REVISI" ? "Catatan revisi (wajib)" : resource.data?.procurement ? "Catatan keputusan (wajib)" : "Catatan (opsional)"} multiline maxLength={2000} value={note} editable={!busy && !uncertain} onChangeText={setNote} />{partial && resource.data?.procurement?.items.map(item=><Input key={item.id} label={`${item.nama_barang}: jumlah disetujui (maks. ${item.jumlah_disetujui ?? item.jumlah_diusulkan})`} keyboardType="number-pad" value={quantities[item.id] ?? ""} editable={!busy && !uncertain} onChangeText={value=>setQuantities(current=>({...current,[item.id]:value}))}/>)}<Button icon="send" title="Kirim keputusan" busy={busy} disabled={uncertain || ((choice !== "DISETUJUI" || !!resource.data?.procurement) && !note.trim())} onPress={() => { void send(); }} /><Button icon="close" title="Batal" secondary disabled={busy} onPress={() => setChoice(null)} />{message && <Notice message={message} />}</Card></View></ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
    </Screen>;
}
const styles = StyleSheet.create({ step: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm }, overlay: { flex: 1, justifyContent: "center", padding: t.space.md, backgroundColor: t.color.page }, flex: { flex: 1 }, dialog: { flexGrow: 1, justifyContent: "center" }, dialogContent: { width: "100%", maxWidth: t.size.content, alignSelf: "center" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, action: { flex: 1, minWidth: t.size.control * 2 } });
