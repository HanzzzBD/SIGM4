import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { LABEL_STATUS_ASET } from "@sigm4/schemas";
import { ApiError } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat, KeadaanTanpaAkses, useDaring } from "../../shared/states";
import { Isian, KotakCentang, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import { downloadMovementDocument, moveAssets, movementAssetsQuery, movementDocumentQuery, movementRoomsQuery, movementUsersQuery } from "./movement-api";
import type { MovementAsset } from "./movement-api";

const STATUS = { MENUNGGU: "Menunggu pembuatan PDF", BERJALAN: "PDF sedang dibuat", SIAP: "PDF siap diunduh", GAGAL: "PDF gagal dibuat" } as const;
export default function AssetMovementPage({ documentId, onDocument }: { readonly documentId: number | null; readonly onDocument: (id: number | null) => void }) {
    const can = useCan(), daring = useDaring(), client = useQueryClient();
    const edit = can("asset.update") && documentId === null, read = can("asset_movement_document.view");
    const [search, setSearch] = useState(""), [q, setQ] = useState(""), [page, setPage] = useState(1);
    const [selected, setSelected] = useState<MovementAsset[]>([]);
    const [room, setRoom] = useState(""), [date, setDate] = useState(""), [reason, setReason] = useState("");
    const [person, setPerson] = useState<{ id: string; nama: string } | null>(null), [userPage, setUserPage] = useState(1);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const assets = useQuery(movementAssetsQuery(q, page, edit && can("asset.view")));
    const rooms = useQuery(movementRoomsQuery(edit && can("location.view")));
    const users = useQuery(movementUsersQuery(userPage, edit && can("user.view")));
    const report = useQuery(movementDocumentQuery(documentId, read));
    const move = useMutation({ mutationFn: moveAssets, onSuccess: (receipt) => {
        setSelected([]); setErrors({}); onDocument(Number(receipt.id));
        void client.invalidateQueries({ queryKey: ["assets"] });
    } });
    const download = useMutation({ mutationFn: () => downloadMovementDocument(documentId!) });
    const fieldError = (field: string) => errors[field] ?? (move.error instanceof ApiError ? move.error.details.find((detail) => detail.field === field)?.message : undefined);
    const usersOptions = users.data?.data ?? [];
    const selectedPerson = person !== null && !usersOptions.some((value) => value.id === person.id) ? [person, ...usersOptions] : usersOptions;
    function submit(event: FormEvent): void {
        event.preventDefault();
        const invalid: Record<string, string> = {};
        if (selected.length === 0) invalid["asset_ids"] = "Pilih 1–50 aset untuk dipindahkan.";
        if (!room) invalid["room_tujuan_id"] = "Pilih lokasi tujuan.";
        if (!date) invalid["tanggal_mutasi"] = "Isi tanggal mutasi.";
        if (!reason.trim()) invalid["alasan"] = "Isi alasan mutasi.";
        setErrors(invalid);
        if (Object.keys(invalid).length === 0) move.mutate({ asset_ids: selected.map((asset) => Number(asset.id)), room_tujuan_id: Number(room),
            tanggal_mutasi: date, alasan: reason, penanggung_jawab_baru_id: person === null ? null : Number(person.id) });
    }
    const doc = report.data;
    return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header><h1 className="text-2xl font-semibold text-text-primary">Mutasi Lokasi Aset</h1><p className="mt-2 text-base text-text-secondary">Pindahkan hingga 50 aset dalam satu operasi. Satu berita acara memuat seluruh aset yang dipindahkan.</p></header>
        {edit && <section aria-labelledby="move-heading" className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4">
            <h2 id="move-heading" className="text-lg font-semibold text-text-primary">Pilih aset dan tujuan</h2>
            {!can("asset.view") || !can("location.view") ? <KeadaanTanpaAkses aksi={<a href="/" className="text-text-link">Kembali ke Dashboard</a>} /> : <>
                <form onSubmit={(event) => { event.preventDefault(); setQ(search.trim()); setPage(1); }} className="flex flex-wrap items-end gap-2">
                    <Isian label="Cari aset" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
                    <Tombol type="submit" varian="secondary">Cari</Tombol>
                </form>
                {assets.isPending && <KeadaanMemuat label="Memuat daftar aset" baris={3} />}
                {assets.isError && <KeadaanGalat galat={assets.error} onCobaLagi={() => void assets.refetch()} />}
                {assets.data?.data.length === 0 && <KeadaanKosong judul="Tidak ada aset" pesan="Ubah pencarian untuk menemukan aset." aksi={<Tombol onClick={() => { setSearch(""); setQ(""); setPage(1); }}>Hapus pencarian</Tombol>} />}
                <fieldset aria-describedby="selected-count" disabled={move.isPending} className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm font-medium text-text-primary">Aset yang akan dipindahkan</legend>
                    {assets.data?.data.map((asset) => {
                        const checked = selected.some((value) => value.id === asset.id);
                        const allowed = ["TERSEDIA", "DALAM_PERBAIKAN"].includes(asset.status);
                        const status = LABEL_STATUS_ASET[asset.status as keyof typeof LABEL_STATUS_ASET] ?? asset.status;
                        return <div key={asset.id} className="rounded-sm border border-border-subtle p-2"><KotakCentang label={`${asset.kode_barang} — ${asset.nama}`} checked={checked}
                            disabled={!allowed || (!checked && selected.length >= 50) || move.isPending} onCheckedChange={(value) => setSelected((previous) => value ? [...previous, asset] : previous.filter((item) => item.id !== asset.id))} />
                            <p className="mt-1 text-sm text-text-secondary">{status}{!allowed && " — tidak dapat dimutasi"}</p></div>;
                    })}
                </fieldset>
                <p id="selected-count" role="status" className="text-sm text-text-primary">{selected.length} dari maksimal 50 aset dipilih.</p>
                {selected.length > 0 && <ul aria-label="Aset terpilih" className="flex flex-col gap-1">{selected.map((asset) => <li key={asset.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-primary"><span>{asset.kode_barang} — {asset.nama}</span><Tombol varian="tertiary" disabled={move.isPending} aria-label={`Hapus ${asset.kode_barang} dari pilihan`} onClick={() => setSelected((previous) => previous.filter((item) => item.id !== asset.id))}>Hapus</Tombol></li>)}</ul>}
                {fieldError("asset_ids") && <p role="alert" className="text-sm text-error-base">{fieldError("asset_ids")}</p>}
                <nav aria-label="Halaman daftar aset" className="flex flex-wrap items-center gap-2"><Tombol varian="secondary" disabled={page <= 1 || assets.isFetching || move.isPending} onClick={() => setPage(page - 1)}>Aset sebelumnya</Tombol><span className="text-sm text-text-secondary">Halaman {page} dari {Math.max(1, assets.data?.meta.total_pages ?? 1)}</span><Tombol varian="secondary" disabled={page >= (assets.data?.meta.total_pages ?? 1) || assets.isFetching || move.isPending} onClick={() => setPage(page + 1)}>Aset berikutnya</Tombol></nav>
                {rooms.isPending && <KeadaanMemuat label="Memuat lokasi tujuan" baris={2} />}
                {rooms.isError && <KeadaanGalat galat={rooms.error} onCobaLagi={() => void rooms.refetch()} />}
                {users.isError && <KeadaanGalat galat={users.error} onCobaLagi={() => void users.refetch()} />}
                <form noValidate onSubmit={submit} className="flex flex-col gap-4">
                    <Pilihan label="Lokasi tujuan" required kosong="Pilih lokasi aktif" opsi={rooms.data ?? []} value={room} galat={fieldError("room_tujuan_id")} disabled={move.isPending || rooms.isPending || rooms.isError} onChange={(event) => setRoom(event.currentTarget.value)} />
                    <Isian label="Tanggal mutasi" type="date" required value={date} galat={fieldError("tanggal_mutasi")} disabled={move.isPending} onChange={(event) => setDate(event.currentTarget.value)} />
                    <Isian label="Alasan mutasi" required maxLength={500} value={reason} galat={fieldError("alasan")} disabled={move.isPending} onChange={(event) => setReason(event.currentTarget.value)} />
                    {can("user.view") && <><Pilihan label="Penanggung jawab baru" kosong="Pertahankan penanggung jawab tiap aset" opsi={selectedPerson.map((value) => ({ nilai: value.id, label: value.nama }))} value={person?.id ?? ""} galat={fieldError("penanggung_jawab_baru_id")} disabled={move.isPending || users.isPending || users.isError} onChange={(event) => setPerson(selectedPerson.find((value) => value.id === event.currentTarget.value) ?? null)} />
                        <div className="flex flex-wrap gap-2"><Tombol varian="tertiary" disabled={userPage <= 1 || users.isFetching || move.isPending} onClick={() => setUserPage(userPage - 1)}>Pengguna sebelumnya</Tombol><Tombol varian="tertiary" disabled={userPage >= (users.data?.meta.total_pages ?? 1) || users.isFetching || move.isPending} onClick={() => setUserPage(userPage + 1)}>Pengguna berikutnya</Tombol></div></>}
                    {move.isError && <KeadaanGalat galat={move.error} onCobaLagi={() => move.reset()} />}
                    <div><Tombol type="submit" sibuk={move.isPending} disabled={!daring || rooms.isPending || rooms.isError || assets.isPending || selected.length === 0}>Simpan mutasi</Tombol></div>
                </form>
            </>}
        </section>}
        {documentId !== null && !read && (move.data?.id === String(documentId)
            ? <Peringatan varian="success" judul="Mutasi tersimpan">Berita acara hanya dapat dibuka oleh pengguna yang memiliki akses berita acara mutasi.</Peringatan>
            : <KeadaanTanpaAkses aksi={<a href="/" className="text-text-link">Kembali ke Dashboard</a>} />)}
        {documentId !== null && read && report.isPending && <KeadaanMemuat label="Memuat berita acara" baris={3} />}
        {report.isError && <KeadaanGalat galat={report.error} onCobaLagi={() => void report.refetch()} />}
        {doc !== undefined && <section aria-labelledby="document-heading" className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4">
            <h2 id="document-heading" className="text-lg font-semibold text-text-primary">Berita acara mutasi #{doc.id}</h2>
            <Peringatan varian="success" judul="Mutasi tersimpan">{doc.snapshot.aset.length} aset telah dipindahkan. Proses pembuatan PDF tidak mengubah hasil mutasi.</Peringatan>
            <p role="status" aria-live="polite" className="text-base text-text-primary">{STATUS[doc.status]}</p>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><dt className="text-sm text-text-secondary">Tanggal mutasi</dt><dd className="text-text-primary">{doc.snapshot.tanggal_mutasi}</dd></div><div><dt className="text-sm text-text-secondary">Pelaku</dt><dd className="text-text-primary">{doc.snapshot.pelaku.nama}</dd></div><div><dt className="text-sm text-text-secondary">Tujuan</dt><dd className="text-text-primary">{doc.snapshot.tujuan.gedung} / {doc.snapshot.tujuan.area} / {doc.snapshot.tujuan.nama}</dd></div><div><dt className="text-sm text-text-secondary">Alasan</dt><dd className="break-words text-text-primary">{doc.snapshot.alasan}</dd></div></dl>
            <ul aria-label="Isi berita acara" className="flex flex-col gap-2 text-sm text-text-primary">{doc.snapshot.aset.map((asset) => <li key={asset.id}>{asset.kode_barang} — {asset.nama}; asal {asset.asal.gedung} / {asset.asal.area} / {asset.asal.nama}</li>)}</ul>
            {doc.pesan_galat !== null && <Peringatan varian="error" judul="Berita acara belum tersedia">{doc.pesan_galat}</Peringatan>}
            {doc.status === "SIAP" && <div><Tombol sibuk={download.isPending} disabled={!daring} onClick={() => download.mutate()}>Unduh PDF</Tombol></div>}
            {download.isError && <KeadaanGalat galat={download.error} onCobaLagi={() => download.reset()} />}
        </section>}
        {can("asset.update") && documentId !== null && <div><Tombol varian="secondary" onClick={() => { setSelected([]); setReason(""); move.reset(); onDocument(null); }}>Mutasi baru</Tombol></div>}
        {!edit && documentId === null && <KeadaanKosong judul="Buka berita acara mutasi" pesan="Gunakan tautan hasil mutasi untuk membaca dan mengunduh berita acaranya." aksi={<a href="/" className="text-text-link">Kembali ke Dashboard</a>} />}
    </div>;
}
