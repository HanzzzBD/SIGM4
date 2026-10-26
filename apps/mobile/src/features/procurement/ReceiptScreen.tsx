import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import type { ProcurementDetail } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, Notice, Screen, SectionHeading, Toggle, tokens as t } from "../../shared/ui";
import { AttachmentField } from "../../shared/upload/AttachmentField";
import { dateWib } from "../../shared/wib";
import { canReceive, loadProcurement, procurementAction, receiptBody, receivedRow, remaining } from "./model";
import type { ReceiptForm, ReceivedRow } from "./model";

const Tree = z.object({ data: z.array(z.object({ nama: z.string(), areas: z.array(z.object({ nama: z.string(), rooms: z.array(z.object({ id: z.string(), nama: z.string() })) })) })) });

function ItemRow({ api, i, r, rooms, canMaterial, disabled, onChange }: { api: Parameters<typeof AttachmentField>[0]["api"]; i: ProcurementDetail["items"][number]; r: ReceivedRow; rooms: readonly { value: string; label: string }[]; canMaterial: boolean; disabled: boolean; onChange: (p: Partial<ReceivedRow>) => void }) {
    const left = remaining(i), asset = i.jenis === "ASET";
    return <Card><EntityCard icon={asset ? "package" : "boxes"} title={i.nama_barang} meta={[`Sisa ${left} ${i.satuan} dari ${i.jumlah_disetujui ?? 0} disetujui`]}/>
        <Toggle label="Barang ini tiba" value={r.selected} disabled={disabled || left <= 0 || (!asset && !canMaterial)} onChange={(selected) => onChange({ selected })}/>
        {r.selected && <>
            <Input label="Jumlah tiba" value={r.jumlah} keyboardType="number-pad" editable={!disabled} onChangeText={(jumlah) => onChange({ jumlah })}/>
            <Chips label="Hasil pemeriksaan" value={r.status} disabled={disabled} options={[{ value: "DITERIMA", label: asset ? "Sesuai, daftarkan aset" : "Sesuai, tambah stok" }, { value: "DITOLAK_SAAT_PENERIMAAN", label: "Tidak sesuai, tolak" }]} onChange={(status) => onChange({ status })}/>
            {r.status === "DITOLAK_SAAT_PENERIMAAN" ? <><Input label="Alasan penolakan" value={r.alasan} multiline maxLength={2000} editable={!disabled} onChangeText={(alasan) => onChange({ alasan })}/><AttachmentField api={api} label="Foto penolakan" kind="PROCUREMENT_REJECTION_PHOTO" documents={false} files={r.foto} max={5} disabled={disabled} onChange={(foto) => onChange({ foto })}/></>
                : <><Chips label="Lokasi penempatan" value={r.room} disabled={disabled} options={rooms} onChange={(room) => onChange({ room })}/>
                    {asset && <><Chips label="Kondisi awal" value={r.kondisi} disabled={disabled} options={[{ value: "BAIK", label: "Baik" }, { value: "RUSAK_RINGAN", label: "Rusak Ringan" }]} onChange={(kondisi) => onChange({ kondisi })}/>
                        <View style={styles.row}><View style={styles.flex}><Input label="Merek" value={r.merek} maxLength={100} editable={!disabled} onChangeText={(merek) => onChange({ merek })}/></View><View style={styles.flex}><Input label="Model" value={r.model} maxLength={100} editable={!disabled} onChangeText={(model) => onChange({ model })}/></View></View>
                        <Input label="Nilai perolehan per unit (Rp, opsional)" value={r.nilai} keyboardType="decimal-pad" editable={!disabled} onChangeText={(nilai) => onChange({ nilai })}/>
                        <Input label="Nomor seri per unit (opsional, satu per baris)" value={r.seri} multiline editable={!disabled} onChangeText={(seri) => onChange({ seri })}/>
                        <Toggle label="Dapat dipinjam" value={r.pinjam} disabled={disabled} onChange={(pinjam) => onChange({ pinjam })}/></>}</>}
        </>}
    </Card>;
}

/** MS-70 — padanan P-54: catat barang tiba; aset/stok terbentuk atomik dengan dokumen penerimaan CLEAN (FR-14.3). */
export function ProcurementReceiptScreen() {
    const params = useLocalSearchParams<{ id: string }>(), pid = /^[1-9]\d*$/.test(params.id ?? "") ? params.id! : "";
    const { api, state } = useAuth(), account = state.kind === "READY" ? state.session.user.id : "", perms = state.kind === "READY" ? state.session.permissions : {}, permitted = !!pid && Object.hasOwn(perms, "procurement.receive");
    const [f, setF] = useState<ReceiptForm | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), attempt = useRef<{ body: string; key: string } | null>(null);
    const d = useResource(`${account}:procurement-receipt:${pid}`, useCallback(async (s: AbortSignal) => { if (!permitted) return null; const x = await loadProcurement(api, pid, s); setF({ tanggal: dateWib(Date.now()), nomor: "", catatan: "", dokumen: [], rows: Object.fromEntries(x.items.map((i) => [i.id, receivedRow(i)])) }); return x; }, [api, pid, permitted]));
    const rooms = useResource(`${account}:procurement-rooms`, useCallback(async (s: AbortSignal) => permitted ? Tree.parse((await api.get("/locations/tree", { signal: s })).data).data.flatMap((b) => b.areas.flatMap((a) => a.rooms.map((r) => ({ value: r.id, label: `${r.nama} · ${a.nama} · ${b.nama}` })))) : null, [api, permitted]));
    if (!permitted) return <Screen title="Catat Penerimaan"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin mencatat penerimaan."/></Screen>;
    if (!d.data || !f) return <Screen title="Catat Penerimaan">{d.error ? <Notice message={d.error}/> : <Label tone="muted">Memuat sisa pengadaan…</Label>}</Screen>;
    if (!canReceive(d.data, perms)) return <Screen title="Catat Penerimaan"><Notice tone="info" message="Usulan ini belum siap atau sudah selesai diterima."/></Screen>;
    const p = d.data, set = (x: Partial<ReceiptForm>) => { setError(null); setF({ ...f, ...x }); };
    const save = async () => {
        const r = receiptBody(p, f); if ("error" in r) { setError(r.error); return; }
        if (f.dokumen.some((x) => x.scan_status !== "CLEAN")) { setError("Dokumen penerimaan harus lolos pemeriksaan sebelum barang didaftarkan."); return; }
        const body = JSON.stringify(r.body); if (attempt.current?.body !== body) attempt.current = { body, key: randomUUID() };
        setBusy(true); setError(null); try { await procurementAction(api, p.id, "receipts", r.body, attempt.current.key); router.replace(`/pengadaan/${p.id}` as "/scan"); } catch (e) { setError(e instanceof Error ? e.message : "Penerimaan belum tersimpan. Coba lagi dengan isian yang sama."); } finally { setBusy(false); }
    };
    return <Screen title={`Penerimaan ${p.nomor}`} subtitle="Barang yang sesuai langsung terdaftar sebagai aset atau stok bahan. Barang ditolak tetap dapat diganti kemudian." footer={<Button icon="check" title="Catat penerimaan" busy={busy} disabled={!f.dokumen.length || !f.nomor.trim()} onPress={() => void save()}/>}>
        {error && <Notice message={error}/>}{rooms.error && <Notice message={rooms.error}/>}
        <DateField label="Tanggal penerimaan" value={f.tanggal} onChange={(tanggal) => set({ tanggal })}/>
        <Input label="Nomor dokumen penerimaan / faktur" value={f.nomor} maxLength={100} onChangeText={(nomor) => set({ nomor })}/>
        <Input label="Catatan (opsional)" value={f.catatan} multiline maxLength={2000} onChangeText={(catatan) => set({ catatan })}/>
        <SectionHeading title="Barang yang tiba"/>
        {p.items.map((i) => <ItemRow key={i.id} api={api} i={i} r={f.rows[i.id]!} rooms={rooms.data ?? []} canMaterial={Object.hasOwn(perms, "material.receive")} disabled={busy} onChange={(x) => set({ rows: { ...f.rows, [i.id]: { ...f.rows[i.id]!, ...x } } })}/>)}
        <AttachmentField api={api} label="Dokumen penerimaan (wajib)" help="Faktur atau berita acara; ditautkan ke aset atau penambahan stok yang tercatat." kind="PROCUREMENT_RECEIPT_DOCUMENT" files={f.dokumen} max={10} disabled={busy} onChange={(files) => set({ dokumen: files.map((x) => ({ ...x, jenis: f.dokumen.find((o) => o.file_id === x.file_id)?.jenis ?? "FAKTUR" })) })}/>
        {f.dokumen.map((x) => <Chips key={x.file_id} label={`Jenis ${x.nama_berkas}`} value={x.jenis} disabled={busy} options={[{ value: "FAKTUR", label: "Faktur" }, { value: "BERITA_ACARA", label: "Berita Acara" }, { value: "LAINNYA", label: "Lainnya" }]} onChange={(jenis) => set({ dokumen: f.dokumen.map((o) => o.file_id === x.file_id ? { ...o, jenis } : o) })}/>)}
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", gap: t.space.sm }, flex: { flex: 1 } });
