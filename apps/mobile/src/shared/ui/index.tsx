import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ReactNode } from "react";
import type { TextInputProps } from "react-native";
import { tokens as t } from "./tokens";
export { tokens } from "./tokens";

export function Screen({ title, children }: { title: string; children: ReactNode }) {
    return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><View style={styles.content}><Text accessibilityRole="header" style={styles.heading}>{title}</Text>{children}</View></ScrollView>;
}
export function Card({ children }: { children: ReactNode }) { return <View style={styles.card}>{children}</View>; }
export function Label({ children }: { children: ReactNode }) { return <Text style={styles.text}>{children}</Text>; }
export function Notice({ message }: { message: string }) { return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>; }
export function Input({ label, ...props }: TextInputProps & { label: string }) { return <View style={styles.field}><Text style={styles.text}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={t.color.muted} style={styles.input} {...props} /></View>; }
export function Button({ title, onPress, disabled = false, busy = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean }) {
    return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={[styles.button, secondary && styles.secondary, (disabled || busy) && styles.disabled]}>{busy ? <ActivityIndicator color={secondary ? t.color.primary : t.color.surface} /> : <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>}</Pressable>;
}
export const styles = StyleSheet.create({
    page: { padding: t.space.md, backgroundColor: t.color.page, flexGrow: 1 },
    content: { gap: t.space.lg, width: "100%", maxWidth: t.size.content, alignSelf: "center" },
    heading: { fontSize: t.font.heading, fontWeight: "600", color: t.color.heading },
    text: { fontSize: t.font.body, color: t.color.text },
    notice: { fontSize: t.font.body, color: t.color.error },
    card: { padding: t.space.lg, gap: t.space.md, borderColor: t.color.border, borderWidth: 1, borderRadius: t.radius.md, backgroundColor: t.color.surface },
    field: { gap: t.space.sm },
    input: { minHeight: t.size.control, borderWidth: 1, borderColor: t.color.border, borderRadius: t.radius.sm, padding: t.space.md, fontSize: t.font.body, color: t.color.text, backgroundColor: t.color.surface },
    button: { minHeight: t.size.touch, padding: t.space.md, backgroundColor: t.color.primary, borderRadius: t.radius.md, justifyContent: "center", alignItems: "center" },
    buttonText: { color: t.color.surface, fontSize: t.font.body, fontWeight: "600" },
    secondary: { backgroundColor: t.color.surface, borderColor: t.color.border, borderWidth: 1 },
    secondaryText: { color: t.color.primary },
    disabled: { opacity: 0.5 },
});
