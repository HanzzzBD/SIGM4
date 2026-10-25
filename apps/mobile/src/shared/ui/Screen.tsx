import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { tokens as t } from "./tokens";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export function Screen({ title, subtitle, icon, children, action, footer }: { title: string; subtitle?: string; icon?: IconName; children: ReactNode; action?: ReactNode; footer?: ReactNode }) {
    return <KeyboardAvoidingView style={styles.frame} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.top}><View style={styles.header}>
            <View style={styles.identity}>{icon && <View style={styles.mark}><Icon name={icon} color={t.color.primary} size={t.size.iconLarge}/></View>}
                <View style={styles.titleBlock}><Text style={styles.brand}>SIGM4 <Text style={styles.school}>/ SMKN 4 Bandung</Text></Text><Text accessibilityRole="header" style={styles.heading}>{title}</Text></View>
            </View>{action && <View style={styles.action}>{action}</View>}
        </View>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><View style={styles.content}>{children}</View></ScrollView>
        {footer && <View style={styles.footer}><View style={styles.content}>{footer}</View></View>}
    </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
    frame: { flex: 1, backgroundColor: t.color.page }, top: { backgroundColor: t.color.surface, padding: t.space.ml, borderBottomWidth: 1, borderBottomColor: t.color.border },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm, width: "100%", maxWidth: t.size.content, alignSelf: "center" },
    identity: { flexDirection: "row", alignItems: "center", gap: t.space.ms, flex: 1, minWidth: 0 }, mark: { height: t.size.avatar, width: t.size.avatar, backgroundColor: t.color.primarySoft, borderRadius: t.radius.lg, alignItems: "center", justifyContent: "center" },
    titleBlock: { flex: 1, gap: t.space.xs }, brand: { color: t.color.primary, fontSize: t.font.caption, fontWeight: "700", letterSpacing: 0.5 }, school: { color: t.color.muted, fontWeight: "400" },
    heading: { fontSize: t.font.heading, fontWeight: "700", color: t.color.heading, letterSpacing: -0.5 }, subtitle: { fontSize: t.font.small, lineHeight: 21, color: t.color.muted, marginTop: t.space.ms, maxWidth: t.size.content, width: "100%", alignSelf: "center" },
    action: { flexShrink: 0 }, page: { padding: t.space.ml, flexGrow: 1 }, content: { gap: t.space.md, width: "100%", maxWidth: t.size.content, alignSelf: "center" },
    footer: { padding: t.space.md, borderTopWidth: 1, borderColor: t.color.border, backgroundColor: t.color.surface },
});
