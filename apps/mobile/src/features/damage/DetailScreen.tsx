import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { DamageReportDetailResponseSchema } from "@sigm4/schemas";
import type { DamageReportDetail } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { MobileApiError } from "../../shared/api/client";
import { formatTime } from "../../shared/time";
import { Button, Card, EntityCard, Label, ListRow, Notice, Screen, tokens as t } from "../../shared/ui";
import { readablePhotoUrl, statusLabels, statusTones, urgencyLabels, urgencyTones } from "./model";
import { VerifyPanel } from "./VerifyPanel";

function Photo({ photo }: { photo: DamageReportDetail["foto"][number] }) {
    const [failed, setFailed] = useState(false);
    const url = readablePhotoUrl(photo, __DEV__);
    if (!url) return <Label>{photo.status === "BELUM_TERUNGGAH" ? "Foto belum terunggah" : photo.status === "INFECTED" ? "Foto diblokir karena tidak aman" : photo.status === "FAILED" ? "Pemeriksaan foto gagal" : photo.status === "CLEAN" ? "Akses foto belum tersedia" : "Foto menunggu pemeriksaan keamanan"}</Label>;
    return failed ? <Notice message="Foto belum dapat dimuat. Muat ulang tiket untuk memperbarui akses foto." /> : <Image source={{ uri: photo.url! }} cachePolicy="none" style={styles.photo} accessibilityLabel={`Foto kerusakan ${photo.urutan + 1}`} onError={() => setFailed(true)} />;
}
export function DamageDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>(); const { state, api } = useAuth(); const [tick, setTick] = useState(0); const [page, setPage] = useState(1);
    const permissions = state.kind === "READY" ? state.session.permissions : {}; const account = state.kind === "READY" ? state.session.user.id : "";
    const permitted = /^[1-9]\d*$/.test(id ?? "") && Object.hasOwn(permissions, "damage.view");
    const load = useCallback(async (signal: AbortSignal) => {
        if (!permitted) return null;
        try { const detail = DamageReportDetailResponseSchema.parse((await api.get(`/damage-reports/${id}`, { signal })).data).data; if (detail.id !== id) throw new Error("Detail tiket tidak cocok dengan tujuan yang diminta."); return detail; }
        catch (e) { if (e instanceof MobileApiError && e.status === 403) throw new Error("Anda tidak memiliki hak akses ke tiket ini.", { cause: e }); if (e instanceof MobileApiError && e.status === 404) throw new Error("Data tiket tidak lagi tersedia.", { cause: e }); throw e; }
    }, [api, id, permitted, tick]);
    const resource = useResource(`${account}:damage-detail:${id}`, load); const detail = resource.data;
    useFocusEffect(useCallback(() => { const timer = setInterval(() => setTick((value) => value + 1), 30_000); return () => clearInterval(timer); }, [account, id]));
    const notes = detail?.catatan ?? []; const pages = Math.max(1, Math.ceil(notes.length / 5)); const currentPage = Math.min(page, pages);
    return <Screen title="Detail Tiket Kerusakan" action={<Button title="Tiket saya" secondary onPress={() => router.replace("/kerusakan" as "/scan")} />}>
        {!permitted && <Notice message="Tiket tidak valid atau Anda tidak memiliki izin membacanya." />}{permitted && <><Button icon="refresh" title="Muat ulang tiket dan foto" secondary onPress={resource.reload} />{resource.loading && <Label>Memuat tiket...</Label>}{resource.error && <Notice message={resource.error} />}
            {detail && <><EntityCard icon="hammer" title={detail.objek.label} meta={[detail.nomor, detail.objek.lokasi]} statuses={[{ label: statusLabels[detail.status], tone: statusTones[detail.status] }, { label: urgencyLabels[detail.urgensi], tone: urgencyTones[detail.urgensi] }]}/>
                <VerifyPanel detail={detail} onDone={resource.reload}/>
                {detail.work_order && Object.hasOwn(permissions, "workorder.view") && <ListRow icon="wrench" title={`Work order ${detail.work_order.nomor}`} onPress={() => router.push(`/work-order/${detail.work_order!.id}` as "/scan")}/>}
                <Card><Label>Pelapor: {detail.pelapor.nama} · {formatTime(detail.dilaporkan_pada)}</Label><Label>{detail.deskripsi}</Label>{detail.foto_tertunda > 0 && <Notice message={`Foto belum terunggah: ${detail.foto_tertunda}. Periksa antrean pada perangkat yang mengirim foto.`} />}{detail.foto.map((photo) => <Photo key={`${photo.file_id}:${photo.url}`} photo={photo} />)}</Card>
                {detail.catatan_verifikasi && <Card><Label>Hasil verifikasi: {detail.catatan_verifikasi}</Label><Label>{detail.diverifikasi_oleh?.nama ?? "Petugas"}{detail.diverifikasi_pada ? ` · ${formatTime(detail.diverifikasi_pada)}` : ""}</Label></Card>}
                {detail.reservasi && <Label>Tertaut reservasi {detail.reservasi.nomor}</Label>}
                <Card><Label>Informasi tambahan ({notes.length})</Label>{notes.length === 0 && <Label>Belum ada informasi tambahan.</Label>}{notes.slice((currentPage - 1) * 5, currentPage * 5).map((note) => <Card key={note.id}><Label>{note.penulis.nama} · {formatTime(note.dibuat_pada)}</Label><Label>{note.keterangan}</Label>{note.foto.map((photo) => <Photo key={`${photo.file_id}:${photo.url}`} photo={photo} />)}</Card>)}{pages > 1 && <><Label>Halaman catatan {currentPage} dari {pages}</Label><Button title="Catatan sebelumnya" secondary disabled={currentPage === 1} onPress={() => setPage(currentPage - 1)} /><Button title="Catatan berikutnya" secondary disabled={currentPage === pages} onPress={() => setPage(currentPage + 1)} /></>}</Card>
            </>}
        </>}<Button title="Antrean foto perangkat ini" secondary onPress={() => router.push("/kerusakan/unggahan" as "/scan")} />
    </Screen>;
}
const styles = StyleSheet.create({ photo: { width: "100%", height: t.size.camera, borderRadius: t.radius.sm, backgroundColor: t.color.page } });
