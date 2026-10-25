import { router } from "expo-router";
import { TwoFactorEnrollment } from "../auth";
import { Card, Screen } from "../../shared/ui";

/**
 * MS-24 dari Keamanan & 2FA: aktivasi sukarela. Role wajib 2FA tidak pernah sampai ke sini tanpa 2FA aktif —
 * gerbang sesi sudah mengarahkannya ke aktivasi berkode (BR-070d) — sehingga kode aktivasi tidak diminta.
 */
export function ActivationScreen() {
    return <Screen title="Aktivasi 2FA" subtitle="Pasang aplikasi authenticator di ponsel lebih dulu. Setelah aktif, 2FA hanya dapat direset Administrator.">
        <Card><TwoFactorEnrollment activationCode={false} onDone={() => { if (router.canGoBack()) router.back(); else router.replace("/profil/keamanan" as "/scan"); }} /></Card>
    </Screen>;
}
