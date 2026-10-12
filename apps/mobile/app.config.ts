import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
    name: "SIGM4", slug: "sigm4", version: "0.1.0", scheme: "sigm4", platforms: ["android", "ios"],
    orientation: "default", userInterfaceStyle: "light",
    ios: { bundleIdentifier: "id.sch.sigm4.mobile", supportsTablet: true },
    android: { package: "id.sch.sigm4.mobile", allowBackup: false },
    plugins: ["expo-router", "expo-secure-store", "expo-sqlite", "expo-dev-client", ["expo-build-properties", { android: { minSdkVersion: 26 }, ios: { deploymentTarget: "16.4" } }]],
    runtimeVersion: { policy: "appVersion" },
    updates: { enabled: Boolean(process.env["EAS_PROJECT_ID"]) },
    ...(process.env["EAS_PROJECT_ID"] ? { extra: { eas: { projectId: process.env["EAS_PROJECT_ID"] } }, updates: { enabled: true, url: `https://u.expo.dev/${process.env["EAS_PROJECT_ID"]}` } } : {}),
};
export default config;
