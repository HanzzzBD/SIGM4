import { Tabs } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../features/auth";
import { useNotifications } from "../../features/notifications";
import { Icon, tokens as t } from "../../shared/ui";
import type { IconName } from "../../shared/ui";
export default function TabLayout() {
    const { state } = useAuth(); const notifications = useNotifications();
    const insets = useSafeAreaInsets();
    const canScan = state.kind === "READY" && (Object.hasOwn(state.session.permissions, "asset.view")||Object.hasOwn(state.session.permissions,"material.view"));
    const icons: Record<string, IconName> = { index: "home", "(tasks)": "tasks", "(scan)": "scan", notifikasi: "bell", profil: "user" };
    return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: t.color.primary, tabBarInactiveTintColor: t.color.muted, tabBarLabelStyle: { fontSize: t.font.caption, fontWeight: "500", marginTop: t.space.xs }, tabBarStyle: { backgroundColor: t.color.surface, borderTopColor: t.color.border, height: t.size.tabBar + insets.bottom, paddingBottom: insets.bottom + t.space.sm, paddingTop: t.space.sm }, tabBarIcon: ({ color, focused }) => <View style={focused ? styles.activeIcon : undefined}><Icon name={icons[route.name] ?? "home"} color={color} size={t.size.iconLarge}/></View> })}>
        <Tabs.Screen name="index" options={{ title: "Beranda" }} /><Tabs.Screen name="(tasks)" options={{ title: "Tugas" }} />
        <Tabs.Screen name="(scan)" options={{ title: "Scan", tabBarIcon: () => <View style={styles.scanIcon}><Icon name="scan" color={t.color.inverse} size={t.size.iconLarge}/></View>, tabBarButton: (props) => <Pressable accessibilityRole="tab" accessibilityLabel="Scan" accessibilityState={{ selected: props.accessibilityState?.selected ?? false, disabled: !canScan }} onPress={canScan ? props.onPress : undefined} onLongPress={canScan ? props.onLongPress : undefined} style={[props.style, { minHeight: t.size.touch, justifyContent: "center", alignItems: "center", opacity: canScan ? 1 : 0.5 }]}>{props.children}</Pressable> }} />
        <Tabs.Screen name="notifikasi" options={{ title: "Notifikasi", ...(notifications.unread > 0 ? { tabBarBadge: notifications.unread > 99 ? "99+" : notifications.unread } : {}) }} />
        <Tabs.Screen name="profil" options={{ title: "Profil" }} />
    </Tabs>;
}
const styles = StyleSheet.create({ activeIcon: { backgroundColor: t.color.primarySoft, borderRadius: t.radius.md, paddingHorizontal: t.space.ms, paddingVertical: t.space.xs }, scanIcon: { width: t.size.touch, height: t.size.touch, borderRadius: t.radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: t.color.primary, marginTop: -t.space.ms } });
