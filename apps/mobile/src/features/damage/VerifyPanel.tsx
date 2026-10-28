import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { DamageReportDetail } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Card, Chips, DateField, Input, Label, Notice, SectionHeading, Toggle, tokens as t } from "../../shared/ui";
import { dateWib } from "../../shared/wib";
import { DECISIONS, loadTechnicians, verifyBody, verifyReport } from "./staff";
import type { Assignment, Decision } from "./staff";

/** Penugasan teknisi bersama MS-60 dan MS-62 (FR-12.1): teknisi + beban aktif, target, estimasi, nonaktifkan aset. */
export function AssignmentFields({ value, onChange, asset }: { value: Assignment; onChange: (v: Assignment) => void; asset: boolean }) {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const techs = useResource(`${account}:technicians`, useCallback((s: AbortSignal) => loadTechnicians(api, s), [api]));
    return <>
        {techs.error && <Notice message={techs.error}/>}
        {techs.data && <Chips label="Teknisi" value={value.technician} options={techs.data.map((x) => ({ value: x.id, label: `${x.nama} · ${x.work_order_aktif} aktif` }))} onChange={(technician) => onChange({ ...value, technician })}/>}
        <DateField label="Target selesai" value={value.target} min={dateWib(Date.now())} onChange={(target) => onChange({ ...value, target })}/>
        <Input label="Estimasi biaya (Rp, opsional)" value={value.estimate} keyboardType="decimal-pad" onChangeText={(estimate) => onChange({ ...value, estimate })}/>
        {asset && <Toggle label="Tandai aset Dalam Perbaikan" value={value.disableAsset} onChange={(disableAsset) => onChange({ ...value, disableAsset })}/>}
    </>;
}
export const emptyAssignment = (): Assignment => ({ technician: "", target: dateWib(Date.now()), estimate: "", disableAsset: true });

/** MS-60 — verifikasi tiket Dilaporkan (FR-11.2): tindak lanjut + work order, perbaikan ringan, atau tolak beralasan. */
export function VerifyPanel({ detail, onDone }: { detail: DamageReportDetail; onDone: () => void }) {
    const { api, state } = useAuth(); const perms = state.kind === "READY" ? state.session.permissions : {}, can = (p: string) => Object.hasOwn(perms, p);
    const [decision, setDecision] = useState<Decision>("TINDAK_LANJUT"), [note, setNote] = useState(""), [condition, setCondition] = useState<"" | "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT">(""), [reason, setReason] = useState("");
    const [assign, setAssign] = useState(emptyAssignment()), [withOrder, setWithOrder] = useState(can("workorder.create")), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const isAsset = detail.objek.jenis === "ASET";
    if (detail.status === "DIVERIFIKASI" && can("workorder.create")) return <Button icon="wrench" title="Buat work order dari tiket ini" onPress={() => router.push(`/work-order/baru?tiket=${detail.id}` as "/scan")}/>;
    if (detail.status !== "DILAPORKAN" || !can("damage.verify")) return null;
    const send = async () => {
        const r = verifyBody({ decision, note, condition, conditionReason: reason, assign: decision === "TINDAK_LANJUT" && withOrder ? assign : null }); if ("error" in r) { setError(r.error); return; }
        setBusy(true); setError(null); try { await verifyReport(api, detail.id, r.body); onDone(); } catch (e) { setError(e instanceof Error ? e.message : "Verifikasi belum tersimpan."); } finally { setBusy(false); }
    };
    return <><SectionHeading title="Verifikasi tiket"/><Card>
        <Chips label="Tindak lanjut" value={decision} options={DECISIONS} onChange={setDecision}/>
        <Input label={decision === "TOLAK" ? "Alasan penolakan (terlihat pelapor)" : decision === "PERBAIKAN_RINGAN" ? "Catatan perbaikan" : "Catatan (opsional)"} value={note} multiline maxLength={1000} onChangeText={setNote}/>
        {isAsset && can("asset.update_condition") && <><Chips label="Kondisi aset (opsional)" value={condition} options={[{ value: "", label: "Tidak diubah" }, { value: "BAIK", label: "Baik" }, { value: "RUSAK_RINGAN", label: "Rusak Ringan" }, { value: "RUSAK_BERAT", label: "Rusak Berat" }]} onChange={setCondition}/>{condition && <Input label="Alasan perubahan kondisi" value={reason} maxLength={500} onChangeText={setReason}/>}</>}
        {decision === "TINDAK_LANJUT" && can("workorder.create") && <><Toggle label="Langsung tugaskan teknisi" value={withOrder} onChange={setWithOrder}/>{withOrder && <AssignmentFields value={assign} onChange={setAssign} asset={isAsset}/>}</>}
        {error && <Notice message={error}/>}
        <View style={{ gap: t.space.sm }}><Button icon="check" title="Simpan verifikasi" busy={busy} onPress={() => void send()}/></View>
        <Label tone="muted">Kondisi Hilang hanya dapat ditetapkan lewat opname atau berita acara.</Label>
    </Card></>;
}
