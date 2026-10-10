// Konsumen outbox penerbit notifikasi (SDD-08 §4.2a, keputusan 75, 78): satu handler
// per event, dijalankan WORKER setelah commit, masing-masing di transaksinya sendiri
// dengan pelaku SYSTEM. Penerima & rincian dihitung modul pemiliknya lewat index.ts-nya
// (SDD-SYS-03). Konsumen M-01 (PR-02-35, keputusan 87); SessionRevoked milik PR-02-27.

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
    identitasPengguna,
    namaRole,
    penggunaAktifBerperan,
    ringkasanImpor,
    tanggalWib,
} from "../../m02-users/index.js";
import {
    EVENT_AKUN_TERKUNCI,
    EVENT_BREAK_GLASS_RECOVERY,
    EVENT_DUA_FAKTOR_AKTIF,
    EVENT_PASSWORD_DIGANTI_SETELAH_RESET,
    EVENT_REFRESH_DIPAKAI_ULANG,
    EVENT_RESET_DIMINTA,
    EVENT_RESET_DITERBITKAN,
    EVENT_SESI_DICABUT,
} from "../../m01-auth/index.js";
import { EVENT_RESERVASI_KEDALUWARSA } from "../../m07-reservation-room/index.js";
import {
    ApprovalSlaBreachedPayloadSchema,
    EVENT_INSTANCE_DIBENTUK,
    NOTIFIKASI_TINDAKAN_SLA,
    catatanLangkah,
    pemutusLangkah,
    sumberNotifikasiApproval,
} from "../../m10-approval/index.js";
import type { RegistriPenyediaRincian } from "../../m10-approval/index.js";
import type { NotifikasiBaru } from "../repositories/notification.repository.js";
import { createDeviceTokenRepository } from "../repositories/device-token.repository.js";
import { createNotificationRepository } from "../repositories/notification.repository.js";
import type { PenyiarNotifikasi } from "./fanout.js";
import type { Terbitan } from "./notification.service.js";
import { NotificationService } from "./notification.service.js";
import { templatUntuk } from "./templates.js";
import { EVENT_ASSET_IMPORT_COMPLETED } from "../../m04-assets/index.js";

/** Kode role penerima tetap (seed 0010): Administrator, Petugas Sarana Prasarana, Pimpinan Sekolah. */
const ADMINISTRATOR = "R-01";
const PETUGAS_SARPRAS = "R-02";
const PIMPINAN = "R-03";

/** Seluruh kode yang dapat diterbitkan konsumen di sini — diperiksa saat dipasang (SDD-08 §5). */
const KODE_DIPAKAI = [
    ...["NT-01", "NT-02", "NT-03", "NT-04", "NT-05", "NT-06", "NT-07", "NT-47", "NT-40", "NT-48", "NT-52", "NT-55", "NT-46"],
    ...["NT-37", "NT-38", "NT-38a", "NT-39", "NT-39a", "NT-53", "NT-54"],
] as const;

/** Deep link M-01: P-67 antrean reset, P-63 detail pengguna (UX §6), profil sendiri. */
const P67 = "/permintaan-reset-password";
const detailPengguna = (id: number): string => `/pengguna/${String(id)}`;

/** Alasan NT-03 bila penolakan tanpa catatan manusia — Lampiran D.5 `auto_reject`. */
const ALASAN_TOLAK_OTOMATIS = "batas waktu persetujuan habis tanpa keputusan";

export interface KonsumenDeps {
    /** Dibaca saat event diproses, bukan saat dipasang — pemasangan tak membuka koneksi. */
    readonly db: () => Kysely<Database>;
    readonly clock: Clock;
    /** Pelaku SYSTEM — dibentuk worker (SDD-03 §6), bukan modul ini. */
    readonly ctx: () => AuthContext;
    readonly rincian?: RegistriPenyediaRincian | undefined;
    /** SDD-08 §4.4a (keputusan 80c): antrekan job push per notifikasi baru SETELAH commit. */
    readonly jadwalkanPush?: ((notifikasiIds: readonly number[]) => Promise<void>) | undefined;
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
        // Keputusan 87b: hanya kode "In-app + Push" katalog yang menghasilkan job push.
        const dipush = baru.filter((n) => templatUntuk(n.kode).push);
        if (deps.jadwalkanPush !== undefined && dipush.length > 0) await deps.jadwalkanPush(dipush.map((n) => n.id));
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

    // FR-07.2 langkah 6 / sekuens 15.2 (m10 §9 NT-01): pengajuan RESERVASI baru → pemutus sah langkah aktif.
    registry.on(
        EVENT_INSTANCE_DIBENTUK,
        jalankan(async (scope, e, p, emit) => {
            if (p["jenis_pengajuan"] !== "RESERVASI_RUANGAN" && p["jenis_pengajuan"] !== "RESERVASI_ASET") return;
            const id = angka(p["instance_id"]);
            const a = await approval(scope, id);
            if (a === undefined) return;
            const penerima = await pemutusLangkah(scope, deps.clock, id, angka(p["langkah_aktif"]));
            const pemohon = (await identitasPengguna(scope, a.sumber.pemohonId))?.nama ?? "";
            await emit(scope, { kode: "NT-01", penerima, params: { ...a.params, pemohon }, referensi: a.referensi, deepLink: a.deepLink, dedupe: { event: e.id } });
        }),
    );

    // BR-023b (m07 §9 NT-46): pengajuan kedaluwarsa TTL → pemohon + pemutus langkah yang aktif saat itu.
    registry.on(
        EVENT_RESERVASI_KEDALUWARSA,
        jalankan(async (scope, e, p, emit) => {
            const id = angka(p["reservation_id"]);
            const approver = p["instance_id"] == null || p["langkah_aktif"] == null ? [] : await pemutusLangkah(scope, deps.clock, angka(p["instance_id"]), angka(p["langkah_aktif"]));
            await emit(scope, {
                kode: "NT-46",
                penerima: [...new Set([angka(p["pemohon_id"]), ...approver])],
                params: { nomor: p["nomor"] },
                referensi: { jenis: "reservation", id },
                deepLink: `/reservasi/${String(id)}`,
                dedupe: { event: e.id },
            });
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

    // NT-55: hasil impor aset langsung menunjuk laporan yang dapat ditinjau ulang (P-17).
    registry.on(EVENT_ASSET_IMPORT_COMPLETED, jalankan(async (scope, e, p, emit) => {
        const jobId = angka(p["job_id"]);
        await emit(scope, { kode: "NT-55", penerima: [angka(p["oleh"])], params: { ...p, status: p["status"] === "GAGAL" ? "gagal" : "selesai" }, referensi: { jenis: "asset_import_job", id: jobId }, deepLink: `/aset/impor?job=${jobId}`, dedupe: { event: e.id } });
    }));

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

    // MOB-SEC-05 / FR-17.2 AC 3 (keputusan 78a, 80b): sesi dicabut → token perangkat keluarganya dicabut.
    registry.on(
        EVENT_SESI_DICABUT,
        jalankan(async (scope, _e, p) => {
            if (typeof p["family_id"] === "string") await createDeviceTokenRepository(scope.tx).cabutKeluarga(scope.ctx, p["family_id"]);
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

    // ---- M-01 (m01-auth.md §9; PR-02-35, keputusan 87). `{waktu}` = saat kejadian (occurredAt), bukan saat diproses.
    const nama = async (scope: TransactionScope, id: number): Promise<string> => (await identitasPengguna(scope, id))?.nama ?? "Pengguna";
    const waktu = (e: OutboxEvent): string => e.occurredAt.toISOString();

    // FR-01.3 langkah 2: permintaan reset masuk → Administrator (NT-37).
    registry.on(
        EVENT_RESET_DIMINTA,
        jalankan(async (scope, e, p, emit) => {
            const userId = angka(p["user_id"]);
            await emit(scope, {
                kode: "NT-37",
                penerima: await penggunaAktifBerperan(scope, [ADMINISTRATOR]),
                params: { pengguna: await nama(scope, userId) },
                referensi: { jenis: "password_reset_request", id: angka(p["permintaan_id"]) },
                deepLink: P67,
                dedupe: { event: e.id },
            });
        }),
    );

    // FR-01.3 langkah 5: password sementara diterbitkan → Administrator PENERBIT saja (NT-38).
    registry.on(
        EVENT_RESET_DITERBITKAN,
        jalankan(async (scope, e, p, emit) => {
            await emit(scope, {
                kode: "NT-38",
                penerima: [angka(p["oleh"])],
                params: { pengguna: await nama(scope, angka(p["user_id"])), waktu: waktu(e) },
                referensi: { jenis: "password_reset_request", id: angka(p["permintaan_id"]) },
                deepLink: P67,
                dedupe: { event: e.id },
            });
        }),
    );

    // FR-01.3 langkah 7: password diganti setelah reset → pengguna itu (NT-38a).
    registry.on(
        EVENT_PASSWORD_DIGANTI_SETELAH_RESET,
        jalankan(async (scope, e, p, emit) => {
            const userId = angka(p["user_id"]);
            await emit(scope, { kode: "NT-38a", penerima: [userId], params: { waktu: waktu(e) }, referensi: { jenis: "user", id: userId }, deepLink: "/profil", dedupe: { event: e.id } });
        }),
    );

    // FR-01.1 A2: akun terkunci → pemilik akun + Administrator (NT-39); tautan berbeda per penerima.
    registry.on(
        EVENT_AKUN_TERKUNCI,
        jalankan(async (scope, e, p, emit) => {
            const userId = angka(p["user_id"]);
            const params = { pengguna: await nama(scope, userId) };
            const dasar = { kode: "NT-39", params, referensi: { jenis: "user", id: userId }, dedupe: { event: e.id } } as const;
            // Pemilik lebih dulu: Administrator yang akunnya sendiri terkunci tidak menerima baris kedua —
            // `dedupe_key` kejadian tunggal sama per penerima (SDD-08 §4.1), jadi tautan profilnya yang bertahan.
            await emit(scope, { ...dasar, penerima: [userId], deepLink: "/profil" });
            await emit(scope, { ...dasar, penerima: await penggunaAktifBerperan(scope, [ADMINISTRATOR]), deepLink: detailPengguna(userId) });
        }),
    );

    // BR-070e: 2FA diaktifkan → Administrator (NT-39a), dengan platform sesi pengonfirmasi (keputusan 87d).
    registry.on(
        EVENT_DUA_FAKTOR_AKTIF,
        jalankan(async (scope, e, p, emit) => {
            const userId = angka(p["user_id"]);
            await emit(scope, {
                kode: "NT-39a",
                penerima: await penggunaAktifBerperan(scope, [ADMINISTRATOR]),
                params: { pengguna: await nama(scope, userId), waktu: waktu(e), platform: typeof p["platform"] === "string" ? p["platform"] : null },
                referensi: { jenis: "user", id: userId },
                deepLink: detailPengguna(userId),
                dedupe: { event: e.id },
            });
        }),
    );

    // FR-01.6 langkah 6: break-glass → seluruh Pimpinan Sekolah (NT-53).
    registry.on(
        EVENT_BREAK_GLASS_RECOVERY,
        jalankan(async (scope, e, p, emit) => {
            const userId = angka(p["user_id"]);
            await emit(scope, {
                kode: "NT-53",
                penerima: await penggunaAktifBerperan(scope, [PIMPINAN]),
                params: { email: typeof p["email"] === "string" ? p["email"] : "", waktu: waktu(e) },
                referensi: { jenis: "user", id: userId },
                deepLink: detailPengguna(userId),
                dedupe: { event: e.id },
            });
        }),
    );

    // SDD-SESS-04: pemakaian ulang refresh token → Administrator (NT-54, keputusan 87a).
    registry.on(
        EVENT_REFRESH_DIPAKAI_ULANG,
        jalankan(async (scope, e, p, emit) => {
            const userId = angka(p["user_id"]);
            await emit(scope, {
                kode: "NT-54",
                penerima: await penggunaAktifBerperan(scope, [ADMINISTRATOR]),
                params: { pengguna: await nama(scope, userId), waktu: waktu(e) },
                referensi: { jenis: "user", id: userId },
                deepLink: detailPengguna(userId),
                dedupe: { event: e.id },
            });
        }),
    );
}
