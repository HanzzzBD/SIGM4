import { Stack } from "expo-router";
export const unstable_settings = { initialRouteName: "menu" };
export default function MenuLayout() { return <Stack screenOptions={{ headerShown: false }} />; }
