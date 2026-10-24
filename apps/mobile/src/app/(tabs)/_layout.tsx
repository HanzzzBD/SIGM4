import { Tabs } from "expo-router";
import { Pressable, Text } from "react-native";
import { useAuth } from "../../features/auth";
import { useNotifications } from "../../features/notifications";
import { tokens as t } from "../../shared/ui";
export default function TabLayout() {
    const { state } = useAuth(); const notifications = useNotifications();
    const canScan = state.kind === "READY" && Object.hasOwn(state.session.permissions, "asset.view");
    return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.color.primary, tabBarInactiveTintColor: t.color.muted, tabBarLabelStyle: { fontSize: t.font.small }, tabBarStyle: { backgroundColor: t.color.surface, borderTopColor: t.color.border, minHeight: t.size.touch }, tabBarIconStyle: { display: "none" } }}>
        <Tabs.Screen name="index" options={{ title: "Beranda" }} /><Tabs.Screen name="(tasks)" options={{ title: "Tugas" }} />
        <Tabs.Screen name="(scan)" options={{ title: "Scan", tabBarButton: (props) => <Pressable accessibilityRole="tab" accessibilityLabel="Scan" accessibilityState={{ selected: props.accessibilityState?.selected ?? false, disabled: !canScan }} onPress={canScan ? props.onPress : undefined} onLongPress={canScan ? props.onLongPress : undefined} style={[props.style, { minHeight: t.size.touch, justifyContent: "center", alignItems: "center", opacity: canScan ? 1 : 0.5 }]}><Text style={{ fontSize: t.font.small, color: props.accessibilityState?.selected ? t.color.primary : t.color.muted }}>Scan</Text></Pressable> }} />
        <Tabs.Screen name="notifikasi" options={{ title: "Notifikasi", ...(notifications.unread > 0 ? { tabBarBadge: notifications.unread > 99 ? "99+" : notifications.unread } : {}) }} />
        <Tabs.Screen name="profil" options={{ title: "Profil" }} />
    </Tabs>;
}
