import * as SecureStore from "expo-secure-store";
import { TokenVault } from "./vault";
export { TokenVault, TokensSchema } from "./vault";
export type { Tokens } from "./vault";
export const tokenVault = new TokenVault({
    get: (key) => SecureStore.getItemAsync(key),
    set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    remove: (key) => SecureStore.deleteItemAsync(key),
});
