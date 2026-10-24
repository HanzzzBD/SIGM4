import { openDatabaseAsync } from "expo-sqlite";
import * as Crypto from "expo-crypto";
import type { z } from "zod";
import { tokenVault } from "./secure";
import { OfflineOpnameAuthStore } from "./offline-opname-auth";
import type { OfflineOpnameSessionSchema } from "./offline-opname-auth";
import type { SqliteConnection } from "./upload/queue";
let database: ReturnType<typeof openDatabaseAsync> | null = null;
export const stocktakeDatabase = () => database ??= openDatabaseAsync("sigm4-stocktake.db");
async function authStore() {
    const store = new OfflineOpnameAuthStore(await stocktakeDatabase() as unknown as SqliteConnection, tokenVault, s => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s), Date.now); await store.initialize(); return store;
}
export const saveOfflineOpnameSession = async (s: z.infer<typeof OfflineOpnameSessionSchema>) => (await authStore()).save(s);
export const readOfflineOpnameSession = async () => (await authStore()).read();
export const clearOfflineOpnameAuth = async (account?: string) => (await authStore()).clear(account);
