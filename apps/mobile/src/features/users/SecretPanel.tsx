// Rahasia sekali tampil (BR-070c; keputusan 25 log phase-07): hanya di state layar, tidak disimpan maupun dikirim;
// tangkapan layar sudah diblokir aplikasi. Tombol Salin memakai clipboard OS atas permintaan pengguna.
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Card, Label, Notice, tokens as t } from "../../shared/ui";
import { formatTime } from "../../shared/time";

export interface Secret { title: string; label: string; value: string; until: string | null }
export function SecretPanel({ secret, onDone }: { secret: Secret; onDone: () => void }) {
    const [copied, setCopied] = useState(false);
    return <Card><Label strong>{secret.title}</Label>
        <Notice tone="info" message="Hanya tampil kali ini. Serahkan langsung kepada pemilik akun, bukan melalui pesan atau notifikasi."/>
        <Label tone="muted">{secret.label}</Label><Text selectable style={styles.secret} accessibilityLabel={`${secret.label}: ${secret.value.split("").join(" ")}`}>{secret.value}</Text>
        <Label tone="muted">Berlaku hingga {secret.until ? formatTime(secret.until) : "waktu yang ditetapkan sekolah"}. Pengguna wajib menggantinya saat masuk.</Label>
        <Button icon={copied ? "check" : "clipboardList"} title={copied ? "Tersalin" : "Salin"} secondary onPress={() => { void Clipboard.setStringAsync(secret.value).then(() => setCopied(true)); }}/>
        <Button icon="check" title="Sudah diserahkan, tutup" onPress={onDone}/>
    </Card>;
}
const styles = StyleSheet.create({ secret: { fontSize: t.font.heading, fontWeight: "600", color: t.color.heading, letterSpacing: t.space.xs / 2 } });
