import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as ScreenCapture from "expo-screen-capture";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, AuthScreen, useAuth } from "../features/auth";
import { UploadProvider } from "../features/uploads";
import { Button, Label, Notice, Screen } from "../shared/ui";

function SessionGate() {
    const { state, loading, error, retry } = useAuth();
    const [protectedReady, setProtectedReady] = useState(false);
    const [privacyError, setPrivacyError] = useState(false);
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
    return <Stack screenOptions={{ headerShown: false }} />;
}
export default function RootLayout() {
    const url = process.env.EXPO_PUBLIC_API_URL;
    let valid = false;
    try { if (url) { const parsed = new URL(url); valid = parsed.protocol === "https:" || (__DEV__ && parsed.protocol === "http:"); } } catch { /* Konfigurasi tidak dapat dipakai. */ }
    if (!valid || !url) return <SafeAreaProvider><SafeAreaView style={{ flex: 1 }}><Screen title="SIGM4"><Notice message="Aplikasi belum dapat terhubung. Hubungi Administrator untuk konfigurasi aplikasi." /></Screen></SafeAreaView></SafeAreaProvider>;
    return <SafeAreaProvider><SafeAreaView style={{ flex: 1 }}><AuthProvider baseURL={url}><UploadProvider><SessionGate /></UploadProvider></AuthProvider></SafeAreaView></SafeAreaProvider>;
}
