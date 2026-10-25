import { useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { WorkOrderEstimateDecisionSchema } from "@sigm4/schemas";
import type { WorkOrderDetail } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { Button, Card, Chips, Input, Label, Notice, SectionHeading } from "../../shared/ui";
import { rupiah } from "../../shared/wib";
import { verifyWorkOrderBody } from "./model";

/** Bagian pengelola di MS-17/MS-61 (`workorder.verify`): verifikasi hasil dan keputusan revisi estimasi. */
export function SupervisorPanel({ d, onDone }: { d: WorkOrderDetail; onDone: () => void }) {
    const { api, state } = useAuth(); const can = state.kind === "READY" && Object.hasOwn(state.session.permissions, "workorder.verify");
    const [note, setNote] = useState(""), [condition, setCondition] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const key = useRef<{ body: string; key: string } | null>(null);
    const verifying = ["MENUNGGU_VERIFIKASI", "TIDAK_DAPAT_DIPERBAIKI"].includes(d.status), estimate = d.status_estimasi === "MENUNGGU";
    if (!can || (!verifying && !estimate)) return null;
    const send = async (path: string, r: { body: unknown } | { error: string }) => {
        if ("error" in r) { setError(r.error); return; }
        const text = JSON.stringify([path, r.body]); if (key.current?.body !== text) key.current = { body: text, key: randomUUID() };
        setBusy(true); setError(null); try { await api.post(`/work-orders/${d.id}/${path}`, r.body, { headers: { "Idempotency-Key": key.current.key } }); setNote(""); onDone(); } catch (e) { setError(e instanceof Error ? e.message : "Keputusan belum tersimpan."); } finally { setBusy(false); }
    };
    const decide = (approve: boolean) => { const p = WorkOrderEstimateDecisionSchema.safeParse({ keputusan: approve ? "DISETUJUI" : "DITOLAK", catatan: note }); return p.success ? { body: p.data } : { error: "Catatan keputusan wajib diisi." }; };
    const isAsset = d.objek.jenis === "ASET";
    return <><SectionHeading title="Keputusan petugas"/><Card>
        {estimate && <><Label>Usulan estimasi {rupiah(d.estimasi_diusulkan)}{d.alasan_estimasi ? ` · ${d.alasan_estimasi}` : ""}</Label></>}
        {verifying && <><Label>{d.status === "TIDAK_DAPAT_DIPERBAIKI" ? "Teknisi menyatakan tidak dapat diperbaiki." : "Hasil pekerjaan menunggu verifikasi."}{d.rekomendasi ? ` Rekomendasi: ${d.rekomendasi}` : ""}</Label>
            {isAsset && <Chips label="Kondisi aset sesudah perbaikan" value={condition} options={[{ value: "BAIK", label: "Baik" }, { value: "RUSAK_RINGAN", label: "Rusak Ringan" }, { value: "RUSAK_BERAT", label: "Rusak Berat" }]} onChange={setCondition}/>}</>}
        <Input label={verifying ? "Catatan verifikasi / pengembalian" : "Catatan keputusan estimasi"} value={note} multiline maxLength={2000} onChangeText={setNote}/>
        {error && <Notice message={error}/>}
        {verifying ? <><Button icon="checkCircle" title="Verifikasi & tutup" busy={busy} onPress={() => void send("verify", verifyWorkOrderBody(true, note, condition, isAsset))}/><Button icon="arrowLeft" title="Kembalikan ke teknisi" secondary disabled={busy} onPress={() => void send("verify", verifyWorkOrderBody(false, note, condition, isAsset))}/></>
            : <><Button icon="check" title="Setujui estimasi" busy={busy} onPress={() => void send("estimate/decide", decide(true))}/><Button icon="close" title="Tolak estimasi" secondary disabled={busy} onPress={() => void send("estimate/decide", decide(false))}/></>}
    </Card></>;
}
