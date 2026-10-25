import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { router } from "expo-router";
import { NotificationsResponseSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useNotifications } from "./Provider";
import { useResource } from "../../shared/api/useResource";
import { internalPath } from "../../shared/navigation";
import { formatTime } from "../../shared/time";
import { Button, Card, EmptyState, EntityCard, Label, ListRow, Notice, Screen } from "../../shared/ui";

export function NotificationsScreen() {
    const { state, api } = useAuth(); const notifications = useNotifications();
    const [page, setPage] = useState(1); const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState<string | null>(null);
    const account = state.kind === "READY" ? state.session.user.id : ""; const permitted = state.kind === "READY" && Object.hasOwn(state.session.permissions, "notification.manage_own");
    const load = useCallback(async (signal: AbortSignal) => permitted ? NotificationsResponseSchema.parse((await api.get("/notifications", { params: { page, per_page: 10 }, signal })).data) : null, [api, page, permitted]);
    const resource = useResource(`${account}:notifications:${page}`, load);
    const act = async (action: () => Promise<void>) => { setBusy(true); setActionError(null); try { await action(); resource.reload(); notifications.refresh(); } catch (e) { setActionError(e instanceof Error ? e.message : "Permintaan gagal. Coba lagi."); } finally { setBusy(false); } };
    return <Screen title="Notifikasi" subtitle="Pembaruan tugas, pengajuan, dan aktivitas akun Anda. Notifikasi in-app tetap tersedia meski push perangkat belum aktif."><Card><ListRow title="Pemberitahuan perangkat" subtitle={notifications.status} icon="bell"/><Button icon="bell" title="Aktifkan atau coba ulang push" busy={busy} disabled={!permitted} onPress={() => { void act(notifications.enablePush); }} /><Button icon="settings" title="Pengaturan notifikasi perangkat" secondary onPress={() => { void Linking.openSettings().catch(() => setActionError("Pengaturan belum dapat dibuka.")); }} /></Card>
        {!permitted && <Notice message="Anda tidak memiliki izin mengelola notifikasi." />}
        {permitted && <><Button icon="refresh" title="Muat ulang" secondary onPress={resource.reload} /><Button icon="checkCircle" title="Tandai semua terbaca" secondary busy={busy} disabled={notifications.unread === 0} onPress={() => { void act(async () => { await api.patch("/notifications/read-all"); }); }} />
            {resource.loading && <Label>Memuat notifikasi…</Label>}{resource.error && <><Notice message={resource.error} /><Button title="Coba lagi" onPress={resource.reload} /></>}{actionError && <Notice message={actionError} />}
            {resource.data?.data.length === 0 && <EmptyState illustration="empty" title="Belum ada notifikasi" description="Pembaruan penting akan muncul di sini."/>}
            {resource.data?.data.map((item) => <EntityCard key={item.id} icon="bell" title={item.judul} meta={[item.isi, formatTime(item.created_at)]} statuses={item.dibaca_pada === null ? [{ label: "Belum dibaca", tone: "info" }] : []} onPress={() => { if (!busy) void act(async () => { if (item.dibaca_pada === null) await api.patch(`/notifications/${item.id}/read`); const path = internalPath(item.deep_link); if (path) router.push(path as "/scan"); else setActionError("Notifikasi ini tidak memiliki tujuan yang dapat dibuka."); }); }} />)}
            {resource.data && resource.data.meta.total_pages > 1 && <><Label>Halaman {page} dari {resource.data.meta.total_pages}</Label><Button title="Sebelumnya" secondary disabled={page === 1 || resource.loading} onPress={() => setPage((value) => value - 1)} /><Button title="Berikutnya" secondary disabled={page >= resource.data!.meta.total_pages || resource.loading} onPress={() => setPage((value) => value + 1)} /></>}
        </>}
    </Screen>;
}
