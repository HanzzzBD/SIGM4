import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import * as ScreenCapture from "expo-screen-capture";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, AuthScreen, useAuth } from "../features/auth";
import { UploadProvider } from "../features/uploads";
import { StocktakeProvider, StocktakeScreen } from "../features/stocktake";
import { NotificationsProvider, useNotifications } from "../features/notifications";
import { isHeadless } from "../shared/push";
import { TourRoot } from "../features/tour";
import { Button, ChromeProvider, Label, Notice, Screen } from "../shared/ui";

function SessionGate() {
    const { state, loading, error, retry, offlineOnly } = useAuth();
    const [protectedReady, setProtectedReady] = useState(false);
    const [privacyError, setPrivacyError] = useState(false);
    const notifications = useNotifications();
    useEffect(() => {
        let live = true;
        const protection = Platform.OS === "ios" ? ScreenCapture.enableAppSwitcherProtectionAsync() : ScreenCapture.preventScreenCaptureAsync("sigm4");
        void protection.then(() => { if (live) setProtectedReady(true); }).catch(() => { if (live) setPrivacyError(true); });
        return () => { live = false; if (Platform.OS === "ios") void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => undefined); else void ScreenCapture.allowScreenCaptureAsync("sigm4").catch(() => undefined); };
    }, []);
    if (privacyError) return <Screen title="SIGM4"><Notice message="Perlindungan pratinjau perangkat belum dapat diaktifkan. Tutup dan buka ulang aplikasi." /></Screen>;
    if (loading || !protectedReady) return <Screen title="SIGM4"><Label>Memeriksa sesi…</Label></Screen>;
    if (error) return <Screen title="Sesi belum dapat diperiksa"><Notice message={error} /><Button title="Coba lagi" onPress={retry} /></Screen>;
    if (state.kind !== "READY") return <AuthScreen key={state.kind} />;
    // Lonceng C-30 di setiap layar ber-header, hanya bagi pemegang notification.manage_own (MS-29, UXD-21).
    const chrome = Object.hasOwn(state.session.permissions, "notification.manage_own") ? { unread: notifications.unread, openNotifications: () => router.push("/notifikasi" as "/scan") } : null;
    if (offlineOnly) return <StocktakeScreen />;
    return <ChromeProvider value={chrome}><TourRoot><View style={{ flex: 1 }}>{notifications.banner && <View><Label>Ada notifikasi baru.</Label><Button title="Lihat notifikasi" onPress={() => { notifications.dismissBanner(); router.push("/notifikasi" as "/scan"); }} /><Button title="Tutup pemberitahuan" secondary onPress={notifications.dismissBanner} /></View>}<Stack screenOptions={{ headerShown: false }} /></View></TourRoot></ChromeProvider>;
}
export default function RootLayout() {
    const [headless, setHeadless] = useState<boolean | null>(null);
    useEffect(() => { let live = true; void isHeadless().catch(() => false).then((value) => { if (live) setHeadless(value); }); return () => { live = false; }; }, []);
    if (headless !== false) return null;
    return <AppRoot />;
}
function AppRoot() {
    const url = process.env.EXPO_PUBLIC_API_URL;
    let valid = false;
    try { if (url) { const parsed = new URL(url); valid = parsed.protocol === "https:" || (__DEV__ && parsed.protocol === "http:"); } } catch { /* Konfigurasi tidak dapat dipakai. */ }
    if (!valid || !url) return <SafeAreaProvider><SafeAreaView style={{ flex: 1 }}><Screen title="SIGM4"><Notice message="Aplikasi belum dapat terhubung. Hubungi Administrator untuk konfigurasi aplikasi." /></Screen></SafeAreaView></SafeAreaProvider>;
    return <SafeAreaProvider><SafeAreaView edges={["top","left","right"]} style={{ flex: 1 }}><AuthProvider baseURL={url}><StocktakeProvider><UploadProvider><NotificationsProvider><SessionGate /></NotificationsProvider></UploadProvider></StocktakeProvider></AuthProvider></SafeAreaView></SafeAreaProvider>;
}
