import axios from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import type { TokenVault } from "../secure/vault";
import { TokensSchema } from "../secure/vault";

export class MobileApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: readonly { field: string; message: string }[] = []) { super(message); }
}
export function createApi(baseURL: string, platform: "ANDROID" | "IOS", version: string, vault: TokenVault, onSessionLost: () => void, isOnline: () => Promise<boolean> = async () => true): AxiosInstance {
    const headers = { "X-App-Version": version, "X-Platform": platform };
    const client = axios.create({ baseURL, headers, timeout: 30_000 });
    const refreshClient = axios.create({ baseURL, headers, timeout: 30_000 });
    let refresh: Promise<void> | null = null;
    client.interceptors.request.use(async (request) => {
        if (!(await isOnline())) throw new MobileApiError(0, "OFFLINE", "Anda sedang luring. Sambungkan internet dan coba lagi.");
        const tokens = await vault.read();
        if (tokens) request.headers.set("Authorization", `Bearer ${tokens.access_token}`);
        return request;
    });
    client.interceptors.response.use((response) => response, async (error: unknown) => {
        if (!axios.isAxiosError(error)) throw error;
        const response = error.response;
        if(response&&typeof ReadableStream!=="undefined"&&response.data instanceof ReadableStream){try{const reader=response.data.getReader(),decoder=new TextDecoder();let text="";for(;;){const part=await reader.read();if(part.done)break;text+=decoder.decode(part.value,{stream:true});if(text.length>16384){await reader.cancel();throw new Error("Respons galat terlalu besar.");}}response.data=JSON.parse(text+decoder.decode());reader.releaseLock();}catch{response.data=null;}}
        const data = response?.data as { error?: { code?: string; message?: string; details?: { field: string; message: string }[] } } | undefined;
        const request = error.config as (InternalAxiosRequestConfig & { retried?: boolean }) | undefined;
        const authFlow = /^\/auth\/(login|refresh|2fa\/verify|password\/forgot)$/.test(request?.url ?? "");
        if (response?.status === 401 && request && !request.retried && !authFlow) {
            if (!refresh) {
                const revision = vault.revision;
                refresh = (async () => {
                    const tokens = await vault.read();
                    if (!tokens) throw new Error("Sesi berakhir. Silakan masuk kembali.");
                    const result = await refreshClient.post("/auth/refresh", { refresh_token: tokens.refresh_token });
                    const next = TokensSchema.parse(result.data.data.tokens);
                    if (!(await vault.save(next, revision))) throw new Error("Sesi telah berakhir.");
                })().catch(async (e: unknown) => {
                    if (vault.revision === revision && axios.isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403)) { await vault.clear(); onSessionLost(); }
                    throw e;
                }).finally(() => { refresh = null; });
            }
            await refresh;
            request.retried = true;
            return client.request(request);
        }
        throw new MobileApiError(response?.status ?? 0, data?.error?.code ?? "NETWORK_ERROR", data?.error?.message ?? "Tidak dapat terhubung. Periksa koneksi dan coba lagi.", data?.error?.details ?? []);
    });
    return client;
}
