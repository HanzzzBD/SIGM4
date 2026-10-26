import { useState } from "react";
import { Tabs, usePathname } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../features/auth";
import { ChatScreen } from "../../features/chat";
import { MainTour, MainTourTarget } from "../../features/tour";
import type { MainStep } from "../../features/tour";
import { BottomSheet, ChatFab, Icon, tokens as t } from "../../shared/ui";
import type { IconName } from "../../shared/ui";
import { chatFabVisible } from "../../shared/ui/model";

/** Bottom tab Beranda · Tugas · Scan · Chatbot · Menu (UXD-20); Scan tetap di tengah (UXD-03). */
export default function TabLayout() {
    const { state } = useAuth(); const pathname = usePathname();
    const insets = useSafeAreaInsets(); const [chat, setChat] = useState(false);
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const canScan = Object.hasOwn(permissions, "asset.view") || Object.hasOwn(permissions, "material.view");
    const canChat = Object.hasOwn(permissions, "chat.use");
    const icons: Record<string, IconName> = { index: "house", "(tasks)": "listChecks", "(scan)": "scanLine", "(chat)": "messageCircle", "(menu)": "menu" };
    // Langkah tur utama per tab; tab yang tidak dirender (Chatbot tanpa chat.use) tidak ikut tur.
    const steps: Record<string, MainStep> = { index: "home", "(tasks)": "tasks", "(chat)": "chat", "(menu)": "menu" };
    return <MainTour><View style={styles.root}>
        <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: t.color.primary, tabBarInactiveTintColor: t.color.muted, tabBarLabelStyle: { fontSize: t.font.caption, fontWeight: "500", marginTop: t.space.xs }, tabBarStyle: { backgroundColor: t.color.surface, borderTopColor: t.color.borderSubtle, height: t.size.tabBar + insets.bottom, paddingBottom: insets.bottom + t.space.sm, paddingTop: t.space.sm }, tabBarIcon: ({ color, focused }) => { const icon = <View style={focused ? styles.activeIcon : undefined}><Icon name={icons[route.name] ?? "house"} color={color} size={t.size.iconLarge}/></View>; const step = steps[route.name]; return step ? <MainTourTarget step={step}>{icon}</MainTourTarget> : icon; } })}>
            <Tabs.Screen name="index" options={{ title: "Beranda" }} /><Tabs.Screen name="(tasks)" options={{ title: "Tugas" }} />
            <Tabs.Screen name="(scan)" options={{ title: "Scan", tabBarIcon: () => <MainTourTarget step="scan"><View style={styles.scanIcon}><Icon name="scanLine" color={t.color.inverse} size={t.size.iconLarge}/></View></MainTourTarget>, tabBarButton: (props) => <Pressable accessibilityRole="tab" accessibilityLabel="Scan" accessibilityState={{ selected: props.accessibilityState?.selected ?? false, disabled: !canScan }} onPress={canScan ? props.onPress : undefined} onLongPress={canScan ? props.onLongPress : undefined} style={[props.style, { minHeight: t.size.touch, justifyContent: "center", alignItems: "center", opacity: canScan ? 1 : 0.5 }]}>{props.children}</Pressable> }} />
            {/* Tab Chatbot disembunyikan tanpa chat.use (UX §5.5). */}
            <Tabs.Screen name="(chat)" options={{ title: "Chatbot", ...(canChat ? {} : { href: null }) }} />
            <Tabs.Screen name="(menu)" options={{ title: "Menu" }} />
        </Tabs>
        {chatFabVisible(pathname, permissions) && <ChatFab bottom={t.size.tabBar + insets.bottom + t.space.md} onPress={() => setChat(true)}/>}
        <BottomSheet visible={chat} onClose={() => setChat(false)} title="Tanya SIGM4">{chat && <ChatScreen embedded/>}</BottomSheet>
    </View></MainTour>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, activeIcon: { backgroundColor: t.color.primarySoft, borderRadius: t.radius.md, paddingHorizontal: t.space.ms, paddingVertical: t.space.xs }, scanIcon: { width: t.size.touch, height: t.size.touch, borderRadius: t.radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: t.color.primary, marginTop: -t.space.ms } });
