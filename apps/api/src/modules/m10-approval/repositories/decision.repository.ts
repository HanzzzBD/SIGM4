// Repository keputusan persetujuan (FR-10.2, RE-09, SDD-APR-05; SDD-AUTH-02).
// PRIVAT terhadap modul — hanya services/decision.service.ts yang memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { JenisPengajuan } from "../services/dsl.js";
import type { Target } from "./approval.repository.js";

export type KeputusanManusia = "DISETUJUI" | "DITOLAK" | "PERLU_REVISI";
export type StatusInstance = "MENUNGGU" | "DISETUJUI" | "DITOLAK" | "PERLU_REVISI" | "DIBATALKAN";

export interface InstanceKeputusan {
    readonly id: number;
    readonly jenis: JenisPengajuan;
    readonly referensiId: number;
    readonly pemohonId: number;
}

export interface Putusan {
    readonly instanceId: number;
    readonly urutan: number;
    readonly keputusan: KeputusanManusia;
    readonly catatan: string | null;
    readonly oleh: number;
    readonly atasNama: number | null;
    readonly pada: Date;
}

export interface KandidatPending extends Target {
    readonly instanceId: number;
    readonly jenis: JenisPengajuan;
    readonly referensiId: number;
    readonly pemohonId: number;
    readonly pemohonNama: string | null;
    readonly urutan: number;
    readonly slaDeadline: Date | null;
    readonly createdAt: Date;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

export class DecisionRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async instance(ctx: AuthContext, instanceId: number): Promise<InstanceKeputusan | undefined> {
        const b = await this.query(ctx)
            .selectFrom("approval_instances")
            .select(["id", "jenis_pengajuan", "referensi_id", "pemohon_id"])
            .where("id", "=", String(instanceId))
            .executeTakeFirst();
        return b === undefined
            ? undefined
            : { id: Number(b.id), jenis: b.jenis_pengajuan, referensiId: Number(b.referensi_id), pemohonId: Number(b.pemohon_id) };
    }

    /** Target langkah `urutan` — dasar pemeriksaan pemutus sah. */
    async target(ctx: AuthContext, instanceId: number, urutan: number): Promise<Target | undefined> {
        const b = await this.query(ctx)
            .selectFrom("approval_steps")
            .select(["approver_type", "approver_role_id", "approver_user_id"])
            .where("instance_id", "=", String(instanceId))
            .where("urutan", "=", urutan)
            .executeTakeFirst();
        return b === undefined ? undefined : { approverType: b.approver_type, roleId: num(b.approver_role_id), userId: num(b.approver_user_id) };
    }

    /**
     * RE-09 / SDD-APR-05: SATU pernyataan bersyarat — langkah belum diputus DAN masih
     * langkah aktif instance yang masih menunggu. Pemenang mengubah satu baris; yang
     * kalah, setelah pemenang commit, mengevaluasi ulang `keputusan IS NULL` dan
     * mengubah nol baris. Tanpa SELECT-lalu-UPDATE, tanpa kunci tabel.
     */
    async putuskan(ctx: AuthContext, p: Putusan): Promise<boolean> {
        const hasil = await this.query(ctx)
            .updateTable("approval_steps")
            .set({
                keputusan: p.keputusan,
                catatan: p.catatan,
                diputuskan_oleh: p.oleh,
                diputuskan_pada: p.pada,
                atas_nama_user_id: p.atasNama,
            })
            .where("instance_id", "=", String(p.instanceId))
            .where("urutan", "=", p.urutan)
            .where("keputusan", "is", null)
            .where(({ exists, selectFrom }) =>
                exists(
                    selectFrom("approval_instances")
                        .select("id")
                        .where("id", "=", String(p.instanceId))
                        .where("status", "=", "MENUNGGU")
                        .where("langkah_aktif", "=", p.urutan),
                ),
            )
            .executeTakeFirst();
        return hasil.numUpdatedRows === 1n;
    }

    /** RE-09: identitas & waktu pemutus manusia langkah itu; `undefined` bila tidak ada. */
    async pemutus(ctx: AuthContext, instanceId: number, urutan: number): Promise<{ nama: string; pada: Date } | undefined> {
        const b = await this.query(ctx)
            .selectFrom("approval_steps as s")
            .innerJoin("users as u", "u.id", "s.diputuskan_oleh")
            .select(["u.nama", "s.diputuskan_pada"])
            .where("s.instance_id", "=", String(instanceId))
            .where("s.urutan", "=", urutan)
            .executeTakeFirst();
        return b === undefined || b.diputuskan_pada === null ? undefined : { nama: b.nama, pada: b.diputuskan_pada };
    }

    /** Status akhir (Bab 11.3); CHECK `approval_instances_selesai_konsisten` menuntut waktu selesai. */
    async tutup(ctx: AuthContext, instanceId: number, status: Exclude<StatusInstance, "MENUNGGU">, pada: Date): Promise<void> {
        await this.query(ctx)
            .updateTable("approval_instances")
            .set({ status, diselesaikan_pada: pada, langkah_aktif: null })
            .where("id", "=", String(instanceId))
            .execute();
    }

    /**
     * Kotak masuk: PENYARING kasar di SQL — langkah aktif yang menyasar pengguna ini, role-nya,
     * atau pemberi delegasi yang berlaku hari ini baginya. Keputusan akhirnya tetap
     * `resolvePemutus` (satu sumber aturan, SDD-APR-16) di layanan.
     */
    async kandidatPending(ctx: AuthContext, userId: number, tanggal: string): Promise<readonly KandidatPending[]> {
        const delegasi = sql`SELECT d.pemberi_id FROM approval_delegations d
                              WHERE d.penerima_id = ${userId} AND ${tanggal}::date BETWEEN d.mulai AND d.selesai`;
        const baris = await this.query(ctx)
            .selectFrom("approval_instances as i")
            .innerJoin("approval_steps as s", (j) => j.onRef("s.instance_id", "=", "i.id").onRef("s.urutan", "=", "i.langkah_aktif"))
            .leftJoin("users as p", "p.id", "i.pemohon_id")
            .select([
                "i.id",
                "i.jenis_pengajuan",
                "i.referensi_id",
                "i.pemohon_id",
                "p.nama as pemohon_nama",
                "i.created_at",
                "s.urutan",
                "s.approver_type",
                "s.approver_role_id",
                "s.approver_user_id",
                "s.sla_deadline",
            ])
            .where("i.status", "=", "MENUNGGU")
            .where("s.keputusan", "is", null)
            .where(
                sql<boolean>`(
                    (s.approver_type = 'user' AND (s.approver_user_id = ${userId} OR s.approver_user_id IN (${delegasi})))
                 OR (s.approver_type = 'role' AND (s.approver_role_id = (SELECT role_id FROM users WHERE id = ${userId})
                                                OR s.approver_role_id IN (SELECT u.role_id FROM users u WHERE u.id IN (${delegasi})))))`,
            )
            .execute();
        return baris.map((b) => ({
            instanceId: Number(b.id),
            jenis: b.jenis_pengajuan,
            referensiId: Number(b.referensi_id),
            pemohonId: Number(b.pemohon_id),
            pemohonNama: b.pemohon_nama,
            urutan: b.urutan,
            approverType: b.approver_type,
            roleId: num(b.approver_role_id),
            userId: num(b.approver_user_id),
            slaDeadline: b.sla_deadline,
            createdAt: b.created_at,
        }));
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createDecisionRepository(executor: QueryExecutor): DecisionRepository {
    return defineRepository(new DecisionRepository(executor));
}
