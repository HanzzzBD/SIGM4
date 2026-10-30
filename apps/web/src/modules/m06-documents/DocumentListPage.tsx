import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Isian, Pilihan, Peringatan, Tombol } from "../../shared/ui/primitives";
import { KepalaHalaman, PengalihTampilan, useTampilanDaftar } from "../../shared/ui/visual";
import { kategoriQuery } from "../m04-assets";
import { GARANSI, JENIS, LABEL_GARANSI, LABEL_JENIS, semuaDokumenQuery } from "./api";
import type { FilterDokumen, Garansi, Jenis } from "./api";
import { DaftarDokumen } from "./DaftarDokumen";
import { UnggahDokumen } from "./UnggahDokumen";

export default function DocumentListPage({ filter, onFilter }: { readonly filter: FilterDokumen; readonly onFilter: (f: Partial<FilterDokumen>) => void }) {
    const can = useCan();
    const query = useQuery(semuaDokumenQuery(filter));
    const kategori = useQuery({ ...kategoriQuery, enabled: can("asset.view") });
    const [kata, setKata] = useState(filter.q ?? "");
    const [unggah, setUnggah] = useState(false);
    const [tersimpan, setTersimpan] = useState(false);
    const [tampilan, setTampilan] = useTampilanDaftar("P-26");
    useEffect(() => setKata(filter.q ?? ""), [filter.q]);
    const ubah = (f: Partial<FilterDokumen>) => onFilter({ ...f, page: undefined });
    return <div className="flex min-w-0 flex-col gap-6">
        <KepalaHalaman judul="Dokumen Aset" ikon="dokumen" accent="accent-blue" info={{ judul: "Tentang Dokumen Aset", isi: "Dokumen pendukung dan masa garansi seluruh aset yang dapat Anda lihat. Tautan unduh berlaku 15 menit." }} aksi={can("asset_document.manage") && can("asset.view") ? <Tombol disabled={unggah} onClick={() => { setUnggah(true); setTersimpan(false); }}>Unggah Dokumen</Tombol> : undefined} />
        {tersimpan && <Peringatan varian="success">Dokumen tersimpan. Status pemeriksaan akan diperbarui otomatis.</Peringatan>}
        {unggah && <UnggahDokumen onBatal={() => setUnggah(false)} onSelesai={() => { setUnggah(false); setTersimpan(true); }} />}
        <form aria-label="Saringan dokumen" className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); ubah({ q: kata.trim() || undefined }); }}>
            <Isian label="Cari dokumen atau aset" type="search" maxLength={200} value={kata} onChange={(e) => setKata(e.target.value)} />
            <Pilihan label="Jenis dokumen" kosong="Semua jenis" value={filter.jenis ?? ""} onChange={(e) => ubah({ jenis: (e.target.value || undefined) as Jenis | undefined })} opsi={JENIS.map((v) => ({ nilai: v, label: LABEL_JENIS[v] }))} />
            <Pilihan label="Masa garansi" kosong="Semua masa garansi" value={filter.garansi ?? ""} onChange={(e) => ubah({ garansi: (e.target.value || undefined) as Garansi | undefined })} opsi={GARANSI.map((v) => ({ nilai: v, label: LABEL_GARANSI[v] }))} />
            {can("asset.view") && <Pilihan label="Kategori aset" kosong="Semua kategori" value={filter.kategori ?? ""} onChange={(e) => ubah({ kategori: e.target.value || undefined })} opsi={kategori.data?.map((v) => ({ nilai: v.id, label: v.nama })) ?? []} />}
            <Pilihan label="Urutkan dokumen" kosong="Unggahan terbaru" value={filter.urut ?? ""} onChange={(e) => ubah({ urut: e.target.value === "garansi_selesai" ? "garansi_selesai" : undefined })} opsi={[{ nilai: "garansi_selesai", label: "Garansi berakhir terdekat" }]} />
            <div className="flex flex-wrap gap-2"><Tombol type="submit" varian="secondary">Cari</Tombol><Tombol varian="tertiary" onClick={() => { setKata(""); onFilter({ q: undefined, jenis: undefined, garansi: undefined, kategori: undefined, urut: undefined, page: undefined }); }}>Reset saringan</Tombol><Tombol varian="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Muat ulang</Tombol><PengalihTampilan nilai={tampilan} onUbah={setTampilan} /></div>
        </form>
        {kategori.isError && can("asset.view") && <KeadaanGalat galat={kategori.error} onCobaLagi={() => void kategori.refetch()} />}
        <section aria-labelledby="judul-daftar-dokumen" className="flex min-w-0 flex-col gap-4"><h2 id="judul-daftar-dokumen" className="text-xl font-semibold text-text-heading">Daftar Dokumen</h2>
            {query.isPending ? <KeadaanMemuat label="Memuat daftar dokumen" /> : query.isError ? <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} /> : query.data.data.length === 0 ? <KeadaanKosong judul="Tidak ada dokumen" pesan="Belum ada dokumen yang sesuai saringan ini." /> : <DaftarDokumen rows={query.data.data} tampilan={tampilan} />}
        </section>
        {query.data && <nav aria-label="Halaman dokumen" className="flex flex-wrap items-center gap-3"><Tombol varian="secondary" disabled={(filter.page ?? 1) <= 1 || query.isFetching} onClick={() => onFilter({ page: (filter.page ?? 1) - 1 === 1 ? undefined : (filter.page ?? 1) - 1 })}>Sebelumnya</Tombol><span aria-live="polite">Halaman {filter.page ?? 1} dari {Math.max(1, query.data.meta.total_pages)} · {query.data.meta.total} tautan dokumen-aset</span><Tombol varian="secondary" disabled={(filter.page ?? 1) >= query.data.meta.total_pages || query.isFetching} onClick={() => onFilter({ page: (filter.page ?? 1) + 1 })}>Berikutnya</Tombol><Pilihan label="Dokumen per halaman" value={filter.per ?? 25} onChange={(e) => ubah({ per: Number(e.target.value) === 25 ? undefined : Number(e.target.value) as 50 | 100 })} opsi={[25, 50, 100].map((v) => ({ nilai: String(v), label: String(v) }))} /></nav>}
    </div>;
}
