import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth";
import { useUploads } from "../uploads";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Button, Card, Label, Notice, Screen } from "../../shared/ui";

export function DamageQueueScreen() {
    const { state } = useAuth(); const uploads = useUploads(); const [page, setPage] = useState(1); const [error, setError] = useState<string | null>(null);
    const account = state.kind === "READY" ? state.session.user.id : "";
    const load = useCallback(async () => account && uploads.queue ? uploads.queue.list(account) : [], [account, uploads.queue, uploads.count, uploads.progress]);
    const resource = useResource(`${account}:photo-queue`, load); const rows = resource.data ?? []; const pages = Math.max(1, Math.ceil(rows.length / 10)); const currentPage = Math.min(page, pages);
    const cancel = (id: string) => Alert.alert("Batalkan unggahan foto?", "Foto lokal akan dihapus. Tiket atau catatan yang sudah dikirim tetap tersimpan dan dapat menandai foto belum terunggah.", [{ text: "Kembali", style: "cancel" }, { text: "Batalkan unggahan", style: "destructive", onPress: () => { void uploads.queue?.cancel(id, account).then(() => { resource.reload(); uploads.refresh(); }).catch(() => setError("Foto belum dapat dibatalkan.")); } }]);
    return <Screen title="Antrean Foto" action={<Button title="Tiket saya" secondary onPress={() => router.replace("/kerusakan" as "/scan")} />}><Label>Maksimum 50 foto akun Anda selama 72 jam; foto tertua dibuang bila batas terlampaui. Antrean ini tidak mengirim ulang laporan.</Label>
        <Button icon="refresh" title="Muat ulang antrean" secondary onPress={() => { resource.reload(); uploads.refresh(); }} /><Button title="Coba unggah kembali" disabled={!uploads.queue || rows.length === 0} onPress={() => { void uploads.queue?.retry(account).then(() => { uploads.refresh(); resource.reload(); }).catch(() => setError("Unggahan belum dapat dicoba kembali.")); }} />
        {resource.loading && <Label>Memuat antrean...</Label>}{resource.error && <Notice message={resource.error} />}{error && <Notice message={error} />}{uploads.error && <Notice message={uploads.error} />}{uploads.discarded > 0 && <Notice message={`${uploads.discarded} foto dibuang karena batas antrean/retensi. Periksa foto pada tiket terkait.`} />}
        {rows.length === 0 && !resource.loading && <Label>Tidak ada foto yang menunggu unggahan.</Label>}{rows.slice((currentPage - 1) * 10, currentPage * 10).map((entry) => <Card key={entry.id}><Label>{entry.ownerId ? `Foto untuk objek #${entry.ownerId}` : "Foto dengan penautan tiket belum terkonfirmasi"}</Label><Label>{Math.ceil(entry.size / 1024)} KB · ditambahkan {formatTime(new Date(entry.createdAt).toISOString())}</Label><Label>{uploads.progress[entry.id] ?? (entry.attempts ? `Foto belum terunggah. Percobaan ${entry.attempts}; jadwal berikut ${formatTime(new Date(entry.nextAttemptAt).toISOString())}` : "Menunggu unggahan")}</Label><Button icon="close" title="Batalkan unggahan foto ini" secondary onPress={() => cancel(entry.id)} /></Card>)}
        {pages > 1 && <><Label>Halaman {currentPage} dari {pages}</Label><Button title="Foto sebelumnya" secondary disabled={currentPage === 1} onPress={() => setPage(currentPage - 1)} /><Button title="Foto berikutnya" secondary disabled={currentPage >= pages} onPress={() => setPage(currentPage + 1)} /></>}
    </Screen>;
}
