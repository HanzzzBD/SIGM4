import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth";
import { TourChromeProvider, TourScope, TourTarget, useTourControl } from "../../shared/ui";
import type { TourChrome, TourCopy, TourStatus } from "../../shared/ui";
import { loadTourProgress, saveTourProgress } from "./api";
import { MAIN_STEP_ORDER, TOUR_VERSION, mainTourCopy, mainTourKey, needsTour, pageTourFor, shouldAutoRunPage } from "./catalog";
import type { MainStep, TourProgress } from "./catalog";

/** Jeda tur otomatis: tab dan Beranda perlu selesai diukur sebelum disorot. */
const AUTO_TOUR_DELAY_MS = 1200;

interface TourState {
    progress: readonly TourProgress[] | null;
    mainKey: string;
    copy: Readonly<Record<MainStep, TourCopy>> | null;
    replay: number;
    finish: (key: string, status: TourStatus) => void;
    restartMain: () => void;
}
const Context = createContext<TourState | null>(null);

/**
 * Progres tur per akun dari `/me/tours`, dipasang sekali di bawah sesi. Kegagalan memuat tidak
 * menghalangi aplikasi: tur otomatis tidak diputar pada sesi itu, tetapi tetap dapat diputar manual.
 */
export function TourRoot({ children }: { children: ReactNode }) {
    const { state, api } = useAuth();
    const session = state.kind === "READY" ? state.session : null;
    const userId = session?.user.id; const role = session?.user.role_kode ?? ""; const name = session?.user.nama ?? "";
    const [progress, setProgress] = useState<readonly TourProgress[] | null>(null);
    const [replay, setReplay] = useState(0);
    useEffect(() => {
        if (userId === undefined) return undefined;
        let live = true;
        void loadTourProgress(api).then((p) => { if (live) setProgress(p); }).catch(() => undefined);
        return () => { live = false; };
    }, [api, userId]);
    const mainKey = mainTourKey(role);
    const finish = useCallback((key: string, status: TourStatus) => {
        // Optimistis: tur tidak diputar ulang otomatis walau penyimpanan gagal pada sesi ini.
        setProgress((p) => [...(p ?? []).filter((x) => x.kunci !== key), { kunci: key, status, versi: TOUR_VERSION }]);
        void saveTourProgress(api, key, status, TOUR_VERSION).catch(() => undefined);
    }, [api]);
    const chrome = useMemo<TourChrome>(() => ({ pageTour: pageTourFor, shouldAutoRun: (key) => shouldAutoRunPage(progress, mainKey, key), finish }), [progress, mainKey, finish]);
    const value = useMemo<TourState>(() => ({ progress, mainKey, copy: session ? mainTourCopy(role, name) : null, replay, finish, restartMain: () => setReplay((n) => n + 1) }), [progress, mainKey, session, role, name, replay, finish]);
    return <Context.Provider value={value}><TourChromeProvider value={session ? chrome : null}>{children}</TourChromeProvider></Context.Provider>;
}

function MainAuto() {
    const ctx = useContext(Context); const { start } = useTourControl();
    const needed = ctx?.progress != null && needsTour(ctx.progress, ctx.mainKey);
    useEffect(() => {
        if (!needed) return undefined;
        const timer = setTimeout(start, AUTO_TOUR_DELAY_MS);
        return () => clearTimeout(timer);
    }, [needed, start]);
    const replay = ctx?.replay ?? 0;
    useEffect(() => { if (replay > 0) start(); }, [replay, start]);
    return null;
}

/** Kelompok tur utama: langkahnya ada di ikon tab dan tombol chatbot mengambang (`MainTourTarget`). */
export function MainTour({ children }: { children: ReactNode }) {
    const ctx = useContext(Context);
    return <TourScope onFinish={(status) => { if (ctx) ctx.finish(ctx.mainKey, status); }}><MainAuto/>{children}</TourScope>;
}

export function MainTourTarget({ step, children }: { step: MainStep; children: ReactNode }) {
    const ctx = useContext(Context);
    if (!ctx?.copy) return <>{children}</>;
    return <TourTarget name={step} order={MAIN_STEP_ORDER[step]} copy={ctx.copy[step]}>{children}</TourTarget>;
}

/** Memutar ulang tur utama dari layar mana pun (mis. Menu), walau layar itu punya kelompok tur sendiri. */
export function useRestartMainTour() { return useContext(Context)?.restartMain ?? null; }
