import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ReactNode } from "react";
import type { StyleProp, TextInputProps, ViewStyle } from "react-native";
import { tokens as t } from "./tokens";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { StateIllustration } from "./visual";
export { tokens } from "./tokens";
export { Icon } from "./Icon";
export type { IconName } from "./Icon";
export { Screen } from "./Screen";
export { Header, ChromeProvider, CountBadge, useChrome } from "./Header";
export type { Chrome } from "./Header";
export { BottomSheet } from "./BottomSheet";
export { Chips, DateField, MultiChips, Toggle } from "./fields";
export { ChatFab, EntityCard, MiniChart, ModuleTile, ProgressRing, StateIllustration, StatusBadge, Stepper } from "./visual";
export type { StatusTone } from "./visual";
export type { DomainGroup } from "./model";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) { return <View style={[styles.card, style]}>{children}</View>; }
export function Label({ children, tone = "default", strong = false }: { children: ReactNode; tone?: "default" | "muted"; strong?: boolean }) { return <Text style={[styles.text, tone === "muted" && styles.muted, strong && styles.strong]}>{children}</Text>; }
export function Notice({ message, tone = "error" }: { message: string; tone?: "error" | "info" | "success" }) {
    const color = tone === "error" ? t.color.error : tone === "success" ? t.color.success : t.color.primary;
    return <View style={[styles.notice, { backgroundColor: tone === "error" ? t.color.errorSoft : tone === "success" ? t.color.successSoft : t.color.primarySoft }]}><Icon name={tone === "error" ? "alert" : tone === "success" ? "checkCircle" : "info"} color={color}/><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.noticeText, { color }]}>{message}</Text></View>;
}
export function Input({ label, icon, ...props }: TextInputProps & { label: string; icon?: IconName }) {
    return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.inputRow}>{icon && <Icon name={icon} color={t.color.muted}/>}<TextInput accessibilityLabel={label} placeholderTextColor={t.color.muted} style={[styles.input, props.multiline && styles.multiline]} {...props}/></View></View>;
}
export function Button({ title, onPress, disabled = false, busy = false, secondary = false, icon, compact = false }: { title: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean; icon?: IconName; compact?: boolean }) {
    const color = secondary ? t.color.primary : t.color.inverse;
    return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, compact && styles.compact, pressed && (secondary ? styles.secondaryPressed : styles.pressed), (disabled || busy) && styles.disabled]}>{busy ? <ActivityIndicator color={color}/> : <>{icon && <Icon name={icon} color={color}/>}<Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></>}</Pressable>;
}
export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <View style={styles.section}><View style={styles.sectionText}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{description && <Text style={styles.caption}>{description}</Text>}</View>{action}</View>; }
export function Badge({ label, tone = "info" }: { label: string; tone?: "info" | "warning" | "success" | "neutral" }) {
    // Pasangan ikon status wajib FOUNDATIONS §8 (NFR-AC-06): peringatan segitiga, menunggu lingkaran putus.
    const color = tone === "warning" ? t.color.warning : tone === "success" ? t.color.success : tone === "neutral" ? t.color.muted : t.color.info;
    return <View style={[styles.badge, { backgroundColor: tone === "warning" ? t.color.warningSoft : tone === "success" ? t.color.successSoft : tone === "neutral" ? t.color.neutralSoft : t.color.infoSoft }]}><Icon name={tone === "warning" ? "alert" : tone === "success" ? "checkCircle" : tone === "neutral" ? "circleDashed" : "info"} size={t.size.iconSmall} color={color}/><Text style={[styles.badgeText, { color }]}>{label}</Text></View>;
}
export function ListRow({ title, subtitle, icon, onPress }: { title: string; subtitle?: string; icon: IconName; onPress?: () => void }) {
    const content = <><View style={styles.rowIcon}><Icon name={icon} color={t.color.iconDefault}/></View><View style={styles.rowText}><Text style={styles.rowTitle}>{title}</Text>{subtitle && <Text style={styles.caption}>{subtitle}</Text>}</View>{onPress && <Icon name="chevronRight" color={t.color.muted}/>}</>;
    return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.secondaryPressed]}>{content}</Pressable> : <View style={styles.row}>{content}</View>;
}
/** C-21; `illustration` menampilkan C-37 di atas judul keadaan. */
export function EmptyState({ icon = "tasks", title, description, illustration }: { icon?: IconName; title: string; description: string; illustration?: "empty" | "error" | "noAccess" | "offline" | "success" }) { return <View style={styles.empty}>{illustration ? <StateIllustration kind={illustration}/> : <View style={styles.emptyIcon}><Icon name={icon} size={t.size.iconLarge} color={t.color.primary}/></View>}<Text style={styles.sectionTitle}>{title}</Text><Text style={[styles.caption, styles.center]}>{description}</Text></View>; }
export const styles = StyleSheet.create({
    text: { fontSize: t.font.body, lineHeight: 24, color: t.color.text }, muted: { color: t.color.muted, fontSize: t.font.small, lineHeight: 21 }, strong: { fontWeight: "600", color: t.color.heading },
    card: { padding: t.space.md, gap: t.space.ms, borderColor: t.color.borderSubtle, borderWidth: 1, borderRadius: t.radius.lg, backgroundColor: t.color.surface },
    notice: { padding: t.space.ms, borderRadius: t.radius.md, flexDirection: "row", alignItems: "flex-start", gap: t.space.sm }, noticeText: { flex: 1, fontSize: t.font.small, lineHeight: 21 },
    field: { gap: t.space.sm }, fieldLabel: { fontSize: t.font.small, fontWeight: "600", color: t.color.heading }, inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: t.color.borderStrong, borderRadius: t.radius.md, backgroundColor: t.color.surface, paddingHorizontal: t.space.ms, gap: t.space.sm },
    input: { minHeight: t.size.control, paddingVertical: t.space.ms, flex: 1, minWidth: 0, fontSize: t.font.body, color: t.color.heading }, multiline: { minHeight: t.size.control * 2, textAlignVertical: "top" },
    button: { minHeight: t.size.control, paddingHorizontal: t.space.md, paddingVertical: t.space.ms, gap: t.space.sm, flexDirection: "row", backgroundColor: t.color.primary, borderRadius: t.radius.md, justifyContent: "center", alignItems: "center" }, buttonText: { color: t.color.inverse, fontSize: t.font.small, fontWeight: "600", flexShrink: 1, textAlign: "center" },
    secondary: { backgroundColor: t.color.surface, borderColor: t.color.border, borderWidth: 1 }, secondaryText: { color: t.color.primary }, compact: { paddingHorizontal: t.space.ms, paddingVertical: t.space.sm, minHeight: t.size.touch }, pressed: { backgroundColor: t.color.primaryPressed }, secondaryPressed: { backgroundColor: t.color.primarySoft }, disabled: { opacity: 0.45 },
    section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.ms }, sectionText: { flex: 1, gap: t.space.xs }, sectionTitle: { color: t.color.heading, fontSize: t.font.title, fontWeight: "600" }, caption: { color: t.color.muted, fontSize: t.font.small, lineHeight: 21 },
    badge: { alignSelf: "flex-start", flexDirection: "row", gap: t.space.xs, alignItems: "center", borderRadius: t.radius.full, paddingHorizontal: t.space.sm, paddingVertical: t.space.xs }, badgeText: { fontSize: t.font.caption, fontWeight: "600" },
    row: { flexDirection: "row", alignItems: "center", gap: t.space.ms, minHeight: t.size.touch, paddingVertical: t.space.sm }, rowIcon: { width: t.size.touch, height: t.size.touch, borderRadius: t.radius.md, backgroundColor: t.color.neutralSoft, alignItems: "center", justifyContent: "center" }, rowText: { flex: 1, gap: t.space.xs }, rowTitle: { color: t.color.heading, fontSize: t.font.body, fontWeight: "500" },
    empty: { alignItems: "center", gap: t.space.ms, paddingVertical: t.space.lg }, emptyIcon: { width: t.size.avatar, height: t.size.avatar, borderRadius: t.radius.full, alignItems: "center", justifyContent: "center", backgroundColor: t.color.primarySoft }, center: { textAlign: "center" },
});
