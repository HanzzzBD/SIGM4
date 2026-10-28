import { useEffect, useRef, useState } from "react";
import { Alert, FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { getNetworkStateAsync } from "expo-network";
import { randomUUID } from "expo-crypto";
import { StocktakeResponseSchema } from "@sigm4/schemas";
import type { StocktakeSession, StocktakeItem } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { Button, Card, Label, Notice, tokens as t } from "../../shared/ui";
import { useStocktakeQueue } from "./Provider";
import { loadStocktakeLocation, requireEmptyLocationQueue } from "./model";
import { InspectionPanel } from "./InspectionPanel";
import { MaterialSessionScreen } from "./MaterialSessionScreen";
interface Loaded { session: StocktakeSession; items: StocktakeItem[]; categories: { id: string; nama: string }[] }
export function StocktakeSessionScreen({ id, onBack }: { id: string; onBack: () => void }) {
    const { api, state, offlineOnly } = useAuth(), q = useStocktakeQueue(), account = state.kind === "READY" ? state.session.user.id : "";
    const [room, setRoom] = useState(""), [data, setData] = useState<Loaded | null>(null), [session, setSession] = useState<StocktakeSession | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [version, setVersion] = useState(0), [inspecting, setInspecting] = useState(false), [selected, setSelected] = useState<StocktakeItem | null>(null), [actionBusy, setActionBusy] = useState(false);
    const actionKey = useRef<string | null>(null), current = useRef(account); current.current = account;
    const tablet = useWindowDimensions().width >= 768;
    useEffect(() => {
        if (!q.queue || !account||session?.domain==="BAHAN") return;
        const controller = new AbortController(); setBusy(true); setError(""); setData(null);
        void (async () => {
            const network = await getNetworkStateAsync(), online = !offlineOnly && network.isConnected && network.isInternetReachable !== false;
            if (!room) {
                const s = online ? StocktakeResponseSchema.parse((await api.get(`/audit-sessions/${id}`, { signal: controller.signal })).data).data : (await q.queue!.sessions(account)).find(s => s.id === id);
                if (!s) throw new Error("Sesi tidak tersedia dalam cache. Sambungkan internet untuk mengunduh target.");
                if (!controller.signal.aborted && current.current === account) { setSession(s); const cachedRooms = await q.queue!.cachedRooms(account, id); setRoom(online ? s.lokasi[0]?.id ?? "" : cachedRooms[0] ?? s.lokasi[0]?.id ?? ""); }
                return;
            }
            const loaded = online ? await loadStocktakeLocation(api, q.queue!, account, id, room, controller.signal) : await q.queue!.cached(account, id, room);
            if (!loaded) throw new Error("Target lokasi belum diunduh atau melewati 72 jam. Pilih lokasi yang tersimpan atau sambungkan internet.");
            if (!controller.signal.aborted && current.current === account) { setData(loaded); setSession(loaded.session); }
        })().catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Target belum dimuat."); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
        return () => controller.abort();
    }, [q.queue, api, id, room, account, version, offlineOnly,session?.domain]);
    const complete = async () => {
        if (!q.queue || !account || !room || actionBusy) return;
        setActionBusy(true); setError("");
        try {
            if (offlineOnly) throw new Error("Penyelesaian lokasi memerlukan koneksi internet.");
            await requireEmptyLocationQueue(q.queue, account, id, room);
            actionKey.current ??= randomUUID();
            await api.post(`/audit-sessions/${id}/complete-location`, { room_id: Number(room) }, { headers: { "Idempotency-Key": actionKey.current } });
            if (current.current !== account) return; actionKey.current = null; setVersion(v => v + 1);
        } catch (e) { setError(e instanceof Error ? e.message : "Lokasi belum selesai."); } finally { setActionBusy(false); }
    };
    if(session?.domain==="BAHAN")return <MaterialSessionScreen id={id} initialSession={session} initialRoom={room} onBack={onBack}/>;
    if (inspecting && data) return <InspectionPanel id={id} room={room} data={data} selected={selected} onBack={() => { setInspecting(false); setSelected(null); setVersion(v => v + 1); }} />;
    const pending = q.entries.filter(e => e.sessionId === id), available = data?.session.status === "BERJALAN" && !data.session.finalized_at && !data.session.lokasi.find(l => l.id === room)?.selesai;
    const locations = <View style={styles.locations}><Text accessibilityRole="header" style={styles.heading}>Lokasi</Text>{session?.lokasi.map(l => <Button key={l.id} title={`${l.nama} · ${l.diperiksa}/${l.target}${l.selesai ? " · Selesai" : ""}`} secondary={room !== l.id} disabled={busy || actionBusy} onPress={() => { actionKey.current = null; setRoom(l.id); }} />)}</View>;
    const header = <View style={styles.header}><Button icon="arrowLeft" title="Kembali ke sesi opname" secondary onPress={onBack} /><Text accessibilityRole="header" style={styles.heading}>{session?.nama ?? "Sesi Opname"}</Text>{offlineOnly && <Notice message="Mode luring: hasil disimpan di perangkat. Persetujuan dan penyelesaian lokasi tetap memerlukan internet." />}{busy && <Label>Memuat target lokasi…</Label>}{error && <Notice message={error} />}{q.error && <Notice message={q.error} />}{q.message && <Notice message={q.message} />}<Label>{pending.length} hasil/foto sesi ini menunggu sinkronisasi.</Label><Button title="Unduh ulang target dan sinkronkan" secondary disabled={busy} onPress={() => { setVersion(v => v + 1); q.refresh(); }} />{!tablet && locations}{data && <><Label>{data.items.length} aset target pada lokasi. Pemeriksaan yang belum tersinkron ditandai terpisah.</Label><Button icon="scan" title="Scan opname / masukkan kode aset manual" disabled={!available} onPress={() => { setSelected(null); setInspecting(true); }} /><Button icon="checkCircle" title="Selesaikan Lokasi Ini" secondary busy={actionBusy} disabled={busy || !available || pending.some(e => String(e.body["room_id"]) === room) || offlineOnly} onPress={() => void complete()} /></>}{pending.some(e => e.blocked) && <><Notice message="Ada pemeriksaan yang ditolak server. Periksa alasan pada antrean; hasil ini belum menjadi data resmi." /><Button title="Coba kirim ulang hasil ditolak" secondary disabled={offlineOnly} onPress={() => { void q.queue!.retry(account).then(q.refresh).catch(x => setError(x instanceof Error ? x.message : "Hasil belum dikirim ulang.")); }} />{pending.filter(e => e.blocked).map(e => <Card key={e.id}><Label>{e.error}</Label><Button title={`Hapus hasil lokal ${e.entityKey}`} secondary onPress={() => Alert.alert("Hapus hasil lokal?", "Hasil ini belum diterima server. Foto lokal juga akan dihapus.", [{ text: "Kembali", style: "cancel" }, { text: "Hapus hasil", style: "destructive", onPress: () => { void q.queue!.discard(e.id, account).then(q.refresh).catch(x => setError(x instanceof Error ? x.message : "Hasil belum dihapus.")); } }])} /></Card>)}</>}</View>;
    return <View style={[styles.frame, tablet && styles.tablet]}>{tablet && <ScrollView style={styles.sidebar}>{locations}</ScrollView>}<FlatList style={styles.frame} contentContainerStyle={styles.list} data={data?.items ?? []} keyExtractor={i => i.id} ListHeaderComponent={header} renderItem={({ item }) => <Card><Label>{item.kode_barang} · {item.nama}</Label><Label>{pending.some(e => e.kind === "scan" && String(e.body["asset_id"]) === item.asset_id) ? "Menunggu Sinkronisasi" : item.hasil === "BELUM_DIPERIKSA" ? "Belum Diperiksa" : item.hasil === "DIPINJAM" ? "Dipinjam" : item.hasil.replaceAll("_", " ")}</Label><Button title={`Periksa ${item.kode_barang}`} secondary disabled={!available} onPress={() => { setSelected(item); setInspecting(true); }} /></Card>} ItemSeparatorComponent={() => <View style={{ height: t.space.md }} />} keyboardShouldPersistTaps="handled" /></View>;
}
const styles = StyleSheet.create({ frame: { flex: 1, backgroundColor: t.color.page }, tablet: { flexDirection: "row" }, sidebar: { width: 320, flexGrow: 0, borderRightWidth: 1, borderColor: t.color.border }, list: { padding: t.space.md, gap: t.space.md }, header: { gap: t.space.md, paddingBottom: t.space.md }, locations: { gap: t.space.sm, padding: t.space.md }, heading: { fontSize: t.font.heading, fontWeight: "600", color: t.color.text } });
