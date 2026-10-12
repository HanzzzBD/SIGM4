import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Isian, Tombol } from "../../shared/ui/primitives";
import { pilihanAsetQuery } from "./api";
import type { PilihanAset } from "./api";

export function PilihAset({ pilihan, onTambah, onLepas, utama, sibuk = false }: { readonly pilihan: readonly PilihanAset[]; readonly onTambah: (a: PilihanAset) => void; readonly onLepas: (id: string) => void; readonly utama?: string | undefined; readonly sibuk?: boolean }) {
    const [kata, setKata] = useState("");
    const [cari, setCari] = useState("");
    const query = useQuery(pilihanAsetQuery(cari));
    return <section aria-label="Pilihan aset dokumen" className="flex min-w-0 flex-col gap-3">
        <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><Isian label="Cari aset (nama atau kode)" value={kata} onChange={(e) => setKata(e.target.value)} disabled={sibuk} /></div>
            <Tombol varian="secondary" disabled={sibuk || kata.trim() === ""} onClick={() => setCari(kata)}>Cari aset</Tombol>
        </div>
        {query.isFetching && <KeadaanMemuat label="Memuat pilihan aset" />}
        {query.isError && <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} />}
        {query.data && <ul aria-label="Hasil pencarian aset" className="flex flex-col gap-2">
            {query.data.length === 0 && <li>Tidak ada aset yang cocok.</li>}
            {query.data.filter((a) => a.id !== utama).map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle p-3">
                <span className="min-w-0 break-words"><span className="font-mono">{a.kode_barang}</span> · {a.nama}</span>
                <Tombol varian="secondary" disabled={sibuk || pilihan.some((v) => v.id === a.id) || pilihan.length >= (utama ? 200 : 201)} onClick={() => onTambah(a)} aria-label={`Pilih ${a.kode_barang}`}>Pilih</Tombol>
            </li>)}
            {query.data.length === 25 && <li className="text-sm text-text-secondary">Menampilkan 25 kecocokan pertama. Perjelas nama atau kode untuk mencari aset lain.</li>}
        </ul>}
        {pilihan.length > 0 && <ul aria-label="Aset tambahan terpilih" className="flex flex-col gap-2">{pilihan.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-words"><span className="font-mono">{a.kode_barang}</span> · {a.nama}</span>
            <Tombol varian="tertiary" disabled={sibuk} aria-label={`Lepas pilihan ${a.kode_barang}`} onClick={() => onLepas(a.id)}>Lepas pilihan</Tombol>
        </li>)}</ul>}
    </section>;
}
