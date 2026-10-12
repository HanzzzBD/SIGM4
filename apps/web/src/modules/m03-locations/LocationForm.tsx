import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { api } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { KeadaanGalat } from "../../shared/states";
import { Isian, Pilihan, Tombol } from "../../shared/ui/primitives";
import { JENIS, label, responsibleQuery } from "./api";
import type { Room } from "./api";

export type Target = { readonly kind: "buildings" | "areas" | "rooms"; readonly parent?: string; readonly room?: Room };
export default function LocationForm({ target, onClose }: { readonly target: Target; readonly onClose: () => void }) {
    const qc = useQueryClient();
    const can = useCan();
    const people = useQuery({ ...responsibleQuery, enabled: target.kind === "rooms" && can("user.view") });
    const room = target.room;
    const [nama, setNama] = useState(room?.nama ?? "");
    const [kode, setKode] = useState(room?.kode ?? "");
    const [jenis, setJenis] = useState<string>(room?.jenis ?? "KELAS");
    const [capacity, setCapacity] = useState(room?.kapasitas?.toString() ?? "");
    const [owner, setOwner] = useState(room?.penanggung_jawab_id ?? "");
    const [reserve, setReserve] = useState(room?.dapat_direservasi ?? false);
    const [student, setStudent] = useState(room?.boleh_direservasi_siswa ?? false);
    const [extra, setExtra] = useState("");
    const save = useMutation({ mutationFn: async () => {
        const common = { nama: nama.trim(), kode: kode.trim() };
        const body = target.kind === "buildings" ? { ...common, keterangan: extra.trim() || null } : target.kind === "areas" ? { ...common, building_id: Number(target.parent), lantai: extra === "" ? null : Number(extra) } : { ...common, area_id: Number(room?.area_id ?? target.parent), jenis, kapasitas: capacity === "" ? null : Number(capacity), penanggung_jawab_id: owner === "" ? null : Number(owner), dapat_direservasi: reserve, boleh_direservasi_siswa: student };
        if (room) await api.put(`/rooms/${room.id}`, body); else await api.post(`/${target.kind}`, body);
    }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["locations"] }); onClose(); } });
    const title = `${room ? "Ubah" : "Tambah"} ${target.kind === "buildings" ? "gedung" : target.kind === "areas" ? "area" : "ruangan"}`;
    return <Dialog.Root open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}><Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-overlay" />
        <Dialog.Content className="fixed inset-4 m-auto h-fit max-h-full max-w-modal-sm overflow-auto rounded-lg border border-border-subtle bg-surface-default p-6 shadow-2">
            <Dialog.Title className="text-lg font-semibold text-text-heading">{title}</Dialog.Title>
            <Dialog.Description className="text-sm text-text-secondary">Kode harus unik pada tingkat lokasi yang sama.</Dialog.Description>
            <form className="mt-4 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
                <Isian label="Nama" required maxLength={150} value={nama} onChange={(e) => setNama(e.target.value)} />
                <Isian label="Kode" required maxLength={50} value={kode} onChange={(e) => setKode(e.target.value)} />
                {target.kind !== "rooms" ? <Isian label={target.kind === "areas" ? "Lantai" : "Keterangan"} type={target.kind === "areas" ? "number" : "text"} value={extra} onChange={(e) => setExtra(e.target.value)} /> : <>
                    <Pilihan label="Jenis ruangan" value={jenis} opsi={JENIS.map((s) => ({ nilai: s, label: label(s) }))} onChange={(e) => setJenis(e.target.value)} />
                    <Isian label="Kapasitas orang" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                    {can("user.view") && <Pilihan label="Penanggung jawab" kosong="Belum ditetapkan" value={owner} disabled={people.isPending || people.isError} opsi={[...(owner && !(people.data ?? []).some((p) => p.id === owner) ? [{ nilai: owner, label: "Penanggung jawab saat ini" }] : []), ...(people.data ?? []).map((p) => ({ nilai: p.id, label: p.nama }))]} onChange={(e) => setOwner(e.target.value)} />}
                    {people.isError && <KeadaanGalat galat={people.error} onCobaLagi={() => void people.refetch()} />}
                    <label><input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} /> Dapat direservasi</label>
                    <label><input type="checkbox" checked={student} onChange={(e) => setStudent(e.target.checked)} /> Boleh direservasi siswa</label>
                </>}
                {save.isError && <KeadaanGalat galat={save.error} onCobaLagi={() => save.reset()} />}
                <footer className="flex justify-end gap-3"><Tombol type="button" varian="secondary" disabled={save.isPending} onClick={onClose}>Batal</Tombol><Tombol type="submit" sibuk={save.isPending}>Simpan</Tombol></footer>
            </form>
        </Dialog.Content>
    </Dialog.Portal></Dialog.Root>;
}
