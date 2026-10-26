import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens as t } from "./tokens";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { bellLabel, countBadge } from "./model";

/** Lonceng header disediakan lapisan app agar shared/ui tidak mengimpor fitur (SDD-12 §4.1). */
export interface Chrome { unread: number; openNotifications: () => void }
const ChromeContext = createContext<Chrome | null>(null);
export function ChromeProvider({ value, children }: { value: Chrome | null; children: ReactNode }) { return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>; }
export function useChrome() { return useContext(ChromeContext); }

export function CountBadge({ count, style }: { count: number; style?: object }) {
    const label = countBadge(count);
    return label === null ? null : <View style={[styles.badge, style]} accessible={false}><Text style={styles.badgeText}>{label}</Text></View>;
}

/** C-30 — satu baris: kembali/ikon modul · judul · info · lonceng (UXD-21). */
/** `onHelp` memutar panduan layar sesuai permintaan bila katalog memilikinya. */
export function Header({ title, icon, onBack, onInfo, onHelp, collapsed = false }: { title: string; icon?: IconName; onBack?: () => void; onInfo?: () => void; onHelp?: () => void; collapsed?: boolean }) {
    const chrome = useChrome();
    return <View style={[styles.bar, collapsed && styles.collapsed]}>
        {!collapsed && (onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={onBack} style={styles.button}><Icon name="arrowLeft" color={t.color.iconDefault}/></Pressable> : icon ? <View style={styles.button}><Icon name={icon} color={t.color.iconDefault}/></View> : null)}
        <Text accessibilityRole="header" accessibilityLabel={title} numberOfLines={1} style={[styles.title, collapsed && styles.titleCollapsed]}>{title}</Text>
        {!collapsed && onHelp && <Pressable accessibilityRole="button" accessibilityLabel="Panduan layar ini" onPress={onHelp} style={styles.button}><Icon name="help" color={t.color.iconDefault}/></Pressable>}
        {!collapsed && onInfo && <Pressable accessibilityRole="button" accessibilityLabel="Keterangan halaman" onPress={onInfo} style={styles.button}><Icon name="info" color={t.color.iconDefault}/></Pressable>}
        {!collapsed && chrome && <Pressable accessibilityRole="button" accessibilityLabel={bellLabel(chrome.unread)} onPress={chrome.openNotifications} style={styles.button}><Icon name="bell" color={t.color.iconDefault}/><CountBadge count={chrome.unread} style={styles.bellBadge}/></Pressable>}
    </View>;
}
const styles = StyleSheet.create({
    bar: { minHeight: t.size.topbar, flexDirection: "row", alignItems: "center", gap: t.space.xs, paddingHorizontal: t.space.sm, backgroundColor: t.color.surface, borderBottomWidth: 1, borderBottomColor: t.color.borderSubtle },
    collapsed: { minHeight: t.size.touch, justifyContent: "center" },
    button: { width: t.size.touch, height: t.size.touch, alignItems: "center", justifyContent: "center" },
    title: { flex: 1, minWidth: 0, fontSize: t.font.title, fontWeight: "600", color: t.color.heading, paddingHorizontal: t.space.xs },
    titleCollapsed: { flex: 0, fontSize: t.font.body, textAlign: "center" },
    badge: { minWidth: t.size.badge, height: t.size.badge, paddingHorizontal: t.space.xs, borderRadius: t.radius.full, backgroundColor: t.color.primary, alignItems: "center", justifyContent: "center" },
    badgeText: { fontSize: t.font.caption, fontWeight: "700", color: t.color.inverse, fontVariant: ["tabular-nums"] },
    bellBadge: { position: "absolute", top: t.space.xs, right: t.space.xs },
});
