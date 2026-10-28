import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { router, useRootNavigationState } from "expo-router";
import { NotificationsResponseSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { DeviceRegistration } from "./registration";
import { NavigationInbox } from "../../shared/navigation";
import { deviceIdentity, firebaseEnabled, listenPush, notificationPermission, revokeNativePush } from "../../shared/push";

interface NotificationContext { unread: number; refresh: () => void; status: string; enablePush: () => Promise<void>; banner: boolean; dismissBanner: () => void }
const Context = createContext<NotificationContext | null>(null);
export function NotificationsProvider({ children }: { children: ReactNode }) {
    const { state, api, controller, offlineOnly } = useAuth(); const navigation = useRootNavigationState();
    const account = state.kind === "READY" && !offlineOnly ? state.session.user.id : null;
    const permitted = state.kind === "READY" && Object.hasOwn(state.session.permissions, "notification.manage_own");
    const currentAccount = useRef(account); currentAccount.current = account;
    const inbox = useRef(new NavigationInbox()); const paused = useRef(false);
    const [unread, setUnread] = useState(0); const [version, setVersion] = useState(0); const [event, setEvent] = useState(0);
    const [banner, setBanner] = useState(false); const [status, setStatus] = useState(firebaseEnabled ? "Push belum diaktifkan. Notifikasi in-app tetap tersedia." : "Push belum dikonfigurasi sekolah. Notifikasi in-app tetap tersedia.");
    const refresh = () => setVersion((value) => value + 1);
    const registration = useMemo(() => new DeviceRegistration({
        identity: deviceIdentity,
        register: async (fid, signal) => { await api.post("/device-tokens", { token: fid, platform: Platform.OS === "ios" ? "IOS" : "ANDROID" }, { signal }); },
        unregister: async (fid) => { await api.delete(`/device-tokens/${encodeURIComponent(fid)}`, { timeout: 5000 }); },
        revokeNative: revokeNativePush,
    }), [api]);
    useEffect(() => controller.setBeforeLogout(async () => {
        paused.current = true; inbox.current.clear(); setBanner(false); setUnread(0);
        await registration.logout().catch(() => undefined);
    }), [controller, registration]);
    useEffect(() => {
        if (!account || !permitted) { registration.stop(); inbox.current.clear(); setUnread(0); setBanner(false); return; }
        let live = true; paused.current = false;
        const start = () => { if (!paused.current) void registration.start().then((ready) => { if (live) setStatus(ready ? "Push aktif pada perangkat ini." : firebaseEnabled ? "Izin push belum diberikan. Notifikasi in-app tetap tersedia." : "Push belum dikonfigurasi sekolah. Notifikasi in-app tetap tersedia."); }).catch(() => { if (live) setStatus("Push belum dapat didaftarkan. Coba lagi; notifikasi in-app tetap tersedia."); }); };
        start(); const listener = AppState.addEventListener("change", (value) => { if (value === "active") start(); });
        return () => { live = false; registration.stop(); listener.remove(); };
    }, [account, permitted, registration]);
    useEffect(() => {
        let live = true; let stop: () => void = () => undefined;
        void listenPush({
            received: () => { if (live && currentAccount.current && !paused.current) { setBanner(true); refresh(); } },
            opened: (message) => { if (live && !paused.current) { inbox.current.offer(message.data?.deep_link, currentAccount.current); setEvent((value) => value + 1); refresh(); } },
            refreshed: () => { if (currentAccount.current && !paused.current) void registration.start().catch(() => setStatus("Push perlu didaftarkan ulang. Buka Notifikasi dan coba lagi.")); },
        }).then((close) => { if (live) stop = close; else close(); }).catch(() => setStatus("Push belum dapat dibuka. Notifikasi in-app tetap tersedia."));
        return () => { live = false; stop(); };
    }, [registration]);
    useEffect(() => { if (account && navigation?.key && !paused.current) { const path = inbox.current.take(account); if (path) router.push(path as "/scan"); } }, [account, event, navigation?.key]);
    useEffect(() => {
        if (!account || !permitted) return;
        let live = true; let abort: AbortController | null = null;
        const fetchCount = () => {
            if (paused.current || AppState.currentState !== "active") return;
            abort?.abort(); abort = new AbortController(); const current = abort;
            void api.get("/notifications", { params: { per_page: 1 }, signal: current.signal }).then((result) => { if (live && !current.signal.aborted) setUnread(NotificationsResponseSchema.parse(result.data).meta.unread_count); }).catch(() => undefined);
        };
        fetchCount(); const timer = setInterval(fetchCount, 30_000); const listener = AppState.addEventListener("change", (value) => { if (value === "active") fetchCount(); else abort?.abort(); });
        return () => { live = false; abort?.abort(); clearInterval(timer); listener.remove(); };
    }, [api, account, permitted, version]);
    const enablePush = async () => {
        if (!firebaseEnabled) { setStatus("Push belum dikonfigurasi sekolah. Notifikasi in-app tetap tersedia."); return; }
        if (!account || !permitted || paused.current) return;
        if (!(await notificationPermission(true))) { setStatus("Push ditolak. Aktifkan Notifikasi untuk SIGM4 di pengaturan perangkat; notifikasi in-app tetap tersedia."); return; }
        try { const ready = await registration.start(); setStatus(ready ? "Push aktif pada perangkat ini." : "Push belum aktif. Coba lagi."); } catch { setStatus("Push belum dapat didaftarkan. Coba lagi."); }
    };
    return <Context.Provider value={{ unread, refresh, status, enablePush, banner, dismissBanner: () => setBanner(false) }}>{children}</Context.Provider>;
}
export function useNotifications() { const value = useContext(Context); if (!value) throw new Error("Provider notifikasi diperlukan."); return value; }
