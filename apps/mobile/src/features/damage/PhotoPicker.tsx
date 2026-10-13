import { useRef, useState } from "react";
import { Linking, StyleSheet } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Button, Card, Label, Notice, tokens as t } from "../../shared/ui";
import { discardPreparedPhoto, preparePhoto } from "../uploads";
import type { PreparedPhoto } from "../uploads";

export function PhotoPicker({ photos, disabled, onAdd, onRemove, isCurrent }: { photos: readonly PreparedPhoto[]; disabled: boolean; onAdd: (photo: PreparedPhoto) => void; onRemove: (id: string) => void; isCurrent: () => boolean }) {
    const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
    const picking = useRef(false);
    const pick = async (camera: boolean) => {
        if (picking.current || busy || disabled || photos.length >= 5) return;
        picking.current = true;
        setBusy(true); setError(null);
        try {
            if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Izin kamera ditolak. Aktifkan melalui pengaturan atau pilih foto dari galeri.");
            if (!isCurrent()) return;
            const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], exif: false, base64: false, allowsEditing: false, quality: 1 };
            const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
            if (result.canceled || !isCurrent()) return;
            const photo = await preparePhoto(result.assets[0]!.uri);
            if (isCurrent()) onAdd(photo); else await discardPreparedPhoto(photo);
        } catch (e) { if (isCurrent()) setError(e instanceof Error ? e.message : "Foto belum dapat dipilih. Coba kamera atau galeri."); }
        finally { picking.current = false; setBusy(false); }
    };
    return <Card><Label>Foto kerusakan ({photos.length}/5)</Label><Label>Laporan baru wajib 1–5 foto. Informasi tambahan dapat dikirim tanpa foto. Foto diperkecil sebelum dikirim.</Label><Button title="Ambil foto dengan kamera" busy={busy} disabled={disabled || photos.length >= 5} onPress={() => { void pick(true); }} /><Button title="Pilih foto dari galeri" secondary disabled={busy || disabled || photos.length >= 5} onPress={() => { void pick(false); }} />
        {error && <><Notice message={error} /><Button title="Buka pengaturan izin" secondary onPress={() => { void Linking.openSettings().catch(() => setError("Pengaturan belum dapat dibuka.")); }} /></>}
        {photos.map((photo, index) => <Card key={photo.id}><Image source={{ uri: photo.path }} cachePolicy="none" style={styles.photo} accessibilityLabel={`Foto kerusakan ${index + 1}`} /><Label>Foto {index + 1} · {Math.ceil(photo.size / 1024)} KB</Label><Button title={`Hapus foto ${index + 1}`} secondary disabled={disabled || busy} onPress={() => onRemove(photo.id)} /></Card>)}
    </Card>;
}
const styles = StyleSheet.create({ photo: { width: "100%", height: t.size.qr, borderRadius: t.radius.sm, backgroundColor: t.color.page } });
