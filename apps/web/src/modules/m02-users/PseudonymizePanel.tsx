import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PseudonymizeUserBodySchema, PseudonymizedUserResponseSchema } from "@sigm4/schemas";
import type { PseudonymizeUserBody } from "@sigm4/schemas";
import { api } from "../../shared/api";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, KotakCentang, Pilihan, Peringatan, Tombol } from "../../shared/ui/primitives";
import { galatIsian, LABEL_METODE, METODE_VERIFIKASI, penggunaQuery } from "./api";

export default function PseudonymizePanel({ id, nama }: { readonly id: string; readonly nama: string }) {
    const cache = useQueryClient();
    const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false), [ack, setAck] = useState(false);
    const [reason, setReason] = useState(""), [reference, setReference] = useState(""), [method, setMethod] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const mutation = useMutation({
        mutationFn: async (body: PseudonymizeUserBody) => PseudonymizedUserResponseSchema.parse((await api.post(`/users/${id}/pseudonymize`, body)).data),
        onSuccess: async () => { setConfirm(false); await cache.invalidateQueries({ queryKey: penggunaQuery(id).queryKey }); await cache.invalidateQueries({ queryKey: ["users", "daftar"] }); },
        onError: () => { void cache.invalidateQueries({ queryKey: penggunaQuery(id).queryKey }); },
    });
    const input = { alasan: reason, referensi_permintaan: reference, metode_verifikasi: method };
    function validate() {
        const parsed = PseudonymizeUserBodySchema.safeParse(input);
        const fields = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0]), i.message]));
        if (!ack) fields["ack"] = "Konfirmasi bahwa Anda memahami dampak permanen.";
        setErrors(fields);
        if (parsed.success && ack) setConfirm(true);
    }
    if (!open) return <div><Tombol varian="danger" onClick={() => setOpen(true)}>Pseudonimkan akun</Tombol></div>;
    return <section aria-labelledby="privacy-heading" className="flex flex-col gap-4 rounded-md border border-border-strong bg-surface-default p-4">
        <h2 id="privacy-heading" className="text-lg font-semibold text-text-heading">Pseudonimisasi permanen: {nama}</h2>
        <Peringatan varian="warning">Nama, email, NIP/NIS, telepon dan unit kerja diganti atau dikosongkan. Akun tidak dapat dipulihkan atau digunakan kembali. Transaksi, audit lama, dan foto bukti tetap tersimpan serta dilindungi izin akses.</Peringatan>
        <p className="text-sm text-text-secondary">Verifikasi permintaan subjek data secara luring. Catat nomor referensinya; hindari menyalin identitas pribadi ke alasan.</p>
        <Isian label="Referensi permintaan terverifikasi" required maxLength={200} value={reference} disabled={mutation.isPending} galat={errors["referensi_permintaan"]} onChange={e => setReference(e.target.value)} />
        <Pilihan label="Metode verifikasi identitas" required kosong="Pilih metode" value={method} disabled={mutation.isPending} galat={errors["metode_verifikasi"]} opsi={METODE_VERIFIKASI.map(m => ({ nilai: m, label: LABEL_METODE[m] }))} onChange={e => setMethod(e.target.value)} />
        <Isian label="Alasan pseudonimisasi" required maxLength={500} value={reason} disabled={mutation.isPending} galat={errors["alasan"]} onChange={e => setReason(e.target.value)} />
        <KotakCentang label="Saya memahami akun tidak dapat dipulihkan dan bukti transaksi tetap disimpan." checked={ack} disabled={mutation.isPending} onCheckedChange={setAck} />
        {errors["ack"] && <p role="alert" className="text-sm text-error-base">{errors["ack"]}</p>}
        {mutation.error && <Peringatan varian="error">{galatIsian(mutation.error).umum ?? "Pseudonimisasi belum berhasil. Periksa isian dan kewajiban akun."}</Peringatan>}
        <div className="flex flex-wrap gap-3"><Tombol varian="danger" disabled={mutation.isPending} onClick={validate}>Tinjau pseudonimisasi</Tombol><Tombol varian="secondary" disabled={mutation.isPending} onClick={() => setOpen(false)}>Batal</Tombol></div>
        <DialogKonfirmasi buka={confirm} onTutup={() => setConfirm(false)} judul={`Pseudonimkan ${nama} secara permanen?`} labelAksi="Pseudonimkan permanen" varian="danger" sibuk={mutation.isPending} galat={mutation.error ? galatIsian(mutation.error).umum ?? "Pseudonimisasi belum berhasil." : undefined}
            onKonfirmasi={() => mutation.mutate(PseudonymizeUserBodySchema.parse(input))}>
            Identitas akun akan diganti dan seluruh sesi dicabut. Tindakan ini tidak dapat dibatalkan. Kewajiban diperiksa ulang sebelum proses dijalankan.
        </DialogKonfirmasi>
    </section>;
}
