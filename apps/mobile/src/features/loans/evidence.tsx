// Bukti serah terima/pengembalian (BR-027, 31.6): foto & tanda tangan diunggah DAN dikonfirmasi sebelum transaksi —
// API menolak berkas belum terkonfirmasi (keputusan paket 2 log phase-07; koreksi UX §7.6.6).
import { useRef, useState } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { fetch } from "expo/fetch";
import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { discardPreparedPhoto, preparePhoto } from "../../shared/upload/native";
import { Button, Icon, Input, Label, Notice, tokens as t } from "../../shared/ui";
import { parseAssetQr } from "../scanner";

const sha256 = async (file: File) => [...new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes()))].map((b) => b.toString(16).padStart(2, "0")).join("");
async function upload(api: AxiosInstance, file: File, mime: "image/jpeg" | "image/png", checksum: string): Promise<number> {
    const order = z.object({ data: z.object({ file_id: z.string(), upload_url: z.url() }) }).parse((await api.post("/files/presign", { jenis: "HANDOVER_PHOTO", mime, ukuran: file.size })).data).data;
    if (!(await fetch(order.upload_url, { method: "PUT", headers: { "content-type": mime }, body: file })).ok) throw new Error("Unggahan bukti gagal. Coba unggah lagi sebelum melanjutkan.");
    await api.post("/files/confirm", { file_id: Number(order.file_id), checksum });
    return Number(order.file_id);
}

/** Foto kondisi: dikompresi MOB-MED-01 lalu diunggah langsung; maks 5 per unit. */
export function EvidencePhotos({ api, label, ids, onChange, disabled = false }: { api: AxiosInstance; label: string; ids: readonly number[]; onChange: (ids: number[]) => void; disabled?: boolean }) {
    const [previews, setPreviews] = useState<Record<number, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const add = async (camera: boolean) => {
        setError(null);
        try {
            if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Izin kamera ditolak. Pilih foto dari galeri.");
            const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], exif: false, quality: 1 };
            const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
            const asset = result.canceled ? undefined : result.assets[0]; if (!asset) return;
            setBusy(true);
            const photo = await preparePhoto(asset.uri);
            try { const id = await upload(api, new File(photo.path), "image/jpeg", photo.checksum); setPreviews((p) => ({ ...p, [id]: asset.uri })); onChange([...ids, id]); }
            finally { await discardPreparedPhoto(photo).catch(() => undefined); }
        } catch (e) { setError(e instanceof Error ? e.message : "Foto belum terunggah."); } finally { setBusy(false); }
    };
    return <View style={styles.block}><Text style={styles.label}>{label} (wajib)</Text>
        <View style={styles.photos}>{ids.map((id) => <View key={id}>{previews[id] ? <Image source={{ uri: previews[id] }} style={styles.photo} contentFit="cover" accessibilityLabel="Foto bukti terunggah"/> : <View style={styles.photo}/>}<Pressable accessibilityRole="button" accessibilityLabel="Hapus foto" onPress={() => onChange(ids.filter((x) => x !== id))} style={styles.remove}><Icon name="close" size={t.size.iconSmall} color={t.color.inverse}/></Pressable></View>)}</View>
        {error && <Notice message={error}/>}
        {ids.length < 5 && <View style={styles.row}><View style={styles.flex}><Button icon="plus" title="Kamera" secondary compact busy={busy} disabled={disabled} onPress={() => void add(true)}/></View><View style={styles.flex}><Button icon="plus" title="Galeri" secondary compact disabled={disabled || busy} onPress={() => void add(false)}/></View></View>}
    </View>;
}

/** Kanvas tanda tangan (31.6): ≥300×150, diekspor PNG 600×300 lalu diunggah. */
export function SignaturePad({ api, onSaved, disabled = false }: { api: AxiosInstance; onSaved: (id: number | null) => void; disabled?: boolean }) {
    const [paths, setPaths] = useState<string[]>([]), [live, setLive] = useState(""), [saved, setSaved] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const current = useRef(""), svg = useRef<Svg>(null);
    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => { current.current = `M${e.nativeEvent.locationX.toFixed(1)} ${e.nativeEvent.locationY.toFixed(1)}`; setLive(current.current); },
        onPanResponderMove: (e) => { current.current += ` L${e.nativeEvent.locationX.toFixed(1)} ${e.nativeEvent.locationY.toFixed(1)}`; setLive(current.current); },
        onPanResponderRelease: () => { const done = current.current; setPaths((p) => [...p, done]); setLive(""); },
    })).current;
    const clear = () => { setPaths([]); setLive(""); setSaved(false); onSaved(null); };
    const save = () => {
        if (!svg.current || paths.length === 0) return; setBusy(true); setError(null);
        svg.current.toDataURL((base64: string) => { void (async () => {
            const file = new File(Paths.cache, `ttd-${Crypto.randomUUID()}.png`);
            try { file.create(); file.write(base64, { encoding: "base64" }); onSaved(await upload(api, file, "image/png", await sha256(file))); setSaved(true); }
            catch (e) { setError(e instanceof Error ? e.message : "Tanda tangan belum terunggah."); } finally { if (file.exists) file.delete(); setBusy(false); }
        })(); }, { width: 600, height: 300 });
    };
    return <View style={styles.block}><Text style={styles.label}>Tanda tangan penerima (wajib)</Text>
        <View style={[styles.pad, saved && styles.padSaved]} {...(disabled || saved ? {} : pan.panHandlers)} accessibilityLabel="Kanvas tanda tangan">
            <Svg ref={svg} width="100%" height="100%" style={StyleSheet.absoluteFill}>{[...paths, live].filter(Boolean).map((d, i) => <Path key={i} d={d} stroke={t.color.heading} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>)}</Svg>
            {paths.length === 0 && !live && <Text style={styles.hint}>Tanda tangan di sini</Text>}
        </View>
        {error && <Notice message={error}/>}{saved && <Notice tone="success" message="Tanda tangan tersimpan."/>}
        <View style={styles.row}><View style={styles.flex}><Button icon="close" title="Ulangi" secondary compact disabled={busy} onPress={clear}/></View><View style={styles.flex}><Button icon="check" title="Simpan tanda tangan" compact busy={busy} disabled={disabled || saved || paths.length === 0} onPress={save}/></View></View>
    </View>;
}

/** Kode aset manual atau QR label `/a/{uuid}` dari kamera (MS-10/MS-11 langkah 1). */
export function UnitCode({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (code: string) => void; disabled?: boolean }) {
    const [open, setOpen] = useState(false), [permission, ask] = useCameraPermissions(), [error, setError] = useState<string | null>(null), handled = useRef(false);
    const start = async () => { setError(null); handled.current = false; if (!permission?.granted && !(await ask()).granted) { setError("Izin kamera ditolak. Masukkan kode aset manual."); return; } setOpen(true); };
    return <View style={styles.block}>
        <View style={styles.codeRow}><View style={styles.flex}><Input label={label} value={value} onChangeText={onChange} editable={!disabled} autoCapitalize="characters"/></View><Pressable accessibilityRole="button" accessibilityLabel={`Pindai QR untuk ${label}`} disabled={disabled} onPress={() => void start()} style={styles.scan}><Icon name="scanLine" color={t.color.iconInverse}/></Pressable></View>
        {error && <Label tone="muted">{error}</Label>}
        <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}><SafeAreaView style={styles.camera}>
            <CameraView style={styles.flex} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(r) => { if (handled.current) return; handled.current = true; try { onChange(parseAssetQr(r.data, process.env.EXPO_PUBLIC_APP_URL ?? "")); } catch (e) { setError(e instanceof Error ? e.message : "QR tidak dikenali."); } setOpen(false); }}/>
            <View style={styles.cameraBar}><Button icon="close" title="Tutup pemindai" secondary onPress={() => setOpen(false)}/></View>
        </SafeAreaView></Modal>
    </View>;
}

const styles = StyleSheet.create({
    block: { gap: t.space.sm }, label: { fontSize: t.font.small, fontWeight: "600", color: t.color.heading }, row: { flexDirection: "row", gap: t.space.sm }, flex: { flex: 1, minWidth: 0 },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, photo: { width: t.size.media, height: t.size.media, borderRadius: t.radius.md, backgroundColor: t.color.neutralSoft },
    remove: { position: "absolute", top: -t.space.xs, right: -t.space.xs, width: t.size.iconLarge, height: t.size.iconLarge, borderRadius: t.radius.full, backgroundColor: t.color.heading, alignItems: "center", justifyContent: "center" },
    pad: { height: t.size.camera / 2, minWidth: t.size.camera, borderWidth: 1, borderColor: t.color.borderStrong, borderRadius: t.radius.md, backgroundColor: t.color.surface, alignItems: "center", justifyContent: "center" }, padSaved: { borderColor: t.color.success },
    hint: { fontSize: t.font.small, color: t.color.muted }, codeRow: { flexDirection: "row", alignItems: "flex-end", gap: t.space.sm },
    scan: { width: t.size.control, height: t.size.control, borderRadius: t.radius.md, backgroundColor: t.color.primary, alignItems: "center", justifyContent: "center" },
    camera: { flex: 1, backgroundColor: t.color.heading }, cameraBar: { padding: t.space.md, backgroundColor: t.color.surface },
});
