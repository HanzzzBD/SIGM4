import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

/** Data hanya di memori; batal saat keluar, akun berubah atau aplikasi di latar belakang. */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
    const [attempt, setAttempt] = useState(0);
    const [snapshot, setSnapshot] = useState<{ key: string; data: T | null; error: string | null; loading: boolean }>({ key: "", data: null, error: null, loading: true });
    useFocusEffect(useCallback(() => {
        let abort: AbortController | null = null; let live = true;
        const start = () => {
            abort?.abort(); const current = new AbortController(); abort = current;
            setSnapshot({ key, data: null, error: null, loading: true });
            void load(current.signal).then((data) => { if (live && !current.signal.aborted) setSnapshot({ key, data, error: null, loading: false }); })
                .catch((e: unknown) => { if (live && !current.signal.aborted) setSnapshot({ key, data: null, error: e instanceof Error ? e.message : "Data belum dapat dimuat. Coba lagi.", loading: false }); });
        };
        if (AppState.currentState === "active") start();
        const listener = AppState.addEventListener("change", (value) => { if (value === "active") start(); else abort?.abort(); });
        return () => { live = false; abort?.abort(); listener.remove(); };
    }, [key, load, attempt]));
    return { ...(snapshot.key === key ? snapshot : { data: null, error: null, loading: true }), reload: () => setAttempt((value) => value + 1) };
}
