import { EXPORT_READY, exportNotificationSource } from "../../m16-analytics/index.js";
import { disposalNotificationSource } from "../../m21-disposal/index.js";
import { materialRequestNotification } from "../../m22-materials/index.js";
import { currentReminderLoan } from "../../m09-loans/index.js";
import { procurementDecisionSource } from "../../m14-procurement/index.js";
import { EVENT_WORK_ORDER_ASSIGNED,workOrderNotificationSource } from "../../m12-maintenance/index.js";
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
import { EVENT_ROOM_SCHEDULE_IMPORT_COMPLETED, EVENT_RESERVASI_DIBATALKAN, EVENT_RESERVASI_KEDALUWARSA } from "../../m07-reservation-room/index.js";
import { EVENT_KERUSAKAN_DILAPORKAN, EVENT_KERUSAKAN_DIVERIFIKASI } from "../../m11-damage-reports/index.js";
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
    "NT-56", "NT-42",
    "NT-49",
    "NT-50", "NT-51",
    "NT-43", "NT-44", "NT-45",
    "NT-34","NT-35","NT-36",
    "NT-30", "NT-31", "NT-32", "NT-33",
    "NT-10", "NT-14", "NT-15",
    ...["NT-01", "NT-02", "NT-03", "NT-04", "NT-05", "NT-06", "NT-07", "NT-47", "NT-40", "NT-48", "NT-52", "NT-55", "NT-46", "NT-08", "NT-09"],
    ...["NT-37", "NT-38", "NT-38a", "NT-39", "NT-39a", "NT-53", "NT-54"],
    ...["NT-19", "NT-20", "NT-21", "NT-22", "NT-24", "NT-25", "NT-26", "NT-27", "NT-28"],
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

    registry.on(EXPORT_READY, jalankan(async (scope, e, p, emit) => {
        const source = await exportNotificationSource(scope, String(p["export_id"]), deps.clock);
        if (source) await emit(scope, { kode: "NT-42", penerima: [source.requesterId], params: { jenis: source.title }, referensi: { jenis: "report_export", id: source.id }, deepLink: source.deepLink, dedupe: { event: e.id } });
    }));

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
            if(a.sumber.jenis==="PENGADAAN_BARANG"&&status!=="MENUNGGU"){
                const source=await procurementDecisionSource(scope,id,angka(p["urutan"]));if(!source)return;
                const label=status==="DISETUJUI"?(source.sebagian?"disetujui sebagian":"disetujui"):status==="PERLU_REVISI"?"memerlukan revisi":"ditolak";
                await emit(scope,{kode:"NT-35",penerima:[source.pengusul_id],params:{nomor:source.nomor,status:label,catatan:await catatanLangkah(scope,id,angka(p["urutan"]))},referensi:{jenis:"procurement",id:source.id},deepLink:`/pengadaan/${source.id}`,dedupe});return;
            }
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

    registry.on("AssetDisposalProposed", jalankan(async (scope, e, p, emit) => {
        const id = angka(p["disposal_id"]), source = await disposalNotificationSource(scope, id);
        await emit(scope, { kode: "NT-43", penerima: await pemutusLangkah(scope, deps.clock, angka(p["instance_id"]), angka(p["langkah_aktif"])), params: { ...p, ...source }, referensi: { jenis: "asset_disposal", id }, deepLink: `/penghapusan/${id}`, dedupe: { event: e.id } });
    }));
    registry.on("AssetDisposalDecided", jalankan(async (scope, e, p, emit) => {
        const id = angka(p["disposal_id"]), source = await disposalNotificationSource(scope, id);
        const labels: Record<string, string> = { DISETUJUI: "disetujui", DISETUJUI_SEBAGIAN: "disetujui sebagian", DITOLAK: "ditolak", PERLU_REVISI: "memerlukan revisi", DIBATALKAN: "dibatalkan" };
        await emit(scope, { kode: "NT-44", penerima: [angka(p["pengusul_id"])], params: { ...source, status: labels[String(p["status"])] ?? "berubah" }, referensi: { jenis: "asset_disposal", id }, deepLink: `/penghapusan/${id}`, dedupe: { event: e.id } });
    }));
    registry.on("AssetDisposalExecuted", jalankan(async (scope, e, p, emit) => {
        const id = angka(p["disposal_id"]), source = await disposalNotificationSource(scope, id);
        await emit(scope, { kode: "NT-45", penerima: [angka(p["pengusul_id"]), ...await penggunaAktifBerperan(scope, [PIMPINAN])], params: { ...p, ...source }, referensi: { jenis: "asset_disposal", id }, deepLink: `/penghapusan/${id}`, dedupe: { event: e.id } });
    }));
    registry.on("ProcurementSubmitted",jalankan(async(scope,e,p,emit)=>{
        const id=angka(p["procurement_id"]),referensi={jenis:"procurement",id},deepLink=`/pengadaan/${id}`,dedupe={event:e.id};
        await emit(scope,{kode:"NT-34",penerima:await pemutusLangkah(scope,deps.clock,angka(p["instance_id"]),angka(p["langkah_aktif"])),params:p,referensi,deepLink:`/persetujuan/${angka(p["instance_id"])}`,dedupe});
        await emit(scope,{kode:"NT-35",penerima:[angka(p["pengusul_id"])],params:{...p,status:"diajukan dan menunggu persetujuan"},referensi,deepLink,dedupe});
    }));
    registry.on("ProcurementReceived",jalankan(async(scope,e,p,emit)=>{
        const petugas=await penggunaAktifBerperan(scope,[ADMINISTRATOR,PETUGAS_SARPRAS]);
        await emit(scope,{kode:"NT-35",penerima:[angka(p["pengusul_id"])],params:{...p,status:p["status"]==="SELESAI"?"selesai diterima":"diterima sebagian"},referensi:{jenis:"procurement",id:angka(p["procurement_id"])},deepLink:`/pengadaan/${angka(p["procurement_id"])}`,dedupe:{event:e.id}});
        await emit(scope,{kode:"NT-36",penerima:[...petugas,angka(p["pengusul_id"])],params:p,referensi:{jenis:"procurement",id:angka(p["procurement_id"])},deepLink:`/pengadaan/${angka(p["procurement_id"])}`,dedupe:{event:e.id}});
    }));
    registry.on("ProcurementDrafted",jalankan(async(scope,e,p,emit)=>{await emit(scope,{kode:"NT-35",penerima:[angka(p["pengusul_id"])],params:{...p,status:"kembali menjadi Draf"},referensi:{jenis:"procurement",id:angka(p["procurement_id"])},deepLink:`/pengadaan/${angka(p["procurement_id"])}`,dedupe:{event:e.id}});}));
    registry.on("ProcurementClosed",jalankan(async(scope,e,p,emit)=>{await emit(scope,{kode:"NT-35",penerima:[angka(p["pengusul_id"])],params:{...p,status:"ditutup sebagai Tidak Direalisasikan",catatan:p["alasan"]},referensi:{jenis:"procurement",id:angka(p["procurement_id"])},deepLink:`/pengadaan/${angka(p["procurement_id"])}`,dedupe:{event:e.id}});}));
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
                kode: p["alasan"] === "TIDAK_DIAMBIL" ? "NT-09" : "NT-46",
                penerima: [...new Set([angka(p["pemohon_id"]), ...approver])],
                params: { nomor: p["nomor"] },
                referensi: { jenis: "reservation", id },
                deepLink: `/reservasi/${String(id)}`,
                dedupe: { event: e.id },
            });
        }),
    );

    // FR-07.3 A2 (m07 §9 NT-08): dibatalkan PIHAK LAIN → pemohon, segera. Pembatalan sendiri tanpa notifikasi.
    registry.on(
        EVENT_RESERVASI_DIBATALKAN,
        jalankan(async (scope, e, p, emit) => {
            if (p["sepihak"] !== true && p["kode_notifikasi"] !== "NT-27") return;
            const id = angka(p["reservation_id"]);
            const pelaku = (await identitasPengguna(scope, angka(p["pelaku_id"])))?.nama ?? "Petugas";
            await emit(scope, {
                kode: p["kode_notifikasi"] === "NT-27" ? "NT-27" : "NT-08",
                penerima: [angka(p["pemohon_id"])],
                params: { nomor: p["nomor"], pelaku, alasan: p["alasan"], aset: p["aset"] },
                referensi: { jenis: "reservation", id },
                deepLink: `/reservasi/${String(id)}`,
                dedupe: { event: e.id },
            });
        }),
    );

    for (const [event, code] of [["LoanCheckedOut", "NT-10"], ["LoanReturned", "NT-14"], ["FineIssued", "NT-15"]] as const) {
        registry.on(event, jalankan(async (scope, e, p, emit) => {
            const id = angka(p["loan_id"]);
            await emit(scope, { kode: code, penerima: [angka(p["peminjam_id"])], params: p, referensi: { jenis: "loan", id }, deepLink: `/peminjaman/${id}`, dedupe: { event: e.id } });
            if (event === "FineIssued" && p["jenis"] === "GANTI_RUGI") await emit(scope, { kode: code, penerima: await penggunaAktifBerperan(scope, [PIMPINAN]), params: p, referensi: { jenis: "loan", id }, deepLink: `/peminjaman/${id}`, dedupe: { event: e.id } });
        }));
    }
    for (const [event, code] of [["LoanDueReminder", "NT-11"], ["LoanOverdueReminder", "NT-12"]] as const) registry.on(event, jalankan(async (scope, e, p, emit) => {
        if (!await currentReminderLoan(scope, angka(p["loan_id"]), String(p["tanggal"]))) return;
        await emit(scope, { kode: code, penerima: [angka(p["peminjam_id"])], params: p, referensi: { jenis: "loan", id: angka(p["loan_id"]) }, deepLink: `/peminjaman/${angka(p["loan_id"])}`, dedupe: code === "NT-12" ? { harian: String(p["hari_wib"]) } : { event: e.id } });
    }));
    registry.on("LoanOverdueRecap", jalankan(async (scope, _e, p, emit) => { await emit(scope, { kode: "NT-13", penerima: await penggunaAktifBerperan(scope, [PETUGAS_SARPRAS]), params: p, referensi: { jenis: "loan_recap", id: Number(String(p["hari_wib"]).replaceAll("-", "")) }, deepLink: "/peminjaman?tab=terlambat", dedupe: { harian: String(p["hari_wib"]) } }); }));
    for (const [event, code] of [["FinePaid", "NT-16"], ["FineWaived", "NT-17"], ["BorrowerBlocked", "NT-18"]] as const) registry.on(event, jalankan(async (scope, e, p, emit) => { await emit(scope, { kode: code, penerima: [angka(p["peminjam_id"])], params: p, referensi: { jenis: code === "NT-18" ? "borrower" : "fine", id: code === "NT-18" ? angka(p["peminjam_id"]) : angka(p["fine_id"]) }, deepLink: code === "NT-18" ? "/denda" : `/denda/${angka(p["fine_id"])}`, dedupe: { event: e.id } }); }));
    // FR-11.1 langkah 5 (m11 §9, keputusan 20d): NT-19 ke Petugas Sarpras; urgensi KRITIS → NT-20 ke
    // Petugas + Pimpinan SEBAGAI GANTI NT-19 (satu notifikasi per tiket). Pelapor tidak dinotifikasi.
    registry.on(
        EVENT_KERUSAKAN_DILAPORKAN,
        jalankan(async (scope, e, p, emit) => {
            const id = angka(p["damage_report_id"]);
            const kritis = p["urgensi"] === "KRITIS";
            const pelaporId = angka(p["pelapor_id"]);
            const penerima = (await penggunaAktifBerperan(scope, kritis ? [PETUGAS_SARPRAS, PIMPINAN] : [PETUGAS_SARPRAS])).filter((u) => u !== pelaporId);
            if (penerima.length === 0) return;
            await emit(scope, {
                kode: kritis ? "NT-20" : "NT-19",
                penerima,
                params: kritis
                    ? { nomor: p["nomor"], objek: p["objek"], lokasi: p["lokasi"] }
                    : { nomor: p["nomor"], objek: p["objek"], pelapor: (await identitasPengguna(scope, pelaporId))?.nama ?? "Pengguna" },
                referensi: { jenis: "damage_report", id },
                deepLink: `/kerusakan/${String(id)}`,
                dedupe: { event: e.id },
            });
        }),
    );

    registry.on("MaterialLowStock", jalankan(async (scope, e, p, emit) => {
        const id = angka(p["material_id"]);
        await emit(scope, { kode: "NT-49", penerima: await penggunaAktifBerperan(scope, [PETUGAS_SARPRAS, ADMINISTRATOR]), params: p, referensi: { jenis: "material", id }, deepLink: `/bahan/${id}`, dedupe: { event: e.id } });
    }));
    registry.on("MaterialRequestReady", jalankan(async (scope, e, p, emit) => {
        const id = angka(p["request_id"]), source = await materialRequestNotification(scope, id, undefined, angka(p["revision"])); if (!source) return;
        await emit(scope, { kode: "NT-50", penerima: [angka(p["pemohon_id"])], params: { ...p, ...source }, referensi: { jenis: "material_request", id }, deepLink: `/permintaan-bahan/${id}`, dedupe: { event: e.id } });
    }));
    registry.on("MaterialIssued", jalankan(async (scope, e, p, emit) => {
        const id = angka(p["request_id"]), source = await materialRequestNotification(scope, id, angka(p["issue_id"])); if (!source) return;
        await emit(scope, { kode: "NT-51", penerima: [angka(p["pemohon_id"])], params: { ...p, ...source }, referensi: { jenis: "material_request", id }, deepLink: `/permintaan-bahan/${id}`, dedupe: { event: e.id } });
    }));
    registry.on("AuditSessionCreated", jalankan(async (scope, e, p, emit) => {
        await emit(scope, { kode: "NT-30", penerima: (p["pelaksana_ids"] as number[]), params: p, referensi: { jenis: "audit_session", id: angka(p["session_id"]) }, deepLink: `/opname/${String(p["session_id"])}`, dedupe: { event: e.id } });
    }));
    registry.on("AuditSessionSubmitted", jalankan(async (scope, e, p, emit) => {
        await emit(scope, { kode: "NT-31", penerima: await penggunaAktifBerperan(scope, [PIMPINAN]), params: p, referensi: { jenis: "audit_session", id: angka(p["session_id"]) }, deepLink: `/opname/${String(p["session_id"])}/rekonsiliasi`, dedupe: { event: e.id } });
    }));
    registry.on("AuditSessionDecided", jalankan(async (scope, e, p, emit) => {
        await emit(scope, { kode: "NT-32", penerima: p["pelaksana_ids"] as number[], params: p, referensi: { jenis: "audit_session", id: angka(p["session_id"]) }, deepLink: `/opname/${String(p["session_id"])}`, dedupe: { event: e.id } });
    }));
    registry.on("AssetMarkedLost", jalankan(async (scope, e, p, emit) => {
        await emit(scope, { kode: "NT-33", penerima: await penggunaAktifBerperan(scope, [PIMPINAN, PETUGAS_SARPRAS]), params: p, referensi: { jenis: "audit_session", id: angka(p["session_id"]) }, deepLink: `/opname/${String(p["session_id"])}`, dedupe: { event: e.id } });
    }));
    registry.on("PreventiveWorkOrderCreated", jalankan(async (scope, e, p, emit) => {
        await emit(scope, { kode: "NT-28", penerima: [angka(p["teknisi_id"]), ...await penggunaAktifBerperan(scope, [PETUGAS_SARPRAS])], params: p, referensi: { jenis: "work_order", id: angka(p["work_order_id"]) }, deepLink: `/work-order/${String(p["work_order_id"])}`, dedupe: { event: e.id } });
    }));
    registry.on("PreventiveAssetAvailable", jalankan(async (scope, e, p, emit) => {
        await emit(scope, { kode: "NT-28", penerima: [angka(p["teknisi_id"])], params: { ...p, tanggal: "sekarang; aset sudah tersedia" }, referensi: { jenis: "work_order", id: angka(p["work_order_id"]) }, deepLink: `/work-order/${String(p["work_order_id"])}`, dedupe: { event: e.id } });
    }));
    registry.on(EVENT_WORK_ORDER_ASSIGNED, jalankan(async (scope, e, p, emit) => {
        await emit(scope, { kode: "NT-22", penerima: [angka(p["teknisi_id"])], params: { nomor: p["nomor"], prioritas: p["prioritas"] }, referensi: { jenis: "work_order", id: angka(p["work_order_id"]) }, deepLink: `/work-order/${String(p["work_order_id"])}`, dedupe: { event: e.id } });
    }));
    for(const event of ["WorkOrderCompleted","WorkOrderPaused","WorkOrderEstimateRequested"])registry.on(event,jalankan(async(scope,e,p,emit)=>{
        const id=angka(p["work_order_id"]),source=await workOrderNotificationSource(scope,id);if(!source)return;
        await emit(scope,{kode:"NT-24",penerima:await penggunaAktifBerperan(scope,[PETUGAS_SARPRAS,ADMINISTRATOR]),params:{...p,nomor:source.nomor,kejadian:event},referensi:{jenis:"work_order",id},deepLink:`/work-order/${id}`,dedupe:{event:e.id}});
    }));
    registry.on("WorkOrderReturned",jalankan(async(scope,e,p,emit)=>{const id=angka(p["work_order_id"]),source=await workOrderNotificationSource(scope,id);if(!source)return;await emit(scope,{kode:"NT-25",penerima:[source.teknisi_id],params:{nomor:source.nomor,catatan:p["catatan"]},referensi:{jenis:"work_order",id},deepLink:`/work-order/${id}`,dedupe:{event:e.id}});}));
    registry.on("WorkOrderClosed",jalankan(async(scope,e,p,emit)=>{const id=angka(p["work_order_id"]),source=await workOrderNotificationSource(scope,id);if(!source)return;await emit(scope,{kode:"NT-26",penerima:[source.teknisi_id,...(source.pelapor_id===null?[]:[source.pelapor_id])],params:{aset:source.objek},referensi:{jenis:"work_order",id},deepLink:`/work-order/${id}`,dedupe:{event:e.id}});}));
    // FR-11.2 langkah 5 (m11 §9, keputusan 21b): hasil verifikasi → pelapor, beserta catatan/alasannya.
    // Pelapor yang memverifikasi tiketnya sendiri tidak dinotifikasi.
    registry.on(
        EVENT_KERUSAKAN_DIVERIFIKASI,
        jalankan(async (scope, e, p, emit) => {
            const id = angka(p["damage_report_id"]);
            const pelaporId = angka(p["pelapor_id"]);
            if (pelaporId === angka(p["pelaku_id"])) return;
            const hasil = p["status"] === "DITOLAK" ? "ditolak" : p["status"] === "SELESAI" ? "diverifikasi dan diselesaikan dengan perbaikan ringan" : "diverifikasi dan akan ditindaklanjuti";
            await emit(scope, {
                kode: "NT-21",
                penerima: [pelaporId],
                params: { nomor: p["nomor"], hasil, catatan: p["catatan"] ?? null },
                referensi: { jenis: "damage_report", id },
                deepLink: `/kerusakan/${String(id)}`,
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

    registry.on(EVENT_ROOM_SCHEDULE_IMPORT_COMPLETED, jalankan(async (scope, e, p, emit) => {
        const jobId = String(p["job_id"]);
        await emit(scope, { kode: "NT-56", penerima: [angka(p["oleh"])], params: { ...p, status: p["status"] === "GAGAL" ? "gagal" : "selesai" }, referensi: { jenis: "room_schedule_import_job", id: angka(jobId) }, deepLink: `/kalender-ruangan?kelola=true&impor=${jobId}`, dedupe: { event: e.id } });
    }));
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
