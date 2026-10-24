import { Linking } from "react-native";
import { useAuth } from "../auth";
import { Button, Screen, Notice } from "../../shared/ui";
export function DisposalPortalScreen({ id }: { id: string }) {
    const { state, offlineOnly } = useAuth();
    const allowed = state.kind === "READY" && Object.hasOwn(state.session.permissions, "disposal.view");
    let target: string | null = null;
    try { const url = new URL(process.env.EXPO_PUBLIC_APP_URL ?? ""); if (url.protocol === "https:" && /^[1-9]\d*$/.test(id)) target = new URL(`/penghapusan/${id}`, url.origin).href; } catch { /* School deployment configures the portal. */ }
    return <Screen title="Penghapusan Aset"><Notice message={allowed ? "Tinjau usulan, bukti dan berita acara penghapusan melalui portal web sekolah." : "Anda tidak memiliki izin melihat penghapusan aset."} />{allowed && target && <Button icon="arrowRight" title="Buka penghapusan di portal web" disabled={offlineOnly} onPress={() => { void Linking.openURL(target!); }} />}</Screen>;
}
