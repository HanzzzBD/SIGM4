import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DisposalDetail } from "@sigm4/schemas";
import { useCan, useSesi } from "../../shared/auth";
import { ApiError } from "../../shared/api";
import { pendingInstanceQuery, putuskan, riwayatApprovalQuery } from "../m10-approval";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { KotakCentang, Tombol, Peringatan } from "../../shared/ui/primitives";
import { message } from "./api";
type Choice = "DISETUJUI" | "SEBAGIAN" | "DITOLAK" | "PERLU_REVISI";
export default function ApprovalActions({ data }: { data: DisposalDetail }) {
    const can = useCan(), { user } = useSesi(), client = useQueryClient(), enabled = can("approval.decide") && data.status === "MENUNGGU_PERSETUJUAN" && !!data.approval_instance_id;
    const pending = useQuery({ ...pendingInstanceQuery(Number(data.approval_instance_id)), enabled }), history = useQuery({ ...riwayatApprovalQuery(Number(data.approval_instance_id)), enabled });
    const [choice, setChoice] = useState<Choice | null>(null), [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
    const attempt = useRef<{ signature: string; key: string } | null>(null);
    useEffect(() => setSelected(data.items.filter(i => i.disetujui !== false).map(i => i.id)), [data.items]);
    if (!enabled) return null;
    const ready = pending.data?.referensi_id === Number(data.id) && pending.data.jenis_pengajuan === "PENGHAPUSAN_ASET", clean = data.lampiran.every(f => f.status === "CLEAN"), final = history.data && !history.data.langkah.some(l => l.urutan > (pending.data?.urutan ?? Infinity) && l.status === "BELUM_AKTIF");
    const approveAllowed = clean && ((user.role_kode === "R-03" && can("disposal.approve")) || (!!history.data && !final));
    const send = async (catatan: string) => { if (!pending.data || !choice) return;
        const body = { urutan: pending.data.urutan, keputusan: choice === "SEBAGIAN" ? "DISETUJUI" as const : choice, catatan, ...(choice === "SEBAGIAN" ? { rincian_keputusan: { items: data.items.map(i => ({ item_id: Number(i.id), disetujui: selected.includes(i.id), keterangan: catatan })) } } : {}) };
        const signature = JSON.stringify(body); if (attempt.current && attempt.current.signature !== signature) { setError("Hasil keputusan belum pasti. Ulangi keputusan dan catatan yang sama."); return; }
        attempt.current ??= { signature, key: crypto.randomUUID() }; setBusy(true); setError(""); try { await putuskan(Number(data.approval_instance_id), body, attempt.current.key); attempt.current = null; setChoice(null); await Promise.all([client.invalidateQueries({ queryKey: ["approvals"] }), client.invalidateQueries({ queryKey: ["disposal", data.id] }), client.invalidateQueries({ queryKey: ["disposals"] })]); }
        catch (e) { if (e instanceof ApiError && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status)) attempt.current = null; setError(message(e)); } finally { setBusy(false); }
    };
    return <section className="flex flex-col gap-4"><h2 className="text-lg font-semibold">Keputusan persetujuan</h2>{pending.isError && <Peringatan varian="error">Kewenangan belum dimuat. <Tombol varian="secondary" onClick={() => void pending.refetch()}>Periksa kewenangan lagi</Tombol></Peringatan>}{!ready && !pending.isPending && <p>Usulan ini tidak berada dalam langkah aktif Anda.</p>}{error && <Peringatan varian="error">{error}</Peringatan>}{ready && <>{!clean && <Peringatan varian="warning">Persetujuan menunggu seluruh lampiran CLEAN.</Peringatan>}{final && !can("disposal.approve") && <Peringatan varian="warning">Keputusan akhir penghapusan memerlukan Pimpinan. Anda dapat menolak atau meminta revisi.</Peringatan>}<div className="flex flex-wrap gap-3"><Tombol disabled={busy || !approveAllowed} onClick={() => setChoice("DISETUJUI")}>Setujui</Tombol><Tombol varian="secondary" disabled={busy || !approveAllowed} onClick={() => setChoice("SEBAGIAN")}>Setujui Sebagian</Tombol><Tombol varian="danger" disabled={busy} onClick={() => setChoice("DITOLAK")}>Tolak</Tombol><Tombol varian="secondary" disabled={busy} onClick={() => setChoice("PERLU_REVISI")}>Perlu Revisi</Tombol></div></>}
        <DialogKonfirmasi buka={choice !== null} onTutup={() => setChoice(null)} judul={choice === "SEBAGIAN" ? "Setujui sebagian aset?" : choice === "DITOLAK" ? "Tolak usulan penghapusan?" : choice === "PERLU_REVISI" ? "Minta revisi usulan?" : "Setujui usulan penghapusan?"} labelAksi="Simpan keputusan" labelAlasan="Catatan keputusan" sibuk={busy} galat={error || undefined} onKonfirmasi={catatan => { if (choice === "SEBAGIAN" && !selected.length) { setError("Pilih minimal satu aset, atau gunakan Tolak."); return; } void send(catatan); }}>{choice === "SEBAGIAN" ? <div className="flex flex-col gap-3">{data.items.map(i => <KotakCentang key={i.id} label={`${i.snapshot.kode_barang} · ${i.snapshot.nama}${i.disetujui === false ? " (ditolak level sebelumnya)" : ""}`} checked={selected.includes(i.id)} disabled={i.disetujui === false || busy} onCheckedChange={checked => setSelected(old => checked ? [...old, i.id] : old.filter(id => id !== i.id))} />)}</div> : "Persetujuan belum menghapuskan aset. Petugas mencatat pelaksanaan setelah persetujuan akhir."}</DialogKonfirmasi>
    </section>;
}
