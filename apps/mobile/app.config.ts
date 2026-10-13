import type { ExpoConfig } from "expo/config";
import { existsSync } from "node:fs";
const appUrl = process.env["EXPO_PUBLIC_APP_URL"] ?? process.env["EXPO_PUBLIC_API_URL"];
const appHost = appUrl && new URL(appUrl).protocol === "https:" ? new URL(appUrl).hostname : null;
const androidFirebase = process.env["GOOGLE_SERVICES_JSON"];
const iosFirebase = process.env["GOOGLE_SERVICE_INFO_PLIST"];
const firebaseEnabled = Boolean(androidFirebase && iosFirebase && existsSync(androidFirebase) && existsSync(iosFirebase));
const apnsEnvironment = process.env["APNS_ENVIRONMENT"] === "production" ? "production" : "development";
const config: ExpoConfig = {
    name: "SIGM4", slug: "sigm4", version: "0.2.0", scheme: "sigm4", platforms: ["android", "ios"],
    orientation: "default", userInterfaceStyle: "light",
    ios: { bundleIdentifier: "id.sch.sigm4.mobile", supportsTablet: true, ...(firebaseEnabled ? { googleServicesFile: iosFirebase!, entitlements: { "aps-environment": apnsEnvironment }, infoPlist: { UIBackgroundModes: ["remote-notification"] } } : {}), ...(appHost ? { associatedDomains: [`applinks:${appHost}`] } : {}) },
    android: { package: "id.sch.sigm4.mobile", allowBackup: false, blockedPermissions: ["android.permission.RECORD_AUDIO"], ...(firebaseEnabled ? { googleServicesFile: androidFirebase! } : {}), ...(appHost ? { intentFilters: [{ action: "VIEW", autoVerify: true, category: ["BROWSABLE", "DEFAULT"], data: [{ scheme: "https", host: appHost, pathPrefix: "/" }] }] } : {}) },
    plugins: ["expo-router", "expo-secure-store", "expo-sqlite", "expo-dev-client", ["expo-notifications", { defaultChannel: "default" }], ...(firebaseEnabled ? ["@react-native-firebase/app", "@react-native-firebase/messaging"] : []), ["expo-camera", { cameraPermission: "Izinkan SIGM4 memindai label QR aset.", recordAudioAndroid: false, microphonePermission: false }], ["expo-build-properties", { android: { minSdkVersion: 26 }, ios: { deploymentTarget: "16.4", useFrameworks: "static" } }]],
    runtimeVersion: { policy: "appVersion" },
    updates: { enabled: Boolean(process.env["EAS_PROJECT_ID"]) },
    extra: { firebaseEnabled, ...(process.env["EAS_PROJECT_ID"] ? { eas: { projectId: process.env["EAS_PROJECT_ID"] } } : {}) },
    ...(process.env["EAS_PROJECT_ID"] ? { updates: { enabled: true, url: `https://u.expo.dev/${process.env["EAS_PROJECT_ID"]}` } } : {}),
};
export default config;
