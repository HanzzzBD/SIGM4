// P-28 / FR-08.1: katalog per kategori, rincian unit, serta saran tanggal bebas.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AssetAvailabilityQuerySchema, LABEL_KONDISI_ASET } from "@sigm4/schemas";
import type { AssetAvailabilityGroup } from "@sigm4/schemas";
import { useEffect, useState } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat, useDaring } from "../../shared/states";
import { Isian, KotakCentang, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import { KepalaHalaman } from "../../shared/ui/visual";
import { availabilityQuery } from "./api";

export interface AvailabilitySearch {
    readonly mulai: string; readonly selesai: string;
    readonly q?: string | undefined; readonly kategori?: string | undefined;
    readonly tersedia?: boolean | undefined; readonly urut?: "nama" | "-nama" | "tersedia" | "-tersedia" | undefined;
    readonly page?: number | undefined;
}
const dateLabel = (iso: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const localWib = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 16);

function Group({ group, online, refreshing, onAlternative, range }: { readonly group: AssetAvailabilityGroup; readonly online: boolean; readonly refreshing: boolean; readonly onAlternative: (start: string) => void; readonly range: AvailabilitySearch }) {
    const can = useCan();
    const [selected, setSelected] = useState<readonly string[]>([]);
    const [unitPage, setUnitPage] = useState(1);
    const pages = Math.ceil(group.unit.length / 20);
    return <article className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-default p-4">
        <div className="flex items-start gap-4">
            {group.foto_url !== null && <img src={group.foto_url} alt={`Foto ${group.nama}`} loading="lazy" className="h-16 w-16 shrink-0 rounded-sm object-cover" />}
            <div className="flex flex-col gap-1"><h3 className="text-lg font-semibold text-text-heading">{group.nama}</h3>
                <p className="text-sm text-text-secondary">{[group.merek, group.model].filter(Boolean).join(" · ")}</p>
                <Lencana varian={group.jumlah_tersedia > 0 ? "success" : "warning"}>{`${String(group.jumlah_tersedia)} dari ${String(group.jumlah_unit)} unit tersedia`}</Lencana>
            </div>
        </div>
        {group.jumlah_tersedia === 0 && (group.tersedia_mulai === null
            ? <p className="text-sm text-text-secondary">Belum ada rentang bebas dengan durasi ini dalam horizon pemesanan. Coba rentang lain.</p>
            : <div className="flex flex-col gap-2"><p className="text-sm text-text-secondary">Tersedia terdekat: {dateLabel(group.tersedia_mulai)} WIB.</p><Tombol varian="secondary" disabled={!online || refreshing} onClick={() => onAlternative(group.tersedia_mulai as string)}>Gunakan tanggal tersedia</Tombol></div>)}
        <details>
            <summary className="min-h-control-md cursor-pointer py-3 text-base font-medium text-text-link">Lihat unit dan pilih aset</summary>
            <ul className="flex flex-col divide-y divide-border-subtle">
                {group.unit.slice((unitPage - 1) * 20, unitPage * 20).map((unit) => <li key={unit.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="flex flex-col gap-1">
                        <KotakCentang label={`${unit.kode_barang} · ${LABEL_KONDISI_ASET[unit.kondisi]}`} checked={selected.includes(unit.id)} disabled={!unit.tersedia || !online || refreshing} onCheckedChange={(checked) => setSelected((previous) => checked ? [...previous, unit.id] : previous.filter((id) => id !== unit.id))} />
                        <p className="ml-8 text-sm text-text-secondary">{unit.tersedia ? "Tersedia" : "Terpakai"}</p>
                    </div>
                    {can("asset.view") && <Link to="/aset/$id" params={{ id: unit.id }} className="min-h-control-md py-3 text-sm text-text-link">Detail {unit.kode_barang}</Link>}
                </li>)}
            </ul>
            {pages > 1 && <div className="flex flex-wrap items-center gap-2"><Tombol varian="secondary" disabled={unitPage === 1} onClick={() => setUnitPage(unitPage - 1)}>Unit sebelumnya</Tombol><span className="text-sm">Halaman unit {unitPage} dari {pages}</span><Tombol varian="secondary" disabled={unitPage === pages} onClick={() => setUnitPage(unitPage + 1)}>Unit berikutnya</Tombol></div>}
            <p role="status" className="mt-3 text-sm text-text-secondary">{selected.length} unit dipilih. Pemilihan belum memesan atau mengunci unit.</p>
            {can("reservation.create") && <div className="mt-3 flex flex-col gap-2">{selected.length === 0 || !online || refreshing ? <Tombol disabled>Ajukan reservasi</Tombol> : <Link to="/reservasi/baru" search={{ mode: "aset", kategori: group.kategori.id, jumlah: selected.length, units: selected.join(","), mulai: new Date(`${range.mulai}:00+07:00`).toISOString(), selesai: new Date(`${range.selesai}:00+07:00`).toISOString() }} className="inline-flex min-h-control-md items-center justify-center rounded-md bg-teal-600 px-4 py-2 font-medium text-text-inverse hover:bg-teal-700">Ajukan reservasi</Link>}<p className="text-sm text-text-secondary">Alokasi otomatis dapat memilih unit pengganti sekategori; unit pasti terlihat setelah disetujui.</p></div>}
        </details>
    </article>;
}

export default function AssetAvailabilityPage({ search, onSearch }: { readonly search: AvailabilitySearch; readonly onSearch: (patch: Partial<AvailabilitySearch>) => void }) {
    const online = useDaring();
    const [keyword, setKeyword] = useState(search.q ?? "");
    useEffect(() => setKeyword(search.q ?? ""), [search.q]);
    const parsed = AssetAvailabilityQuerySchema.safeParse({ dari: `${search.mulai}:00+07:00`, sampai: `${search.selesai}:00+07:00`, q: search.q, kategori_id: search.kategori, hanya_tersedia: search.tersedia ? "true" : "false", sort: search.urut, page: search.page });
    const query = useQuery({ ...availabilityQuery(parsed.success ? parsed.data : { dari: "", sampai: "", page: 1, per_page: 25, sort: "nama" }), enabled: parsed.success && online });
    const change = (patch: Partial<AvailabilitySearch>) => onSearch({ ...patch, page: undefined });
    const data = query.data;
    const alternative = (start: string) => {
        const duration = Date.parse(`${search.selesai}:00+07:00`) - Date.parse(`${search.mulai}:00+07:00`);
        change({ mulai: localWib(start), selesai: localWib(new Date(Date.parse(start) + duration).toISOString()) });
    };
    return <div className="flex flex-col gap-6">
        <KepalaHalaman judul="Katalog Aset" ikon="katalog" accent="accent-green" info={{ judul: "Tentang Katalog Aset", isi: "Lihat ketersediaan dan pilih unit aset untuk rentang peminjaman. Seluruh waktu dalam WIB." }} />
        <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); change({ q: keyword.trim() || undefined }); }}>
            <Isian label="Mulai peminjaman (WIB)" type="datetime-local" step="60" required value={search.mulai} onChange={(event) => change({ mulai: event.target.value })} />
            <Isian label="Rencana pengembalian (WIB)" type="datetime-local" step="60" required value={search.selesai} onChange={(event) => change({ selesai: event.target.value })} />
            <Isian label="Cari nama atau kategori" type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            <Pilihan label="Kategori" value={search.kategori ?? ""} kosong="Semua kategori" opsi={(data?.data.kategori ?? []).map((c) => ({ nilai: c.id, label: c.nama }))} onChange={(event) => change({ kategori: event.target.value || undefined })} />
            <Pilihan label="Urutkan" value={search.urut ?? "nama"} opsi={[{ nilai: "nama", label: "Nama A–Z" }, { nilai: "-nama", label: "Nama Z–A" }, { nilai: "-tersedia", label: "Unit tersedia terbanyak" }, { nilai: "tersedia", label: "Unit tersedia paling sedikit" }]} onChange={(event) => change({ urut: event.target.value as AvailabilitySearch["urut"] })} />
            <div className="flex flex-wrap items-center gap-4"><KotakCentang label="Hanya yang tersedia" checked={search.tersedia ?? false} onCheckedChange={(checked) => change({ tersedia: checked || undefined })} /><Tombol type="submit" varian="secondary">Cari</Tombol><Tombol varian="secondary" disabled={!online || !parsed.success} sibuk={query.isFetching} onClick={() => void query.refetch()}>Muat ulang</Tombol></div>
        </form>
        {!online && <Peringatan varian="warning">Anda sedang luring. Sambungkan kembali untuk melihat ketersediaan terbaru dan memilih unit.</Peringatan>}
        {!parsed.success ? <Peringatan varian="warning">{parsed.error.issues[0]?.message ?? "Pilih rentang waktu yang sah."}</Peringatan>
            : query.isError ? <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} />
            : query.isPending && online ? <KeadaanMemuat label="Memuat ketersediaan aset" baris={6} />
            : data !== undefined && <>
                <p role="status" className="text-sm text-text-secondary">{query.isFetching ? "Memperbarui ketersediaan…" : `${String(data.meta.total)} kelompok aset ditemukan.`}</p>
                {data.data.kelompok.length === 0 ? <KeadaanKosong judul="Tidak ada aset yang cocok" pesan="Ubah rentang atau hapus saringan untuk melihat pilihan lain." aksi={<Tombol varian="secondary" onClick={() => { setKeyword(""); change({ q: undefined, kategori: undefined, tersedia: undefined }); }}>Hapus saringan</Tombol>} />
                    : data.data.kategori.filter((category) => data.data.kelompok.some((g) => g.kategori.id === category.id)).map((category) => <section key={category.id} className="flex flex-col gap-3" aria-label={category.nama}><h2 className="text-xl font-semibold text-text-heading">{category.nama}</h2><div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">{data.data.kelompok.filter((g) => g.kategori.id === category.id).map((group) => <Group key={`${group.key}:${String(query.dataUpdatedAt)}`} group={group} online={online} refreshing={query.isFetching} onAlternative={alternative} range={search} />)}</div></section>)}
                {data.meta.total_pages > 1 && <nav aria-label="Halaman katalog" className="flex flex-wrap items-center gap-3"><Tombol varian="secondary" disabled={data.meta.page <= 1 || query.isFetching} onClick={() => onSearch({ page: data.meta.page - 1 })}>Sebelumnya</Tombol><span className="text-sm">Halaman {data.meta.page} dari {data.meta.total_pages}</span><Tombol varian="secondary" disabled={data.meta.page >= data.meta.total_pages || query.isFetching} onClick={() => onSearch({ page: data.meta.page + 1 })}>Berikutnya</Tombol></nav>}
            </>}
    </div>;
}
