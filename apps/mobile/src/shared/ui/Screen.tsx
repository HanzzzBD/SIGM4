import { useCallback, useState } from "react";
import { KeyboardAvoidingView, LayoutAnimation, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { router, useFocusEffect, usePathname } from "expo-router";
import { tokens as t } from "./tokens";
import type { IconName } from "./Icon";
import { Header } from "./Header";
import { BottomSheet } from "./BottomSheet";
import { headerCollapsed } from "./model";
import { TourScope, TourTarget, useTourChrome, useTourControl } from "./tour";
import type { PageTourSpec } from "./tour";

function canGoBack() { try { return router.canGoBack(); } catch { return false; } }

/** Jeda tur otomatis: data layar dimuat asinkron; tur yang diputar pengguna sendiri tidak menunggu. */
const AUTO_TOUR_DELAY_MS = 1200;

/**
 * Kerangka layar mobile: header C-30 satu baris (UXD-21). `icon` menandai layar akar tab (ikon modul,
 * tanpa tombol kembali); `subtitle` adalah keterangan halaman yang dibuka dari ikon info di C-36 (DSD-11).
 */
type ScreenProps = { title: string; subtitle?: string; icon?: IconName; children: ReactNode; action?: ReactNode; footer?: ReactNode; onBack?: () => void };

export function Screen(props: ScreenProps) {
    const tour = useTourChrome(); const pathname = usePathname();
    const spec = tour?.pageTour(pathname) ?? null;
    return <TourScope onFinish={(status) => { if (spec) tour?.finish(spec.key, status); }}><ScreenFrame {...props} spec={spec}/></TourScope>;
}

function ScreenFrame({ title, subtitle, icon, children, action, footer, onBack, spec }: ScreenProps & { spec: PageTourSpec | null }) {
    const tour = useTourChrome(); const control = useTourControl();
    // Mini-tur otomatis hanya untuk layar yang sedang fokus; layar tab lain tetap terpasang di belakang.
    useFocusEffect(useCallback(() => {
        if (!spec || !tour?.shouldAutoRun(spec.key)) return undefined;
        const timer = setTimeout(control.start, AUTO_TOUR_DELAY_MS);
        return () => clearTimeout(timer);
    }, [spec, tour, control.start]));
    const [collapsed, setCollapsed] = useState(false); const [info, setInfo] = useState(false);
    const back = onBack ?? (!icon && canGoBack() ? () => router.back() : undefined);
    const scrolled = (y: number) => { const next = headerCollapsed(y); if (next !== collapsed) { LayoutAnimation.configureNext(LayoutAnimation.create(t.motion.base, "easeInEaseOut", "opacity")); setCollapsed(next); } };
    return <KeyboardAvoidingView style={styles.frame} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {spec ? <TourTarget name="header" order={1} copy={spec.header}><Header title={title} {...(icon ? { icon } : {})} {...(back ? { onBack: back } : {})} {...(subtitle ? { onInfo: () => setInfo(true) } : {})} onHelp={control.start} collapsed={collapsed}/></TourTarget>
            : <Header title={title} {...(icon ? { icon } : {})} {...(back ? { onBack: back } : {})} {...(subtitle ? { onInfo: () => setInfo(true) } : {})} collapsed={collapsed}/>}
        {action && !collapsed && <View style={styles.toolbar}><View style={styles.action}>{action}</View></View>}
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={(event) => scrolled(event.nativeEvent.contentOffset.y)}>{spec ? <TourTarget name="content" order={2} copy={spec.content}><View style={styles.content}>{children}</View></TourTarget> : <View style={styles.content}>{children}</View>}</ScrollView>
        {footer && <View style={styles.footer}><View style={styles.content}>{footer}</View></View>}
        {subtitle && <BottomSheet visible={info} onClose={() => setInfo(false)} title={title}><Text style={styles.info}>{subtitle}</Text></BottomSheet>}
    </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
    frame: { flex: 1, backgroundColor: t.color.page },
    toolbar: { backgroundColor: t.color.surface, paddingHorizontal: t.space.md, paddingVertical: t.space.sm, borderBottomWidth: 1, borderBottomColor: t.color.borderSubtle },
    action: { alignSelf: "flex-end", maxWidth: t.size.content },
    page: { padding: t.space.md, flexGrow: 1 }, content: { gap: t.space.md, width: "100%", maxWidth: t.size.content, alignSelf: "center" },
    footer: { padding: t.space.md, borderTopWidth: 1, borderColor: t.color.borderSubtle, backgroundColor: t.color.surface },
    info: { paddingHorizontal: t.space.md, fontSize: t.font.body, lineHeight: 24, color: t.color.text },
});
