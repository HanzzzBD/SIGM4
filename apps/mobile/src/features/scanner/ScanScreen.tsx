import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Linking, StyleSheet, Switch, Text, View } from "react-native";
import { useAuth } from "../auth";
import { Button, Card, Input, Label, Notice, tokens as t } from "../../shared/ui";
import { AssetDetailSchema } from "@sigm4/schemas";
import { allowed, resolveCode, resolveQr, ScanGate } from "./model";

type Result = { id: string; nama: string; kode_barang: string };
export function ScanScreen() {
    const { state, api } = useAuth();
    const [permission, requestPermission] = useCameraPermissions();
    const [focused, setFocused] = useState(false); const [foreground, setForeground] = useState(AppState.currentState === "active");
    const [continuous, setContinuous] = useState(false); const [torch, setTorch] = useState(false);
    const [code, setCode] = useState(""); const [manual, setManual] = useState(false);
    const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<Result[]>([]);
    const gate = useRef(new ScanGate()); const controller = useRef<AbortController | null>(null);
    const nextCameraAttempt = useRef(0);
    useFocusEffect(useCallback(() => { setFocused(true); gate.current.reset(); return () => { setFocused(false); controller.current?.abort(); }; }, []));
    useEffect(() => { const subscription = AppState.addEventListener("change", (value) => { setForeground(value === "active"); if (value !== "active") controller.current?.abort(); }); return () => { subscription.remove(); controller.current?.abort(); }; }, []);
    const permitted = state.kind === "READY" && allowed(state.session.permissions, "asset.view");
    const scan = async (value: string, isManual = false) => {
        if (!permitted || !focused || !foreground || results.length >= 200) return;
        if (!isManual) { if (Date.now() < nextCameraAttempt.current) return; nextCameraAttempt.current = Date.now() + 1500; }
        await gate.current.run(`${isManual ? "code" : "qr"}:${value}`, async () => {
            const current = new AbortController(); controller.current = current; setBusy(true); setError(null);
            try {
                const id = isManual ? await resolveCode(api, value, current.signal) : await resolveQr(api, value, process.env.EXPO_PUBLIC_APP_URL ?? api.defaults.baseURL ?? "", current.signal);
                if (current.signal.aborted) return;
                if (!continuous) router.push(`/scan/hasil/${id}`);
                else {
                    const asset = AssetDetailSchema.parse((await api.get(`/assets/${id}`, { signal: current.signal })).data.data);
                    if (!current.signal.aborted) setResults((items) => items.some((item) => item.id === id) ? items : [...items, { id, nama: asset.nama, kode_barang: asset.kode_barang }]);
                }
            } catch (e) {
                if (!current.signal.aborted) { setError(e instanceof Error ? e.message : "Pemindaian gagal. Coba lagi atau masukkan kode manual."); throw e; }
            } finally { if (controller.current === current) { controller.current = null; setBusy(false); } }
        }).catch(() => undefined);
    };
    if (!permitted) return <View style={styles.page}><Notice message="Anda tidak memiliki izin melihat aset." /><Button title="Kembali" onPress={() => router.replace("/")} /></View>;
    const header = <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Pindai aset</Text><Label>Arahkan label QR ke bingkai, jarak 10–30 cm.</Label>
        {permission?.granted && focused && foreground ? <View style={styles.cameraFrame}><CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={busy || results.length >= 200 ? undefined : ({ data }) => { void scan(data); }} onMountError={() => setError("Kamera belum dapat dibuka. Coba lagi atau gunakan kode manual.")} /><View pointerEvents="none" style={styles.reticle} /></View> : <Card><Label>{permission?.granted ? "Kamera dijeda saat aplikasi tidak aktif." : "Kamera diperlukan untuk membaca label QR. Anda tetap dapat memakai kode manual."}</Label>
            {!permission?.granted && <Button title={permission?.canAskAgain === false ? "Buka pengaturan kamera" : "Izinkan kamera"} onPress={() => { void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()).catch(() => setError("Izin kamera belum dapat dibuka. Aktifkan Kamera untuk SIGM4 di pengaturan perangkat.")); }} />}</Card>}
        {permission?.granted && <Button title={torch ? "Matikan lampu" : "Nyalakan lampu"} secondary onPress={() => setTorch((value) => !value)} />}
        <View style={styles.row}><Label>Mode beruntun</Label><Switch accessibilityLabel="Mode beruntun" value={continuous} disabled={busy} onValueChange={(value) => { setContinuous(value); gate.current.reset(); }} trackColor={{ true: t.color.primary }} /></View>
        <Button title="Masukkan kode aset manual" secondary onPress={() => setManual((value) => !value)} />
        {manual && <Card><Input label="Kode aset" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={150} /><Button title="Cari aset" busy={busy} disabled={!code.trim()} onPress={() => { void scan(code, true); }} /></Card>}
        {busy && <Label>Memeriksa aset…</Label>}{error && <Notice message={error} />}
        {results.length > 0 && <><Label>{results.length} aset berhasil dipindai. Hasil hanya tersimpan selama layar ini terbuka.</Label><Button title="Bersihkan daftar" secondary disabled={busy} onPress={() => { setResults([]); gate.current.reset(); }} /></>}
        {results.length >= 200 && <Notice message="Daftar mencapai 200 aset. Bersihkan daftar untuk melanjutkan." />}
    </View>;
    return <FlatList style={styles.page} contentContainerStyle={styles.list} data={results} keyExtractor={(item) => item.id} ListHeaderComponent={header} ItemSeparatorComponent={() => <View style={styles.separator} />} renderItem={({ item }) => <Card><Label>{item.kode_barang} · {item.nama}</Label><Button title={`Lihat hasil ${item.kode_barang}`} secondary onPress={() => router.push(`/scan/hasil/${item.id}`)} /></Card>} ListFooterComponent={<Button title="Kembali ke beranda" secondary onPress={() => router.replace("/")} />} keyboardShouldPersistTaps="handled" />;
}
const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: t.color.page }, list: { padding: t.space.md, gap: t.space.md, width: "100%", maxWidth: t.size.content, alignSelf: "center" },
    header: { gap: t.space.md }, title: { fontSize: t.font.heading, fontWeight: "600", color: t.color.heading },
    cameraFrame: { height: t.size.camera, overflow: "hidden", borderRadius: t.radius.md, alignItems: "center", justifyContent: "center" },
    reticle: { width: t.size.qr, height: t.size.qr, borderColor: t.color.surface, borderWidth: 2, borderRadius: t.radius.md },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, separator: { height: t.space.md },
});
