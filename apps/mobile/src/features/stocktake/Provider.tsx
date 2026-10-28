import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import { getNetworkStateAsync, addNetworkStateListener } from "expo-network";
import { useAuth } from "../auth";
import { openStocktakeQueue, stocktakeSender } from "./native";
import type { StocktakeQueue, PendingInspection } from "./queue";
interface QueueState { queue: StocktakeQueue | null; entries: PendingInspection[]; error: string | null; message: string | null; refresh: () => void }
const Context = createContext<QueueState | null>(null);
export function StocktakeProvider({ children }: { children: ReactNode }) {
    const { state, api, controller, offlineOnly } = useAuth(), account = state.kind === "READY" ? state.session.user.id : null;
    const current = useRef(account); current.current = account;
    const [queue, setQueue] = useState<StocktakeQueue | null>(null), [entries, setEntries] = useState<PendingInspection[]>([]), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
    const refresh = useRef<() => void>(() => undefined);
    useEffect(() => { let live = true; void openStocktakeQueue().then(q => { if (live) setQueue(q); }).catch(e => { if (live) setError(e instanceof Error ? e.message : "Antrean belum tersedia."); }); return () => { live = false; }; }, []);
    useEffect(() => controller.setBeforeLogout(async () => { if (queue && account) await queue.clear(account); }), [queue, controller, account]);
    useEffect(() => controller.setLogoutGuard(async discard => {
        if (!account) return;
        if (!queue) throw new Error("Antrean opname sedang diperiksa. Tunggu sebelum keluar.");
        const pending = await queue.list(account);
        if (pending.length && !discard) throw new Error(`${pending.length} hasil opname beserta foto belum tersinkron. Sinkronkan dahulu atau pilih Hapus data dan keluar.`);
    }), [queue, controller, account]);
    useEffect(() => {
        setEntries([]); setError(null); setMessage(null);
        if (!queue || !account) { setEntries([]); return; }
        let live = true;
        const run = async () => {
            await queue.prune();
            const network = await getNetworkStateAsync();
            if (!live || current.current !== account) return;
            if (!offlineOnly && network.isConnected && network.isInternetReachable !== false) await queue.drain(account, () => current.current, stocktakeSender(api, queue, () => current.current), (entry, duplicate) => { if (live && duplicate) setMessage(entry.kind==="material"?"Versi hitungan sudah dicatat server. Unduh ulang target sebelum menghitung ulang; hasil pertama dipertahankan.":"Scan ganda ditemukan. Hasil pertama dari server dipertahankan."); });
            const pending = await queue.list(account);
            if (live && current.current === account) setEntries(pending);
        };
        const trigger = () => { void run().catch(e => { if (live) setError(e instanceof Error ? e.message : "Sinkronisasi belum selesai."); }); };
        refresh.current = trigger; trigger(); const timer = setInterval(trigger, 10000), network = addNetworkStateListener(trigger), active = AppState.addEventListener("change", s => { if (s === "active") trigger(); });
        return () => { live = false; queue.stop(); refresh.current = () => undefined; clearInterval(timer); network.remove(); active.remove(); };
    }, [queue, account, api, offlineOnly]);
    return <Context.Provider value={{ queue, entries, error, message, refresh: () => refresh.current() }}>{children}</Context.Provider>;
}
export function useStocktakeQueue() { const q = useContext(Context); if (!q) throw new Error("Provider opname diperlukan."); return q; }
