import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Isian, Pilihan, Tombol } from "../../shared/ui/primitives";
import { KepalaHalaman } from "../../shared/ui/visual";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import LocationForm from "./LocationForm";
import type { Target } from "./LocationForm";
import { treeQuery, label } from "./api";

export default function LocationTreePage({ q, status, onSearch }: { readonly q: string; readonly status: string; readonly onSearch: (q: string, status: string) => void }) {
    const tree = useQuery(treeQuery);
    const can = useCan();
    const qc = useQueryClient();
    const [target, setTarget] = useState<Target | null>(null);
    const [change, setChange] = useState<{ kind: "buildings" | "rooms"; id: string; nama: string; status: string } | null>(null);
    const update = useMutation({ mutationFn: async () => { if (change) await api.patch(`/${change.kind}/${change.id}/status`, { status: change.status }); }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["locations"] }); setChange(null); } });
    const manage = can("location.manage");
    const match = (name: string, code: string) => `${name} ${code}`.toLocaleLowerCase("id").includes(q.toLocaleLowerCase("id"));
    const buildings = tree.data?.map((b) => ({ ...b, areas: b.areas.map((a) => ({ ...a, rooms: a.rooms.filter((r) => (status === "" || r.status === status) && (match(b.nama, b.kode) || match(a.nama, a.kode) || match(r.nama, r.kode))) })).filter((a) => a.rooms.length > 0 || (status === "" && (match(b.nama, b.kode) || match(a.nama, a.kode)))) })).filter((b) => b.areas.length > 0 || ((status === "" || b.status === status) && match(b.nama, b.kode))) ?? [];
    return <div className="flex flex-col gap-6">
        <KepalaHalaman judul="Manajemen Lokasi" ikon="lokasi" accent="accent-blue" info={{ judul: "Tentang Lokasi", isi: "Gedung, area, dan ruangan beserta jumlah unit aset. Buka ruangan untuk melihat asetnya." }} aksi={manage ? <Tombol onClick={() => setTarget({ kind: "buildings" })}>Tambah gedung</Tombol> : undefined} />
        <div className="grid gap-4 sm:grid-cols-2"><Isian label="Cari lokasi" type="search" value={q} onChange={(e) => onSearch(e.target.value, status)} /><Pilihan label="Status lokasi" kosong="Semua status" value={status} opsi={[{ nilai: "AKTIF", label: "Aktif" }, { nilai: "NONAKTIF", label: "Nonaktif" }]} onChange={(e) => onSearch(q, e.target.value)} /></div>
        {tree.isPending ? <KeadaanMemuat label="Memuat lokasi" /> : tree.isError ? <KeadaanGalat galat={tree.error} onCobaLagi={() => void tree.refetch()} /> : buildings.length === 0 ? <p role="status">Tidak ada lokasi yang sesuai.</p> : <ul className="flex flex-col gap-4">{buildings.map((b) => <li key={b.id} className="rounded-md border border-border-subtle bg-surface-default p-4">
            <details key={`${b.id}-${q}-${status}`} open={q !== "" || status !== "" || undefined}><summary className="cursor-pointer font-semibold">{b.nama} · {b.kode} · {b.jumlah_aset} aset · {label(b.status)}</summary>
                {manage && <div className="mt-3 flex flex-wrap gap-3"><Tombol varian="secondary" onClick={() => setTarget({ kind: "areas", parent: b.id })}>Tambah area di {b.nama}</Tombol><Tombol varian="secondary" onClick={() => setChange({ kind: "buildings", id: b.id, nama: b.nama, status: b.status === "AKTIF" ? "NONAKTIF" : "AKTIF" })}>{b.status === "AKTIF" ? "Nonaktifkan" : "Aktifkan"} gedung {b.nama}</Tombol></div>}
                <ul className="mt-4 flex flex-col gap-4 border-l border-border-subtle pl-4">{b.areas.map((a) => <li key={a.id}><details key={`${a.id}-${q}-${status}`} open={q !== "" || status !== "" || undefined}><summary className="cursor-pointer font-medium">{a.nama} · {a.kode} · {a.jumlah_aset} aset</summary>
                    {manage && <Tombol className="mt-3" varian="secondary" onClick={() => setTarget({ kind: "rooms", parent: a.id })}>Tambah ruangan di {a.nama}</Tombol>}
                    <ul className="mt-3 flex flex-col gap-3 pl-4">{a.rooms.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3"><a className="text-text-link" href={`/lokasi/ruangan/${r.id}`}>{r.nama} · {r.kode} · {r.jumlah_aset} aset · {label(r.status)}</a>{manage && <div className="flex flex-wrap gap-2"><Tombol varian="secondary" onClick={() => setTarget({ kind: "rooms", room: r })}>Ubah {r.nama}</Tombol><Tombol varian="secondary" onClick={() => setChange({ kind: "rooms", id: r.id, nama: r.nama, status: r.status === "AKTIF" ? "NONAKTIF" : "AKTIF" })}>{r.status === "AKTIF" ? "Nonaktifkan" : "Aktifkan"} {r.nama}</Tombol></div>}</li>)}</ul>
                </details></li>)}</ul>
            </details>
        </li>)}</ul>}
        {target && <LocationForm target={target} onClose={() => setTarget(null)} />}
        <DialogKonfirmasi buka={change !== null} onTutup={() => setChange(null)} judul={`${change?.status === "AKTIF" ? "Aktifkan" : "Nonaktifkan"} ${change?.nama ?? ""}?`} labelAksi="Konfirmasi" sibuk={update.isPending} onKonfirmasi={() => update.mutate()}>{update.isError ? <KeadaanGalat galat={update.error} onCobaLagi={() => update.reset()} /> : "Lokasi yang masih memuat aset harus dikosongkan terlebih dahulu. Reservasi yang sudah disetujui tetap berlaku."}</DialogKonfirmasi>
    </div>;
}
