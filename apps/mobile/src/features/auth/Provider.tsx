import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import { getNetworkStateAsync, addNetworkStateListener } from "expo-network";
import type { AxiosInstance } from "axios";
import Constants from "expo-constants";
import { createApi } from "../../shared/api/client";
import { tokenVault } from "../../shared/secure";
import { SessionController } from "./session";
import type { AuthState } from "./session";
import { saveOfflineOpnameSession, readOfflineOpnameSession, clearOfflineOpnameAuth } from "../../shared/stocktake-native";

interface AuthContext { state: AuthState; controller: SessionController; api: AxiosInstance; loading: boolean; error: string | null; retry: () => void; offlineOnly: boolean; offlineError: string | null }
const Context = createContext<AuthContext | null>(null);
export function AuthProvider({ baseURL, children }: { baseURL: string; children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ kind: "LOGIN" });
    const [offlineOnly, setOfflineOnly] = useState(false), [offlineError, setOfflineError] = useState<string | null>(null);
    const pendingCache = useRef<Promise<void>>(Promise.resolve());
    const restoreAttempt = useRef(0);
    const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
    const api = useMemo(() => createApi(baseURL, Platform.OS === "ios" ? "IOS" : "ANDROID", Constants.expoConfig?.version ?? "0.2.0", tokenVault, () => setState({ kind: "LOGIN" }), async () => { const network = await getNetworkStateAsync(); return network.isConnected === true && network.isInternetReachable !== false; }), [baseURL]);
    const controller = useMemo(() => new SessionController(api, tokenVault, Platform.OS === "ios" ? "IOS" : "ANDROID", Date.now, next => {
        restoreAttempt.current++; setLoading(false); setState(next); setOfflineOnly(false);
        if (next.kind === "READY") pendingCache.current = saveOfflineOpnameSession({ ...next.session, user: { ...next.session.user, must_change_password: false } }).catch(() => setOfflineError("Mode luring belum dapat disiapkan. Sambungkan internet saat membuka ulang aplikasi."));
    }), [api]);
    const retry = () => { const attempt = ++restoreAttempt.current, revision = tokenVault.revision; setLoading(true); setError(null); if (offlineOnly) { setState({ kind: "LOGIN" }); setOfflineOnly(false); } void controller.restore().catch(async (e: unknown) => {
        const network = await getNetworkStateAsync();
        if (attempt !== restoreAttempt.current || revision !== tokenVault.revision) return;
        if (!network.isConnected || network.isInternetReachable === false) {
            const cached = await readOfflineOpnameSession();
            if (attempt !== restoreAttempt.current || revision !== tokenVault.revision) return;
            if (cached) { setState({ kind: "READY", session: cached }); setOfflineOnly(true); return; }
        }
        setError(e instanceof Error ? e.message : "Sesi belum dapat diperiksa.");
    }).catch((e: unknown) => { if (attempt === restoreAttempt.current && revision === tokenVault.revision) setError(e instanceof Error ? e.message : "Sesi luring tidak tersedia."); }).finally(() => { if (attempt === restoreAttempt.current) setLoading(false); }); };
    useEffect(() => { retry(); }, [controller]);
    useEffect(() => controller.setBeforeLogout(async () => { await pendingCache.current; await clearOfflineOpnameAuth(); }), [controller]);
    useEffect(() => {
        if (!offlineOnly) return;
        let live = true;
        const listener = addNetworkStateListener(n => { if (n.isConnected && n.isInternetReachable !== false) retry(); });
        const timer = setInterval(() => { const attempt = restoreAttempt.current, revision = tokenVault.revision; void readOfflineOpnameSession().then(s => { if (live && attempt === restoreAttempt.current && revision === tokenVault.revision && !s) { setState({ kind: "LOGIN" }); setOfflineOnly(false); setError("Sesi opname luring kedaluwarsa. Sambungkan internet dan masuk kembali."); } }).catch(() => { if (live) setOfflineError("Sesi luring belum dapat diperiksa. Sambungkan internet untuk memeriksa ulang akun."); }); }, 30000);
        return () => { live = false; listener.remove(); clearInterval(timer); };
    }, [offlineOnly, controller]);
    return <Context.Provider value={{ state, controller, api, loading, error, retry, offlineOnly, offlineError }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error("Provider sesi diperlukan."); return value; }
