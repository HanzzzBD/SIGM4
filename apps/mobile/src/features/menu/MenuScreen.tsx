import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { roleLabel } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useRestartMainTour } from "../tour";
import { BottomSheet, Button, EmptyState, Icon, Input, ModuleTile, Notice, Screen, tokens as t } from "../../shared/ui";
import { initials } from "../../shared/ui/model";
import { searchMenu, visibleMenu, webUrl } from "./model";
import type { VisibleEntry } from "./model";

/** MS-31 — kartu Profil, pencarian modul, lima grup domain tersaring permission (UXD-20). */
export function MenuScreen() {
    const { state, offlineOnly } = useAuth();
    const restartTour = useRestartMainTour();
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const [query, setQuery] = useState(""); const [web, setWeb] = useState<VisibleEntry | null>(null); const [error, setError] = useState<string | null>(null);
    const groups = useMemo(() => searchMenu(visibleMenu(permissions), query), [permissions, query]);
    if (state.kind !== "READY") return null;
    const user = state.session.user;
    const open = (entry: VisibleEntry) => { if (entry.web) { setError(null); setWeb(entry); } else router.push(entry.path as "/scan"); };
    const openWeb = () => {
        const url = web ? webUrl(process.env.EXPO_PUBLIC_APP_URL ?? "", web.path) : null;
        if (!url) { setError("Alamat web sekolah belum dikonfigurasi. Hubungi Administrator."); return; }
        if (offlineOnly) { setError("Layanan web memerlukan koneksi. Sambungkan internet dan coba lagi."); return; }
        void Linking.openURL(url).then(() => setWeb(null)).catch(() => setError("Browser belum dapat dibuka. Coba lagi."));
    };
    return <Screen title="Menu" icon="menu">
        <Pressable accessibilityRole="button" accessibilityLabel={`Profil ${user.nama}, ${roleLabel(user.role_kode)}`} onPress={() => router.push("/profil" as "/scan")} style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
            <View style={styles.avatar}><Text style={styles.initials}>{initials(user.nama)}</Text></View>
            <View style={styles.identity}><Text numberOfLines={1} style={styles.name}>{user.nama}</Text><Text numberOfLines={1} style={styles.role}>{roleLabel(user.role_kode)}</Text></View>
            <Icon name="chevronRight" color={t.color.muted}/>
        </Pressable>
        {restartTour && <Button secondary icon="help" title="Pengenalan SIGM4" onPress={restartTour}/>}
        <Input icon="search" label="Cari modul" value={query} onChangeText={setQuery} placeholder="Contoh: reservasi" autoCorrect={false}/>
        {groups.length === 0 && <EmptyState illustration="empty" title="Modul tidak ditemukan" description="Coba kata lain atau periksa ejaan."/>}
        {groups.map((group) => <View key={group.group} style={styles.group}>
            <Text accessibilityRole="header" style={styles.groupTitle}>{group.label}</Text>
            <View style={styles.grid}>{group.entries.map((entry) => <ModuleTile key={entry.id} label={entry.label} icon={entry.icon} group={group.group} web={entry.web !== undefined} onPress={() => open(entry)}/>)}</View>
        </View>)}
        <BottomSheet visible={web !== null} onClose={() => setWeb(null)} title={web?.label ?? "Buka di web"}>
            <View style={styles.sheet}><Text style={styles.reason}>{web?.web?.reason}</Text>{error && <Notice message={error}/>}<Button icon="externalLink" title="Buka di web sekolah" onPress={openWeb}/></View>
        </BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({
    profile: { flexDirection: "row", alignItems: "center", gap: t.space.ms, padding: t.space.md, backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.borderSubtle, borderRadius: t.radius.lg }, pressed: { backgroundColor: t.color.primarySoft },
    avatar: { width: t.size.avatar, height: t.size.avatar, borderRadius: t.radius.full, backgroundColor: t.color.primarySoft, alignItems: "center", justifyContent: "center" }, initials: { fontSize: t.font.title, fontWeight: "600", color: t.color.primary },
    identity: { flex: 1, minWidth: 0, gap: t.space.xs }, name: { fontSize: t.font.title, fontWeight: "600", color: t.color.heading }, role: { fontSize: t.font.small, color: t.color.muted },
    group: { gap: t.space.sm }, groupTitle: { fontSize: t.font.small, fontWeight: "600", color: t.color.text }, grid: { flexDirection: "row", flexWrap: "wrap", gap: t.space.ms },
    sheet: { padding: t.space.md, gap: t.space.md }, reason: { fontSize: t.font.body, lineHeight: 24, color: t.color.text },
});
