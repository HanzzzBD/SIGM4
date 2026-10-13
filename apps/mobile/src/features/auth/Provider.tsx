import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import { getNetworkStateAsync } from "expo-network";
import type { AxiosInstance } from "axios";
import Constants from "expo-constants";
import { createApi } from "../../shared/api/client";
import { tokenVault } from "../../shared/secure";
import { SessionController } from "./session";
import type { AuthState } from "./session";

interface AuthContext { state: AuthState; controller: SessionController; api: AxiosInstance; loading: boolean; error: string | null; retry: () => void }
const Context = createContext<AuthContext | null>(null);
export function AuthProvider({ baseURL, children }: { baseURL: string; children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ kind: "LOGIN" });
    const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
    const api = useMemo(() => createApi(baseURL, Platform.OS === "ios" ? "IOS" : "ANDROID", Constants.expoConfig?.version ?? "0.2.0", tokenVault, () => setState({ kind: "LOGIN" }), async () => { const network = await getNetworkStateAsync(); return network.isConnected === true && network.isInternetReachable !== false; }), [baseURL]);
    const controller = useMemo(() => new SessionController(api, tokenVault, Platform.OS === "ios" ? "IOS" : "ANDROID", Date.now, setState), [api]);
    const retry = () => { setLoading(true); setError(null); void controller.restore().catch((e: unknown) => setError(e instanceof Error ? e.message : "Sesi belum dapat diperiksa.")).finally(() => setLoading(false)); };
    useEffect(() => { retry(); }, [controller]);
    return <Context.Provider value={{ state, controller, api, loading, error, retry }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error("Provider sesi diperlukan."); return value; }
