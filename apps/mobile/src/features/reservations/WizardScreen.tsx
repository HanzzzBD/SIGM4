import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { AssetReservationBodySchema, RoomReservationBodySchema } from "@sigm4/schemas";
import type { AssetReservationBody, RoomReservationBody, RoomReservationPreview } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { MobileApiError } from "../../shared/api/client";
import { BottomSheet, Button, Card, Chips, DateField, Input, Label, MultiChips, Notice, Screen, SectionHeading, StatusBadge, Stepper, Toggle, tokens as t } from "../../shared/ui";
import { dateWib, isoWib, longDate, midnightWib, shiftDay, timeWib, validTime } from "../../shared/wib";
import { loadAssets, loadDetail, loadRooms, preview, submit } from "./api";
import { EMPTY_ASSET, EMPTY_ROOM, WEEKDAYS, assetBody, draftsFromDetail, draftsFromParams, nearestSlot, overlapping, previewSummary, roomBody, roomsWithCapacity, timeOptions, timeProblem } from "./model";
import type { AssetDraft, RoomDraft } from "./model";

const STEPS = ["Objek & Waktu", "Detail", "Tinjau"] as const;
const DATE_STATE = { TERSEDIA: { label: "Tersedia", tone: "success" }, BENTROK: { label: "Bentrok", tone: "error" }, TIDAK_SAH: { label: "Tidak dapat diajukan", tone: "warning" }, DILEWATI: { label: "Dilewati", tone: "pending" } } as const;
type Body = RoomReservationBody | AssetReservationBody;

/** MS-46 — padanan P-29: tiga layar penuh (UXD-04) untuk ruangan, aset, atau gabungan (BR-024b). */
export function WizardScreen() {
    const params = useLocalSearchParams<{ mode?: string; ruangan?: string; tanggal?: string; kategori?: string; mulai?: string; selesai?: string; dari?: string }>();
    const { state, api, offlineOnly } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const today = dateWib(Date.now()), initial = useRef(draftsFromParams(params, today));
    const [mode, setMode] = useState(initial.current.mode), [room, setRoom] = useState<RoomDraft>(initial.current.room), [asset, setAsset] = useState<AssetDraft>(initial.current.asset);
    const [step, setStep] = useState(0), [review, setReview] = useState<{ body: Body; result: RoomReservationPreview } | null>(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState<{ text: string; code?: string } | null>(null), [quit, setQuit] = useState(false);
    const key = useRef<{ body: string; key: string } | null>(null);
    useEffect(() => { // Ubah Jadwal / Ajukan Ulang: pengajuan BARU terisi dari reservasi lama (BR-024).
        if (!params.dari || !/^[1-9]\d*$/.test(params.dari)) return;
        void loadDetail(api, params.dari).then((detail) => { const d = draftsFromDetail(detail); setMode(d.mode); if (d.mode === "RUANGAN") setRoom(d.room); else setAsset(d.asset); }).catch((e: unknown) => setError({ text: e instanceof Error ? e.message : "Pengajuan lama belum dimuat." }));
    }, [api, params.dari]);
    const rangeStart = mode === "RUANGAN" ? midnightWib(room.date).toISOString() : isoWib(asset.startDate, asset.startTime), rangeEnd = mode === "RUANGAN" ? midnightWib(shiftDay(room.date, 1)).toISOString() : isoWib(asset.endDate, asset.endTime);
    const assetRange = validTime(asset.startTime) && validTime(asset.endTime) && `${asset.endDate}${asset.endTime}` > `${asset.startDate}${asset.startTime}`;
    const rooms = useResource(`${account}:wizard-rooms:${rangeStart}:${rangeEnd}`, useCallback((signal: AbortSignal) => (mode === "RUANGAN" || assetRange) ? loadRooms(api, rangeStart, rangeEnd, signal) : Promise.resolve(null), [api, rangeStart, rangeEnd, mode, assetRange]));
    const assets = useResource(`${account}:wizard-assets:${rangeStart}:${rangeEnd}`, useCallback((signal: AbortSignal) => mode === "ASET" && assetRange ? loadAssets(api, { dari: rangeStart, sampai: rangeEnd, per_page: 100 }, signal) : Promise.resolve(null), [api, rangeStart, rangeEnd, mode, assetRange]));
    if (!Object.hasOwn(permissions, "reservation.create")) return <Screen title="Ajukan Reservasi"><Notice message="Anda tidak memiliki izin mengajukan reservasi."/></Screen>;
    const r = (patch: Partial<RoomDraft>) => { setError(null); setRoom((v) => ({ ...v, ...patch })); }, a = (patch: Partial<AssetDraft>) => { setError(null); setAsset((v) => ({ ...v, ...patch })); };
    const data = rooms.data, times = data ? timeOptions(data) : { start: [], end: [] };
    const problem = mode === "RUANGAN" ? data ? timeProblem(data, room) : "Memuat ketersediaan ruangan…" : !assetRange ? "Isi rentang pinjam yang sah (jam HH:MM)." : asset.selections.some((s) => !s.category || !(Number(s.quantity) > 0)) ? "Pilih kategori dan jumlah unit." : asset.units.length > 0 && asset.units.length !== Number(asset.selections[0]?.quantity) ? "Jumlah unit manual harus sama dengan jumlah unit." : null;
    const suggestion = mode === "RUANGAN" && data && !room.recurring && problem === "Ruangan sudah terpakai pada rentang ini." ? nearestSlot(data, room.room, room.date, room.start, room.end) : null;
    const capacity = data?.ruangan.find((x) => x.id === room.room)?.kapasitas ?? null, participants = Number(room.participants);
    const toReview = async (body: Body = mode === "RUANGAN" ? roomBody(room) : assetBody(asset)) => {
        const parsed = mode === "RUANGAN" ? RoomReservationBodySchema.safeParse(body) : AssetReservationBodySchema.safeParse(body);
        if (!parsed.success) { setError({ text: parsed.error.issues.map((i) => i.message).join(" ") }); return; }
        setBusy(true); setError(null);
        try { const result = await preview(api, body); setReview({ body, result }); setStep(2); }
        catch (e) { setError({ text: e instanceof Error ? e.message : "Pengajuan belum dapat ditinjau.", ...(e instanceof MobileApiError ? { code: e.code } : {}) }); } finally { setBusy(false); }
    };
    const send = async () => {
        if (!review || busy) return;
        const text = JSON.stringify(review.body); if (key.current?.body !== text) key.current = { body: text, key: randomUUID() };
        setBusy(true); setError(null);
        try { const created = await submit(api, review.body, key.current.key); router.replace(`/reservasi/${created.id}` as "/scan"); }
        catch (e) { setError({ text: e instanceof Error ? e.message : "Pengajuan belum terkirim. Coba lagi dengan isian yang sama.", ...(e instanceof MobileApiError ? { code: e.code } : {}) }); } finally { setBusy(false); }
    };
    const skip = (date: string, on: boolean) => { const next = { ...room, skip: on ? [...room.skip, date] : room.skip.filter((d) => d !== date) }; setRoom(next); void toReview(roomBody(next)); };
    const summary = review ? previewSummary(review.result.tanggal) : null;
    const dirty = JSON.stringify([room, asset]) !== JSON.stringify([initial.current.room, initial.current.asset]);
    const groups = assets.data?.data.kelompok ?? [], categories = assets.data?.data.kategori ?? [], units = groups.filter((g) => g.kategori.id === asset.selections[0]?.category).flatMap((g) => g.unit.filter((u) => u.tersedia));
    const freeRooms = data ? data.ruangan.filter((x) => mode === "RUANGAN" || overlapping(data.slot, x.id, new Date(rangeStart), new Date(rangeEnd)).length === 0) : [];
    const recurring = (d: { recurring: boolean; days: readonly number[]; until: string }, set: (p: { recurring?: boolean; days?: number[]; until?: string; skip?: string[] }) => void, from: string) => <>
        <Toggle label="Ulangi setiap minggu" value={d.recurring} onChange={(v) => set({ recurring: v, skip: [] })}/>
        {d.recurring && <><MultiChips label="Hari" value={[...d.days]} options={WEEKDAYS.map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => set({ days: v, skip: [] })}/><DateField label="Sampai tanggal" value={d.until} min={from} onChange={(v) => set({ until: v, skip: [] })}/></>}
    </>;
    return <Screen title="Ajukan Reservasi" subtitle="Pengajuan gabungan bersifat semua-atau-tidak-sama-sekali: bila satu objek atau tanggal bentrok, seluruh pengajuan ditolak. Periksa langkah Tinjau sebelum mengirim." onBack={() => step > 0 ? setStep(step - 1) : dirty ? setQuit(true) : router.back()}
        footer={<View style={styles.footer}>{step > 0 && <View style={styles.flex}><Button icon="arrowLeft" title="Kembali" secondary disabled={busy} onPress={() => setStep(step - 1)}/></View>}<View style={styles.flex}>{step === 0 ? <Button icon="arrowRight" title="Lanjut" disabled={problem !== null} onPress={() => setStep(1)}/> : step === 1 ? <Button icon="arrowRight" title="Tinjau" busy={busy} disabled={offlineOnly} onPress={() => void toReview()}/> : <Button icon="send" title="Ajukan" busy={busy} disabled={!summary?.canSubmit || offlineOnly} onPress={() => void send()}/>}</View></View>}>
        <Stepper steps={STEPS} active={step}/>
        {offlineOnly && <Notice message="Pengajuan memerlukan koneksi dan tidak akan diantrekan."/>}
        {error && <Notice message={error.text}/>}{error?.code === "BORROWER_BLOCKED" && Object.hasOwn(permissions, "fine.view") && <Button icon="receipt" title="Lihat denda & kewajiban" secondary onPress={() => router.push("/denda" as "/scan")}/>}
        {suggestion && <Card><Label>Slot terdekat yang kosong: {suggestion.start.replace(":", ".")}–{suggestion.end.replace(":", ".")} WIB.</Label><Button icon="check" title="Pakai slot ini" secondary onPress={() => r(suggestion)}/></Card>}
        {step === 0 && <>
            <Chips label="Yang dipesan" value={mode} options={[{ value: "RUANGAN", label: "Ruangan" }, { value: "ASET", label: "Aset (opsional + ruangan)" }]} onChange={(v) => { setMode(v); setError(null); }}/>
            {mode === "RUANGAN" ? <>
                <DateField label="Tanggal" value={room.date} min={today} onChange={(v) => r({ date: v, start: "", end: "" })}/>
                {rooms.loading && <Label tone="muted">Memuat ruangan…</Label>}{rooms.error && <Notice message={rooms.error}/>}
                {data && <Chips label="Ruangan" value={room.room} options={data.ruangan.map((x) => ({ value: x.id, label: `${x.nama}${x.kapasitas !== null ? ` · ${x.kapasitas}` : ""}` }))} onChange={(v) => r({ room: v })}/>}
                {data && <Chips label="Jam mulai (WIB)" value={room.start} options={times.start.map((v) => ({ value: v, label: v.replace(":", ".") }))} onChange={(v) => r({ start: v, end: room.end && room.end > v ? room.end : "" })}/>}
                {data && room.start && <Chips label="Jam selesai (WIB)" value={room.end} options={times.end.filter((v) => v > room.start).map((v) => ({ value: v, label: v.replace(":", ".") }))} onChange={(v) => r({ end: v })}/>}
            </> : <>
                <View style={styles.row}><View style={styles.flex}><DateField label="Mulai" value={asset.startDate} min={today} onChange={(v) => a({ startDate: v, endDate: v > asset.endDate ? v : asset.endDate, units: [] })}/></View><View style={styles.time}><Input label="Jam" value={asset.startTime} maxLength={5} onChangeText={(v) => a({ startTime: v, units: [] })}/></View></View>
                <View style={styles.row}><View style={styles.flex}><DateField label="Rencana kembali" value={asset.endDate} min={asset.startDate} onChange={(v) => a({ endDate: v, units: [] })}/></View><View style={styles.time}><Input label="Jam" value={asset.endTime} maxLength={5} onChangeText={(v) => a({ endTime: v, units: [] })}/></View></View>
                {assets.loading && assetRange && <Label tone="muted">Memuat aset tersedia…</Label>}{assets.error && <Notice message={assets.error}/>}
                {asset.selections.map((s, i) => <Card key={i}>
                    <Chips label={i === 0 ? "Kategori aset" : `Kategori tambahan ${i}`} value={s.category} options={categories.map((c) => ({ value: c.id, label: `${c.nama} · ${groups.filter((g) => g.kategori.id === c.id).reduce((n, g) => n + g.jumlah_tersedia, 0)} tersedia` }))} onChange={(v) => a({ selections: asset.selections.map((x, j) => j === i ? { ...x, category: v } : x), ...(i === 0 ? { units: [] } : {}) })}/>
                    <Input label="Jumlah unit" value={s.quantity} keyboardType="number-pad" onChangeText={(v) => a({ selections: asset.selections.map((x, j) => j === i ? { ...x, quantity: v.replace(/\D/g, "") } : x) })}/>
                    {i > 0 && <Button icon="close" title="Hapus kategori" secondary compact onPress={() => a({ selections: asset.selections.filter((_, j) => j !== i) })}/>}
                </Card>)}
                {asset.units.length === 0 && <Button icon="plus" title="Tambah kategori aset" secondary onPress={() => a({ selections: [...asset.selections, { category: "", quantity: "1" }] })}/>}
                {/* Pemilihan unit manual hanya bagi pengelola, seperti web (reservation.cancel_any). */}
                {Object.hasOwn(permissions, "reservation.cancel_any") && asset.selections.length === 1 && units.length > 0 && <MultiChips label="Unit manual (opsional)" value={[...asset.units]} options={units.map((u) => ({ value: u.id, label: u.kode_barang }))} onChange={(v) => a({ units: v })}/>}
            </>}
            {problem && !problem.startsWith("Memuat") && <Label tone="muted">{problem}</Label>}
        </>}
        {step === 1 && (mode === "RUANGAN" ? <>
            <Input label="Nama kegiatan" value={room.name} maxLength={200} onChangeText={(v) => r({ name: v })}/>
            <Input label="Jenis kegiatan" value={room.activity} maxLength={100} placeholder="Rapat, Pelatihan, Lomba" onChangeText={(v) => r({ activity: v })}/>
            <Input label="Jumlah peserta" value={room.participants} keyboardType="number-pad" onChangeText={(v) => r({ participants: v.replace(/\D/g, "") })}/>
            {capacity !== null && participants > capacity && data && <Card><Notice tone="info" message={`Peserta melebihi kapasitas ruangan (${capacity} orang).`}/>{roomsWithCapacity(data, room, participants).map((x) => <Button key={x.id} title={`Pindah ke ${x.nama} · ${x.kapasitas}`} secondary compact onPress={() => r({ room: x.id })}/>)}</Card>}
            <Input label="Keperluan (opsional)" value={room.purpose} multiline maxLength={1000} onChangeText={(v) => r({ purpose: v })}/>
            <Input label="Kebutuhan tambahan (opsional)" value={room.needs} multiline maxLength={1000} onChangeText={(v) => r({ needs: v })}/>
            <Input label="Keterangan (opsional)" value={room.note} multiline maxLength={1000} onChangeText={(v) => r({ note: v })}/>
            {recurring(room, (p) => r({ ...p, ...(p.recurring && room.days.length === 0 ? { days: [new Date(`${room.date}T00:00:00Z`).getUTCDay() || 7] } : {}) }), room.date)}
        </> : <>
            <Input label="Keperluan" value={asset.purpose} multiline maxLength={1000} onChangeText={(v) => a({ purpose: v })}/>
            <Input label="Lokasi penggunaan" value={asset.location} maxLength={200} onChangeText={(v) => a({ location: v })}/>
            <Toggle label="Sertakan ruangan (reservasi gabungan)" value={asset.room !== ""} onChange={(on) => a({ room: on ? freeRooms[0]?.id ?? "" : "" })}/>
            {asset.room !== "" && <><Chips label="Ruangan kosong pada rentang ini" value={asset.room} options={freeRooms.map((x) => ({ value: x.id, label: x.nama }))} onChange={(v) => a({ room: v })}/><Input label="Nama kegiatan" value={asset.name} maxLength={200} onChangeText={(v) => a({ name: v })}/><Input label="Jenis kegiatan" value={asset.activity} maxLength={100} onChangeText={(v) => a({ activity: v })}/><Input label="Jumlah peserta" value={asset.participants} keyboardType="number-pad" onChangeText={(v) => a({ participants: v.replace(/\D/g, "") })}/></>}
            {recurring(asset, (p) => a(p), asset.startDate)}
        </>)}
        {step === 2 && review && summary && <>
            <Notice tone="info" message="Semua objek dan tanggal diajukan sekaligus; satu bentrok menolak seluruh pengajuan."/>
            <SectionHeading title={`${summary.booked} tanggal akan dipesan`}/>
            {review.result.tanggal.map((d) => <Card key={d.tanggal}><View style={styles.dateRow}><View style={styles.flex}><Text style={styles.strong}>{longDate(d.tanggal)}</Text><Text style={styles.meta}>{timeWib(d.mulai).replace(":", ".")}–{timeWib(d.selesai).replace(":", ".")} WIB{d.alasan ? ` · ${d.alasan}` : ""}</Text></View><StatusBadge {...DATE_STATE[d.keadaan]}/></View>
                {mode === "RUANGAN" && room.recurring && d.keadaan !== "TERSEDIA" && <Button title={d.keadaan === "DILEWATI" ? "Sertakan lagi" : "Lewati tanggal ini"} secondary compact disabled={busy} onPress={() => skip(d.tanggal, d.keadaan !== "DILEWATI")}/>}</Card>)}
            {summary.blocked > 0 && <Notice message={mode === "RUANGAN" && room.recurring ? "Lewati tanggal yang bentrok atau tidak sah sebelum mengajukan." : "Ubah waktu pada langkah pertama; ada tanggal yang bentrok atau tidak sah."}/>}
            <SectionHeading title="Jalur persetujuan"/>
            <Card>{review.result.jalur_persetujuan.map((l) => <View key={l.urutan} style={styles.dateRow}><Text style={styles.strong}>{l.urutan}. {l.approver}</Text><StatusBadge label={l.akan_dilewati ? "Dilewati" : `${l.sla_jam} jam kerja`} tone={l.akan_dilewati ? "pending" : "info"}/></View>)}
                <Label tone="muted">Pengajuan berjalan {review.result.kuota.berjalan} dari batas {review.result.kuota.batas}.</Label></Card>
        </>}
        <BottomSheet visible={quit} onClose={() => setQuit(false)} title="Batalkan pengajuan?"><View style={styles.sheet}><Label>Isian yang belum dikirim akan hilang.</Label><Button icon="close" title="Ya, batalkan" onPress={() => { setQuit(false); setRoom(EMPTY_ROOM); setAsset(EMPTY_ASSET); router.back(); }}/><Button title="Lanjutkan mengisi" secondary onPress={() => setQuit(false)}/></View></BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({
    footer: { flexDirection: "row", gap: t.space.sm }, flex: { flex: 1, minWidth: 0 }, row: { flexDirection: "row", gap: t.space.sm }, time: { width: t.size.avatar * 2 },
    dateRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, strong: { fontSize: t.font.body, fontWeight: "600", color: t.color.heading }, meta: { fontSize: t.font.small, color: t.color.muted }, sheet: { padding: t.space.md, gap: t.space.md },
});
