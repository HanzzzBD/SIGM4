import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { MaintenanceScheduleInput } from "@sigm4/schemas";
import { Tombol, Pilihan } from "../../shared/ui/primitives";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { pesanGalat, tanggalId } from "./schedule-format";
import ScheduleForm from "./ScheduleForm";
import { saveSchedule, scheduleListQuery } from "./schedule-api";

export default function ScheduleListPage({ page, status, days, onFilter }: { page: number; status: string; days: string; onFilter: (page: number, status: string, days: string) => void }) {
    const client = useQueryClient(), list = useQuery(scheduleListQuery(page, status, days));
    const [creating, setCreating] = useState(false);
    const save = useMutation({ mutationFn: (input: MaintenanceScheduleInput) => saveSchedule(input), onSuccess: async () => { setCreating(false); await client.invalidateQueries({ queryKey: ["maintenance-schedules"] }); } });
    return <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold text-text-heading">Jadwal Pemeliharaan</h1><p className="mt-1 text-text-secondary">Work order terbit otomatis H-7 sebelum jatuh tempo. Tanggal memakai WIB.</p></div><Tombol onClick={() => { save.reset(); setCreating(!creating); }}>{creating ? "Tutup formulir" : "Buat jadwal"}</Tombol></header>
        {creating && <section className="rounded-md border border-border-subtle bg-surface-default p-4"><h2 className="mb-4 text-lg font-semibold">Buat jadwal preventif</h2><ScheduleForm busy={save.isPending} error={save.isError ? pesanGalat(save.error) : undefined} onSave={input => save.mutate(input)} /></section>}
        <div className="grid gap-4 md:grid-cols-2"><Pilihan label="Status jadwal" kosong="Semua status" value={status} opsi={[{ nilai: "AKTIF", label: "Aktif" }, { nilai: "NONAKTIF", label: "Nonaktif" }]} onChange={e => onFilter(1, e.target.value, days)} /><Pilihan label="Jatuh tempo" kosong="Semua tanggal" value={days} opsi={[{ nilai: "7", label: "Dalam 7 hari" }, { nilai: "14", label: "Dalam 14 hari" }, { nilai: "30", label: "Dalam 30 hari" }]} onChange={e => onFilter(1, status, e.target.value)} /></div>
        {list.isPending ? <KeadaanMemuat label="Memuat jadwal pemeliharaan" /> : list.isError ? <KeadaanGalat galat={list.error} onCobaLagi={() => void list.refetch()} /> : list.data.data.length === 0 ? <KeadaanKosong judul="Belum ada jadwal" pesan="Buat jadwal preventif atau ubah saringan." /> : <><ul className="divide-y divide-border-subtle rounded-md border border-border-subtle">{list.data.data.map(s => <li key={s.id} className="flex flex-wrap justify-between gap-3 p-4"><div><Link className="text-text-link font-medium" to="/jadwal-pemeliharaan/$id" params={{ id: s.id }}>{s.nama}</Link><p className="mt-1 text-sm text-text-secondary">{s.nama_aset ?? s.nama_kategori ?? (s.asset_id ? `Aset ${s.asset_id}` : `Kategori ${s.category_id}`)} · setiap {s.interval_hari} hari · {s.status === "AKTIF" ? "Aktif" : "Nonaktif"}</p></div><p>Jatuh tempo: {s.jatuh_tempo_berikutnya ? tanggalId(s.jatuh_tempo_berikutnya) : "Belum ada aset"}</p></li>)}</ul><nav aria-label="Halaman jadwal" className="flex items-center gap-3"><Tombol varian="secondary" disabled={page <= 1} onClick={() => onFilter(page - 1, status, days)}>Sebelumnya</Tombol><span>{page} / {list.data.meta.total_pages}</span><Tombol varian="secondary" disabled={page >= list.data.meta.total_pages} onClick={() => onFilter(page + 1, status, days)}>Berikutnya</Tombol></nav></>}
    </div>;
}
