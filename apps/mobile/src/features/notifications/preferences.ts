// MS-28 Preferensi Notifikasi (FR-17.3; UXD-05) — kontrak dan aturan yang sama dengan P-78 web.
import type { AxiosInstance } from "axios";
import { z } from "zod";

/** Urutan enam kelompok UXD-05. */
export const GROUPS = ["PERSETUJUAN", "RESERVASI_PEMINJAMAN", "DENDA_KEWAJIBAN", "KERUSAKAN_PERAWATAN", "OPNAME_PENGADAAN", "AKUN_SISTEM"] as const;
export type Group = (typeof GROUPS)[number];
const Preference = z.object({ jenis: z.enum(GROUPS), in_app: z.boolean(), push: z.boolean(), terkunci: z.boolean() });
export type Preference = z.infer<typeof Preference>;
const Response = z.object({ data: z.array(Preference) });
export const loadPreferences = async (api: AxiosInstance, signal: AbortSignal) => Response.parse((await api.get("/notifications/preferences", { signal })).data).data;
export const savePreferences = async (api: AxiosInstance, list: readonly Pick<Preference, "jenis" | "in_app" | "push">[]) => Response.parse((await api.put("/notifications/preferences", { preferensi: list })).data).data;

/**
 * Relevansi kelompok dari permission `/me`, bukan role (keputusan PR-02-43, UX §7.6.8) — sama dengan web;
 * Akun & Sistem selalu relevan.
 */
export const GROUP_PERMISSIONS: Readonly<Record<Group, readonly string[] | null>> = {
    PERSETUJUAN: ["approval.decide", "reservation.create", "loan.extend", "procurement.create", "disposal.create", "material.request"],
    RESERVASI_PEMINJAMAN: ["reservation.view", "loan.view"],
    DENDA_KEWAJIBAN: ["fine.view"],
    KERUSAKAN_PERAWATAN: ["damage.create", "damage.view", "workorder.view"],
    OPNAME_PENGADAAN: ["audit.view", "procurement.view", "disposal.view", "material.request"],
    AKUN_SISTEM: null,
};
export function relevantPreferences(list: readonly Preference[], permissions: Readonly<Record<string, string>>): Preference[] {
    return list.filter((item) => GROUP_PERMISSIONS[item.jenis]?.some((permission) => Object.hasOwn(permissions, permission)) ?? true);
}

export type Channels = Readonly<Partial<Record<Group, { in_app: boolean; push: boolean }>>>;
/** Push bergantung in-app: mematikan in-app ikut mematikan push (SDD-08 §4.5, keputusan 81c). */
export function setChannel(state: Channels, group: Group, channel: "in_app" | "push", value: boolean): Channels {
    const current = state[group] ?? { in_app: true, push: true };
    return { ...state, [group]: channel === "in_app" ? { in_app: value, push: value ? current.push : false } : { ...current, push: current.in_app && value } };
}
/** Kelompok terkunci tidak dikirim (keputusan 81e) dan selalu tampil menyala (FR-17.3 A1). */
export function shownChannels(item: Preference, state: Channels) { return item.terkunci ? { in_app: true, push: true } : state[item.jenis] ?? { in_app: item.in_app, push: item.push }; }
export function preferencePayload(list: readonly Preference[], state: Channels) {
    return list.filter((item) => !item.terkunci).map((item) => ({ jenis: item.jenis, ...shownChannels(item, state) }));
}
