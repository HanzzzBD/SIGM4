import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens as t } from "./tokens";
import { Icon } from "./Icon";

/** C-36 — setengah layar bawaan, dapat ditarik penuh; tutup dengan seret, ketuk latar, atau tombol berlabel. */
export function BottomSheet({ visible, onClose, title, children, full = false }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; full?: boolean }) {
    const { height } = useWindowDimensions(); const insets = useSafeAreaInsets();
    const [expanded, setExpanded] = useState(full); const [reduced, setReduced] = useState(false);
    const offset = useRef(new Animated.Value(height)).current;
    useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined); }, []);
    useEffect(() => {
        if (!visible) return;
        setExpanded(full); offset.setValue(height);
        // Masuk motion.duration.slow + easing enter; reduced motion → 0 ms (FOUNDATIONS §9).
        Animated.timing(offset, { toValue: 0, duration: reduced ? 0 : t.motion.slow, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }).start();
    }, [visible, full, height, offset, reduced]);
    const close = () => Animated.timing(offset, { toValue: height, duration: reduced ? 0 : t.motion.slow, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: true }).start(() => onClose());
    const closeRef = useRef(close); closeRef.current = close;
    const drag = useRef(PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > t.space.sm,
        onPanResponderMove: (_, g) => { if (g.dy > 0) offset.setValue(g.dy); },
        onPanResponderRelease: (_, g) => { if (g.dy > t.size.topbar) closeRef.current(); else { if (g.dy < -t.space.lg) setExpanded(true); Animated.timing(offset, { toValue: 0, duration: t.motion.base, useNativeDriver: true }).start(); } },
    })).current;
    return <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        <View style={styles.root}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tutup lapisan" style={StyleSheet.absoluteFill} onPress={close}><View style={styles.overlay}/></Pressable>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.anchor} pointerEvents="box-none">
                <Animated.View accessibilityViewIsModal style={[styles.sheet, { height: expanded ? height - insets.top : height / 2, paddingBottom: insets.bottom, transform: [{ translateY: offset }] }]}>
                    <View {...drag.panHandlers} style={styles.grip}><View style={styles.handle}/></View>
                    <View style={styles.head}><Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Tutup ${title}`} onPress={close} style={styles.close}><Icon name="close" color={t.color.iconDefault}/></Pressable></View>
                    <View style={styles.body}>{children}</View>
                </Animated.View>
            </KeyboardAvoidingView>
        </View>
    </Modal>;
}
const styles = StyleSheet.create({
    root: { flex: 1 }, overlay: { flex: 1, backgroundColor: t.color.overlay }, anchor: { flex: 1, justifyContent: "flex-end" },
    sheet: { backgroundColor: t.color.surface, borderTopLeftRadius: t.radius.lg, borderTopRightRadius: t.radius.lg, ...t.elevation.floating },
    grip: { alignItems: "center", paddingVertical: t.space.sm }, handle: { width: t.space.xl, height: t.space.xs, borderRadius: t.radius.full, backgroundColor: t.color.pending },
    head: { flexDirection: "row", alignItems: "center", paddingHorizontal: t.space.md, gap: t.space.sm }, title: { flex: 1, fontSize: t.font.title, fontWeight: "600", color: t.color.heading },
    close: { width: t.size.touch, height: t.size.touch, alignItems: "center", justifyContent: "center" }, body: { flex: 1, minHeight: 0 },
});
