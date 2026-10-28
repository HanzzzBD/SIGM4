import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MaintenanceScheduleInputSchema } from "@sigm4/schemas";
import type { MaintenanceScheduleInput } from "@sigm4/schemas";
import { Isian, Pilihan, Tombol, Peringatan } from "../../shared/ui/primitives";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { scheduleAssetsQuery, scheduleOptionsQuery } from "./schedule-api";

export default function ScheduleForm({ initial, busy, error, onSave }: { initial?: MaintenanceScheduleInput | undefined; busy: boolean; error?: string | undefined; onSave: (input: MaintenanceScheduleInput) => void }) {
    const options = useQuery(scheduleOptionsQuery);
    const [nama, setNama] = useState(initial?.nama ?? ""), [category, setCategory] = useState(initial?.category_id?.toString() ?? ""), [asset, setAsset] = useState(initial?.asset_id?.toString() ?? "");
    const [scope, setScope] = useState(initial?.asset_id ? "aset" : "kategori"), [interval, setInterval] = useState(initial?.interval_hari.toString() ?? "30"), [start, setStart] = useState(initial?.tanggal_mulai ?? new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10));
    const [tech, setTech] = useState(initial?.teknisi_default_id.toString() ?? ""), [checklist, setChecklist] = useState(initial?.checklist.join("\n") ?? ""), [validation, setValidation] = useState("");
    const [assetPage, setAssetPage] = useState(1);
    const assets = useQuery({ ...scheduleAssetsQuery(category, assetPage), enabled: scope === "aset" && !!category && !initial });
    if (options.isPending) return <KeadaanMemuat label="Memuat pilihan jadwal" />;
    if (options.isError) return <KeadaanGalat galat={options.error} onCobaLagi={() => void options.refetch()} />;
    return <form className="flex flex-col gap-4" onSubmit={event => {
        event.preventDefault();
        const parsed = MaintenanceScheduleInputSchema.safeParse({ nama, ...(scope === "aset" ? { asset_id: Number(asset) } : { category_id: Number(category) }), interval_hari: Number(interval), tanggal_mulai: start, teknisi_default_id: Number(tech), checklist: checklist.split("\n").map(s => s.trim()).filter(Boolean) });
        if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Lengkapi jadwal."); return; }
        setValidation(""); onSave(parsed.data);
    }}>
        <Isian label="Nama jadwal" value={nama} maxLength={200} required onChange={e => setNama(e.target.value)} />
        <div className="grid gap-4 md:grid-cols-2">
            <Pilihan label="Cakupan" value={scope} disabled={!!initial} opsi={[{ nilai: "kategori", label: "Semua aset kategori" }, { nilai: "aset", label: "Satu aset" }]} onChange={e => setScope(e.target.value)} />
            <Pilihan label="Kategori" kosong="Pilih kategori" value={category} disabled={!!initial} opsi={options.data.categories.map(c => ({ nilai: c.id, label: c.nama }))} onChange={e => { setCategory(e.target.value); setAsset(""); setAssetPage(1); const suggested = options.data.categories.find(c => c.id === e.target.value)?.interval_preventif_hari; if (suggested !== null && suggested !== undefined) setInterval(String(suggested)); }} />
            {scope === "aset" && <><Pilihan label="Aset" value={asset} kosong={initial?.asset_id ? `Aset ${initial.asset_id}` : "Pilih aset"} disabled={!!initial || assets.isFetching} opsi={(assets.data ?? []).map(a => ({ nilai: a.id, label: `${a.kode_barang} · ${a.nama}` }))} onChange={e => setAsset(e.target.value)} />{assets.isError && <KeadaanGalat galat={assets.error} onCobaLagi={() => void assets.refetch()} />}<div className="flex gap-2"><Tombol varian="secondary" disabled={!!initial || assetPage === 1} onClick={() => setAssetPage(assetPage - 1)}>Aset sebelumnya</Tombol><Tombol varian="secondary" disabled={!!initial || assets.data?.length !== 100} onClick={() => setAssetPage(assetPage + 1)}>Aset berikutnya</Tombol></div></>}
            <Pilihan label="Preset interval" value={["1", "7", "30", "90", "365"].includes(interval) ? interval : "custom"} opsi={[{ nilai: "1", label: "Harian" }, { nilai: "7", label: "Mingguan" }, { nilai: "30", label: "Bulanan (30 hari)" }, { nilai: "90", label: "Triwulanan (90 hari)" }, { nilai: "365", label: "Tahunan (365 hari)" }, { nilai: "custom", label: "Jumlah hari khusus" }]} onChange={e => { if (e.target.value !== "custom") setInterval(e.target.value); }} />
            <Isian label="Interval (hari)" bantuan="Usulan kategori dapat Anda sesuaikan." type="number" min={1} max={3650} required value={interval} onChange={e => setInterval(e.target.value)} />
            <Isian label="Jatuh tempo pertama (WIB)" bantuan="Hari libur digeser ke hari kerja berikutnya." type="date" required value={start} onChange={e => setStart(e.target.value)} />
            <Pilihan label="Teknisi penanggung jawab" kosong="Pilih teknisi" required value={tech} opsi={options.data.technicians.map(t => ({ nilai: t.id, label: t.nama }))} onChange={e => setTech(e.target.value)} />
        </div>
        <label className="flex flex-col gap-2">Checklist pekerjaan (satu pekerjaan per baris)<textarea className="rounded-sm border border-border-strong bg-surface-default p-3" rows={5} required value={checklist} onChange={e => setChecklist(e.target.value)} /></label>
        {(validation || error) && <Peringatan varian="error">{validation || error}</Peringatan>}
        <Tombol type="submit" sibuk={busy}>{initial ? "Simpan perubahan" : "Buat jadwal"}</Tombol>
    </form>;
}
