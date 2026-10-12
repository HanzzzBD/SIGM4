import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Peringatan, Tombol } from "../../shared/ui/primitives";
import { dokumenAsetQuery } from "./api";
import { DaftarDokumen } from "./DaftarDokumen";
import { UnggahDokumen } from "./UnggahDokumen";

export default function DocumentPanel({ id }: { readonly id: string }) {
    const can = useCan();
    const query = useQuery(dokumenAsetQuery(id));
    const [unggah, setUnggah] = useState(false);
    const [tersimpan, setTersimpan] = useState(false);
    return <section aria-labelledby="judul-dokumen-aset" className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3"><h2 id="judul-dokumen-aset" className="text-xl font-semibold text-text-heading">Dokumen Aset</h2><div className="flex flex-wrap gap-2"><Tombol varian="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>Muat ulang</Tombol>{can("asset_document.manage") && <Tombol disabled={unggah} onClick={() => { setUnggah(true); setTersimpan(false); }}>Unggah Dokumen</Tombol>}</div></header>
        {tersimpan && <Peringatan varian="success">Dokumen tersimpan. Status pemeriksaan akan diperbarui otomatis.</Peringatan>}
        {unggah && <UnggahDokumen assetId={id} onBatal={() => setUnggah(false)} onSelesai={() => { setUnggah(false); setTersimpan(true); }} />}
        {query.isPending ? <KeadaanMemuat label="Memuat dokumen aset" /> : query.isError ? <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} /> : query.data.length === 0 ? <KeadaanKosong judul="Belum ada dokumen" pesan="Dokumen yang ditautkan ke aset ini akan tampil di sini." /> : <DaftarDokumen rows={query.data} assetId={id} />}
    </section>;
}
