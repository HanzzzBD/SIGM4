import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { MaintenanceScheduleInput } from "@sigm4/schemas";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Tombol } from "../../shared/ui/primitives";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { pesanGalat, tanggalId } from "./schedule-format";
import ScheduleForm from "./ScheduleForm";
import { saveSchedule, scheduleAction, scheduleDetailQuery, scheduleOrdersQuery } from "./schedule-api";

export default function ScheduleDetailPage({ id }: { id: string }) {
    const client = useQueryClient(), query = useQuery(scheduleDetailQuery(id));
    const [orderPage, setOrderPage] = useState(1);
    const orders = useQuery(scheduleOrdersQuery(id, orderPage));
    const [editing, setEditing] = useState(false), [action, setAction] = useState<"skip" | "deactivate" | null>(null);
    const refresh = async () => { await client.invalidateQueries({ queryKey: ["maintenance-schedules"] }); };
    const save = useMutation({ mutationFn: (input: MaintenanceScheduleInput) => saveSchedule(input, id), onSuccess: async () => { setEditing(false); await refresh(); } });
    const mutate = useMutation({ mutationFn: (alasan: string) => scheduleAction(id, action!, alasan), onSuccess: async () => { setAction(null); await refresh(); } });
    if (query.isPending) return <KeadaanMemuat label="Memuat detail jadwal" />;
    if (query.isError) return <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} />;
    const s = query.data;
    const input: MaintenanceScheduleInput = { nama: s.nama, ...(s.asset_id ? { asset_id: Number(s.asset_id) } : { category_id: Number(s.category_id) }), interval_hari: s.interval_hari, tanggal_mulai: s.tanggal_mulai.slice(0, 10), checklist: s.checklist, teknisi_default_id: Number(s.teknisi_default_id) };
    return <div className="flex flex-col gap-6"><Link to="/jadwal-pemeliharaan" className="text-text-link">Kembali ke jadwal pemeliharaan</Link><header><h1 className="text-2xl font-semibold text-text-heading">{s.nama}</h1><p className="mt-1 text-text-secondary">{s.status === "AKTIF" ? "Jadwal aktif" : "Jadwal nonaktif"}</p></header>
        <dl className="grid gap-4 rounded-md border border-border-subtle p-4 md:grid-cols-2">{[["Cakupan", s.nama_aset ?? s.nama_kategori ?? (s.asset_id ? `Aset ${s.asset_id}` : `Kategori ${s.category_id}`)], ["Interval", `${s.interval_hari} hari`], ["Teknisi", s.nama_teknisi ?? s.teknisi_default_id], ["Jatuh tempo pertama", tanggalId(s.tanggal_mulai)], ["Jatuh tempo berikutnya", s.jatuh_tempo_berikutnya ? tanggalId(s.jatuh_tempo_berikutnya) : "Belum ada aset"]].map(([label, value]) => <div key={label}><dt className="text-sm text-text-secondary">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
        <section><h2 className="text-lg font-semibold">Checklist pekerjaan</h2><ul className="mt-3 list-disc pl-6">{s.checklist.map((c, index) => <li key={index}>{c}</li>)}</ul></section>
        <p className="text-text-secondary">Work order terbit H-7. Siklus berikutnya dihitung per aset dari tanggal penyelesaian. Perubahan checklist berlaku pada work order yang akan terbit.</p>
        <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Work order dari jadwal ini</h2>{orders.isPending ? <KeadaanMemuat label="Memuat work order jadwal" /> : orders.isError ? <KeadaanGalat galat={orders.error} onCobaLagi={() => void orders.refetch()} /> : <><ul className="divide-y divide-border-subtle">{orders.data.map(o => <li key={o.id} className="py-3"><a className="text-text-link" href={`/work-order/${o.id}`}>{o.nomor}</a><p className="text-sm text-text-secondary">{o.menunggu_ketersediaan_aset ? "Menunggu Ketersediaan Aset" : o.status.replaceAll("_", " ")} · {tanggalId(o.target_selesai)}</p></li>)}</ul>{orders.data.length === 0 && <p className="text-text-secondary">Belum ada work order pada halaman ini.</p>}<div className="flex gap-3"><Tombol varian="secondary" disabled={orderPage === 1} onClick={() => setOrderPage(orderPage - 1)}>WO sebelumnya</Tombol><Tombol varian="secondary" disabled={orders.data.length < 20} onClick={() => setOrderPage(orderPage + 1)}>WO berikutnya</Tombol></div></>}</section>
        <div className="flex flex-wrap gap-3"><Tombol varian="secondary" onClick={() => { save.reset(); setEditing(!editing); }}>{editing ? "Tutup formulir" : "Ubah jadwal"}</Tombol>{s.status === "AKTIF" && <><Tombol varian="secondary" onClick={() => { mutate.reset(); setAction("skip"); }}>Lewati sekali</Tombol><Tombol varian="danger" onClick={() => { mutate.reset(); setAction("deactivate"); }}>Nonaktifkan</Tombol></>}</div>
        {editing && <ScheduleForm initial={input} busy={save.isPending} error={save.isError ? pesanGalat(save.error) : undefined} onSave={value => save.mutate(value)} />}
        <DialogKonfirmasi buka={action !== null} onTutup={() => setAction(null)} judul={action === "skip" ? "Lewati satu siklus?" : "Nonaktifkan jadwal?"} labelAksi={action === "skip" ? "Lewati sekali" : "Nonaktifkan"} labelAlasan="Alasan" sibuk={mutate.isPending} galat={mutate.isError ? pesanGalat(mutate.error) : undefined} onKonfirmasi={reason => mutate.mutate(reason)}>{action === "skip" ? "Siklus berikutnya maju satu interval. Work order yang sudah terbit harus diselesaikan dahulu." : "Work order berikutnya tidak diterbitkan. Work order yang sudah terbit tetap berjalan."}</DialogKonfirmasi>
    </div>;
}
