// Bantuan uji web: server HTTP tiruan pada adapter axios (tanpa jaringan) dan perakit
// aplikasi lengkap di atas riwayat memori — uji melewati router, gerbang sesi, dan
// klien HTTP yang SAMA dengan produksi.

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import axios, { AxiosError, AxiosHeaders } from "axios";
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import axe from "axe-core";
import { buatQueryClient } from "../src/app/main";
import { buatRouter } from "../src/app/router";
import { api } from "../src/shared/api";

export interface Permintaan {
    readonly method: string;
    readonly url: string;
    readonly params: Record<string, unknown>;
    readonly data: unknown;
}

export type Jawaban = { readonly status: number; readonly data?: unknown; readonly headers?: Record<string, string> };
export type Penangan = (p: Permintaan) => Jawaban | Promise<Jawaban>;

/** Memasang server tiruan pada instans axios; mengembalikan log permintaan. */
export function pasangServer(penangan: Penangan, klien: AxiosInstance = api): Permintaan[] {
    const log: Permintaan[] = [];
    klien.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        const p: Permintaan = {
            method: (config.method ?? "get").toUpperCase(),
            url: config.url ?? "",
            params: (config.params as Record<string, unknown> | undefined) ?? {},
            data: typeof config.data === "string" ? (JSON.parse(config.data) as unknown) : config.data,
        };
        log.push(p);
        const j = await penangan(p);
        const respons: AxiosResponse = { status: j.status, statusText: String(j.status), data: j.data ?? null, headers: new AxiosHeaders(j.headers ?? {}), config };
        if (j.status >= 400) throw new AxiosError(`HTTP ${String(j.status)}`, "ERR_BAD_RESPONSE", config, {}, respons);
        return respons;
    };
    return log;
}

export const sukses = (data: unknown): Jawaban => ({ status: 200, data: { success: true, data, meta: null } });
export const gagal = (status: number, code: string, message: string, requestId = "req-uji-1"): Jawaban => ({ status, data: { success: false, error: { code, message }, request_id: requestId } });

export const ME_ADMIN = {
    user: { id: "1", nama: "Admin Uji", email: "admin@sekolah.sch.id", telepon: null, role_kode: "R-01", must_change_password: false },
    permissions: { "dashboard.view": "all", "user.view": "all", "notification.manage_own": "all" },
};

/** Aplikasi utuh pada path tertentu. */
export async function renderAplikasi(path: string) {
    const queryClient = buatQueryClient();
    queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
    const router = buatRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
    await router.load();
    const hasil = render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return { ...hasil, router, queryClient };
}

/** Pelanggaran aksesibilitas axe (WCAG 2.1 A/AA) atas sebuah wadah (SDD-11 §4.6 audit). */
export async function pelanggaranAxe(wadah: Element): Promise<string[]> {
    const hasil = await axe.run(wadah, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
    return hasil.violations.map((v) => `${v.id}: ${v.help}`);
}

export { axios };
