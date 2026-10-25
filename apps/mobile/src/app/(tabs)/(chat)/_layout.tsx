import { Stack } from "expo-router";
export const unstable_settings = { initialRouteName: "chat/index" };
export default function ChatLayout() { return <Stack screenOptions={{ headerShown: false }} />; }
