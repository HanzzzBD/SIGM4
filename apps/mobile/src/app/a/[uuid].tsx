import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../features/auth";
import { allowed, resolveQr } from "../../features/scanner";
import { Button, Label, Notice, Screen } from "../../shared/ui";
export default function AssetLink() {
    const { uuid } = useLocalSearchParams<{ uuid: string }>(); const { state, api } = useAuth();
    const [error, setError] = useState<string | null>(null); const [attempt, setAttempt] = useState(0);
    const permitted = state.kind === "READY" && allowed(state.session.permissions, "asset.view");
    useEffect(() => {
        if (!permitted) return;
        const abort = new AbortController(); setError(null);
        const origin = process.env.EXPO_PUBLIC_APP_URL ?? api.defaults.baseURL ?? "";
        void resolveQr(api, `${new URL(origin).origin}/a/${uuid}`, origin, abort.signal).then((id) => { if (!abort.signal.aborted) router.replace(`/aset/${id}`); }).catch((e: unknown) => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Data tidak lagi tersedia."); });
        return () => abort.abort();
    }, [api, uuid, permitted, attempt]);
    return <Screen title="Buka aset">{!permitted ? <Notice message="Anda tidak memiliki izin melihat aset." /> : error ? <><Notice message={error} /><Button title="Coba lagi" onPress={() => setAttempt((value) => value + 1)} /></> : <Label>Memeriksa aset…</Label>}<Button title="Masukkan kode aset manual" onPress={() => router.replace("/scan")} /><Button title="Beranda" secondary onPress={() => router.replace("/")} /></Screen>;
}
