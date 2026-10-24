import { useLocalSearchParams } from "expo-router";
import { Linking } from "react-native";
import { useAuth } from "../../../../../features/auth";
import { Screen, Button, Notice } from "../../../../../shared/ui";
export default function ReconciliationLink() {
    const { id } = useLocalSearchParams<{ id: string }>(), { state, offlineOnly } = useAuth();
    const allowed = state.kind === "READY" && ["audit.approve", "audit.manage"].some(p => Object.hasOwn(state.session.permissions, p));
    let url: string | null = null;
    try { const origin = new URL(process.env.EXPO_PUBLIC_APP_URL ?? ""); if (origin.protocol === "https:" && /^[1-9]\d*$/.test(id)) url = new URL(`/opname/${id}/rekonsiliasi`, origin.origin).href; } catch { /* The school portal is configured by the deployment. */ }
    return <Screen title="Rekonsiliasi Opname"><Notice message={allowed ? "Tinjau selisih, foto bukti, dan berikan keputusan melalui portal web sekolah." : "Anda tidak memiliki izin meninjau rekonsiliasi."} />{allowed && url && <Button title="Buka rekonsiliasi di portal web" disabled={offlineOnly} onPress={() => { void Linking.openURL(url!); }} />}</Screen>;
}
