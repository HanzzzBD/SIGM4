// Konsumen outbox penerbit notifikasi (SDD-08 §4.2a, keputusan 75, 78): satu handler
// per event, dijalankan WORKER setelah commit, masing-masing di transaksinya sendiri
// dengan pelaku SYSTEM. Penerima & rincian dihitung modul pemiliknya lewat index.ts-nya
// (SDD-SYS-03). Konsumen M-01 milik PR-02-35; SessionRevoked milik PR-02-27.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { EventHandlerRegistry, OutboxEvent } from "../../../shared/events/index.js";
import {
    EVENT_AKUN_BERUBAH,
    EVENT_IMPOR_SELESAI,
    EVENT_KONSEN_WALI_HILANG,
    namaRole,
    penggunaAktifBerperan,
    ringkasanImpor,
    tanggalWib,
} from "../../m02-users/index.js";
import {
    ApprovalSlaBreachedPayloadSchema,
    NOTIFIKASI_TINDAKAN_SLA,
    catatanLangkah,
    pemutusLangkah,
    sumberNotifikasiApproval,
} from "../../m10-approval/index.js";
import type { RegistriPenyediaRincian } from "../../m10-approval/index.js";
import type { NotifikasiBaru } from "../repositories/notification.repository.js";
import { createNotificationRepository } from "../repositories/notification.repository.js";
import type { PenyiarNotifikasi } from "./fanout.js";
import type { Terbitan } from "./notification.service.js";
import { NotificationService } from "./notification.service.js";
import { templatUntuk } from "./templates.js";

/** Kode role penerima tetap (seed 0010): Administrator, Petugas Sarana Prasarana. */
const ADMINISTRATOR = "R-01";
const PETUGAS_SARPRAS = "R-02";

/** Seluruh kode yang dapat diterbitkan konsumen di sini — diperiksa saat dipasang (SDD-08 §5). */
const KODE_DIPAKAI = ["NT-02", "NT-03", "NT-04", "NT-05", "NT-06", "NT-07", "NT-47", "NT-40", "NT-48", "NT-52"] as const;

/** Alasan NT-03 bila penolakan tanpa catatan manusia — Lampiran D.5 `auto_reject`. */
const ALASAN_TOLAK_OTOMATIS = "batas waktu persetujuan habis tanpa keputusan";

export interface KonsumenDeps {
    /** Dibaca saat event diproses, bukan saat dipasang — pemasangan tak membuka koneksi. */
    readonly db: () => Kysely<Database>;
    readonly clock: Clock;
    /** Pelaku SYSTEM — dibentuk worker (SDD-03 §6), bukan modul ini. */
    readonly ctx: () => AuthContext;
    readonly rincian?: RegistriPenyediaRincian | undefined;
    /** SDD-08 §4.3a: siaran SETELAH commit; tanpa penyiar (uji) notifikasi tetap tersimpan. */
    readonly penyiar?: (() => PenyiarNotifikasi) | undefined;
}

type Payload = Readonly<Record<string, unknown>>;
const angka = (v: unknown): number => Number(v);

export function pasangKonsumenNotifikasi(registry: EventHandlerRegistry, deps: KonsumenDeps): void {
    for (const kode of KODE_DIPAKAI) templatUntuk(kode);
    const notifikasi = new NotificationService(deps.clock);
    type Emit = (scope: TransactionScope, t: Terbitan) => Promise<void>;
    const jalankan = (kerja: (scope: TransactionScope, e: OutboxEvent, p: Payload, emit: Emit) => Promise<void>) => async (e: OutboxEvent) => {
        const baru: NotifikasiBaru[] = [];
        const emit: Emit = async (scope, t) => {
            baru.push(...(await notifikasi.emit(scope, t)));
        };
        await withTransaction(deps.ctx(), (scope) => kerja(scope, e, (e.payload ?? {}) as Payload, emit), deps.db());
        await siarkanSetelahCommit(baru);
    };

    /** NTF-05: tiap notifikasi baru disiarkan bersama hitungan belum-dibaca penerimanya. */
    const siarkanSetelahCommit = async (baru: readonly NotifikasiBaru[]): Promise<void> => {
        if (deps.penyiar === undefined || baru.length === 0) return;
        const penyiar = deps.penyiar();
        for (const n of baru) {
            const unread = await withTransaction(deps.ctx(), (scope) => createNotificationRepository(scope.tx).belumDibaca(scope.ctx, n.userId), deps.db());
            await penyiar.siarkan(n.userId, {
                jenis: "notifikasi",
                notifikasi: { id: n.id, kode: n.kode, judul: n.judul, isi: n.isi, deep_link: n.deepLink, created_at: n.createdAt.toISOString() },
                unread_count: unread,
            });
        }
    };

    /** Rincian pengajuan + referensi + deep link bersama NT-02…07, NT-47. */
    const approval = async (scope: TransactionScope, instanceId: number) => {
        const sumber = await sumberNotifikasiApproval(scope, instanceId, deps.rincian);
        if (sumber === undefined) return undefined;
        const r = sumber.rincian;
        return { sumber, params: { label: r.label, objek: r.objek, tanggal: r.tanggal }, referensi: { jenis: "approval_instance", id: instanceId }, deepLink: r.deepLink };
    };

    // FR-10.2 langkah 5–7, A1 (m10 §9): hasil keputusan → pemohon, atau approver langkah berikutnya.
    registry.on(
        "ApprovalDecided",
        jalankan(async (scope, e, p, emit) => {
            const id = angka(p["instance_id"]);
            const a = await approval(scope, id);
            if (a === undefined) return;
            const dedupe = { event: e.id };
            const status = p["status"];
            if (status === "DISETUJUI") {
                await emit(scope, { kode: "NT-02", penerima: [a.sumber.pemohonId], params: a.params, referensi: a.referensi, deepLink: a.deepLink, dedupe });
            } else if (status === "DITOLAK") {
                const alasan = (await catatanLangkah(scope, id, angka(p["urutan"]))) ?? ALASAN_TOLAK_OTOMATIS;
                await emit(scope, { kode: "NT-03", penerima: [a.sumber.pemohonId], params: { ...a.params, alasan }, referensi: a.referensi, deepLink: a.deepLink, dedupe });
            } else if (status === "PERLU_REVISI") {
                const catatan = (await catatanLangkah(scope, id, angka(p["urutan"]))) ?? "";
                await emit(scope, { kode: "NT-04", penerima: [a.sumber.pemohonId], params: { ...a.params, catatan }, referensi: a.referensi, deepLink: a.deepLink, dedupe });
            } else if (status === "MENUNGGU" && p["langkah_aktif"] != null) {
                const penerima = await pemutusLangkah(scope, deps.clock, id, angka(p["langkah_aktif"]));
                await emit(scope, { kode: "NT-05", penerima, params: a.params, referensi: a.referensi, deepLink: a.deepLink, dedupe });
            }
        }),
    );

    // RE-11 / RE-13: seluruh langkah terlewati → fallback; Administrator + Petugas Sarpras dialarmi.
    registry.on(
        "ApprovalFallbackRouted",
        jalankan(async (scope, e, p, emit) => {
            const a = await approval(scope, angka(p["instance_id"]));
            if (a === undefined) return;
            const penerima = await penggunaAktifBerperan(scope, [ADMINISTRATOR, PETUGAS_SARPRAS]);
            await emit(scope, { kode: "NT-47", penerima, params: a.params, referensi: a.referensi, deepLink: a.deepLink, dedupe: { event: e.id } });
        }),
    );

    // FR-10.2 A2/A2a (keputusan 73d, 75): kontrak payload divalidasi — menyimpang = galat → dead letter + alarm.
    registry.on(
        "ApprovalSlaBreached",
        jalankan(async (scope, e, mentah, emit) => {
            const p = ApprovalSlaBreachedPayloadSchema.parse(mentah);
            const a = await approval(scope, p.instance_id);
            if (a === undefined) return;
            const kode = NOTIFIKASI_TINDAKAN_SLA[p.tindakan];
            let penerima: readonly number[];
            if (p.tindakan === "REMIND") {
                penerima = [...(await pemutusLangkah(scope, deps.clock, p.instance_id, p.urutan)), ...(await penggunaAktifBerperan(scope, [PETUGAS_SARPRAS]))];
            } else if (p.tindakan === "ESCALATE") {
                penerima = [p.eskalasi_ke];
            } else {
                penerima = await penggunaAktifBerperan(scope, [ADMINISTRATOR, PETUGAS_SARPRAS]);
            }
            // NT-06 berulang harian (anti-spam 1×/hari per objek, SDD-NTF-07); lainnya kejadian tunggal.
            const dedupe = p.tindakan === "REMIND" ? { harian: tanggalWib(deps.clock.now()) } : { event: e.id };
            await emit(scope, { kode, penerima, params: a.params, referensi: a.referensi, deepLink: a.deepLink, dedupe });
        }),
    );

    // IMPT-04: impor > 200 baris selesai → pengunggah.
    registry.on(
        EVENT_IMPOR_SELESAI,
        jalankan(async (scope, e, p, emit) => {
            const jobId = angka(p["job_id"]);
            const r = await ringkasanImpor(scope, jobId);
            if (r === undefined) return;
            await emit(scope, {
                kode: "NT-52",
                penerima: [angka(p["oleh"])],
                params: r,
                referensi: { jenis: "user_import_job", id: jobId },
                deepLink: "/pengguna/impor",
                dedupe: { event: e.id },
            });
        }),
    );

    // FR-02.2 / m02 §9: role atau status akun berubah → pengguna itu.
    registry.on(
        EVENT_AKUN_BERUBAH,
        jalankan(async (scope, e, p, emit) => {
            const userId = angka(p["user_id"]);
            const role = typeof p["role_baru"] === "string" ? await namaRole(scope, p["role_baru"]) : null;
            const status = p["status_baru"] === "AKTIF" ? "Aktif" : p["status_baru"] === "NONAKTIF" ? "Nonaktif" : null;
            await emit(scope, {
                kode: "NT-40",
                penerima: [userId],
                params: { role, status },
                referensi: { jenis: "user", id: userId },
                deepLink: "/profil",
                dedupe: { event: e.id },
            });
        }),
    );

    // DP-02 / SL-06: akun siswa ditolak tanpa persetujuan wali → Administrator.
    registry.on(
        EVENT_KONSEN_WALI_HILANG,
        jalankan(async (scope, e, p, emit) => {
            const userId = p["user_id"] == null ? null : angka(p["user_id"]);
            await emit(scope, {
                kode: "NT-48",
                penerima: await penggunaAktifBerperan(scope, [ADMINISTRATOR]),
                params: { nama: typeof p["nama"] === "string" ? p["nama"] : "" },
                referensi: userId === null ? null : { jenis: "user", id: userId },
                deepLink: userId === null ? "/pengguna" : `/pengguna/${String(userId)}`,
                dedupe: { event: e.id },
            });
        }),
    );
}
