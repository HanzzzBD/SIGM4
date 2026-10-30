import { useQuery } from "@tanstack/react-query";
import type { ReadyCheckout } from "@sigm4/schemas";
import { useEffect, useState } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat, useDaring } from "../../shared/states";
import { Peringatan, Tombol } from "../../shared/ui/primitives";
import { KepalaHalaman } from "../../shared/ui/visual";
import { readyQuery } from "./api";
import { CheckoutForm } from "./CheckoutForm";

export default function CheckoutPage({ initialReservation, onCreated }: { readonly initialReservation?: string | undefined; readonly onCreated: (id: string) => void }) {
    const can = useCan(), online = useDaring();
    const [page, setPage] = useState(1), [selected, setSelected] = useState<ReadyCheckout | null>(null), [direct, setDirect] = useState(false), [showAll, setShowAll] = useState(false);
    const queue = useQuery({ ...readyQuery(page, showAll ? undefined : initialReservation), enabled: online });
    useEffect(() => { if (initialReservation && !showAll && selected === null) { const row = queue.data?.data.find((r) => r.id === initialReservation); if (row) setSelected(row); } }, [initialReservation, queue.data, selected, showAll]);
    return <div className="mx-auto flex w-full max-w-4xl flex-col gap-6"><KepalaHalaman judul="Antrean Serah Terima" ikon="serahTerima" accent="accent-green" info={{ judul: "Tentang Antrean Serah Terima", isi: "Reservasi aset yang siap diserahkan hari ini. Verifikasi unit fisik sebelum menyerahkan." }} />{!online && <Peringatan varian="warning">Anda sedang luring. Antrean dan transaksi memerlukan koneksi.</Peringatan>}
        {selected || direct ? <CheckoutForm key={selected?.id ?? "langsung"} reservation={selected} online={online} onCreated={onCreated} onCancel={() => { setSelected(null); setDirect(false); setShowAll(true); }} /> : <>
            {can("loan.direct") && <Tombol varian="secondary" disabled={!online} onClick={() => setDirect(true)}>Peminjaman langsung</Tombol>}
            {initialReservation && !showAll && <Tombol varian="secondary" onClick={() => setShowAll(true)}>Lihat seluruh antrean hari ini</Tombol>}
            {queue.isPending && online && <KeadaanMemuat label="Memuat antrean serah terima" />}{queue.isError && <KeadaanGalat galat={queue.error} onCobaLagi={() => void queue.refetch()} />}
            {queue.data?.data.length === 0 && <KeadaanKosong judul="Tidak ada reservasi siap diserahkan" pesan="Reservasi yang sudah disetujui dan dijadwalkan hari ini akan muncul di sini." />}
            <ul className="flex flex-col gap-4">{queue.data?.data.map((r) => <li key={r.id} className="flex flex-col gap-3 rounded-md border border-border-subtle p-4"><h2 className="text-lg font-semibold">{r.nomor}</h2><p>{r.peminjam.nama} · {r.unit.length} unit · {r.lokasi_penggunaan}</p><p className="text-sm text-text-secondary">{new Date(r.waktu_mulai).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p><Tombol disabled={!online || queue.isFetching} onClick={() => setSelected(r)}>Serah terima {r.nomor}</Tombol></li>)}</ul>
            {queue.data && <div className="flex flex-wrap items-center gap-3"><Tombol varian="secondary" disabled={page <= 1 || !online} onClick={() => setPage(page - 1)}>Sebelumnya</Tombol><span>Halaman {page} dari {queue.data.meta.total_pages}</span><Tombol varian="secondary" disabled={page >= queue.data.meta.total_pages || !online} onClick={() => setPage(page + 1)}>Berikutnya</Tombol></div>}
        </>}
    </div>;
}
