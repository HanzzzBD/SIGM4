import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { getNetworkStateAsync } from "expo-network";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import { StocktakeItemSchema } from "@sigm4/schemas";
import type { StocktakeItem, StocktakeSession } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { PhotoPicker } from "../damage";
import type { PreparedPhoto } from "../uploads";
import { Button, Card, Input, Label, Notice, Screen, tokens as t } from "../../shared/ui";
import { useStocktakeQueue } from "./Provider";
import { cachedAsset, snapshotCode, initialInspectionCondition } from "./model";
import { stageStocktakePhoto, removeStocktakePhoto } from "./native";
export function InspectionPanel({ id, room, data, selected: initial, onBack }: { id: string; room: string; data: { session: StocktakeSession; items: StocktakeItem[]; categories: { id: string; nama: string }[] }; selected: StocktakeItem | null; onBack: () => void }) {
    const { state, api, offlineOnly } = useAuth(), q = useStocktakeQueue(), account = state.kind === "READY" ? state.session.user.id : "";
    const [permission, requestPermission] = useCameraPermissions(), [foreground, setForeground] = useState(AppState.currentState === "active"), [code, setCode] = useState(""), [selected, setSelected] = useState(initial), [condition, setCondition] = useState<StocktakeItem["kondisi_sistem"]>(initialInspectionCondition(initial)), [note, setNote] = useState(""), [finding, setFinding] = useState(false), [description, setDescription] = useState(""), [category, setCategory] = useState(""), [categorySearch, setCategorySearch] = useState(""), [photos, setPhotos] = useState<PreparedPhoto[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
    const current = useRef(account); current.current = account; const alive = useRef(true), pendingCamera = useRef(false), nextScan = useRef(0), savedId = useRef<string | null>(null), prepared = useRef(photos); prepared.current = photos;
    const committingPhotos = useRef(new Set<string>());
    const [focused, setFocused] = useState(false);
    useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
    const origin = process.env.EXPO_PUBLIC_APP_URL ?? api.defaults.baseURL ?? "";
    useEffect(() => { alive.current = true; const listener = AppState.addEventListener("change", s => setForeground(s === "active")); return () => { alive.current = false; listener.remove(); for (const p of prepared.current) if (!committingPhotos.current.has(p.path)) void removeStocktakePhoto(p.path).catch(() => undefined); }; }, []);
    const isCurrent = () => alive.current && current.current === account;
    const resolve = async (value: string) => {
        if (busy || pendingCamera.current || !q.queue || !account) return;
        pendingCamera.current = true; setBusy(true); setError("");
        try {
            let asset = cachedAsset(value, origin, data.items);
            if (!asset) for (const location of await q.queue.cachedRooms(account, id)) { const cache = await q.queue.cached(account, id, location); asset = cache ? cachedAsset(value, origin, cache.items) : null; if (asset) break; }
            if (!asset) {
                const network = await getNetworkStateAsync();
                if (offlineOnly || !network.isConnected || network.isInternetReachable === false) throw new Error("Aset belum tersedia dalam target lokal. Unduh lokasi asal saat daring atau catat temuan baru bila aset memang belum terdaftar.");
                const input = snapshotCode(value, origin);
                asset = z.object({ data: StocktakeItemSchema }).parse((await api.get(`/audit-sessions/${id}/resolve`, { params: input.uuid ? { uuid: input.uuid } : { code: input.code } })).data).data;
            }
            if (isCurrent()) { setSelected(asset); setCondition(initialInspectionCondition(asset)); setNote(""); setFinding(false); savedId.current = null; setNotice(""); }
        } catch (e) { if (isCurrent()) setError(e instanceof Error ? e.message : "Kode belum cocok dengan target."); }
        finally { pendingCamera.current = false; if (isCurrent()) setBusy(false); }
    };
    const save = async () => {
        if (!q.queue || !account || busy) return;
        if (!finding && !selected) { setError("Pindai atau pilih aset dahulu."); return; }
        if (finding && (!description.trim() || !category)) { setError("Isi deskripsi dan pilih kategori temuan baru."); return; }
        setBusy(true); setError("");
        try {
            const cache = await q.queue.cached(account, id, room);
            if (!cache) throw new Error("Target lokal melewati 72 jam. Unduh target ulang sebelum mencatat.");
            if (!isCurrent()) return;
            savedId.current ??= randomUUID();
            photos.forEach(p => committingPhotos.current.add(p.path));
            const inserted = await q.queue.enqueue({ id: savedId.current, accountId: account, sessionId: id, kind: finding ? "finding" : "scan", body: finding ? { deskripsi: description.trim(), category_id: Number(category), room_id: Number(room), kondisi: condition } : { asset_id: Number(selected!.asset_id), room_id: Number(room), kondisi: condition, catatan: note }, photos });
            if (!inserted) await Promise.all(photos.map(p => removeStocktakePhoto(p.path)));
            prepared.current = []; committingPhotos.current.clear();
            if (!isCurrent()) return;
            setPhotos([]); setCondition(initialInspectionCondition(null)); setSelected(null); setCode(""); setNote(""); setDescription(""); savedId.current = null; setFinding(false);
            setNotice(inserted ? "Pemeriksaan tersimpan di perangkat. Sinkronisasi berjalan saat daring; lanjutkan pemindaian berikutnya." : "Aset sudah dicatat dalam antrean. Hasil pertama dipertahankan."); q.refresh();
        } catch (e) { committingPhotos.current.clear(); if (isCurrent()) setError(e instanceof Error ? e.message : "Hasil belum tersimpan."); else await Promise.all(photos.map(p => removeStocktakePhoto(p.path))); }
        finally { if (isCurrent()) setBusy(false); }
    };
    return <Screen title="Scan Opname"><Button icon="arrowLeft" title="Kembali ke target lokasi" secondary disabled={busy} onPress={onBack} /><Label>Lokasi pemeriksaan: {data.session.lokasi.find(l => l.id === room)?.nama}. Simpan hasil sebelum berpindah aset.</Label>
        {!finding && <>{permission?.granted && (offlineOnly || focused) && foreground ? <View style={styles.camera}><CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={busy || selected ? undefined : ({ data: value }) => { if (Date.now() < nextScan.current) return; nextScan.current = Date.now() + 1500; void resolve(value); }} onMountError={() => setError("Kamera tidak dapat dibuka. Masukkan kode aset manual.")} /></View> : <Card><Label>{permission?.granted ? "Kamera dijeda ketika aplikasi tidak aktif." : "Aktifkan kamera atau gunakan kode manual."}</Label>{!permission?.granted && <Button title={permission?.canAskAgain === false ? "Buka pengaturan kamera" : "Izinkan kamera"} onPress={() => { void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()).catch(() => setError("Izin kamera belum tersedia.")); }} />}</Card>}<Input label="Kode aset manual" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={200} /><Button title="Cocokkan kode aset" secondary busy={busy} disabled={!code.trim()} onPress={() => void resolve(code)} />{selected && <Card><Label>{selected.kode_barang} · {selected.nama}</Label><Label>Snapshot lokasi: {selected.lokasi_sistem}. {selected.diperiksa_pada ? "Pemeriksaan sudah tercatat di server; pemindaian ulang mempertahankan hasil pertama." : "Belum diperiksa."}</Label></Card>}</>}
        <Button title={finding ? "Kembali ke scan aset" : "Catat Temuan Baru"} secondary disabled={busy || photos.length > 0} onPress={() => { setFinding(!finding); setCondition(initialInspectionCondition(finding ? selected : null)); setNote(""); setError(""); savedId.current = null; }} />
        {finding && <Card><Input label="Deskripsi temuan baru" multiline value={description} onChangeText={setDescription} maxLength={2000} /><Input label="Cari kategori temuan" value={categorySearch} onChangeText={setCategorySearch} />{data.categories.filter(c => c.nama.toLowerCase().includes(categorySearch.toLowerCase())).slice(0, 20).map(c => <Button key={c.id} title={`Kategori: ${c.nama}${category === c.id ? " (dipilih)" : ""}`} secondary={category !== c.id} onPress={() => setCategory(c.id)} />)}{data.categories.length === 0 && <Notice message="Pilihan kategori belum tersimpan. Unduh target lokasi saat daring." />}</Card>}
        <Card><Label>Kondisi fisik: {condition === "BAIK" ? "Baik" : condition === "RUSAK_RINGAN" ? "Rusak Ringan" : condition === "HILANG" ? "Hilang" : "Rusak Berat"}</Label>{(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"] as const).map(c => <Button key={c} title={`Gunakan kondisi ${c === "BAIK" ? "Baik" : c === "RUSAK_RINGAN" ? "Rusak Ringan" : c === "HILANG" ? "Hilang" : "Rusak Berat"}`} secondary={c !== condition} disabled={busy} onPress={() => setCondition(c)} />)}{!finding && <Input label="Catatan pemeriksaan (opsional)" value={note} onChangeText={setNote} multiline maxLength={2000} />}</Card>
        <PhotoPicker title="Foto opname" help="Foto opsional, maksimal 5. Hasil dan foto disimpan bersama dalam antrean opname." photos={photos} disabled={busy} isCurrent={isCurrent} onAdd={p => { try { const staged = stageStocktakePhoto(p); prepared.current = [...prepared.current, staged]; setPhotos(old => [...old, staged]); } catch (e) { setError(e instanceof Error ? e.message : "Foto belum disimpan."); } }} onRemove={photoId => { const photo = photos.find(p => p.id === photoId); if (photo) void removeStocktakePhoto(photo.path).then(() => { prepared.current = prepared.current.filter(p => p.id !== photoId); setPhotos(old => old.filter(p => p.id !== photoId)); }).catch(e => setError(e instanceof Error ? e.message : "Foto belum dihapus.")); }} />
        {error && <Notice message={error} />}{notice && <Notice message={notice} />}<Button title={finding ? "Simpan Temuan Baru" : "Catat dan lanjutkan scan"} busy={busy} disabled={!q.queue || (!finding && !selected)} onPress={() => void save()} />
    </Screen>;
}
const styles = StyleSheet.create({ camera: { height: t.size.qr, overflow: "hidden", borderRadius: t.radius.md, backgroundColor: t.color.border } });
