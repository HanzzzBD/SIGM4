import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { useAuth } from "../auth";
import { openUploadQueue, uploadSender } from "../../shared/upload/native";
import type { UploadQueue } from "../../shared/upload/queue";
interface QueueState { count: number; discarded: number; error: string | null; message: string | null; queue: UploadQueue | null; refresh: () => void }
const Context = createContext<QueueState | null>(null);
export function UploadProvider({ children }: { children: ReactNode }) {
    const { state, api } = useAuth();
    const account = state.kind === "READY" ? state.session.user.id : null;
    const currentAccount = useRef(account); currentAccount.current = account;
    const [queue, setQueue] = useState<UploadQueue | null>(null); const [count, setCount] = useState(0); const [discarded, setDiscarded] = useState(0); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
    useEffect(() => { let live = true; void openUploadQueue((n) => { if (live) setDiscarded((v) => v + n); }).then((q) => { if (live) setQueue(q); }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Antrean belum dapat dibuka.")); return () => { live = false; }; }, []);
    const refresh = () => { if (queue && account) void queue.list(account).then((items) => setCount(items.length)); };
    useEffect(() => {
        if (!queue || !account) { setCount(0); return; }
        let live = true;
        const drain = async () => {
            const network = await getNetworkStateAsync();
            if (network.isConnected && network.isInternetReachable !== false) await queue.drain(account, uploadSender(api, queue, () => currentAccount.current, (_id, status) => { if (live) setMessage(status); }));
            if (live) { setCount((await queue.list(account)).length); setMessage(null); }
        };
        const run = () => { void drain().catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "Foto belum terunggah."); }); };
        run(); const timer = setInterval(run, 30_000);
        const network = addNetworkStateListener(run); const app = AppState.addEventListener("change", (next) => { if (next === "active") run(); });
        return () => { live = false; clearInterval(timer); network.remove(); app.remove(); };
    }, [queue, account, api]);
    return <Context.Provider value={{ count, discarded, error, message, queue, refresh }}>{children}</Context.Provider>;
}
export function useUploads() { const value = useContext(Context); if (!value) throw new Error("Provider antrean diperlukan."); return value; }
export { preparePhoto, enqueuePreparedPhoto } from "../../shared/upload/native";
