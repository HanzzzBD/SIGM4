import { useCallback } from "react";
import type { ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import type { FineDetail, LoanDetail } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { REGISTERED_SCREENS } from "../../shared/screens";
import { formatTime } from "../../shared/time";
import { Button, Card, EmptyState, EntityCard, Label, ListRow, Notice, Screen, SectionHeading, StatusBadge, tokens as t } from "../../shared/ui";
import { rupiah } from "../../shared/wib";
import { loadFine, loadLoan } from "./api";
import { CONDITION_LABEL, EXTENSION_LABEL, FINE_LABEL, FINE_TONE, fineBreakdown, fineKind, loanLabel, loanTone, unitState } from "./model";

type Photo = LoanDetail["unit"][number]["foto_awal"][number];
/** Bukti privat hanya tampil bila CLEAN (SDD-FS-03); selain itu teks keadaan. */
export function Photos({ photos, label }: { photos: readonly Photo[]; label: string }) {
    return <View style={styles.photos}>{photos.map((p, i) => p.url && p.status === "CLEAN" ? <Pressable key={p.file_id} accessibilityRole="imagebutton" accessibilityLabel={`Buka ${label} ${i + 1}`} onPress={() => { void Linking.openURL(p.url!).catch(() => undefined); }}><Image source={{ uri: p.url }} style={styles.photo} contentFit="cover"/></Pressable> : <StatusBadge key={p.file_id} label={p.status === "PENDING" ? "Menunggu pemindaian" : "Tidak dapat ditampilkan"} tone="pending"/>)}</View>;
}
export const field = (label: string, value: string | number | null | undefined) => value === null || value === undefined || value === "" ? null : <View key={label} style={styles.field}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;

/** MS-51 — padanan P-34: transaksi, unit + bukti kondisi, jatuh tempo, kewajiban per unit (FR-09.2, FR-09.5). */
export function LoanDetailScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, can = (p: string) => Object.hasOwn(permissions, p), valid = /^[1-9]\d*$/.test(id) && can("loan.view");
    const resource = useResource(`${account}:loan:${id}`, useCallback((signal: AbortSignal) => valid ? loadLoan(api, id, signal) : Promise.resolve(null), [api, id, valid]));
    if (!valid) return <Screen title="Detail Peminjaman"><EmptyState illustration="noAccess" title="Peminjaman tidak dapat dibuka" description="Tautan tidak sah atau Anda tidak memiliki izin melihat peminjaman."/></Screen>;
    const l = resource.data;
    return <Screen title={l?.nomor ?? "Detail Peminjaman"}>
        {resource.loading && <Label tone="muted">Memuat peminjaman…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {l && <>
            <EntityCard icon="handHelping" title={l.peminjam.nama} meta={[`Jatuh tempo ${formatTime(l.tanggal_jatuh_tempo)}`]} statuses={[{ label: loanLabel(l.status), tone: loanTone(l.status) }]} value={`${l.unit.length}`}/>
            {l.bypass_approval && <Notice tone="info" message={`Peminjaman langsung tanpa persetujuan${l.alasan_bypass ? `: ${l.alasan_bypass}` : "."}`}/>}
            {l.aksi.checkin && REGISTERED_SCREENS["MS-11"] && <Button icon="handshake" title="Proses pengembalian" onPress={() => router.push(`/peminjaman/${l.id}/kembali` as "/scan")}/>}
            {l.aksi.perpanjang && <Button icon="calendarClock" title="Ajukan perpanjangan" secondary onPress={() => router.push(`/peminjaman/${l.id}/perpanjang` as "/scan")}/>}
            {l.estimasi_denda && <Notice tone="info" message={`Estimasi denda unit belum kembali: ${rupiah(l.estimasi_denda)}.`}/>}
            <Card>{[field("Petugas serah terima", l.petugas.nama), field(l.diwakilkan ? "Penerima kuasa" : "Penerima", l.nama_penerima), field("Diserahkan", formatTime(l.tanggal_pinjam)), field("Jatuh tempo", formatTime(l.tanggal_jatuh_tempo)), field("Jatuh tempo asli", l.tanggal_jatuh_tempo_asli && l.tanggal_jatuh_tempo_asli !== l.tanggal_jatuh_tempo ? formatTime(l.tanggal_jatuh_tempo_asli) : null), field("Ditutup", l.tanggal_kembali ? formatTime(l.tanggal_kembali) : "Belum ditutup")]}</Card>
            <ListRow icon="calendarCheck" title={`Reservasi ${l.nomor_reservasi}`} onPress={() => router.push(`/reservasi/${l.reservation_id}` as "/scan")}/>
            {l.signature && <Card><Label strong>Tanda tangan penerima</Label><Photos photos={[l.signature]} label="Tanda tangan"/></Card>}
            <SectionHeading title="Unit dan bukti kondisi"/>
            {l.unit.map((u) => { const s = unitState(u); return <Card key={u.id}>
                <View style={styles.row}><Text style={styles.strong}>{u.kode_barang} · {u.nama}</Text><StatusBadge {...s}/></View>
                <Label tone="muted">Kondisi awal {CONDITION_LABEL[u.kondisi_awal] ?? u.kondisi_awal}{u.alasan_substitusi ? ` · Substitusi: ${u.alasan_substitusi}` : ""}</Label>
                <Photos photos={u.foto_awal} label={`Kondisi awal ${u.kode_barang}`}/>
                {u.tanggal_kembali && <><Label tone="muted">Kembali {formatTime(u.tanggal_kembali)}{u.catatan ? ` · ${u.catatan}` : ""}</Label><Photos photos={u.foto_akhir} label={`Kondisi akhir ${u.kode_barang}`}/></>}
                {u.denda.map((f) => <ListRow key={f.id} icon="receipt" title={`${fineKind(f.jenis)}: ${rupiah(f.jumlah)}`} subtitle={fineBreakdown(f).join(" · ")} {...(can("fine.view") ? { onPress: () => router.push(`/denda/${f.id}` as "/scan") } : {})}/>)}
                {u.damage_report_id && can("damage.view") && <ListRow icon="hammer" title="Laporan kerusakan terkait" onPress={() => router.push(`/kerusakan/${u.damage_report_id}` as "/scan")}/>}
            </Card>; })}
            {(l.perpanjangan?.length ?? 0) > 0 && <><SectionHeading title="Riwayat perpanjangan"/>{l.perpanjangan!.map((e) => <EntityCard key={e.id} icon="calendarClock" title={`${formatTime(e.jatuh_tempo_lama)} → ${formatTime(e.jatuh_tempo_baru)}`} meta={[e.alasan]} statuses={[{ label: EXTENSION_LABEL[e.status] ?? e.status, tone: e.status === "DISETUJUI" ? "success" : e.status === "DITOLAK" ? "error" : e.status === "MENUNGGU_PERSETUJUAN" ? "warning" : "pending" }]} {...(e.approval_instance_id && can("approval.view") ? { onPress: () => router.push(`/persetujuan/${e.approval_instance_id}` as "/scan") } : {})}/>)}</>}
        </>}
    </Screen>;
}

const FINE_HISTORY: Readonly<Record<string, string>> = { FINE_PAID: "Pembayaran tercatat", FINE_WAIVED: "Denda dibebaskan", COMPENSATION_WAIVED: "Ganti rugi dibebaskan", COMPENSATION_PROPOSED: "Nilai penggantian diusulkan", COMPENSATION_DECIDED: "Usulan nilai diputuskan", DIBUKA_KEMBALI: "Status lunas dikoreksi" };
/** MS-53 — padanan P-36: rincian perhitungan (BR-028, BR-028b, BR-028e), blokir, usulan, riwayat. */
export function FineDetailScreen({ actions }: { actions?: (fine: FineDetail, reload: () => void) => ReactNode }) {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, valid = /^[1-9]\d*$/.test(id) && Object.hasOwn(permissions, "fine.view");
    const resource = useResource(`${account}:fine:${id}`, useCallback((signal: AbortSignal) => valid ? loadFine(api, id, signal) : Promise.resolve(null), [api, id, valid]));
    if (!valid) return <Screen title="Detail Kewajiban"><EmptyState illustration="noAccess" title="Kewajiban tidak dapat dibuka" description="Tautan tidak sah atau Anda tidak memiliki izin melihat kewajiban."/></Screen>;
    const f = resource.data;
    return <Screen title="Detail Kewajiban">
        {resource.loading && <Label tone="muted">Memuat kewajiban…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {f && <>
            <EntityCard icon="receipt" title={`${fineKind(f.jenis)} · ${f.kode_barang}`} meta={[f.nama_aset, f.peminjam.nama]} statuses={[{ label: FINE_LABEL[f.status], tone: FINE_TONE[f.status] }]} value={rupiah(f.sisa ?? f.jumlah)}/>
            {f.blokir.aktif && <Notice message={`Pengajuan peminjam diblokir. ${f.blokir.alasan.join(" ")}`}/>}
            {!f.blokir.konfigurasi_lengkap && <Notice tone="info" message="Administrator belum melengkapi ambang pemblokiran."/>}
            <Card>{fineBreakdown(f).map((line) => <Label key={line}>{line}</Label>)}{!f.menunggu_penetapan && [field("Jumlah", rupiah(f.jumlah)), field("Dibebaskan", rupiah(f.jumlah_dibebaskan)), field("Sisa tagihan", rupiah(f.sisa))]}{f.tanggal_bayar && field("Pembayaran", `${formatTime(f.tanggal_bayar)}${f.nomor_bukti ? ` · Bukti ${f.nomor_bukti}` : ""}`)}</Card>
            {Object.hasOwn(permissions, "loan.view") && <ListRow icon="handHelping" title={`Peminjaman ${f.nomor_peminjaman}`} onPress={() => router.push(`/peminjaman/${f.loan_id}` as "/scan")}/>}
            {actions?.(f, resource.reload)}
            {f.usulan.length > 0 && <><SectionHeading title="Usulan nilai penggantian"/>{f.usulan.map((p) => <EntityCard key={p.id} icon="receipt" title={rupiah(p.jumlah)} meta={[p.alasan, p.pengusul]} statuses={[{ label: p.status === "MENUNGGU" ? "Menunggu" : p.status === "DISETUJUI" ? "Disetujui" : "Ditolak", tone: p.status === "DISETUJUI" ? "success" : p.status === "DITOLAK" ? "error" : "warning" }]}/>)}</>}
            {f.riwayat.length > 0 && <><SectionHeading title="Riwayat"/><Card>{f.riwayat.map((h) => <View key={h.id} style={styles.field}><Text style={styles.value}>{FINE_HISTORY[h.aksi] ?? h.aksi}{h.jumlah ? ` · ${rupiah(h.jumlah)}` : ""}</Text><Text style={styles.label}>{h.oleh} · {formatTime(h.pada)}{h.alasan ? ` · ${h.alasan}` : ""}</Text></View>)}</Card></>}
        </>}
    </Screen>;
}
const styles = StyleSheet.create({
    photos: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, photo: { width: t.size.media, height: t.size.media, borderRadius: t.radius.md, backgroundColor: t.color.neutralSoft },
    field: { gap: t.space.xs }, label: { fontSize: t.font.small, color: t.color.muted }, value: { fontSize: t.font.body, color: t.color.heading },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm }, strong: { flex: 1, fontSize: t.font.body, fontWeight: "600", color: t.color.heading },
});
