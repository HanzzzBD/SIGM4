// P-29 / UXD-04: tiga langkah untuk aset, dengan satu pengajuan gabungan BR-024b.
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AssetAvailabilityQuerySchema, AssetReservationBodySchema } from "@sigm4/schemas";
import type { AssetReservationBody, RoomReservationCreated, RoomReservationPreview } from "@sigm4/schemas";
import { useEffect, useRef, useState } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanMemuat, useDaring } from "../../shared/states";
import { Isian, KotakCentang, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import { hariIniWib, ketersediaanQuery } from "../m07-reservation-room";
import { availabilityQuery, previewAssetReservation, submitAssetReservation } from "./api";

export interface AssetWizardInitial { readonly category?: string | undefined; readonly quantity?: number | undefined; readonly units?: string | undefined; readonly room?: string | undefined; readonly start?: string | undefined; readonly end?: string | undefined; readonly purpose?: string | undefined; readonly location?: string | undefined; readonly name?: string | undefined; readonly activity?: string | undefined; readonly participants?: number | undefined; readonly selections?: readonly { category: string; quantity: number }[] | undefined; readonly pattern?: { hari: readonly number[]; sampai: string } | undefined }
const inWib = (value: string | undefined, fallback: string) => value === undefined ? fallback : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 7 * 3_600_000).toISOString().slice(0, 16) : fallback;
export default function AssetReservationWizardPage({ initial, onCancel, onCreated }: { readonly initial: AssetWizardInitial; readonly onCancel: () => void; readonly onCreated: (result: RoomReservationCreated) => void }) {
    const can = useCan(), online = useDaring();
    const manualAllowed = can("reservation.cancel_any");
    const [step, setStep] = useState<1 | 2 | 3>(1), [category, setCategory] = useState(initial.category ?? ""), [quantity, setQuantity] = useState(initial.quantity ?? 1);
    const [start, setStart] = useState(inWib(initial.start, `${hariIniWib()}T08:00`)), [end, setEnd] = useState(inWib(initial.end, `${hariIniWib()}T17:00`));
    const [purpose, setPurpose] = useState(initial.purpose ?? ""), [location, setLocation] = useState(initial.location ?? ""), [room, setRoom] = useState(initial.room ?? "");
    const [name, setName] = useState(initial.name ?? ""), [activity, setActivity] = useState(initial.activity ?? ""), [participants, setParticipants] = useState(initial.participants ?? 1);
    const [manual, setManual] = useState(manualAllowed && initial.units !== undefined), [units, setUnits] = useState((initial.units ?? "").split(",").filter(Boolean));
    const [unitPage, setUnitPage] = useState(1);
    const [extra, setExtra] = useState(initial.selections?.slice(1) ?? []);
    const [recurring, setRecurring] = useState(initial.pattern !== undefined), [days, setDays] = useState<readonly number[]>(initial.pattern?.hari ?? []), [until, setUntil] = useState(initial.pattern?.sampai ?? start.slice(0, 10));
    const [errors, setErrors] = useState<Record<string, string>>({}), [failure, setFailure] = useState<string | null>(null);
    const [review, setReview] = useState<RoomReservationPreview | null>(null), [body, setBody] = useState<AssetReservationBody | null>(null);
    const key = useRef<string | null>(null), heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => { heading.current?.focus(); }, [step]);
    const parsedRange = AssetAvailabilityQuerySchema.safeParse({ dari: `${start}:00+07:00`, sampai: `${end}:00+07:00`, kategori_id: category || undefined, per_page: 100 });
    const catalogue = useQuery({ ...availabilityQuery(parsedRange.success ? parsedRange.data : { dari: "", sampai: "", page: 1, per_page: 100, sort: "nama" }), enabled: step === 1 && can("reservation.view") && parsedRange.success && online });
    const rooms = useQuery({ ...ketersediaanQuery(`${start}:00+07:00`, `${end}:00+07:00`, {}), enabled: step === 2 && can("reservation.view") && parsedRange.success && online });
    const availableUnits = catalogue.data?.data.kelompok.filter((g) => g.kategori.id === category).flatMap((g) => g.unit.filter((u) => u.tersedia)) ?? [];
    const preview = useMutation({ mutationFn: previewAssetReservation });
    const submit = useMutation({ mutationFn: ({ payload, token }: { payload: AssetReservationBody; token: string }) => submitAssetReservation(payload, token) });
    const build = () => AssetReservationBodySchema.safeParse({ jenis: "ASET", aset: [{ category_id: Number(category), jumlah: quantity, ...(manual ? { asset_ids: units.map(Number) } : {}) }, ...extra.map((e) => ({ category_id: Number(e.category), jumlah: e.quantity }))], waktu_mulai: `${start}:00+07:00`, waktu_selesai: `${end}:00+07:00`, keperluan: purpose, lokasi_penggunaan: location, ...(room === "" ? {} : { room_id: Number(room), nama_kegiatan: name, jenis_kegiatan: activity, jumlah_peserta: participants }), ...(recurring ? { pengulangan: { hari: days, sampai: until } } : {}) });
    const toReview = async () => {
        const parsed = build();
        if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0] as string, i.message]))); return; }
        try { setFailure(null); const result = await preview.mutateAsync(parsed.data); setBody(parsed.data); setReview(result); key.current = crypto.randomUUID(); setStep(3); }
        catch (error) { setFailure(error instanceof Error ? error.message : "Pengajuan tidak dapat ditinjau."); }
    };
    return <div className="flex flex-col gap-6">
        <header><h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold text-text-heading">Pengajuan Reservasi Aset</h1><p className="mt-1 text-base text-text-secondary">Alokasi otomatis dapat mengganti unit dengan unit lain sekategori. Pemilihan belum mengunci aset.</p></header>
        <ol aria-label="Langkah pengajuan" className="flex flex-wrap gap-4">{["Aset & Jadwal", "Keperluan & Lokasi", "Tinjau & Ajukan"].map((label, index) => <li key={label} aria-current={index + 1 === step ? "step" : undefined} className="text-sm font-medium">{index + 1}. {label}</li>)}</ol>
        {!online && <Peringatan varian="warning">Anda sedang luring. Sambungkan kembali sebelum meninjau atau mengajukan.</Peringatan>}
        {!can("reservation.view") && <Peringatan varian="warning">Anda memerlukan akses melihat reservasi untuk memilih aset dan ruangan.</Peringatan>}
        {failure !== null && <Peringatan varian="error">{failure} <Link to="/katalog-aset" search={{ mulai: start, selesai: end, kategori: category || undefined }} className="text-text-link underline">Lihat ketersediaan dan tanggal alternatif</Link></Peringatan>}
        {Object.values(errors).length > 0 && <Peringatan varian="error">{Object.values(errors).join(" ")}</Peringatan>}
        {step === 1 && <section className="flex flex-col gap-4" aria-label="Aset dan jadwal">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Isian label="Mulai peminjaman (WIB)" type="datetime-local" required value={start} onChange={(e) => { setStart(e.target.value); setUnits([]); }} /><Isian label="Rencana pengembalian (WIB)" type="datetime-local" required value={end} onChange={(e) => { setEnd(e.target.value); setUnits([]); }} /></div>
            {!parsedRange.success && <Peringatan varian="warning">{parsedRange.error.issues[0]?.message ?? "Pilih rentang yang sah."}</Peringatan>}
            {catalogue.isPending && online && can("reservation.view") && parsedRange.success && <KeadaanMemuat label="Memuat aset tersedia" />}
            {catalogue.isError && <KeadaanGalat galat={catalogue.error} onCobaLagi={() => void catalogue.refetch()} />}
            <Pilihan label="Kategori aset" required value={category} kosong="Pilih kategori" opsi={(catalogue.data?.data.kategori ?? []).map((c) => ({ nilai: c.id, label: c.nama }))} onChange={(e) => { setCategory(e.target.value); setUnits([]); setUnitPage(1); }} />
            <Isian label="Jumlah unit" type="number" min={1} required value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} galat={errors["aset"]} />
            {manualAllowed && <KotakCentang label="Tentukan unit secara manual" checked={manual} disabled={extra.length > 0} onCheckedChange={setManual} />}
            {extra.map((selection, index) => <div key={index} className="grid grid-cols-1 items-end gap-3 md:grid-cols-3"><Pilihan label={`Kategori tambahan ${index + 1}`} value={selection.category} kosong="Pilih kategori" opsi={(catalogue.data?.data.kategori ?? []).map((c) => ({ nilai: c.id, label: c.nama }))} onChange={(e) => setExtra((old) => old.map((s, i) => i === index ? { ...s, category: e.target.value } : s))} /><Isian label={`Jumlah kategori tambahan ${index + 1}`} type="number" min={1} value={selection.quantity} onChange={(e) => setExtra((old) => old.map((s, i) => i === index ? { ...s, quantity: Number(e.target.value) } : s))} /><Tombol varian="secondary" onClick={() => setExtra((old) => old.filter((_, i) => i !== index))}>Hapus kategori {index + 1}</Tombol></div>)}
            <Tombol varian="secondary" disabled={manual} onClick={() => setExtra((old) => [...old, { category: "", quantity: 1 }])}>Tambahkan kategori aset</Tombol>
            <KotakCentang label="Reservasi berulang mingguan" checked={recurring} onCheckedChange={setRecurring} />
            {recurring && <div className="flex flex-col gap-3"><div className="flex flex-wrap gap-3">{["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].map((label, i) => <KotakCentang key={label} label={label} checked={days.includes(i + 1)} onCheckedChange={(checked) => setDays((old) => checked ? [...old, i + 1] : old.filter((d) => d !== i + 1))} />)}</div><Isian label="Berulang sampai" type="date" required min={start.slice(0, 10)} value={until} onChange={(e) => setUntil(e.target.value)} /></div>}
            {manual && <div className="flex flex-col gap-2">{availableUnits.slice((unitPage - 1) * 20, unitPage * 20).map((u) => <KotakCentang key={u.id} label={u.kode_barang} checked={units.includes(u.id)} onCheckedChange={(checked) => setUnits((old) => checked ? [...old, u.id] : old.filter((id) => id !== u.id))} />)}<div className="flex gap-2"><Tombol varian="secondary" disabled={unitPage <= 1} onClick={() => setUnitPage(unitPage - 1)}>Unit sebelumnya</Tombol><Tombol varian="secondary" disabled={unitPage * 20 >= availableUnits.length} onClick={() => setUnitPage(unitPage + 1)}>Unit berikutnya</Tombol></div></div>}
            <Tombol disabled={!online || !parsedRange.success || category === "" || !Number.isSafeInteger(quantity) || quantity < 1 || (manual && units.length !== quantity)} onClick={() => { setErrors({}); setStep(2); }}>Lanjutkan</Tombol>
        </section>}
        {step === 2 && <section className="flex flex-col gap-4" aria-label="Keperluan dan lokasi">
            <Isian label="Keperluan" required value={purpose} onChange={(e) => setPurpose(e.target.value)} galat={errors["keperluan"]} /><Isian label="Lokasi penggunaan" required value={location} onChange={(e) => setLocation(e.target.value)} galat={errors["lokasi_penggunaan"]} />
            <Pilihan label="Ruangan pendukung (opsional)" value={room} kosong="Tanpa reservasi ruangan" opsi={(rooms.data?.ruangan ?? []).map((r) => ({ nilai: r.id, label: r.nama }))} onChange={(e) => setRoom(e.target.value)} />
            {rooms.isError && <KeadaanGalat galat={rooms.error} onCobaLagi={() => void rooms.refetch()} />}
            {room !== "" && <><Peringatan varian="info">Ruangan dan seluruh aset diproses dalam satu persetujuan. Bila salah satu tidak tersedia atau ditolak, seluruh pengajuan ditolak. Penggunaan ruangan dicatat terpisah dari serah terima aset.</Peringatan><Isian label="Nama kegiatan" required value={name} onChange={(e) => setName(e.target.value)} /><Isian label="Jenis kegiatan" required value={activity} onChange={(e) => setActivity(e.target.value)} /><Isian label="Jumlah peserta" type="number" min={1} required value={participants} onChange={(e) => setParticipants(Number(e.target.value))} /></>}
            <div className="flex gap-2"><Tombol varian="secondary" onClick={() => { key.current = null; setStep(1); }}>Kembali</Tombol><Tombol sibuk={preview.isPending} disabled={!online} onClick={() => void toReview()}>Tinjau pengajuan</Tombol></div>
        </section>}
        {step === 3 && review !== null && body !== null && <section className="flex flex-col gap-4" aria-label="Tinjau pengajuan">
            <p className="text-base">{quantity + extra.reduce((n, e) => n + e.quantity, 0)} unit · {purpose} · {location}</p><p className="text-sm">{start.replace("T", " ")} sampai {end.replace("T", " ")} WIB</p>
            {review.tanggal.map((d) => <div key={d.tanggal} className="flex flex-wrap items-center gap-2"><span>{d.tanggal}</span><Lencana varian={d.keadaan === "TERSEDIA" ? "success" : "warning"}>{d.keadaan === "TERSEDIA" ? "Tersedia" : d.keadaan === "BENTROK" ? "Bentrok" : d.keadaan === "DILEWATI" ? "Dilewati" : "Tidak dapat diajukan"}</Lencana>{d.alasan !== null && <p>{d.alasan}</p>}{recurring && <KotakCentang label={`Lewati ${d.tanggal}`} checked={d.keadaan === "DILEWATI"} disabled={preview.isPending || submit.isPending} onCheckedChange={(checked) => { const next = { ...body, lewati: checked ? [...(body.lewati ?? []), d.tanggal] : (body.lewati ?? []).filter((date) => date !== d.tanggal) }; void preview.mutateAsync(next).then((value) => { setBody(next); setReview(value); key.current = crypto.randomUUID(); }).catch((error: unknown) => setFailure(error instanceof Error ? error.message : "Tinjauan gagal diperbarui.")); }} />}</div>)}
            <h2 className="text-lg font-semibold">Jalur persetujuan</h2><ol className="flex flex-col gap-2">{review.jalur_persetujuan.map((l) => <li key={l.urutan}>{l.urutan}. {l.approver} · SLA {l.sla_jam} jam{l.akan_dilewati === null ? "" : ` · ${l.akan_dilewati}`}</li>)}</ol>
            <p className="text-sm">Kuota tertunda: {review.kuota.berjalan} dari {review.kuota.batas}.</p>
            <div className="flex gap-2"><Tombol varian="secondary" disabled={submit.isPending} onClick={() => { key.current = null; setStep(2); }}>Kembali</Tombol><Tombol sibuk={submit.isPending} disabled={!online || preview.isPending || !review.tanggal.some((d) => d.keadaan === "TERSEDIA") || review.tanggal.some((d) => d.keadaan !== "TERSEDIA" && d.keadaan !== "DILEWATI") || review.kuota.berjalan >= review.kuota.batas} onClick={() => { if (key.current === null) return; void submit.mutateAsync({ payload: body, token: key.current }).then(onCreated).catch((error: unknown) => setFailure(error instanceof Error ? error.message : "Pengajuan gagal. Coba lagi.")); }}>Ajukan reservasi</Tombol></div>
        </section>}
        <Tombol varian="secondary" disabled={submit.isPending} onClick={onCancel}>Batal</Tombol>
    </div>;
}
