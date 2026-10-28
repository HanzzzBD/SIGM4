// Kontrak konfigurasi approval rule (FR-10.1, Lampiran D.5, RE-07; keputusan 77) + pemilih
// approver (M-02 `/roles`, `/users`). Role ditulis KODE (`R-02`), pengguna ber-id angka.

import { queryOptions } from "@tanstack/react-query";
import type { JenisPengajuan } from "@sigm4/schemas";
import { ambilData, api } from "../../shared/api";

export type TipeApprover = "role" | "user";
export type PerilakuSla = "remind" | "escalate";
/** BR-039a: `auto_approve` tidak pernah ada di klien. */
export type Terminal = "hold_and_alert" | "auto_reject";

export interface LangkahD5 {
    readonly order: number;
    readonly approver_type: TipeApprover;
    readonly approver_role?: string;
    readonly approver_user_id?: number;
    readonly sla_hours: number;
    readonly on_sla_breach: PerilakuSla;
    readonly escalate_to_user_id?: number;
}

export interface ApproverD5 {
    readonly approver_type: TipeApprover;
    readonly approver_role?: string;
    readonly approver_user_id?: number;
}

export interface DefinisiAturan {
    readonly jenis_pengajuan: JenisPengajuan;
    readonly prioritas: number;
    readonly kondisi: unknown;
    readonly steps: readonly LangkahD5[];
    readonly fallback_approver: ApproverD5 | null;
    readonly terminal_on_exhausted_escalation: Terminal;
}

export interface AturanTersimpan extends DefinisiAturan {
    readonly id: number;
    readonly status_aktif: boolean;
    readonly versi: number;
    readonly updated_at: string;
}

type Nama = { readonly id: number; readonly nama: string | null } | null;

export interface HasilPratinjau {
    readonly terpilih: { readonly rule_id: number | null; readonly draf: boolean; readonly bawaan: boolean; readonly prioritas: number | null; readonly versi: number | null };
    readonly cocok: readonly { readonly rule_id: number | null; readonly draf: boolean; readonly prioritas: number }[];
    readonly langkah: readonly {
        readonly urutan: number;
        readonly approver: { readonly tipe: TipeApprover; readonly role: { readonly kode: string | null; readonly nama: string | null } | null; readonly user: Nama };
        readonly sla_jam: number;
        readonly on_sla_breach: PerilakuSla;
        readonly eskalasi_ke: Nama;
        readonly fallback: boolean;
        readonly akan_dilewati: string | null;
    }[];
}

export type Fakta = Readonly<Record<string, string | number | boolean | readonly number[]>>;

export interface Role {
    readonly id: string;
    readonly kode: string;
    readonly nama: string;
    readonly permissions: readonly { readonly kode: string }[];
}

export interface PenggunaRingkas {
    readonly id: string;
    readonly nama: string;
    readonly role_id: string;
    readonly status: string;
}

export const KUNCI_ATURAN = ["approval-rules"] as const;

export const kueriAturan = queryOptions({
    queryKey: KUNCI_ATURAN,
    queryFn: () => ambilData<AturanTersimpan[]>(api.get("/approval-rules")),
});

export const kueriRole = queryOptions({
    queryKey: ["roles"],
    queryFn: () => ambilData<Role[]>(api.get("/roles")),
    staleTime: 5 * 60 * 1000,
});

/** Pemilih pengguna: role dulu, lalu pengguna AKTIF role itu (keputusan PR-02-34; `GET /users` tanpa pencarian nama). */
export const kueriPenggunaRole = (roleId: string) =>
    queryOptions({
        queryKey: ["users", "role", roleId],
        queryFn: () => ambilData<PenggunaRingkas[]>(api.get("/users", { params: { "filter[role_id]": roleId, "filter[status]": "AKTIF", per_page: 100 } })),
        enabled: roleId !== "",
    });

/** Pengguna yang sudah tersimpan pada aturan — role-nya untuk pemilih, statusnya untuk RE-13. */
export const kueriPengguna = (id: number) =>
    queryOptions({
        queryKey: ["users", String(id)],
        queryFn: () => ambilData<PenggunaRingkas>(api.get(`/users/${String(id)}`)),
        retry: false,
    });

export function simpanAturan(id: number | null, d: DefinisiAturan): Promise<AturanTersimpan> {
    return ambilData<AturanTersimpan>(id === null ? api.post("/approval-rules", d) : api.put(`/approval-rules/${String(id)}`, d));
}

/** FR-10.1 A4; menonaktifkan wajib beralasan (UX-04). */
export function ubahStatusAturan(id: number, aktif: boolean, alasan?: string): Promise<AturanTersimpan> {
    return ambilData<AturanTersimpan>(api.patch(`/approval-rules/${String(id)}/status`, { status_aktif: aktif, ...(alasan === undefined ? {} : { alasan }) }));
}

/** RE-07: evaluator & pemilih yang sama dengan pengajuan sungguhan; tanpa efek samping. */
export function pratinjau(body: { readonly jenis_pengajuan: JenisPengajuan; readonly fakta: Fakta; readonly pemohon_id?: number; readonly aturan_draf: DefinisiAturan & { readonly id?: number } }): Promise<HasilPratinjau> {
    return ambilData<HasilPratinjau>(api.post("/approval-rules/preview", body));
}
