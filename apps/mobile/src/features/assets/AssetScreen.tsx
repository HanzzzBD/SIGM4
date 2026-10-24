import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { AssetDetailSchema, AssetPhotosResponseSchema, AssetTimelineResponseSchema } from "@sigm4/schemas";
import type { AssetDetail, AssetPhoto, EntriLinimasaAset } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { allowed, contextualActions } from "../scanner";
import { Button, Card, Label, Notice, Screen, tokens as t } from "../../shared/ui";

function timelineSummary(entry: EntriLinimasaAset): string {
    switch (entry.jenis) {
        case "PENGHAPUSAN": return `${entry.nomor}: ${entry.aksi === "DIPULIHKAN" ? "aset dipulihkan" : "aset dihapuskan"}. ${entry.alasan}`;
        case "PREVENTIF_DILEWATI":return `${entry.nama}: jadwal ${entry.jatuh_tempo} dilewati. ${entry.alasan}`;
        case "PEMELIHARAAN":return `${entry.nomor}: ${entry.status.replaceAll("_"," ")}${entry.biaya===null?"":` · Biaya Rp${entry.biaya}`}`;
        case "PEMINJAMAN": return `${entry.nomor}: ${entry.status.toLowerCase().replaceAll("_", " ")}`;
        case "KONDISI": return `${entry.kondisi_lama} → ${entry.kondisi_baru}: ${entry.alasan}`;
        case "MUTASI": return `${entry.ruang_asal.nama} → ${entry.ruang_tujuan.nama}: ${entry.alasan}`;
        case "DOKUMEN": return `${entry.aksi}: ${entry.nama_berkas}`;
        case "KERUSAKAN": return `Laporan ${entry.laporan_id}: ${entry.status} (${entry.urgensi})`;
    }
}
export function AssetScreen({ id, detail = false }: { id: string; detail?: boolean }) {
    const { state, api } = useAuth();
    const [asset, setAsset] = useState<AssetDetail | null>(null); const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null); const [retry, setRetry] = useState(0);
    const [photos, setPhotos] = useState<AssetPhoto[]>([]); const [entries, setEntries] = useState<EntriLinimasaAset[]>([]);
    const [photoPage, setPhotoPage] = useState(1); const [photoPages, setPhotoPages] = useState(1);
    const [timelinePage, setTimelinePage] = useState(1); const [timelinePages, setTimelinePages] = useState(1);
    const [mediaError, setMediaError] = useState<string | null>(null); const [mediaBusy, setMediaBusy] = useState(false);
    const [failedPhotos, setFailedPhotos] = useState<string[]>([]); const [focused, setFocused] = useState(false);
    useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const accountId = state.kind === "READY" ? state.session.user.id : "";
    const permitted = allowed(permissions, "asset.view");
    useEffect(() => {
        if (!permitted || !focused) return;
        const abort = new AbortController(); setLoading(true); setError(null); setAsset(null);
        void api.get(`/assets/${encodeURIComponent(id)}`, { signal: abort.signal }).then((result) => {
            if (!abort.signal.aborted) setAsset(AssetDetailSchema.parse(result.data.data));
        }).catch((e: unknown) => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Aset belum dapat dimuat."); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
        return () => abort.abort();
    }, [api, id, retry, permitted, accountId, focused]);
    useEffect(() => { setPhotoPage(1); setTimelinePage(1); setFailedPhotos([]); setPhotos([]); setEntries([]); }, [id, accountId, retry]);
    useEffect(() => {
        if (!detail || !asset || !permitted || !focused) return;
        const abort = new AbortController(); setMediaBusy(true); setMediaError(null);
        void Promise.allSettled([
            api.get(`/assets/${id}/photos`, { params: { page: photoPage, per_page: 10 }, signal: abort.signal }),
            api.get(`/assets/${id}/timeline`, { params: { page: timelinePage, per_page: 10 }, signal: abort.signal }),
        ]).then(([photoResult, timelineResult]) => {
            if (abort.signal.aborted) return;
            if (photoResult.status === "fulfilled") { const data = AssetPhotosResponseSchema.parse(photoResult.value.data); setPhotos(data.data); setPhotoPages(data.meta.total_pages); }
            else { setPhotos([]); setMediaError("Foto belum dapat dimuat. Coba muat ulang."); }
            if (timelineResult.status === "fulfilled") { const data = AssetTimelineResponseSchema.parse(timelineResult.value.data); setEntries(data.data); setTimelinePages(data.meta.total_pages); }
            else { setEntries([]); setMediaError("Riwayat belum dapat dimuat. Coba muat ulang."); }
        }).catch(() => { if (!abort.signal.aborted) setMediaError("Foto atau riwayat belum dapat dibaca. Coba muat ulang."); }).finally(() => { if (!abort.signal.aborted) setMediaBusy(false); });
        return () => abort.abort();
    }, [api, asset, detail, permitted, id, accountId, photoPage, timelinePage, focused]);
    if (!permitted) return <Screen title="Detail aset"><Notice message="Anda tidak memiliki izin melihat aset." /><Button title="Beranda" onPress={() => router.replace("/")} /></Screen>;
    return <Screen title={detail ? "Detail aset" : "Hasil scan"}>
        {loading && <Label>Memuat aset…</Label>}{error && <><Notice message={error} /><Button icon="refresh" title="Coba lagi" onPress={() => setRetry((value) => value + 1)} /></>}
        {asset && <><Card><Label>{asset.kode_barang}</Label><Label>{asset.nama}</Label><Label>Kategori: {asset.kategori.nama}</Label>
            <Label>Lokasi: {asset.lokasi.gedung} · {asset.lokasi.area} · {asset.lokasi.ruang}</Label><Label>Kondisi: {asset.kondisi.replaceAll("_", " ")}</Label><Label>Status: {asset.status.replaceAll("_", " ")}</Label>
            {asset.dihapuskan && <Notice message="Aset tidak aktif: sudah dihapuskan. Aksi transaksi tidak tersedia." />}
            {asset.status === "TIDAK_TERSEDIA" && <Notice message="Aset tidak tersedia untuk transaksi." />}
            {detail && <><Label>Merek / model: {asset.merek ?? "—"} / {asset.model ?? "—"}</Label><Label>Nomor seri: {asset.nomor_seri ?? "—"}</Label><Label>Tahun perolehan: {asset.tahun_perolehan}</Label><Label>Penanggung jawab: {asset.penanggung_jawab?.nama ?? "Belum ditentukan"}</Label><Label>Label QR: {asset.qr_terpasang ? "Terpasang" : "Belum terpasang"}</Label></>}
            {detail && allowed(permissions, "asset.view_financial") && asset.sumber_perolehan !== undefined && <><Label>Sumber perolehan: {asset.sumber_perolehan.replaceAll("_", " ")}</Label><Label>Nilai perolehan: {asset.nilai_perolehan === null || asset.nilai_perolehan === undefined ? "Belum dicatat" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(Number(asset.nilai_perolehan))}</Label></>}
        </Card>
        {!detail && <Button icon="history" title="Lihat detail aset" onPress={() => router.push(`/aset/${asset.id}`)} />}
        {contextualActions(asset, permissions).map((action) => <Card key={action.label}><Button title={action.label} disabled={!action.available} onPress={() => { if (action.available) router.push((action.label==="Perbarui work order"?`/work-order?asset_id=${id}`:action.label==="Riwayat servis"?`/aset/${id}/servis`:`/kerusakan/lapor?asset_id=${id}`) as "/scan"); }} />{action.reason && <Label>{action.reason}</Label>}</Card>)}
        {detail && <><Card><Label>Foto aset</Label>{mediaBusy && <Label>Memuat foto…</Label>}
            {!mediaBusy && photos.length === 0 && <Label>Belum ada foto aset.</Label>}
            {photos.map((photo) => <Card key={photo.id}>{photo.is_primary && <Label>Foto utama</Label>}{photo.status === "CLEAN" && photo.url !== null && !failedPhotos.includes(photo.id) ? <Image source={{ uri: photo.url }} contentFit="contain" cachePolicy="none" style={styles.photo} accessibilityLabel={`Foto ${asset.nama}${photo.is_primary ? ", utama" : ""}`} onError={() => setFailedPhotos((items) => [...items, photo.id])} /> : <Label>{photo.status === "PENDING" ? "Foto sedang diperiksa atau belum terunggah." : photo.status === "INFECTED" ? "Foto tidak lolos pemeriksaan keamanan." : "Foto belum dapat ditampilkan. Muat ulang untuk memperoleh URL baru."}</Label>}</Card>)}
            {photoPages > 1 && <><Label>Halaman foto {photoPage} dari {photoPages}</Label><Button title="Foto sebelumnya" secondary disabled={mediaBusy || photoPage === 1} onPress={() => setPhotoPage((page) => page - 1)} /><Button title="Foto berikutnya" secondary disabled={mediaBusy || photoPage >= photoPages} onPress={() => setPhotoPage((page) => page + 1)} /></>}
        </Card><Card><Label>Riwayat aset</Label>{mediaBusy && <Label>Memuat riwayat…</Label>}{!mediaBusy && entries.length === 0 && <Label>Belum ada riwayat.</Label>}
            {entries.map((entry) => <Card key={`${entry.jenis}:${entry.id}`}><Label>{entry.jenis} · {new Date(entry.waktu).toLocaleString("id-ID")}</Label><Label>{timelineSummary(entry)}</Label></Card>)}
            {timelinePages > 1 && <><Label>Halaman riwayat {timelinePage} dari {timelinePages}</Label><Button icon="history" title="Riwayat sebelumnya" secondary disabled={mediaBusy || timelinePage === 1} onPress={() => setTimelinePage((page) => page - 1)} /><Button icon="history" title="Riwayat berikutnya" secondary disabled={mediaBusy || timelinePage >= timelinePages} onPress={() => setTimelinePage((page) => page + 1)} /></>}
        </Card>{mediaError && <Notice message={mediaError} />}<Button icon="refresh" title="Muat ulang foto dan riwayat" secondary disabled={mediaBusy} onPress={() => setRetry((value) => value + 1)} /></>}
        </>}
        <Button icon="scan" title="Pindai lagi" onPress={() => router.replace("/scan")} /><Button title="Beranda" secondary onPress={() => router.replace("/")} />
    </Screen>;
}
const styles = StyleSheet.create({ photo: { width: "100%", height: t.size.camera, backgroundColor: t.color.page, borderRadius: t.radius.sm } });
