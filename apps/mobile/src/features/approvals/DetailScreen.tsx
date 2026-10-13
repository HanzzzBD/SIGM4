import { useCallback, useMemo, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import { DecideResponseSchema } from "@sigm4/schemas";
import type { ApprovalDecision, LinimasaPersetujuan } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Button, Card, Input, Label, Notice, Screen, tokens as t } from "../../shared/ui";
import { loadReview } from "./api";
import { approvalLabel, approvalConflict, decisionBlockers, DecisionAttempt, slaLabel } from "./model";

const labels = { DISETUJUI: "Setujui", DITOLAK: "Tolak", PERLU_REVISI: "Perlu Revisi" } as const;
function Timeline({ history }: { history: LinimasaPersetujuan }) {
    const [open, setOpen] = useState(false);
    return <Card><Button title={open ? "Tutup linimasa persetujuan" : "Buka linimasa persetujuan"} secondary onPress={() => setOpen((value) => !value)} />{open && <><Label>Diajukan {formatTime(history.dibuat_pada)}</Label>{history.ditolak_otomatis && <Label>Penolakan otomatis oleh SYSTEM</Label>}{history.langkah.map((step) => <Card key={step.urutan}>
        <Label>Langkah {step.urutan} · {approvalLabel(step.status)}</Label><Label>Approver: {step.approver.user?.nama ?? step.approver.role?.nama ?? "Belum tersedia"}{step.fallback ? " (fallback)" : ""}</Label>
        {step.diputuskan_oleh && <Label>Diputuskan oleh {step.diputuskan_oleh.nama ?? "SYSTEM"}{step.atas_nama ? ` atas nama ${step.atas_nama.nama ?? "approver"}` : ""}{step.diputuskan_pada ? ` · ${formatTime(step.diputuskan_pada)}` : ""}</Label>}
        {step.catatan && <Label>Catatan: {step.catatan}</Label>}{step.alasan_dilewati && <Label>Alasan dilewati: {step.alasan_dilewati}</Label>}
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
    const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [uncertain, setUncertain] = useState(false);
    const attempt = useMemo(() => new DecisionAttempt({
        authorize: async (current) => { const fresh = await loadReview(api, id, permissions, current); const reasons = decisionBlockers(fresh, permissions); if (reasons.length) throw new Error(reasons.join(" ")); },
        post: async (body, key, current) => DecideResponseSchema.parse((await api.post(`/approvals/${id}/decide`, body, { signal: current, headers: { "Idempotency-Key": key } })).data).data,
    }, randomUUID), [api, account, id, permissions]);
    useFocusEffect(useCallback(() => {
        signal.current = new AbortController(); setBusy(false); setUncertain(attempt.uncertain); setChoice(null);
        const listener = AppState.addEventListener("change", (next) => { if (next !== "active") { signal.current?.abort(); setChoice(null); } else if (signal.current?.signal.aborted) { signal.current = new AbortController(); setBusy(false); setUncertain(attempt.uncertain); } });
        return () => { signal.current?.abort(); listener.remove(); };
    }, [account, id, attempt]));
    const blockers = resource.data ? decisionBlockers(resource.data, permissions) : ["Seluruh konteks wajib harus selesai dimuat."];
    const send = async () => {
        const current = signal.current?.signal; const pending = resource.data?.pending;
        if (!current || current.aborted || (!attempt.body && (!choice || !pending))) return;
        setBusy(true); setMessage(null);
        try {
            const result = await attempt.send(attempt.body ?? { urutan: pending!.urutan, keputusan: choice!, catatan: note }, current);
            if (current.aborted) return;
            setChoice(null); setNote(""); setMessage(`Keputusan tersimpan: ${approvalLabel(result.keputusan)}.`); resource.reload();
        } catch (error) {
            if (current.aborted) return;
            const conflict = approvalConflict(error);
            setMessage(conflict ? `Pengajuan sudah diputuskan oleh ${conflict.name}${conflict.at ? ` pada ${formatTime(conflict.at)}` : ""}. Muat ulang linimasa untuk melihat hasil terbaru.` : error instanceof Error ? error.message : "Keputusan belum dapat dikirim.");
            if (conflict) { setChoice(null); resource.reload(); }
        } finally { if (!current.aborted) { setBusy(false); setUncertain(attempt.uncertain); } }
    };
    return <Screen title="Tinjau Persetujuan" action={<Button title="Kotak masuk" secondary disabled={busy} onPress={() => router.replace("/persetujuan" as "/scan")} />} footer={<>
        {uncertain ? <><Notice message="Hasil pengiriman belum pasti. Coba periksa dengan keputusan yang sama; jangan membuat keputusan baru." /><Button title="Periksa ulang keputusan" busy={busy} onPress={() => { void send(); }} /></> : <View style={styles.actions}>{(Object.keys(labels) as Array<keyof typeof labels>).map((decision) => <View key={decision} style={styles.action}><Button title={labels[decision]} secondary={decision !== "DISETUJUI"} disabled={!permitted || blockers.length > 0 || resource.loading || busy} onPress={() => { setNote(""); setChoice(decision); }} /></View>)}</View>}
    </>}>
        {!permitted && <Notice message="Pengajuan tidak valid atau Anda tidak memiliki izin membaca persetujuan." />}
        {permitted && <><Button title="Muat ulang konteks" secondary disabled={busy} onPress={resource.reload} />{resource.loading && <Label>Memuat konteks persetujuan...</Label>}{resource.error && <><Notice message={resource.error} /><Button title="Coba lagi" onPress={resource.reload} /></>}
            {resource.data && <><Card><Label>Pengajuan #{resource.data.history.instance_id} · {approvalLabel(resource.data.history.jenis_pengajuan)}</Label><Label>Status: {approvalLabel(resource.data.history.status)}</Label><Label>Pemohon: {resource.data.history.pemohon.nama ?? "Nama belum tersedia"}</Label><Label>Role, riwayat keterlambatan dan kewajiban: belum tersedia.</Label>{resource.data.pending?.atas_nama_user_id !== null && resource.data.pending && <Label>Anda menerima penugasan delegasi.</Label>}</Card>
                {resource.data.room && <Card><Label>{resource.data.room.nomor} · {resource.data.room.ruangan?.nama}</Label><Label>Kegiatan: {resource.data.room.nama_kegiatan ?? "Belum diisi"}</Label><Label>Jenis kegiatan: {resource.data.room.jenis_kegiatan ?? "Belum diisi"}</Label><Label>Peserta: {resource.data.room.jumlah_peserta ?? "Belum diisi"}</Label><Label>Keperluan: {resource.data.room.keperluan ?? "Belum diisi"}</Label><Label>Kebutuhan tambahan: {resource.data.room.kebutuhan_tambahan ?? "Tidak dicantumkan"}</Label><Label>Keterangan: {resource.data.room.keterangan ?? "Tidak dicantumkan"}</Label><Label>{formatTime(resource.data.room.waktu_mulai)} sampai {formatTime(resource.data.room.waktu_selesai)}</Label></Card>}
                {resource.data.availability && <Card><Label>Ketersediaan terkini</Label>{!resource.data.availability.resourceListed && <Notice message="Ruangan tidak ditemukan pada daftar ketersediaan." />}{resource.data.availability.dates.map((date, index) => <View key={index}><Label>{formatTime(date.start)} sampai {formatTime(date.end)}</Label><Label>{date.held ? "Slot pengajuan tercatat" : "Slot pengajuan belum terkonfirmasi"} · {date.conflicts} benturan{date.closed ? " · di luar waktu operasional" : ""}</Label></View>)}</Card>}
                {blockers.length > 0 && <Card><Label>Keputusan belum dapat dilakukan</Label>{blockers.map((reason) => <Notice key={reason} message={reason} />)}</Card>}<Timeline history={resource.data.history} />
            </>}
        </>}{message && <Notice message={message} />}
        <Modal visible={choice !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setChoice(null); }}><SafeAreaView style={styles.overlay} accessibilityViewIsModal><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialog}><View style={styles.dialogContent}><Card><Label>{choice ? `Konfirmasi: ${labels[choice]}` : "Konfirmasi keputusan"}</Label><Label>Pastikan Anda telah meninjau konteks dan linimasa pengajuan.</Label><Input label={choice === "DITOLAK" ? "Alasan penolakan (wajib)" : choice === "PERLU_REVISI" ? "Catatan revisi (wajib)" : "Catatan (opsional)"} multiline maxLength={2000} value={note} editable={!busy && !uncertain} onChangeText={setNote} /><Button title="Kirim keputusan" busy={busy} disabled={uncertain || (choice !== "DISETUJUI" && !note.trim())} onPress={() => { void send(); }} /><Button title="Batal" secondary disabled={busy} onPress={() => setChoice(null)} />{message && <Notice message={message} />}</Card></View></ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
    </Screen>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: "center", padding: t.space.md, backgroundColor: t.color.page }, flex: { flex: 1 }, dialog: { flexGrow: 1, justifyContent: "center" }, dialogContent: { width: "100%", maxWidth: t.size.content, alignSelf: "center" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, action: { flex: 1, minWidth: t.size.control * 2 } });
