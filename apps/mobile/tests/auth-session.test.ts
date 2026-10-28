import axios, { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { createApi, MobileApiError } from "../src/shared/api/client.js";
import { TokenVault } from "../src/shared/secure/vault.js";
import { SessionController } from "../src/features/auth/session.js";
import type { AuthState } from "../src/features/auth/session.js";

const originalAdapter = axios.defaults.adapter;
afterEach(() => { if (originalAdapter !== undefined) axios.defaults.adapter = originalAdapter; else delete axios.defaults.adapter; });
const user = { id: "1", nama: "Pengguna Uji", email: "uji@sekolah.sch.id", role_kode: "R-05", must_change_password: false };
const tokens = { access_token: "access", refresh_token: "refresh" };
function vault() {
    const memory = new Map<string, string>();
    const store = new TokenVault({ get: async (k) => memory.get(k) ?? null, set: async (k, v) => { memory.set(k, v); }, remove: async (k) => { memory.delete(k); } });
    return { store, memory };
}
function server(handle: (request: InternalAxiosRequestConfig) => Promise<{ status?: number; data: unknown }> | { status?: number; data: unknown }) {
    const calls: InternalAxiosRequestConfig[] = [];
    axios.defaults.adapter = async (config) => {
        calls.push(config); const result = await handle(config);
        const response: AxiosResponse = { status: result.status ?? 200, data: result.data, statusText: "", headers: new AxiosHeaders(), config };
        if (response.status >= 400) throw new AxiosError("HTTP error", "ERR_BAD_RESPONSE", config, {}, response);
        return response;
    };
    return calls;
}
const envelope = (data: unknown) => ({ data, success: true, meta: null });
const denied = (code: string) => ({ error: { code, message: "Permintaan ditolak." } });

describe("PR-04-16 SecureStore dan sesi mobile", () => {
    it("UX-019 guards pending local data before hiding the session or deleting credentials; discard must be explicit", async () => {
        const calls = server(() => ({ data: envelope({}) }));
        const { store } = vault(); await store.save(tokens); const states: AuthState[] = []; let cleared = false;
        const controller = new SessionController(createApi("https://sekolah.test/api/v1", "IOS", "0.2.0", store, () => undefined), store, "IOS", () => 1000, state => states.push(state));
        controller.setLogoutGuard(async discard => { if (!discard) throw new Error("Hasil belum tersinkron"); });
        controller.setBeforeLogout(async () => { cleared = true; });
        await expect(controller.logout()).rejects.toThrow("belum tersinkron");
        expect(states).toEqual([]); expect(calls).toHaveLength(0); expect(await store.read()).toEqual(tokens); expect(cleared).toBe(false);
        await controller.logout({ discardPending: true });
        expect(cleared).toBe(true); expect(await store.read()).toBeNull(); expect(states.at(-1)).toEqual({ kind: "LOGIN" });
    });
    it("token disimpan satu rekaman; logout menolak hasil refresh yang datang terlambat", async () => {
        const { store, memory } = vault(); const revision = store.revision;
        await store.save(tokens); expect(memory.size).toBe(1);
        await store.clear(); expect(await store.save(tokens, revision)).toBe(false); expect(memory.size).toBe(0);
        memory.set("sigm4.tokens.v1", "rusak"); expect(await store.read()).toBeNull(); expect(memory.size).toBe(0);
    });
    it("dua 401 hanya menukar refresh sekali; request memakai token baru dan header versi/platform", async () => {
        let count = 0;
        const calls = server(async (request) => {
            if (request.url === "/auth/refresh") { count++; await new Promise((r) => setTimeout(r, 5)); return { data: envelope({ tokens }) }; }
            return request.headers.get("Authorization") === "Bearer old" ? { status: 401, data: denied("TOKEN_EXPIRED") } : { data: envelope({ user, permissions: {} }) };
        });
        const { store } = vault(); await store.save({ ...tokens, access_token: "old" });
        const api = createApi("https://sekolah.test/api/v1", "ANDROID", "0.1.0", store, () => undefined);
        await Promise.all([api.get("/me"), api.get("/assets")]);
        expect(count).toBe(1); expect(await store.read()).toEqual(tokens);
        expect(calls.every((c) => c.headers.get("X-App-Version") === "0.1.0" && c.headers.get("X-Platform") === "ANDROID")).toBe(true);
    });
    it("login gagal tidak memicu refresh; transaksi luring tidak pernah dikirim/diantrekan", async () => {
        const calls = server(() => ({ status: 401, data: denied("UNAUTHENTICATED") })); const { store } = vault();
        const api = createApi("https://sekolah.test/api/v1", "IOS", "0.1.0", store, () => undefined);
        await expect(api.post("/auth/login", {})).rejects.toBeInstanceOf(MobileApiError);
        expect(calls).toHaveLength(1);
        const offline = createApi("https://sekolah.test/api/v1", "IOS", "0.1.0", store, () => undefined, async () => false);
        await expect(offline.post("/approvals/1/approve")).rejects.toMatchObject({ code: "OFFLINE" });
        expect(calls).toHaveLength(1);
    });
    it("challenge hanya di memori; kedaluwarsa kembali ke Login tanpa meminta API", async () => {
        const calls = server(() => ({ data: envelope({ requires_2fa: true, challenge_token: "challenge", expires_in: 300 }) }));
        const { store, memory } = vault(); let now = 1000; const states: AuthState[] = [];
        const api = createApi("https://sekolah.test/api/v1", "ANDROID", "0.1.0", store, () => undefined);
        const controller = new SessionController(api, store, "ANDROID", () => now, (state) => states.push(state));
        await controller.login(user.email, "Password-Lama-12"); expect(memory.size).toBe(0);
        const challenge = states.at(-1); expect(challenge?.kind).toBe("CHALLENGE");
        if (challenge?.kind !== "CHALLENGE") throw new Error("Challenge tidak ada.");
        now = 301001; await expect(controller.verify(challenge, "123456")).rejects.toThrow("kedaluwarsa");
        expect(states.at(-1)).toEqual({ kind: "LOGIN" }); expect(calls).toHaveLength(1);
    });
    it("password wajib mendahului halaman lain; kebutuhan enroll ketika mengganti password kembali ke gerbang", async () => {
        server((request) => request.url === "/auth/login" ? { data: envelope({ user: { ...user, must_change_password: true }, permissions: {}, tokens }) } : { status: 403, data: denied("TWO_FACTOR_REQUIRED") });
        const { store } = vault(); const states: AuthState[] = [];
        const api = createApi("https://sekolah.test/api/v1", "ANDROID", "0.1.0", store, () => undefined);
        const controller = new SessionController(api, store, "ANDROID", () => 1000, (state) => states.push(state));
        await controller.login(user.email, "Password-Lama-12"); expect(states.at(-1)).toEqual({ kind: "PASSWORD" });
        await controller.changePassword("Password-Lama-12", "Password-Baru-12"); expect(states.at(-1)).toEqual({ kind: "ENROLL", returnToPassword: true });
    });
    it("logout menghapus token meskipun jaringan server gagal", async () => {
        server(() => ({ status: 503, data: denied("STORAGE_UNAVAILABLE") }));
        const { store } = vault(); await store.save(tokens); const states: AuthState[] = [];
        const api = createApi("https://sekolah.test/api/v1", "IOS", "0.1.0", store, () => undefined);
        const controller = new SessionController(api, store, "IOS", () => 1000, (state) => states.push(state));
        await expect(controller.logout()).rejects.toBeInstanceOf(MobileApiError); expect(await store.read()).toBeNull(); expect(states.at(-1)).toEqual({ kind: "LOGIN" });
    });
    it("logout menjalankan semua hook cache, antrean dan push meskipun layar telah dilepas", async () => {
        const order: string[] = []; server(() => { order.push("http"); return { data: envelope({}) }; });
        const { store } = vault(); await store.save(tokens); let unsubscribe: () => void = () => undefined;
        const controller = new SessionController(createApi("https://sekolah.test/api/v1", "IOS", "0.2.0", store, () => undefined), store, "IOS", () => 1000, state => { if (state.kind === "LOGOUT") unsubscribe(); });
        controller.setBeforeLogout(async () => { order.push("cache"); });
        unsubscribe = controller.setBeforeLogout(async () => { order.push("queue"); });
        controller.setBeforeLogout(async () => { order.push("push"); });
        await controller.logout(); expect(order).toEqual(["cache", "queue", "push", "http"]); expect(await store.read()).toBeNull();
    });
    it("respons /me yang terlambat sesudah logout tidak mengembalikan sesi lama", async () => {
        let complete!: (response: { data: unknown }) => void;
        let requested!: () => void; const started = new Promise<void>((resolve) => { requested = resolve; });
        server((request) => request.url === "/me" ? new Promise((resolve) => { complete = resolve; requested(); }) : { data: envelope({}) });
        const { store } = vault(); await store.save(tokens); const states: AuthState[] = [];
        const api = createApi("https://sekolah.test/api/v1", "IOS", "0.1.0", store, () => undefined);
        const controller = new SessionController(api, store, "IOS", () => 1000, (state) => states.push(state));
        const restore = controller.restore(); await started; await controller.logout();
        complete({ data: envelope({ user, permissions: { "asset.view": "all" } }) }); await restore;
        expect(states).toEqual([{ kind: "LOGOUT" }, { kind: "LOGIN" }]); expect(await store.read()).toBeNull();
    });
    it("logout langsung menyembunyikan data privat, mencabut push sebelum HTTP dan menolak login paralel", async () => {
        const order: string[] = []; server(() => { order.push("http-logout"); return { data: envelope({}) }; });
        const { store } = vault(); await store.save(tokens); const states: AuthState[] = [];
        const controller = new SessionController(createApi("https://sekolah.test/api/v1", "IOS", "0.2.0", store, () => undefined), store, "IOS", () => 1000, (state) => states.push(state));
        let finish!: () => void;
        controller.setBeforeLogout(() => { order.push("push"); return new Promise((resolve) => { finish = resolve; }); });
        const logout = controller.logout(); expect(states.at(-1)).toEqual({ kind: "LOGOUT" });
        await expect(controller.login(user.email, "Password-Lama-12")).rejects.toThrow("Sesi sedang diakhiri");
        finish(); await logout; expect(order).toEqual(["push", "http-logout"]); expect(states.at(-1)).toEqual({ kind: "LOGIN" });
    });
});
