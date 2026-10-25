import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoanExtendBodySchema } from "@sigm4/schemas";
import type { LoanDetail } from "@sigm4/schemas";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, Peringatan, Tombol } from "../../shared/ui/primitives";
import { extend } from "./management-api";
import { waktuWib } from "./presentation";

export function ExtensionForm({ loan, online, onCancel, onRequested, onFocusReturn }: { readonly loan: LoanDetail; readonly online: boolean; readonly onCancel: () => void; readonly onRequested: () => void; readonly onFocusReturn: () => void }) {
 const [due, setDue] = useState(""), [reason, setReason] = useState(""), [confirm, setConfirm] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
 const intent = useRef<{ body: { tanggal_jatuh_tempo: string; alasan: string }; key: string } | null>(null), client = useQueryClient();
 const mutation = useMutation({ mutationFn: ({ body, key }: NonNullable<typeof intent.current>) => extend(loan.id, body, key) });
 const review = () => { const parsed = LoanExtendBodySchema.safeParse({ tanggal_jatuh_tempo: `${due}:00+07:00`, alasan: reason }); if (!parsed.success) { setError(parsed.error.issues.map((i) => i.message).join(" ")); return; } intent.current = { body: parsed.data, key: crypto.randomUUID() }; setError(null); setConfirm(true); };
 return <section className="flex flex-col gap-4" aria-label="Pengajuan perpanjangan"><h2 className="text-xl font-semibold">Ajukan Perpanjangan</h2>{saved ? <Peringatan varian="success">Pengajuan perpanjangan tercatat dan menunggu persetujuan. Jatuh tempo belum berubah.</Peringatan> : <><p>Jatuh tempo saat ini {waktuWib(loan.tanggal_jatuh_tempo)}. Jadwal baru hanya berlaku setelah disetujui.</p><Isian label="Jatuh tempo baru (WIB)" type="datetime-local" required value={due} onChange={(e) => setDue(e.target.value)} /><Isian label="Alasan perpanjangan" required value={reason} onChange={(e) => setReason(e.target.value)} />{error && <Peringatan varian="error">{error}</Peringatan>}<div className="flex flex-wrap gap-3"><Tombol disabled={!online} onClick={review}>Tinjau perpanjangan</Tombol><Tombol varian="secondary" onClick={onCancel}>Batal perpanjangan</Tombol></div><DialogKonfirmasi onFokusKembali={onFocusReturn} buka={confirm} onTutup={() => setConfirm(false)} judul="Ajukan perpanjangan peminjaman?" labelAksi="Ajukan Perpanjangan" sibuk={mutation.isPending} galat={mutation.error?.message} onKonfirmasi={() => { if (!online || !intent.current) return; mutation.mutate(intent.current, { onSuccess: () => { setConfirm(false); setSaved(true); onRequested(); void client.invalidateQueries({ queryKey: ["loans"] }); } }); }}><p>{due.replace("T", " ")} WIB · {reason}</p><p>Slot tambahan akan ditahan selama menunggu persetujuan. Keterlambatan sebelum keputusan tetap dihitung; pengajuan tidak menjamin persetujuan.</p></DialogKonfirmasi></>}</section>;
}
