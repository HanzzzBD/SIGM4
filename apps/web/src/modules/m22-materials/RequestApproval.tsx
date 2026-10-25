import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialRequestDecisionSchema } from "@sigm4/schemas";
import type { MaterialRequestDetail } from "@sigm4/schemas";
import { useCan } from "../../shared/auth";
import { pendingInstanceQuery, putuskan } from "../m10-approval";
import { Isian, Tombol, Peringatan } from "../../shared/ui/primitives";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { MaterialWriteAttempt } from "./api";
import { materialBusinessError } from "./request-api";
type Choice = "DISETUJUI" | "SEBAGIAN" | "DITOLAK" | "PERLU_REVISI";
export default function RequestApproval({ data }: { data: MaterialRequestDetail }) {
    const can = useCan(), client = useQueryClient(), enabled = data.status === "MENUNGGU_PERSETUJUAN" && can("approval.decide") && !!data.approval_instance_id;
    const pending = useQuery({ ...pendingInstanceQuery(Number(data.approval_instance_id)), enabled }), [choice, setChoice] = useState<Choice | null>(null), [quantities, setQuantities] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState(""), attempt = useRef(new MaterialWriteAttempt());
    if (!enabled) return null;
    const ready = pending.data?.referensi_id === Number(data.id) && pending.data.jenis_pengajuan === "PERMINTAAN_BAHAN";
    const open = (next: Choice) => { setChoice(next); setError(""); setQuantities(Object.fromEntries(data.items.map(i => [i.id, String(i.jumlah_disetujui ?? i.jumlah_diminta)]))); };
    const send = async (catatan: string) => { if (!choice || !pending.data) return; const partial = choice === "SEBAGIAN" ? MaterialRequestDecisionSchema.safeParse({ items: data.items.map(i => ({ item_id: Number(i.id), jumlah_disetujui: Number(quantities[i.id] ?? "") })) }) : null;
        if (partial && (!partial.success || !partial.data.items.some(i => i.jumlah_disetujui > 0) || partial.data.items.some(i => i.jumlah_disetujui > (data.items.find(r => r.id === String(i.item_id))!.jumlah_disetujui ?? data.items.find(r => r.id === String(i.item_id))!.jumlah_diminta)))) { setError("Isi jumlah bulat sesuai batas sebelumnya; setujui minimal satu unit."); return; }
        const body = { urutan: pending.data.urutan, keputusan: choice === "SEBAGIAN" ? "DISETUJUI" as const : choice, catatan, ...(partial?.success ? { rincian_keputusan: partial.data } : {}) }; setBusy(true); setError("");
        try { await attempt.current.send({ instance_id: Number(data.approval_instance_id), body }, async (_c, key) => putuskan(Number(data.approval_instance_id), body, key)); setChoice(null); await Promise.all([client.invalidateQueries({ queryKey: ["material-request", data.id] }), client.invalidateQueries({ queryKey: ["material-requests"] }), client.invalidateQueries({ queryKey: ["approvals"] })]); } catch (e) { setError(materialBusinessError(e)); } finally { setBusy(false); }
    };
    return <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">Keputusan Permintaan</h2>{pending.isError && <Peringatan varian="error">Kewenangan belum dimuat. <Tombol onClick={() => void pending.refetch()}>Coba lagi</Tombol></Peringatan>}{error && <Peringatan varian="error">{error}</Peringatan>}{ready ? <div className="flex flex-wrap gap-3">{(["DISETUJUI", "SEBAGIAN", "DITOLAK", "PERLU_REVISI"] as const).map(c => <Tombol key={c} disabled={busy} varian={c === "DITOLAK" ? "danger" : c === "DISETUJUI" ? "primary" : "secondary"} onClick={() => open(c)}>{c === "DISETUJUI" ? "Setujui" : c === "SEBAGIAN" ? "Setujui Sebagian" : c === "DITOLAK" ? "Tolak" : "Perlu Revisi"}</Tombol>)}</div> : !pending.isPending && <p>Permintaan tidak berada pada langkah aktif Anda.</p>}<DialogKonfirmasi buka={choice !== null} onTutup={() => setChoice(null)} judul={choice === "SEBAGIAN" ? "Setujui sebagian jumlah bahan?" : choice === "DITOLAK" ? "Tolak permintaan bahan?" : choice === "PERLU_REVISI" ? "Minta revisi permintaan bahan?" : "Setujui permintaan bahan?"} labelAksi="Simpan keputusan bahan" labelAlasan="Catatan keputusan bahan" galat={error || undefined} sibuk={busy} onKonfirmasi={catatan => void send(catatan)}>{choice === "SEBAGIAN" ? <div className="flex flex-col gap-3">{data.items.map(i => <Isian key={i.id} label={`Jumlah disetujui ${i.nama} / ${i.lokasi}`} type="number" min={0} max={i.jumlah_disetujui ?? i.jumlah_diminta} step={1} disabled={i.jumlah_disetujui === 0 || busy} value={quantities[i.id] ?? ""} onChange={e => setQuantities(old => ({ ...old, [i.id]: e.target.value }))} />)}</div> : "Keputusan tidak mengurangi saldo. Petugas mencatat jumlah aktual saat bahan diserahkan."}</DialogKonfirmasi></section>;
}
