import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { useAuth } from "../auth";
import { openUploadQueue, uploadSender } from "../../shared/upload/native";
import type { UploadQueue } from "../../shared/upload/queue";
interface QueueState { count: number; discarded: number; error: string | null; message: string | null; progress: Readonly<Record<string, string>>; queue: UploadQueue | null; refresh: () => void }
const Context = createContext<QueueState | null>(null);
export function UploadProvider({ children }: { children: ReactNode }) {
    const { state, api, controller, offlineOnly } = useAuth();
    const account = state.kind === "READY" ? state.session.user.id : null;
    const currentAccount = useRef(account); currentAccount.current = account;
    const [queue, setQueue] = useState<UploadQueue | null>(null); const [count, setCount] = useState(0); const [discarded, setDiscarded] = useState(0); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
    const [progress, setProgress] = useState<Record<string, string>>({}); const runRef = useRef<() => void>(() => undefined);
    useEffect(() => { let live = true; void openUploadQueue((n) => { if (live) setDiscarded((v) => v + n); }).then((q) => { if (live) setQueue(q); }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Antrean belum dapat dibuka.")); return () => { live = false; }; }, []);
    const refresh = () => runRef.current();
    useEffect(() => controller.setLogoutGuard(async discard => {
        if (!account) return;
        if (!queue) throw new Error("Antrean foto sedang diperiksa. Tunggu sebelum keluar.");
        if ((await queue.list(account)).length && !discard) throw new Error("Foto belum terunggah. Sinkronkan dahulu atau pilih Hapus data dan keluar.");
    }), [queue, controller, account]);
    useEffect(() => controller.setBeforeLogout(async () => {
        if (!queue || !account) return;
        queue.stop(account);
        for (const entry of await queue.list(account)) await queue.cancel(entry.id, account);
    }), [queue, controller, account]);
    useEffect(() => {
        setProgress({}); setError(null);
        if (!queue || !account) { setCount(0); return; }
        let live = true;
        const drain = async () => {
            const network = await getNetworkStateAsync();
            if (!live || currentAccount.current !== account) return;
            if (!offlineOnly && network.isConnected && network.isInternetReachable !== false) await queue.drain(account, uploadSender(api, queue, () => currentAccount.current, (id, status) => { if (live) { setMessage(status); setProgress((value) => ({ ...value, [id]: status })); } }));
            const entries = await queue.list(account);
            if (live && currentAccount.current === account) { setCount(entries.length); setMessage(null); const ids = new Set(entries.map((entry) => entry.id)); setProgress((value) => Object.fromEntries(Object.entries(value).filter(([id]) => ids.has(id)))); }
        };
        const run = () => { void drain().catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "Foto belum terunggah."); }); };
        runRef.current = run; run(); const timer = setInterval(run, 30_000);
        const network = addNetworkStateListener(run); const app = AppState.addEventListener("change", (next) => { if (next === "active") run(); });
        return () => { live = false; runRef.current = () => undefined; queue.stop(account); clearInterval(timer); network.remove(); app.remove(); };
    }, [queue, account, api, offlineOnly]);
    return <Context.Provider value={{ count, discarded, error, message, progress, queue, refresh }}>{children}</Context.Provider>;
}
export function useUploads() { const value = useContext(Context); if (!value) throw new Error("Provider antrean diperlukan."); return value; }
export { preparePhoto, enqueuePreparedPhoto, discardPreparedPhoto } from "../../shared/upload/native";
export type { PreparedPhoto } from "../../shared/upload/native";
