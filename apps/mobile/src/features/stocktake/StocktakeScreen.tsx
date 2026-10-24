import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { getNetworkStateAsync } from "expo-network";
import type { StocktakeSession } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { Screen, Button, Card, Label, Notice, tokens as t } from "../../shared/ui";
import { useStocktakeQueue } from "./Provider";
import { loadMine } from "./model";
import { StocktakeSessionScreen } from "./SessionScreen";
function SessionList({ onSelect }: { onSelect: (id: string) => void }) {
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
    return <Screen title="Sesi Opname">{offlineOnly && <Notice message="Hanya opname lokal yang tersedia. Target dan akses luring berlaku 72 jam. Hasil yang belum tersinkron tetap tersimpan sampai dikirim atau Anda keluar." />}{offlineError && <Notice message={offlineError} />}{busy && <Label>Memuat sesi…</Label>}{error && <Notice message={error} />}{queue.error && <Notice message={queue.error} />}{queue.message && <Notice message={queue.message} />}<Label>{queue.entries.length} hasil/foto menunggu sinkronisasi.</Label>{rows.map(s => <Card key={s.id}><Label>{s.nomor} · {s.nama}</Label><Label>{s.status === "BERJALAN" ? "Berjalan" : s.status === "MENUNGGU_PERSETUJUAN" ? "Menunggu Persetujuan" : s.status === "SELESAI" ? "Selesai" : "Dibatalkan"} · {s.diperiksa}/{s.target} aset</Label><Button title={`Buka ${s.nama}`} onPress={() => onSelect(s.id)} /></Card>)}{!busy && !rows.length && <Label>{offlineOnly ? "Belum ada target lokasi tersimpan. Unduh target saat daring sebelum melakukan opname luring." : "Belum ada sesi yang ditugaskan kepada Anda."}</Label>}<View style={{ flexDirection: "row", gap: t.space.sm }}><Button title="Sesi sebelumnya" secondary disabled={page <= 1 || offlineOnly} onPress={() => setPage(page - 1)} /><Button title="Sesi berikutnya" secondary disabled={page >= pages || offlineOnly} onPress={() => setPage(page + 1)} /></View><Button icon="refresh" title="Muat ulang dan sinkronkan" secondary busy={busy} onPress={() => { setVersion(v => v + 1); queue.refresh(); }} />{offlineOnly && <Button title="Keluar dan hapus data lokal" secondary onPress={logout} />}</Screen>;
}
export function StocktakeScreen({ initialId }: { initialId?: string | undefined }) {
    const { state } = useAuth(), [id, setId] = useState(initialId ?? "");
    if (state.kind !== "READY" || !Object.hasOwn(state.session.permissions, "audit.execute")) return <Screen title="Sesi Opname"><Notice message="Anda tidak memiliki izin melaksanakan opname." /></Screen>;
    return id ? <StocktakeSessionScreen key={id} id={id} onBack={() => setId("")} /> : <SessionList onSelect={setId} />;
}
