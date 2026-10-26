import { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { RoomBlockPreview } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { ExportButtons } from "../../shared/export/ExportButtons";
import { shareFromApi } from "../../shared/export/share";
import { MobileApiError } from "../../shared/api/client";
import { formatTime } from "../../shared/time";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Icon, Input, Label, MiniChart, MultiChips, Notice, Screen, SectionHeading, StatusBadge, Toggle, tokens as t } from "../../shared/ui";
import { dateWib, longDate, rangeLabel } from "../../shared/wib";
import { createBlock, deactivateBlock, loadBlocks, loadRoom, loadRoomAssets, loadTree, loadUsers, previewBlock, saveLocation } from "./api";
import type { Room } from "./api";
import { DAYS, ROOM_TYPES, blockBody, blockDecision, locationBody, typeLabel, visibleTree } from "./model";
import type { BlockForm, LocationForm, LocationKind } from "./model";

const usePerms = () => { const { state } = useAuth(); const p = state.kind === "READY" ? state.session.permissions : {}; return { can: (x: string) => Object.hasOwn(p, x), account: state.kind === "READY" ? state.session.user.id : "" }; };
const message = (e: unknown, fallback: string) => e instanceof MobileApiError && e.details.length > 0 ? e.details.map((d) => d.message).join(" ") : e instanceof Error ? e.message : fallback;
const EMPTY_LOCATION: LocationForm = { nama: "", kode: "", extra: "", jenis: "KELAS", kapasitas: "", pj: "", reservable: false, students: false };
const KONDISI_LABEL: Readonly<Record<string, string>> = { BAIK: "Baik", RUSAK_RINGAN: "Rusak Ringan", RUSAK_BERAT: "Rusak Berat", HILANG: "Hilang" };

/** Isian gedung/area/ruangan dalam C-36 (FR-03.1, FR-03.2; `location.manage`). */
function LocationSheet({ target, onClose, onSaved }: { target: { kind: LocationKind; parent: string; room?: Room } | null; onClose: () => void; onSaved: () => void }) {
    const { api } = useAuth(); const { can, account } = usePerms();
    const [form, setForm] = useState<LocationForm>(EMPTY_LOCATION), [key, setKey] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const users = useResource(`${account}:loc-users`, useCallback((s: AbortSignal) => target?.kind === "rooms" && can("user.view") ? loadUsers(api, s) : Promise.resolve(null), [api, target?.kind]));
    const id = target ? `${target.kind}:${target.parent}:${target.room?.id ?? ""}` : "";
    if (target && key !== id) { setKey(id); setError(null); const r = target.room; setForm(r ? { ...EMPTY_LOCATION, nama: r.nama, kode: r.kode, jenis: r.jenis, kapasitas: r.kapasitas?.toString() ?? "", pj: r.penanggung_jawab_id ?? "", reservable: r.dapat_direservasi, students: r.boleh_direservasi_siswa } : EMPTY_LOCATION); }
    const save = async () => { if (!target) return; const r = locationBody(target.kind, form, target.room?.area_id ?? target.parent); if ("error" in r) { setError(r.error); return; } setBusy(true); setError(null); try { await saveLocation(api, target.kind, r.body, target.room?.id); onSaved(); onClose(); } catch (e) { setError(message(e, "Lokasi belum tersimpan.")); } finally { setBusy(false); } };
    const noun = target?.kind === "buildings" ? "gedung" : target?.kind === "areas" ? "area" : "ruangan";
    return <BottomSheet visible={target !== null} full onClose={onClose} title={`${target?.room ? "Ubah" : "Tambah"} ${noun}`}>{target && <View style={styles.sheet}>
        <Input label="Nama" value={form.nama} maxLength={150} onChangeText={(v) => setForm({ ...form, nama: v })}/><Input label="Kode (unik di tingkat ini)" value={form.kode} maxLength={50} autoCapitalize="characters" onChangeText={(v) => setForm({ ...form, kode: v })}/>
        {target.kind !== "rooms" ? <Input label={target.kind === "areas" ? "Lantai (opsional)" : "Keterangan (opsional)"} value={form.extra} keyboardType={target.kind === "areas" ? "number-pad" : "default"} onChangeText={(v) => setForm({ ...form, extra: v })}/> : <>
            <Chips label="Jenis ruangan" value={form.jenis} options={ROOM_TYPES.map((x) => ({ value: x, label: typeLabel(x) }))} onChange={(v) => setForm({ ...form, jenis: v })}/>
            <Input label="Kapasitas orang (opsional)" value={form.kapasitas} keyboardType="number-pad" onChangeText={(v) => setForm({ ...form, kapasitas: v.replace(/\D/g, "") })}/>
            {users.data && <Chips label="Penanggung jawab" value={form.pj} options={[{ value: "", label: "Belum ditetapkan" }, ...users.data.map((u) => ({ value: u.id, label: u.nama }))]} onChange={(v) => setForm({ ...form, pj: v })}/>}
            <Toggle label="Dapat direservasi" value={form.reservable} onChange={(v) => setForm({ ...form, reservable: v, students: v && form.students })}/><Toggle label="Boleh direservasi siswa" value={form.students} disabled={!form.reservable} onChange={(v) => setForm({ ...form, students: v })}/>
        </>}
        {error && <Notice message={error}/>}<Button icon="check" title="Simpan" busy={busy} onPress={() => void save()}/>
    </View>}</BottomSheet>;
}

/** MS-37 — padanan P-22: pohon gedung → area → ruangan yang dijelajah satu tangan (FR-03.x). */
export function LocationTreeScreen() {
    const { api } = useAuth(); const { can, account } = usePerms(); const permitted = can("location.view"), manage = can("location.manage");
    const tree = useResource(`${account}:loc-tree`, useCallback((s: AbortSignal) => permitted ? loadTree(api, s) : Promise.resolve(null), [api, permitted]));
    const [open, setOpen] = useState<string[]>([]), [q, setQ] = useState(""), [target, setTarget] = useState<{ kind: LocationKind; parent: string } | null>(null);
    if (!permitted) return <Screen title="Lokasi"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat lokasi."/></Screen>;
    const toggle = (id: string) => setOpen(open.includes(id) ? open.filter((x) => x !== id) : [...open, id]), searching = q.trim() !== "";
    const Row = ({ id, title, meta, depth, onAdd }: { id: string; title: string; meta: string; depth: number; onAdd?: () => void }) => <View style={[styles.node, { marginLeft: depth * t.space.md }]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: searching || open.includes(id) }} accessibilityLabel={`${title}, ${meta}`} onPress={() => toggle(id)} style={styles.nodeMain}><Icon name={searching || open.includes(id) ? "chevronDown" : "chevronRight"} color={t.color.iconDefault}/><View style={styles.flex}><Text style={styles.strong}>{title}</Text><Text style={styles.meta}>{meta}</Text></View></Pressable>
        {onAdd && <Pressable accessibilityRole="button" accessibilityLabel={`Tambah di ${title}`} onPress={onAdd} style={styles.add}><Icon name="plus" color={t.color.iconDefault}/></Pressable>}
    </View>;
    return <Screen title="Lokasi" subtitle="Ketuk gedung lalu area untuk membuka ruangan. Angka menunjukkan jumlah aset tercatat.">
        <Input icon="search" label="Cari ruangan" value={q} onChangeText={setQ} placeholder="Nama atau kode"/>
        {manage && <Button icon="plus" title="Tambah gedung" secondary onPress={() => setTarget({ kind: "buildings", parent: "" })}/>}
        {tree.loading && <Label tone="muted">Memuat lokasi…</Label>}{tree.error && <Notice message={tree.error}/>}
        {tree.data?.length === 0 && <EmptyState illustration="empty" title="Belum ada lokasi" description="Gedung, area, dan ruangan akan tampil di sini."/>}
        {tree.data && visibleTree(tree.data, q).map(({ building, areas }) => <Card key={building.id}>
            <Row id={`b${building.id}`} title={building.nama} meta={`${building.kode} · ${building.jumlah_aset} aset${building.status === "NONAKTIF" ? " · nonaktif" : ""}`} depth={0} {...(manage ? { onAdd: () => setTarget({ kind: "areas", parent: building.id }) } : {})}/>
            {(searching || open.includes(`b${building.id}`)) && areas.map(({ area, rooms }) => <View key={area.id}>
                <Row id={`a${area.id}`} title={area.nama} meta={`${area.kode} · ${area.jumlah_aset} aset`} depth={1} {...(manage ? { onAdd: () => setTarget({ kind: "rooms", parent: area.id }) } : {})}/>
                {(searching || open.includes(`a${area.id}`)) && rooms.map((r) => <View key={r.id} style={{ marginLeft: t.space.xl }}><EntityCard icon="mapPin" title={r.nama} meta={[r.kode, `${typeLabel(r.jenis)}${r.kapasitas !== null ? ` · ${r.kapasitas} orang` : ""}`]} statuses={r.status === "NONAKTIF" ? [{ label: "Nonaktif", tone: "pending" }] : []} value={`${r.jumlah_aset}`} onPress={() => router.push(`/lokasi/ruangan/${r.id}` as "/scan")}/></View>)}
            </View>)}
        </Card>)}
        <LocationSheet target={target} onClose={() => setTarget(null)} onSaved={tree.reload}/>
    </Screen>;
}

const EMPTY_BLOCK = (today: string): BlockForm => ({ jenis: "JADWAL_TETAP", label: "", days: [], start: "07:00", end: "09:00", from: today, until: today, startDate: today, endDate: today });
/** Jadwal tetap & blokade manual (FR-07.5; keputusan paket 3): daftar, pratinjau kemunculan/bentrok, buat, nonaktifkan. */
function BlocksPanel({ roomId }: { roomId: string }) {
    const { api } = useAuth(); const { account } = usePerms(); const today = dateWib(Date.now());
    const blocks = useResource(`${account}:blocks:${roomId}`, useCallback((s: AbortSignal) => loadBlocks(api, roomId, s), [api, roomId]));
    const [form, setForm] = useState<BlockForm | null>(null), [preview, setPreview] = useState<RoomBlockPreview | null>(null), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [done, setDone] = useState<string | null>(null);
    const run = async (a: () => Promise<void>) => { setBusy(true); setError(null); try { await a(); } catch (e) { setError(message(e, "Blokade belum tersimpan.")); } finally { setBusy(false); } };
    const check = () => run(async () => { const r = blockBody(form!); if ("error" in r) throw new Error(r.error); setPreview(await previewBlock(api, roomId, r.body)); setReason(""); });
    const create = () => run(async () => { const decision = blockDecision(preview!); const r = blockBody(form!, decision === "CANCEL_RESERVATIONS" ? reason : undefined); if ("error" in r) throw new Error(r.error); const c = await createBlock(api, roomId, r.body); setForm(null); setPreview(null); setDone(`${c.slot_dibuat} slot dibuat${c.reservasi_dibatalkan.length ? `; ${c.reservasi_dibatalkan.length} reservasi dibatalkan` : ""}.`); blocks.reload(); });
    const decision = preview ? blockDecision(preview) : null;
    return <><SectionHeading title="Jadwal tetap & blokade"/>{done && <Notice tone="success" message={done}/>}{error && !form && <Notice message={error}/>}
        <View style={styles.row}><View style={styles.flex}><Button icon="plus" title="Tambah" onPress={() => { setError(null); setPreview(null); setForm(EMPTY_BLOCK(today)); }}/></View><View style={styles.flex}><Button icon="externalLink" title="Impor (web)" secondary onPress={() => { const o = process.env.EXPO_PUBLIC_APP_URL ?? ""; if (o.startsWith("https://")) void Linking.openURL(`${new URL(o).origin}/lokasi/ruangan/${roomId}`).catch(() => undefined); }}/></View></View>
        {blocks.loading && <Label tone="muted">Memuat jadwal…</Label>}{blocks.error && <Notice message={blocks.error}/>}
        {blocks.data?.jadwal_tetap.map((b) => <EntityCard key={`j${b.id}`} icon="calendarClock" title={b.label_kegiatan} meta={[`${DAYS[b.hari - 1]} ${b.jam_mulai.replace(":", ".")}–${b.jam_selesai.replace(":", ".")}`, `${b.berlaku_mulai} s.d. ${b.berlaku_sampai}`]} statuses={[{ label: b.status === "AKTIF" ? "Aktif" : "Nonaktif", tone: b.status === "AKTIF" ? "info" : "pending" }]} {...(b.status === "AKTIF" ? { onPress: () => void run(async () => { const r = await deactivateBlock(api, "JADWAL_TETAP", b.id); setDone(`Jadwal dinonaktifkan; ${r.slot_dilepas} slot dilepas.`); blocks.reload(); }) } : {})}/>)}
        {blocks.data?.blokade_manual.map((b) => <EntityCard key={`m${b.id}`} icon="calendarDays" title={b.label_kegiatan} meta={[rangeLabel(b.mulai, b.selesai)]} statuses={[{ label: b.status === "AKTIF" ? "Aktif" : "Nonaktif", tone: b.status === "AKTIF" ? "info" : "pending" }]} {...(b.status === "AKTIF" ? { onPress: () => void run(async () => { const r = await deactivateBlock(api, "BLOKADE_MANUAL", b.id); setDone(`Blokade dinonaktifkan; ${r.slot_dilepas} slot dilepas.`); blocks.reload(); }) } : {})}/>)}
        {blocks.data && blocks.data.jadwal_tetap.length + blocks.data.blokade_manual.length > 0 && <Label tone="muted">Ketuk aturan aktif untuk menonaktifkannya; aturan tidak disunting, buat yang baru.</Label>}
        <BottomSheet visible={form !== null} full onClose={() => setForm(null)} title="Tambah jadwal / blokade">{form && <View style={styles.sheet}>
            <Chips label="Jenis" value={form.jenis} options={[{ value: "JADWAL_TETAP", label: "Jadwal tetap mingguan" }, { value: "BLOKADE_MANUAL", label: "Blokade manual" }]} onChange={(v) => { setPreview(null); setForm({ ...form, jenis: v }); }}/>
            <Input label="Label kegiatan" value={form.label} maxLength={100} onChangeText={(v) => { setPreview(null); setForm({ ...form, label: v }); }}/>
            {form.jenis === "JADWAL_TETAP" ? <><MultiChips label="Hari" value={[...form.days]} options={DAYS.map((d, i) => ({ value: i + 1, label: d.slice(0, 3) }))} onChange={(v) => { setPreview(null); setForm({ ...form, days: v }); }}/><DateField label="Berlaku mulai" value={form.from} onChange={(v) => { setPreview(null); setForm({ ...form, from: v }); }}/><DateField label="Berlaku sampai" value={form.until} min={form.from} onChange={(v) => { setPreview(null); setForm({ ...form, until: v }); }}/></>
                : <><DateField label="Tanggal mulai" value={form.startDate} onChange={(v) => { setPreview(null); setForm({ ...form, startDate: v, endDate: v > form.endDate ? v : form.endDate }); }}/><DateField label="Tanggal selesai" value={form.endDate} min={form.startDate} onChange={(v) => { setPreview(null); setForm({ ...form, endDate: v }); }}/></>}
            <View style={styles.row}><View style={styles.flex}><Input label="Jam mulai" value={form.start} maxLength={5} onChangeText={(v) => { setPreview(null); setForm({ ...form, start: v }); }}/></View><View style={styles.flex}><Input label="Jam selesai" value={form.end} maxLength={5} onChangeText={(v) => { setPreview(null); setForm({ ...form, end: v }); }}/></View></View>
            {preview && <Card><Label strong>{preview.kemunculan.length} kemunculan</Label>{preview.dilewati.map((d) => <Label key={d.tanggal} tone="muted">{longDate(d.tanggal)} dilewati · {d.alasan}</Label>)}
                {preview.bentrok_lain.map((b, i) => <StatusBadge key={i} label={`Bentrok ${b.asal}: ${rangeLabel(b.mulai, b.selesai)}`} tone="error"/>)}
                {preview.bentrok_reservasi.map((r) => <StatusBadge key={r.reservation_id} label={`${r.nomor} · ${r.pemohon} · ${formatTime(r.mulai)}`} tone="warning"/>)}
                {decision === "ADJUST" && <Notice message="Sesuaikan waktu: bentrok dengan blokade atau pemeliharaan lain."/>}
                {decision === "CANCEL_RESERVATIONS" && <><Notice tone="info" message="Menyimpan akan membatalkan reservasi yang bentrok dan memberi tahu pemohonnya."/><Input label="Alasan pembatalan reservasi" value={reason} multiline maxLength={1000} onChangeText={setReason}/></>}
            </Card>}
            {error && <Notice message={error}/>}
            {preview ? <Button icon="check" title={decision === "CANCEL_RESERVATIONS" ? "Batalkan bentrok & simpan" : "Simpan"} busy={busy} disabled={decision === "ADJUST" || (decision === "CANCEL_RESERVATIONS" && !reason.trim())} onPress={() => void create()}/> : <Button icon="search" title="Pratinjau" busy={busy} onPress={() => void check()}/>}
        </View>}</BottomSheet>
    </>;
}

/** MS-38 — padanan P-23: identitas ruangan, inventaris + ringkasan kondisi, tambah aset, ubah ruangan, jadwal tetap. */
export function RoomDetailScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { api } = useAuth(); const { can, account } = usePerms();
    const valid = /^[1-9]\d*$/.test(id) && can("location.view");
    const room = useResource(`${account}:room:${id}`, useCallback((s: AbortSignal) => valid ? loadRoom(api, id, s) : Promise.resolve(null), [api, id, valid]));
    const [q, setQ] = useState(""), [kondisi, setKondisi] = useState(""), [page, setPage] = useState(1), [edit, setEdit] = useState(false);
    const assets = useResource(`${account}:room-assets:${id}:${q}:${kondisi}:${page}`, useCallback((s: AbortSignal) => valid && can("asset.view") ? loadRoomAssets(api, id, { q, kondisi, page }, s) : Promise.resolve(null), [api, id, q, kondisi, page, valid]));
    if (!valid) return <Screen title="Detail Ruangan"><EmptyState illustration="noAccess" title="Ruangan tidak dapat dibuka" description="Tautan tidak sah atau Anda tidak memiliki izin melihat lokasi."/></Screen>;
    const r = room.data, sum = assets.data?.data.ringkasan;
    return <Screen title={r?.nama ?? "Detail Ruangan"}>
        {room.loading && <Label tone="muted">Memuat ruangan…</Label>}{room.error && <Notice message={room.error}/>}
        {r && <EntityCard icon="mapPin" title={r.nama} meta={[r.kode, `${typeLabel(r.jenis)}${r.kapasitas !== null ? ` · ${r.kapasitas} orang` : ""}`]} statuses={[r.status === "AKTIF" ? { label: r.dapat_direservasi ? "Dapat direservasi" : "Tidak direservasikan", tone: r.dapat_direservasi ? "success" : "pending" } : { label: "Nonaktif", tone: "pending" }]}/>}
        <View style={styles.row}>{can("asset.create") && <View style={styles.flex}><Button icon="plus" title="Tambah aset" onPress={() => router.push(`/aset/baru?ruangan=${id}` as "/scan")}/></View>}{can("location.manage") && r && <View style={styles.flex}><Button icon="settings" title="Ubah ruangan" secondary onPress={() => setEdit(true)}/></View>}</View>
        {can("asset.view") && <>
            {sum && <Card><View style={styles.row}><MiniChart kind="donut" values={Object.values(sum.per_kondisi)} summary={`${sum.total} aset: ${Object.entries(sum.per_kondisi).map(([k, v]) => `${KONDISI_LABEL[k]} ${v}`).join(", ")}`}/><View style={styles.flex}><Text style={styles.big}>{sum.total} aset</Text><Text style={styles.meta}>{sum.jumlah_dipinjam} dipinjam · {sum.jumlah_dalam_perbaikan} dalam perbaikan</Text></View></View></Card>}
            {can("report.export") && <ExportButtons formats={["xlsx", "pdf"]} onExport={(format) => shareFromApi(api, `/rooms/${id}/assets/export`, { q: q || undefined, "filter[kondisi]": kondisi || undefined, format }, `inventaris-ruangan-${r?.kode ?? id}`, format)}/>}
            <Input icon="search" label="Cari aset di ruangan" value={q} onChangeText={(v) => { setQ(v); setPage(1); }}/>
            <Chips label="Kondisi" value={kondisi} options={[{ value: "", label: "Semua" }, ...Object.entries(KONDISI_LABEL).map(([value, label]) => ({ value, label }))]} onChange={(v) => { setKondisi(v); setPage(1); }}/>
            {assets.error && <Notice message={assets.error}/>}{assets.data?.data.assets.length === 0 && <EmptyState illustration="empty" title="Belum ada aset" description="Aset di ruangan ini akan tampil di sini."/>}
            {assets.data?.data.assets.map((a) => <EntityCard key={a.kode_barang} icon="package" title={a.nama} meta={[a.kode_barang]} statuses={[{ label: KONDISI_LABEL[a.kondisi] ?? a.kondisi, tone: a.kondisi === "BAIK" ? "success" : a.kondisi === "RUSAK_RINGAN" ? "warning" : "error" }]} {...(a.id ? { onPress: () => router.push(`/aset/${a.id}` as "/scan") } : {})}/>)}
            {assets.data && assets.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{assets.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= assets.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
        </>}
        {can("reservation.fixed_schedule") && <BlocksPanel roomId={id}/>}
        <LocationSheet target={edit && r ? { kind: "rooms", parent: r.area_id, room: r } : null} onClose={() => setEdit(false)} onSaved={room.reload}/>
    </Screen>;
}
const styles = StyleSheet.create({
    row: { flexDirection: "row", gap: t.space.sm, alignItems: "center" }, flex: { flex: 1, minWidth: 0 }, sheet: { padding: t.space.md, gap: t.space.md },
    node: { flexDirection: "row", alignItems: "center", minHeight: t.size.rowMobile }, nodeMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: t.space.sm, minHeight: t.size.touch },
    add: { width: t.size.touch, height: t.size.touch, alignItems: "center", justifyContent: "center" }, strong: { fontSize: t.font.body, fontWeight: "600", color: t.color.heading }, meta: { fontSize: t.font.small, color: t.color.muted }, big: { fontSize: t.font.heading, fontWeight: "700", color: t.color.heading },
});
