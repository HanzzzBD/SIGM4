import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { HasilPenggunaan } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { BottomSheet, Button, Card, Chips, EmptyState, EntityCard, Input, Label, ListRow, Notice, Screen, SectionHeading, tokens as t } from "../../shared/ui";
import { rangeLabel } from "../../shared/wib";
import { REGISTERED_SCREENS } from "../../shared/screens";
import { cancel, loadDetail, recordUsage } from "./api";
import { STATUS_LABEL, STATUS_TONE } from "./model";

const HISTORY: Readonly<Record<string, string>> = { RESERVATION_CREATED: "Diajukan", RESERVATION_UPDATED: "Diperbarui", RESERVATION_CANCELLED: "Dibatalkan", RESERVATION_EXPIRED: "Kedaluwarsa" };
const USAGE: Readonly<Record<HasilPenggunaan, string>> = { BAIK: "Ruangan baik", PERLU_PERHATIAN: "Perlu perhatian", TIDAK_DIGUNAKAN: "Tidak digunakan" };

/** MS-48 — padanan P-31: objek, jadwal, tanggal turunan, aksi dari server (`aksi`), riwayat (FR-07.3, FR-07.4, FR-10.3). */
export function ReservationDetailScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>();
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, can = (p: string) => Object.hasOwn(permissions, p);
    const valid = /^[1-9]\d*$/.test(id) && can("reservation.view");
    const resource = useResource(`${account}:reservation:${id}`, useCallback((signal: AbortSignal) => valid ? loadDetail(api, id, signal) : Promise.resolve(null), [api, id, valid]));
    const [dialog, setDialog] = useState<"batal" | "ubah" | "pakai" | null>(null), [reason, setReason] = useState(""), [usage, setUsage] = useState<HasilPenggunaan | null>(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [done, setDone] = useState<string | null>(null);
    if (!valid) return <Screen title="Detail Reservasi"><EmptyState illustration="noAccess" title="Reservasi tidak dapat dibuka" description="Tautan tidak sah atau Anda tidak memiliki izin melihat reservasi."/></Screen>;
    const d = resource.data;
    const open = (next: typeof dialog) => { setError(null); setReason(""); setUsage(null); setDialog(next); };
    const confirm = async () => {
        if (!d || busy) return; setBusy(true); setError(null);
        try {
            if (dialog === "pakai") { if (!usage) throw new Error("Pilih hasil penggunaan."); await recordUsage(api, d.id, usage, reason.trim() || null); setDone("Penggunaan tercatat."); }
            else { await cancel(api, d.id, reason); setDone("Reservasi dibatalkan."); if (dialog === "ubah") router.push(`/reservasi/baru?dari=${d.id}` as "/scan"); } // BR-024: ubah jadwal = batalkan + pengajuan baru terisi.
            setDialog(null); resource.reload();
        } catch (e) { setError(e instanceof Error ? e.message : "Perubahan belum tersimpan."); } finally { setBusy(false); }
    };
    const usageOptions: HasilPenggunaan[] = d ? [...(d.aksi.catat_penggunaan.kondisi ? ["BAIK", "PERLU_PERHATIAN"] as const : []), ...(d.aksi.catat_penggunaan.tidak_digunakan ? ["TIDAK_DIGUNAKAN"] as const : [])] : [];
    const field = (label: string, value: string | number | null | undefined) => value === null || value === undefined || value === "" ? null : <View key={label} style={styles.field}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
    return <Screen title={d?.nomor ?? "Detail Reservasi"}>
        {resource.loading && <Label tone="muted">Memuat reservasi…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {done && <Notice tone="success" message={done}/>}
        {d && <>
            <EntityCard icon={d.jenis === "RUANGAN" ? "calendarCheck" : "package"} title={d.nama_kegiatan ?? d.ruangan?.nama ?? d.nomor} meta={[d.pemohon.nama, rangeLabel(d.waktu_mulai, d.waktu_selesai)]} statuses={[{ label: STATUS_LABEL[d.status], tone: STATUS_TONE[d.status] }]}/>
            {d.status === "KEDALUWARSA" && <Notice tone="info" message={`Reservasi kedaluwarsa dan slotnya telah dibebaskan.${d.aksi.ajukan_ulang ? " Ajukan ulang bila masih diperlukan." : ""}`}/>}
            <View style={styles.actions}>
                {d.jenis === "ASET" && d.status === "DISETUJUI" && can("loan.manage") && REGISTERED_SCREENS["MS-10"] !== undefined && <Button icon="handshake" title="Serah terima" onPress={() => router.push(`/peminjaman/serah-terima/${d.id}` as "/scan")}/>}
                {usageOptions.length > 0 && <Button icon="clipboardCheck" title="Catat penggunaan" secondary onPress={() => open("pakai")}/>}
                {d.aksi.ubah_jadwal && <Button icon="calendarDays" title="Ubah jadwal" secondary onPress={() => open("ubah")}/>}
                {d.aksi.ajukan_ulang && <Button icon="refresh" title="Ajukan ulang" secondary onPress={() => router.push(`/reservasi/baru?dari=${d.id}` as "/scan")}/>}
                {d.aksi.batalkan && <Button icon="close" title="Batalkan" secondary onPress={() => open("batal")}/>}
            </View>
            <Card>{[field("Ruangan", d.ruangan ? `${d.ruangan.nama} · ${d.ruangan.gedung}` : null), field("Jenis kegiatan", d.jenis_kegiatan), field("Peserta", d.jumlah_peserta), field("Keperluan", d.keperluan), field("Lokasi penggunaan", d.lokasi_penggunaan), field("Kebutuhan tambahan", d.kebutuhan_tambahan), field("Keterangan", d.keterangan), field("Diajukan", formatTime(d.diajukan_pada))]}</Card>
            {d.induk && <ListRow icon="calendarCheck" title={`Bagian dari ${d.induk.nomor}`} onPress={() => router.push(`/reservasi/${d.induk!.id}` as "/scan")}/>}
            {d.tanggal.length > 0 && <><SectionHeading title={`${d.tanggal.length} tanggal`}/>{d.tanggal.map((x) => <EntityCard key={x.id} icon="calendarDays" title={rangeLabel(x.waktu_mulai, x.waktu_selesai)} meta={[x.nomor]} statuses={[{ label: STATUS_LABEL[x.status], tone: STATUS_TONE[x.status] }]} onPress={() => router.push(`/reservasi/${x.id}` as "/scan")}/>)}</>}
            {(d.aset?.length ?? 0) > 0 && <><SectionHeading title="Aset"/>{d.aset!.map((x, i) => <EntityCard key={`${x.reservation_id}${x.asset_id ?? i}`} icon="package" title={x.nama} meta={[x.kode_barang ?? "Unit ditetapkan saat disetujui"]}/>)}</>}
            {can("loan.view") && REGISTERED_SCREENS["MS-51"] !== undefined && (d.peminjaman?.length ?? 0) > 0 && <><SectionHeading title="Peminjaman"/>{d.peminjaman!.map((l) => <ListRow key={l.id} icon="handHelping" title={l.nomor} onPress={() => router.push(`/peminjaman/${l.id}` as "/scan")}/>)}</>}
            {d.penggunaan && <Card><Label strong>Penggunaan ruangan</Label><Label>{d.penggunaan.kondisi_ruangan === "PERLU_PERHATIAN" ? "Perlu perhatian" : d.penggunaan.kondisi_ruangan === "BAIK" ? "Baik" : "Tidak digunakan"} · {formatTime(d.penggunaan.dicatat_pada)}</Label>{d.penggunaan.catatan && <Label tone="muted">{d.penggunaan.catatan}</Label>}</Card>}
            {d.approval_instance_id !== null && can("approval.view") && <ListRow icon="badgeCheck" title="Linimasa persetujuan" onPress={() => router.push(`/persetujuan/${d.approval_instance_id}` as "/scan")}/>}
            {d.riwayat.length > 0 && <><SectionHeading title="Riwayat"/><Card>{d.riwayat.map((h, i) => <View key={i} style={styles.history}><Text style={styles.value}>{HISTORY[h.aksi] ?? h.aksi}{h.nomor ? ` · ${h.nomor}` : ""}</Text><Text style={styles.label}>{h.pelaku ?? "Sistem"} · {formatTime(h.waktu)}{h.keterangan ? ` · ${h.keterangan}` : ""}</Text></View>)}</Card></>}
        </>}
        <BottomSheet visible={dialog !== null} onClose={() => setDialog(null)} title={dialog === "pakai" ? "Catat penggunaan" : dialog === "ubah" ? "Ubah jadwal" : "Batalkan reservasi"}><View style={styles.sheet}>
            {dialog === "ubah" && <Label>Reservasi ini dibatalkan lebih dulu, lalu pengajuan baru terisi dibuka.</Label>}
            {dialog === "pakai" && <Chips label="Hasil" value={usage} options={usageOptions.map((u) => ({ value: u, label: USAGE[u] }))} onChange={setUsage}/>}
            <Input label={dialog === "pakai" ? "Catatan (opsional)" : "Alasan pembatalan"} value={reason} multiline maxLength={1000} onChangeText={setReason}/>
            {error && <Notice message={error}/>}
            <Button icon={dialog === "pakai" ? "check" : "close"} title={dialog === "pakai" ? "Simpan" : dialog === "ubah" ? "Batalkan & ajukan jadwal baru" : "Batalkan reservasi"} busy={busy} disabled={dialog === "pakai" ? usage === null : !reason.trim()} onPress={() => void confirm()}/>
        </View></BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({
    actions: { gap: t.space.sm }, field: { gap: t.space.xs }, label: { fontSize: t.font.small, color: t.color.muted }, value: { fontSize: t.font.body, color: t.color.heading },
    history: { gap: t.space.xs, paddingVertical: t.space.xs, borderBottomWidth: 1, borderBottomColor: t.color.borderSubtle }, sheet: { padding: t.space.md, gap: t.space.md },
});
