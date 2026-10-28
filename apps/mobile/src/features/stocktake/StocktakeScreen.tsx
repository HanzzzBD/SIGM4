import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { getNetworkStateAsync } from "expo-network";
import type { StocktakeSession } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { Screen, Button, EmptyState, EntityCard, Label, Notice, ProgressRing, Toggle, tokens as t } from "../../shared/ui";
import { useStocktakeQueue } from "./Provider";
import { loadMine } from "./model";
import { StocktakeSessionScreen } from "./SessionScreen";
import { ManagerSessionList } from "./ManageScreens";
function SessionList({ onSelect, onAll }: { onSelect: (id: string) => void; onAll?: (() => void) | undefined }) {
    const { api, state, offlineOnly, offlineError, controller } = useAuth(), queue = useStocktakeQueue();
    const account = state.kind === "READY" ? state.session.user.id : "";
    const [rows, setRows] = useState<StocktakeSession[]>([]), [page, setPage] = useState(1), [pages, setPages] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState(""), [version, setVersion] = useState(0);
    useEffect(() => {
        if (!queue.queue || !account) return;
        const controller = new AbortController(); setBusy(true); setError("");
        void (async () => {
            const network = await getNetworkStateAsync();
            if (offlineOnly || !network.isConnected || network.isInternetReachable === false) { setRows(await queue.queue!.sessions(account)); setPages(1); }
            else { const result = await loadMine(api, page, controller.signal); if (!controller.signal.aborted) { setRows(result.data); setPages(result.meta.total_pages); } }
        })().catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Sesi belum tersedia."); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
        return () => controller.abort();
    }, [api, account, queue.queue, page, version, offlineOnly]);
    const logout = () => Alert.alert("Keluar dari sesi luring?", "Cache dan hasil opname yang belum tersinkron pada akun ini akan dihapus.", [{ text: "Batal", style: "cancel" }, { text: "Keluar dan hapus data lokal", style: "destructive", onPress: () => { void controller.logout().catch(() => undefined); } }]);
    return <Screen title="Sesi Opname" {...(offlineOnly ? { subtitle: "Target dan akses luring berlaku 72 jam. Hasil yang belum tersinkron tetap tersimpan sampai dikirim atau Anda keluar." } : {})}>{offlineOnly && <Notice tone="info" message="Hanya opname lokal yang tersedia. Ketuk ikon info untuk batas luring." />}{onAll && !offlineOnly && <Toggle label="Hanya penugasan saya" value onChange={onAll}/>}{offlineError && <Notice message={offlineError} />}{busy && <Label>Memuat sesi…</Label>}{error && <Notice message={error} />}{queue.error && <Notice message={queue.error} />}{queue.message && <Notice message={queue.message} />}<Label>{queue.entries.length} hasil/foto menunggu sinkronisasi.</Label>{rows.map(s => <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}><ProgressRing value={s.diperiksa} max={s.target} label={`${s.nama}: ${s.diperiksa} dari ${s.target} aset diperiksa`}/><View style={{ flex: 1 }}><EntityCard icon="clipboardCheck" title={s.nama} meta={[s.nomor, `${s.diperiksa}/${s.target} aset`]} statuses={[s.status === "BERJALAN" ? { label: "Berjalan", tone: "info" } : s.status === "MENUNGGU_PERSETUJUAN" ? { label: "Menunggu Persetujuan", tone: "pending" } : s.status === "SELESAI" ? { label: "Selesai", tone: "success" } : { label: "Dibatalkan", tone: "pending" }]} onPress={() => onSelect(s.id)} /></View></View>)}{!busy && !rows.length && <EmptyState illustration={offlineOnly ? "offline" : "empty"} title={offlineOnly ? "Belum ada target tersimpan" : "Belum ada sesi"} description={offlineOnly ? "Unduh target saat daring sebelum melakukan opname luring." : "Belum ada sesi yang ditugaskan kepada Anda."}/>}<View style={{ flexDirection: "row", gap: t.space.sm }}><Button title="Sesi sebelumnya" secondary disabled={page <= 1 || offlineOnly} onPress={() => setPage(page - 1)} /><Button title="Sesi berikutnya" secondary disabled={page >= pages || offlineOnly} onPress={() => setPage(page + 1)} /></View><Button icon="refresh" title="Muat ulang dan sinkronkan" secondary busy={busy} onPress={() => { setVersion(v => v + 1); queue.refresh(); }} />{offlineOnly && <Button title="Keluar dan hapus data lokal" secondary onPress={logout} />}</Screen>;
}
export function StocktakeScreen({ initialId }: { initialId?: string | undefined }) {
    const { state, offlineOnly } = useAuth(), [id, setId] = useState(initialId ?? ""), [all, setAll] = useState(false);
    const perms = state.kind === "READY" ? state.session.permissions : {}, execute = Object.hasOwn(perms, "audit.execute");
    // Mode pengelola (P-47) untuk pemegang audit.view yang mengelola/menyetujui; selalu daring.
    const manager = !offlineOnly && Object.hasOwn(perms, "audit.view") && (Object.hasOwn(perms, "audit.manage") || Object.hasOwn(perms, "audit.approve"));
    if (manager && (all || !execute) && !initialId) return <ManagerSessionList onMine={execute ? () => setAll(false) : undefined}/>;
    if (state.kind !== "READY" || !execute) return <Screen title="Sesi Opname"><Notice message="Anda tidak memiliki izin melaksanakan opname." /></Screen>;
    return id ? <StocktakeSessionScreen key={id} id={id} onBack={() => setId("")} /> : <SessionList onSelect={setId} onAll={manager ? () => setAll(true) : undefined} />;
}
