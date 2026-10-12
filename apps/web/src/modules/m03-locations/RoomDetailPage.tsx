import { useMutation, useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { loadRoomBlocksPanel } from "../m07-reservation-room";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Isian, Pilihan, Tombol } from "../../shared/ui/primitives";
import { assetsQuery, categoriesQuery, downloadInventory, KONDISI, label, responsibleQuery, roomQuery, STATUS, treeQuery } from "./api";
import type { Filters } from "./api";
import LocationForm from "./LocationForm";

const RoomBlocksPanel = lazy(loadRoomBlocksPanel);
export default function RoomDetailPage({ id, filters, tab, onFilters, onTab }: { readonly id: string; readonly filters: Filters; readonly tab: "aset" | "jadwal"; readonly onFilters: (f: Filters) => void; readonly onTab: (tab: "aset" | "jadwal") => void }) {
    const can = useCan();
    const room = useQuery(roomQuery(id));
    const tree = useQuery(treeQuery);
    const people = useQuery({ ...responsibleQuery, enabled: can("user.view") && room.data !== undefined && room.data.penanggung_jawab_id !== null });
    const assets = useQuery({ ...assetsQuery(id, filters), enabled: can("asset.view") && tab === "aset" });
    const categories = useQuery({ ...categoriesQuery, enabled: can("asset.view") && tab === "aset" });
    const [edit, setEdit] = useState(false);
    const download = useMutation({ mutationFn: (format: "xlsx" | "pdf") => downloadInventory(id, filters, format) });
    const change = (f: Partial<Filters>) => onFilters({ ...filters, ...f, page: 1 });
    const building = tree.data?.find((b) => b.areas.some((a) => a.id === room.data?.area_id));
    const area = building?.areas.find((a) => a.id === room.data?.area_id);
    if (room.isPending) return <KeadaanMemuat label="Memuat ruangan" />;
    if (room.isError) return <KeadaanGalat galat={room.error} onCobaLagi={() => void room.refetch()} />;
    const r = room.data;
    return <div className="flex flex-col gap-6">
        <a href="/lokasi" className="text-text-link">Kembali ke lokasi</a>
        <header className="flex flex-wrap justify-between gap-4"><div><h1 className="text-2xl font-semibold text-text-heading">{r.nama}</h1><p className="text-text-secondary">{building?.nama} / {area?.nama} / {r.kode}</p></div>{can("location.manage") && <Tombol varian="secondary" onClick={() => setEdit(true)}>Ubah ruangan</Tombol>}</header>
        <dl className="grid gap-4 sm:grid-cols-3">{[["Jenis", label(r.jenis)], ["Status", label(r.status)], ["Kapasitas", r.kapasitas === null ? "Belum diisi" : `${r.kapasitas} orang`], ["Penanggung jawab", people.data?.find((p) => p.id === r.penanggung_jawab_id)?.nama ?? (r.penanggung_jawab_id === null ? "Belum diisi" : "Sudah ditetapkan")], ["Dapat direservasi", r.dapat_direservasi ? "Ya" : "Tidak"], ["Reservasi siswa", r.boleh_direservasi_siswa ? "Ya" : "Tidak"]].map(([title, value]) => <div key={title}><dt className="text-sm text-text-secondary">{title}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
        <nav aria-label="Bagian detail ruangan" className="flex gap-3"><Tombol varian={tab === "aset" ? "primary" : "secondary"} aria-current={tab === "aset" ? "page" : undefined} onClick={() => onTab("aset")}>Aset</Tombol><Tombol varian={tab === "jadwal" ? "primary" : "secondary"} aria-current={tab === "jadwal" ? "page" : undefined} onClick={() => onTab("jadwal")}>Jadwal Tetap</Tombol></nav>
        {tab === "jadwal" ? can("reservation.fixed_schedule") ? <Suspense fallback={<KeadaanMemuat label="Memuat jadwal tetap" />}><RoomBlocksPanel roomId={id} onRuangan={() => undefined} onTutup={() => onTab("aset")} tetap /></Suspense> : <p role="status">Anda tidak memiliki izin melihat atau mengelola jadwal tetap.</p> : !can("asset.view") ? <p role="status">Anda tidak memiliki izin melihat aset ruangan.</p> : <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Isian label="Cari aset" type="search" maxLength={200} value={filters.q ?? ""} onChange={(e) => change({ q: e.target.value })} /><Pilihan label="Kategori" kosong="Semua kategori" value={filters.kategori ?? ""} opsi={(categories.data ?? []).map((c) => ({ nilai: c.id, label: c.nama }))} onChange={(e) => change({ kategori: e.target.value })} /><Pilihan label="Kondisi" kosong="Semua kondisi" value={filters.kondisi ?? ""} opsi={KONDISI.map((s) => ({ nilai: s, label: label(s) }))} onChange={(e) => change({ kondisi: e.target.value })} /><Pilihan label="Status aset" kosong="Semua status" value={filters.status ?? ""} opsi={STATUS.map((s) => ({ nilai: s, label: label(s) }))} onChange={(e) => change({ status: e.target.value })} /></div>
            {categories.isError && <KeadaanGalat galat={categories.error} onCobaLagi={() => void categories.refetch()} />}
            {can("report.export") && <div className="flex gap-3"><Tombol varian="secondary" sibuk={download.isPending} onClick={() => download.mutate("xlsx")}>Ekspor XLSX</Tombol><Tombol varian="secondary" disabled={download.isPending} onClick={() => download.mutate("pdf")}>Ekspor PDF</Tombol></div>}
            {download.isError && <KeadaanGalat galat={download.error} onCobaLagi={() => download.reset()} />}
            {assets.isPending ? <KeadaanMemuat label="Memuat aset ruangan" /> : assets.isError ? <KeadaanGalat galat={assets.error} onCobaLagi={() => void assets.refetch()} /> : <>
                <section aria-label="Ringkasan seluruh ruangan" className="flex flex-wrap gap-4"><p>Total: {assets.data.data.ringkasan.total} unit</p>{KONDISI.map((k) => <p key={k}>{label(k)}: {assets.data.data.ringkasan.per_kondisi[k]}</p>)}<p>Dipinjam: {assets.data.data.ringkasan.jumlah_dipinjam}</p><p>Dalam perbaikan: {assets.data.data.ringkasan.jumlah_dalam_perbaikan}</p></section>
                {assets.data.data.assets.length === 0 ? <div role="status"><p>{assets.data.data.ringkasan.total === 0 ? "Ruangan belum memuat aset." : "Tidak ada aset yang sesuai filter."}</p>{assets.data.data.ringkasan.total === 0 && can("asset.create") && <a className="text-text-link" href={`/aset/baru?ruang=${id}`}>Tambah Aset ke Lokasi Ini</a>}</div> : <div className="overflow-auto border border-border-subtle"><table className="w-full"><caption className="sr-only">Aset dalam ruangan {r.nama}</caption><thead><tr>{["Kode aset", "Nama", "Kondisi", "Status"].map((s) => <th key={s} scope="col" className="p-3 text-left">{s}</th>)}</tr></thead><tbody>{assets.data.data.assets.map((a) => <tr key={a.kode_barang}>{[a.kode_barang, a.nama, label(a.kondisi), label(a.status)].map((v, i) => <td key={i} className="border-t border-border-subtle p-3">{v}</td>)}</tr>)}</tbody></table></div>}
                <nav aria-label="Halaman aset" className="flex flex-wrap items-center gap-3"><Tombol varian="secondary" disabled={(filters.page ?? 1) <= 1} onClick={() => onFilters({ ...filters, page: (filters.page ?? 1) - 1 })}>Sebelumnya</Tombol><p>Halaman {filters.page ?? 1} dari {assets.data.meta.total_pages} · {assets.data.meta.total} hasil</p><Tombol varian="secondary" disabled={(filters.page ?? 1) >= assets.data.meta.total_pages} onClick={() => onFilters({ ...filters, page: (filters.page ?? 1) + 1 })}>Berikutnya</Tombol></nav>
            </>}
        </>}
        {edit && <LocationForm target={{ kind: "rooms", room: r }} onClose={() => setEdit(false)} />}
    </div>;
}
