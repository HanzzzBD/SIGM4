// Penyaringan field per permission (SDD-AUTH-06, SDD-03 §4.3).
//
// Allow-list bersifat opt-in: sebuah field hanya muncul bila didaftarkan di
// `extra` DAN pemanggil memegang permission yang menjaganya. Ini menegakkannya
// di titik SELECT/serialisasi, bukan dengan menghapus properti setelah kueri —
// field yang tidak pernah masuk daftar tidak dapat bocor lewat jalur mana pun.

import type { AuthContext } from "./context.js";

/** Field dasar (selalu terlihat) dan field tambahan yang dijaga satu permission. */
export interface FieldPolicy<TBase extends string, TExtra extends string> {
    readonly base: readonly TBase[];
    readonly extra: readonly TExtra[];
    /** Permission yang membuka `extra`, mis. `asset.view_financial` (SDD-03 §4.3). */
    readonly requires: string;
}

/**
 * Field yang boleh dilihat pemanggil menurut kebijakannya. Tidak memegang
 * `requires` → hanya `base`; memegang → `base` digabung `extra`.
 */
export function allowedFields<TBase extends string, TExtra extends string>(
    ctx: AuthContext,
    policy: FieldPolicy<TBase, TExtra>,
): readonly (TBase | TExtra)[] {
    return ctx.can(policy.requires)
        ? [...policy.base, ...policy.extra]
        : policy.base;
}
