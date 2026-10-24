import Constants from "expo-constants";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { z } from "zod";

const Config = z.object({ firebaseEnabled: z.boolean().default(false) });
export const firebaseEnabled = Config.parse(Constants.expoConfig?.extra ?? {}).firebaseEnabled;
type Remote = { data?: { [key: string]: string | object }; notification?: { title?: string; body?: string }; messageId?: string };
export interface PushListeners { opened(message: Remote): void; received(message: Remote): void; refreshed(): void }
async function modules() {
    const messaging = await import("@react-native-firebase/messaging");
    const installations = await import("@react-native-firebase/installations");
    return { messaging, installations };
}
const granted = (status: Notifications.NotificationPermissionsStatus) => status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
export async function notificationPermission(request: boolean): Promise<boolean> {
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "Notifikasi SIGM4", importance: Notifications.AndroidImportance.HIGH });
    const current = await Notifications.getPermissionsAsync();
    return granted(current) || (request && current.canAskAgain && granted(await Notifications.requestPermissionsAsync()));
}
export async function deviceIdentity(): Promise<string | null> {
    if (!firebaseEnabled || !(await notificationPermission(false))) return null;
    const { messaging: m, installations: i } = await modules(); const service = m.getMessaging();
    await m.setAutoInitEnabled(service, true);
    if (Platform.OS === "ios") await m.registerDeviceForRemoteMessages(service);
    await m.getToken(service); // Associer FID et transport FCM; la valeur n'est ni affichée ni stockée par l'app.
    return i.getId(i.getInstallations());
}
export async function revokeNativePush(): Promise<void> {
    try {
        if (firebaseEnabled) {
            const { messaging: m, installations: i } = await modules(); const service = m.getMessaging();
            await m.setAutoInitEnabled(service, false);
            try { await m.deleteToken(service); } finally { await i.deleteInstallations(i.getInstallations()); }
        }
    } finally { await Notifications.dismissAllNotificationsAsync(); }
}
export async function listenPush(listeners: PushListeners): Promise<() => void> {
    if (!firebaseEnabled) return () => undefined;
    const { messaging: m } = await modules(); const service = m.getMessaging();
    const stop = [m.onMessage(service, listeners.received), m.onNotificationOpenedApp(service, listeners.opened), m.onTokenRefresh(service, listeners.refreshed)];
    const initial = await m.getInitialNotification(service); if (initial) listeners.opened(initial);
    return () => stop.forEach((close) => close());
}
export async function registerBackgroundPush(): Promise<void> {
    if (!firebaseEnabled) return;
    const { messaging: m } = await modules();
    // OS menampilkan payload notifikasi; handler tidak menulis cache atau menjalankan transaksi.
    m.setBackgroundMessageHandler(m.getMessaging(), async () => undefined);
}
export async function isHeadless(): Promise<boolean> {
    if (!firebaseEnabled || Platform.OS !== "ios") return false;
    const { messaging: m } = await modules(); return m.getIsHeadless(m.getMessaging());
}
