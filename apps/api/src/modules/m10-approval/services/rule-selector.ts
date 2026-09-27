// Pemilihan aturan — RE-04, RE-06, BR-036, BR-037. Murni seperti evaluatornya (RE-01):
// kandidat (aturan aktif sejenis) dimuat pemanggil; penyalinan ke `rule_snapshot`
// (RE-05) dan resolusi approver adalah urusan pembentukan instance (PR-02-20/21).

import type { KamusFakta } from "./condition-evaluator.js";
import { evaluate } from "./condition-evaluator.js";
import type { Kondisi } from "./dsl.js";

export interface KandidatAturan {
    readonly id: number;
    readonly prioritas: number;
    readonly kondisi: Kondisi;
}

export interface HasilPemilihan<T extends KandidatAturan> {
    /** `null` = tidak ada yang cocok -> berlaku ATURAN_BAWAAN (RE-06). */
    readonly terpilih: T | null;
    /** Seluruh aturan yang cocok, urut sesuai RE-04 — bahan pratinjau RE-07. */
    readonly cocok: readonly T[];
}

/** RE-04: prioritas tertinggi; seri -> `id` terkecil. */
function urutanRe04(a: KandidatAturan, b: KandidatAturan): number {
    return b.prioritas - a.prioritas || a.id - b.id;
}

export function selectRule<T extends KandidatAturan>(kandidat: readonly T[], fakta: KamusFakta): HasilPemilihan<T> {
    const cocok = kandidat.filter((r) => evaluate(r.kondisi, fakta)).sort(urutanRe04);
    return { terpilih: cocok[0] ?? null, cocok };
}

/**
 * RE-06 / BR-036: aturan bawaan bila tak satu pun cocok — satu level, role
 * Petugas Sarana Prasarana (kode `R-02`, seed 0010), SLA 24 jam. Approver ditulis
 * sebagai KODE role; resolusi ke `roles.id` terjadi saat pembentukan instance.
 */
export const ATURAN_BAWAAN = {
    kondisi: {},
    steps: [{ order: 1, approver_type: "role", approver_role: "R-02", sla_hours: 24, on_sla_breach: "remind" }],
    fallback_approver: null,
    terminal_on_exhausted_escalation: "hold_and_alert",
} as const;
