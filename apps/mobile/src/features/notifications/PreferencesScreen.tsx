import { useCallback, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { LABEL_KELOMPOK_NOTIFIKASI } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Card, EmptyState, Icon, Label, Notice, Screen, StatusBadge, tokens as t } from "../../shared/ui";
import { loadPreferences, preferencePayload, relevantPreferences, savePreferences, setChannel, shownChannels } from "./preferences";
import type { Channels, Preference } from "./preferences";

/** MS-28 — padanan P-78: enam kelompok × dua kanal, berlaku seketika setelah disimpan (FR-17.3, UXD-05). */
export function PreferencesScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const permitted = Object.hasOwn(permissions, "notification.manage_own");
    const resource = useResource(`${account}:notification-preferences`, useCallback((signal: AbortSignal) => permitted ? loadPreferences(api, signal) : Promise.resolve(null), [api, permitted]));
    const [channels, setChannels] = useState<Channels>({}); const [busy, setBusy] = useState(false); const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
    if (!permitted) return <Screen title="Preferensi Notifikasi"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin mengelola notifikasi."/></Screen>;
    const list = resource.data ? relevantPreferences(resource.data, permissions) : [];
    const toggle = (item: Preference, channel: "in_app" | "push", value: boolean) => { setStatus(null); setChannels((current) => setChannel({ ...current, [item.jenis]: shownChannels(item, current) }, item.jenis, channel, value)); };
    const save = async () => {
        setBusy(true); setStatus(null);
        try { await savePreferences(api, preferencePayload(list, channels)); setChannels({}); resource.reload(); setStatus({ tone: "success", text: "Preferensi disimpan dan langsung berlaku." }); }
        catch { setStatus({ tone: "error", text: "Preferensi belum tersimpan. Periksa koneksi lalu coba lagi." }); } finally { setBusy(false); }
    };
    return <Screen title="Preferensi Notifikasi" subtitle="Push dikirim ke aplikasi ini; tanpa notifikasi dalam aplikasi, push tidak dikirim. Sebagian notifikasi wajib tetap terkirim meski kanalnya dimatikan." footer={resource.data ? <Button icon="check" title="Simpan preferensi" busy={busy} onPress={() => void save()}/> : undefined}>
        {resource.loading && <Label tone="muted">Memuat preferensi…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {status && <Notice tone={status.tone} message={status.text}/>}
        {list.map((item) => { const value = shownChannels(item, channels); const label = LABEL_KELOMPOK_NOTIFIKASI[item.jenis];
            return <Card key={item.jenis}>
                <View style={styles.head}><Text style={styles.title}>{label}</Text>{item.terkunci && <StatusBadge label="Wajib" tone="pending"/>}</View>
                {item.terkunci && <View style={styles.locked}><Icon name="lock" size={t.size.iconSmall} color={t.color.muted}/><Text style={styles.caption}>Menyangkut keputusan atas pengajuan, sehingga tidak dapat dimatikan.</Text></View>}
                <Channel label="Dalam aplikasi" group={label} value={value.in_app} disabled={item.terkunci || busy} onChange={(v) => toggle(item, "in_app", v)}/>
                <Channel label="Push" group={label} value={value.push} disabled={item.terkunci || busy || !value.in_app} onChange={(v) => toggle(item, "push", v)}/>
            </Card>; })}
    </Screen>;
}
function Channel({ label, group, value, disabled, onChange }: { label: string; group: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
    return <View style={styles.channel}><Text style={styles.channelText}>{label}</Text><Switch accessibilityLabel={`${label} — ${group}`} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: t.color.pending, true: t.color.primary }} thumbColor={t.color.surface}/></View>;
}
const styles = StyleSheet.create({
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm }, title: { flex: 1, fontSize: t.font.body, fontWeight: "600", color: t.color.heading },
    locked: { flexDirection: "row", alignItems: "center", gap: t.space.xs }, caption: { flex: 1, fontSize: t.font.small, color: t.color.muted },
    channel: { minHeight: t.size.touch, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, channelText: { fontSize: t.font.body, color: t.color.text },
});
