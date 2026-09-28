// DecisionService — eksekusi persetujuan (FR-10.2, SDD-02 §4.4): keputusan
// first-responder-wins (RE-09, BR-041, SDD-APR-05), penghentian alur (BR-038),
// kelanjutan/aktivasi langkah (SDD-APR-14/16), efek atas objek pengajuan lewat
// penangan hasil per jenis (SDD-APR-17, BR-043), dan kotak masuk approver.
// Keputusan 69 log phase-02.

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { createApprovalRepository } from "../repositories/approval.repository.js";
import type { KeputusanManusia, StatusInstance } from "../repositories/decision.repository.js";
import { createDecisionRepository } from "../repositories/decision.repository.js";
import type { ApprovalService } from "./approval.service.js";
import { tanggalWib } from "./approval.service.js";
import type { JenisPengajuan } from "./dsl.js";

const MODUL = "m10-approval";

/**
 * SDD-APR-17: efek keputusan atas objek pengajuan, didaftarkan modul pengajuan per jenis
 * (pola FactAdapter, SDD-APR-09). Keduanya berjalan DI DALAM transaksi keputusan.
 */
export interface PenanganHasil {
    readonly jenis: JenisPengajuan;
    /** BR-043 / SDD-APR-11: kunci & verifikasi objek, promosi slot. Melempar DomainError → persetujuan batal (FR-10.2 A5). */
    sebelumDisetujui(scope: TransactionScope, referensiId: number): Promise<void>;
    /** Pelepasan slot dsb. saat alur berhenti tanpa persetujuan (BR-038, FR-10.2 A1). */
    setelahDitutup(scope: TransactionScope, referensiId: number, status: "DITOLAK" | "PERLU_REVISI"): Promise<void>;
}

export interface InputKeputusan {
    readonly urutan: number;
    readonly keputusan: KeputusanManusia;
    readonly catatan: string | null;
}

export interface HasilKeputusan {
    readonly instance_id: number;
    readonly urutan: number;
    readonly keputusan: KeputusanManusia;
    readonly status: StatusInstance;
    readonly langkah_aktif: number | null;
    readonly atas_nama_user_id: number | null;
}

export interface ItemPending {
    readonly instance_id: number;
    readonly jenis_pengajuan: JenisPengajuan;
    readonly referensi_id: number;
    readonly pemohon: { readonly id: number; readonly nama: string | null };
    readonly urutan: number;
    readonly sla_deadline: Date | null;
    readonly created_at: Date;
    /** RE-12: terisi bila pemanggil memutus sebagai penerima delegasi. */
    readonly atas_nama_user_id: number | null;
}

/** Satu penangan per jenis pengajuan (SDD-APR-17). */
export class RegistriPenanganHasil {
    private readonly peta = new Map<JenisPengajuan, PenanganHasil>();

    daftar(...penangan: readonly PenanganHasil[]): this {
        for (const p of penangan) {
            if (this.peta.has(p.jenis)) throw new Error(`Penangan hasil ganda untuk ${p.jenis} (SDD-APR-17).`);
            this.peta.set(p.jenis, p);
        }
        return this;
    }

    cari(jenis: JenisPengajuan): PenanganHasil | undefined {
        return this.peta.get(jenis);
    }
}

/**
 * Registri proses ini (keputusan 75): API (`approvalRouter`) DAN job worker `approval-sla-check`
 * membaca registri yang SAMA, sehingga `auto_reject` oleh job melepas objek persis seperti
 * penolakan manusia. Modul pengaju mendaftar sekali (pemilik: PR-03-10, PR-04-02).
 * Dibaca saat keputusan, bukan saat layanan dibentuk — urutan pendaftaran tak berpengaruh.
 */
export const penanganHasil = new RegistriPenanganHasil();

export class DecisionService {
    private readonly penangan: RegistriPenanganHasil;

    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
        private readonly approval: ApprovalService,
        /** Bawaan: registri proses. Daftar eksplisit untuk uji terisolasi. */
        penangan: readonly PenanganHasil[] | RegistriPenanganHasil = penanganHasil,
    ) {
        this.penangan = penangan instanceof RegistriPenanganHasil ? penangan : new RegistriPenanganHasil().daftar(...penangan);
    }

    /** `POST /approvals/{id}/decide` — dijalankan di dalam transaksi idempoten pemanggil (ID-01). */
    async putuskan(scope: TransactionScope, instanceId: number, input: InputKeputusan): Promise<HasilKeputusan> {
        const repo = createDecisionRepository(scope.tx);
        // SDD-AUTH-08: instance/langkah yang tidak ada dan yang bukan wewenang pemanggil dijawab SAMA.
        const inst = await repo.instance(scope.ctx, instanceId);
        const target = inst === undefined ? undefined : await repo.target(scope.ctx, instanceId, input.urutan);
        if (inst === undefined || target === undefined) throw new ForbiddenError();
        // FR-10.2 AC: hanya pemutus sah langkah itu — pemegang aktif, penerima delegasi; pemohon tidak (BR-039).
        const saya = (await this.approval.pemutusSah(scope, target, inst.pemohonId)).pemutus.find((p) => p.userId === scope.ctx.userId);
        if (saya === undefined) throw new ForbiddenError();
        // BR-042 + keputusan 69: penolakan dan permintaan revisi wajib beralasan.
        if (input.keputusan !== "DISETUJUI" && (input.catatan ?? "").trim() === "") {
            throw new DomainError("VALIDATION_ERROR", "Catatan wajib diisi saat menolak atau meminta revisi.", { field: "catatan" });
        }

        const pada = this.clock.now();
        const menang = await repo.putuskan(scope.ctx, {
            instanceId,
            urutan: input.urutan,
            keputusan: input.keputusan,
            catatan: input.catatan,
            oleh: scope.ctx.userId,
            atasNama: saya.atasNamaUserId,
            pada,
            target,
        });
        if (!menang) {
            // RE-09: yang kalah menerima identitas pemutus + waktunya (keputusan 69: lewat details).
            const pemutus = await repo.pemutus(scope.ctx, instanceId, input.urutan);
            throw new DomainError(
                "APPROVAL_ALREADY_DECIDED",
                "Langkah persetujuan ini sudah diputuskan atau tidak lagi aktif.",
                pemutus === undefined
                    ? undefined
                    : {
                          errors: [
                              { field: "diputuskan_oleh", message: pemutus.nama },
                              { field: "diputuskan_pada", message: pemutus.pada.toISOString() },
                          ],
                      },
            );
        }

        const penangan = this.penangan.cari(inst.jenis);
        let status: StatusInstance = "MENUNGGU";
        let langkahAktif: number | null = null;
        if (input.keputusan === "DISETUJUI") {
            const terbuka = (await createApprovalRepository(scope.tx).langkahInstance(scope.ctx, instanceId)).some((l) => l.terbuka);
            if (terbuka) {
                // Langkah berikutnya — pemutus nonaktif dilewati, habis → fallback (RE-11/13).
                langkahAktif = await this.approval.aktifkanBerikutnya(scope, instanceId);
            } else {
                await penangan?.sebelumDisetujui(scope, inst.referensiId); // BR-043, SDD-APR-17
                status = "DISETUJUI";
                await repo.tutup(scope.ctx, instanceId, status, pada);
            }
        } else {
            // BR-038: penolakan pada langkah mana pun mengakhiri alur; revisi mengembalikan ke pemohon (A1).
            status = input.keputusan;
            await repo.tutup(scope.ctx, instanceId, status, pada);
            await penangan?.setelahDitutup(scope, inst.referensiId, input.keputusan);
        }

        const hasil: HasilKeputusan = {
            instance_id: instanceId,
            urutan: input.urutan,
            keputusan: input.keputusan,
            status,
            langkah_aktif: langkahAktif,
            atas_nama_user_id: saya.atasNamaUserId,
        };
        // BR-042: pelaku, waktu, keputusan, catatan — pelaku & waktu dicatat AuditLogger.
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "APPROVAL_DECIDED",
            entitas: "approval_instances",
            entitasId: instanceId,
            nilaiSesudah: { ...hasil, catatan: input.catatan },
        });
        // Hanya jalur pemenang yang sampai di sini (RE-09).
        await publish(scope, {
            name: "ApprovalDecided",
            aggregateType: "approval_instance",
            aggregateId: instanceId,
            payload: { instance_id: instanceId, urutan: input.urutan, keputusan: input.keputusan, status, langkah_aktif: langkahAktif },
        });
        return hasil;
    }

    /**
     * Lampiran D.5 `auto_reject` (keputusan 73): eskalasi habis → instance `Ditolak` oleh
     * SYSTEM. Langkahnya tetap tanpa keputusan manusia (`approval_steps_pemutus_ada`);
     * objek dilepas lewat penangan yang sama dengan penolakan manusia (SDD-APR-17), dan
     * pemohon dinotifikasi lewat `ApprovalDecided` (NT-03). Dijalankan di transaksi job.
     */
    async tolakOtomatis(scope: TransactionScope, instanceId: number, urutan: number): Promise<void> {
        const repo = createDecisionRepository(scope.tx);
        const inst = await repo.instance(scope.ctx, instanceId);
        if (inst === undefined) throw new Error(`Instance persetujuan ${String(instanceId)} tidak ada.`);
        await repo.tutup(scope.ctx, instanceId, "DITOLAK", this.clock.now());
        await this.penangan.cari(inst.jenis)?.setelahDitutup(scope, inst.referensiId, "DITOLAK");
        const hasil = { instance_id: instanceId, urutan, keputusan: "DITOLAK", status: "DITOLAK", langkah_aktif: null } as const;
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "APPROVAL_DECIDED",
            entitas: "approval_instances",
            entitasId: instanceId,
            nilaiSesudah: { ...hasil, otomatis: true },
            keterangan: "Eskalasi SLA habis tanpa keputusan — ditolak otomatis (Lampiran D.5 auto_reject).",
        });
        await publish(scope, { name: "ApprovalDecided", aggregateType: "approval_instance", aggregateId: instanceId, payload: hasil });
    }

    /**
     * `GET /approvals/pending` (FR-10.2 langkah 2): hanya langkah yang menjadi wewenang
     * pemanggil (AC), paling mendesak dulu — tenggat SLA terdekat, lalu yang lebih lama menunggu.
     */
    async pending(ctx: AuthContext, page: number, perPage: number): Promise<{ rows: readonly ItemPending[]; total: number }> {
        const semua = await withTransaction(
            ctx,
            async (scope) => {
                const kandidat = await createDecisionRepository(scope.tx).kandidatPending(scope.ctx, ctx.userId, tanggalWib(this.clock.now()));
                const hasil: ItemPending[] = [];
                for (const k of kandidat) {
                    const saya = (await this.approval.pemutusSah(scope, k, k.pemohonId)).pemutus.find((p) => p.userId === ctx.userId);
                    if (saya === undefined) continue;
                    hasil.push({
                        instance_id: k.instanceId,
                        jenis_pengajuan: k.jenis,
                        referensi_id: k.referensiId,
                        pemohon: { id: k.pemohonId, nama: k.pemohonNama },
                        urutan: k.urutan,
                        sla_deadline: k.slaDeadline,
                        created_at: k.createdAt,
                        atas_nama_user_id: saya.atasNamaUserId,
                    });
                }
                return hasil;
            },
            this.db,
        );
        const waktu = (d: Date | null): number => (d === null ? Number.POSITIVE_INFINITY : d.getTime());
        semua.sort((a, b) => waktu(a.sla_deadline) - waktu(b.sla_deadline) || a.created_at.getTime() - b.created_at.getTime() || a.instance_id - b.instance_id);
        return { rows: semua.slice((page - 1) * perPage, page * perPage), total: semua.length };
    }
}
