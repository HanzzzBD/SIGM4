import axios from "axios";
import type { AxiosAdapter } from "axios";
import { describe, expect, it } from "vitest";
import { HistoryResponseSchema, ReservationDetailSchema } from "@sigm4/schemas";
import type { ApprovalDecision, ApprovalDecisionResult, ApprovalPending } from "@sigm4/schemas";
import { MobileApiError } from "../src/shared/api/client";
import { findPending, loadReview } from "../src/features/approvals/api";
import { approvalConflict, decisionBlockers, DecisionAttempt, slaLabel } from "../src/features/approvals/model";
import type { ApprovalReview } from "../src/features/approvals/model";

const time = "2026-10-13T08:00:00+07:00";
const pending: ApprovalPending = { instance_id: 7, jenis_pengajuan: "RESERVASI_RUANGAN", referensi_id: 8, pemohon: { id: 9, nama: "Pemohon" }, urutan: 1, sla_deadline: time, sla: { sisa_menit_kerja: 90, terlambat: false }, created_at: time, atas_nama_user_id: null };
const history = HistoryResponseSchema.parse({ success: true, meta: null, data: { instance_id: 7, jenis_pengajuan: "RESERVASI_RUANGAN", referensi_id: 8, status: "MENUNGGU", pemohon: pending.pemohon, aturan: { rule_id: 1, versi: 1 }, langkah_aktif: 1, dibuat_pada: time, diselesaikan_pada: null, ditolak_otomatis: false, langkah: [{ urutan: 1, status: "AKTIF", approver: { tipe: "role", role: { id: 2, nama: "Approver" }, user: null }, fallback: false, catatan: null, diputuskan_oleh: null, atas_nama: null, diputuskan_pada: null, alasan_dilewati: null, eskalasi: null, eskalasi_habis_pada: null, sla: null, durasi_menit_kerja: null }] } }).data;
const room = ReservationDetailSchema.parse({ id: "8", nomor: "RSV-8", jenis: "RUANGAN", status: "MENUNGGU_PERSETUJUAN", ruangan: { id: "3", nama: "Aula", gedung: "Gedung" }, pemohon: { id: "9", nama: "Pemohon" }, nama_kegiatan: "Rapat", jenis_kegiatan: null, jumlah_peserta: 10, keperluan: null, kebutuhan_tambahan: null, keterangan: null, waktu_mulai: time, waktu_selesai: "2026-10-13T09:00:00+07:00", diajukan_pada: time, induk: null, tanggal: [], penggunaan: null, approval_instance_id: 7, aksi: { batalkan: false, ubah_jadwal: false, ajukan_ulang: false, catat_penggunaan: { kondisi: false, tidak_digunakan: false } }, riwayat: [] });
const permissions = { "approval.view": "all", "approval.decide": "all", "reservation.view": "all" };
// Fixture lengkap hanya menguji gerbang; reader produksi selalu memblokir konteks pemohon yang belum ada.
const complete = (): ApprovalReview => ({ history, pending, room, availability: { resourceListed: true, dates: [{ start: room.waktu_mulai, end: room.waktu_selesai, held: true, conflicts: 0, closed: false }] }, contextError: null, requesterContextComplete: true });
const body: ApprovalDecision = { urutan: 1, keputusan: "DISETUJUI", catatan: null };
const result: ApprovalDecisionResult = { instance_id: 7, urutan: 1, keputusan: "DISETUJUI", status: "DISETUJUI", langkah_aktif: null, atas_nama_user_id: null };
const signal = () => new AbortController().signal;
const apiWith = (adapter: AxiosAdapter) => axios.create({ adapter });
const envelope = (data: unknown) => ({ success: true, data, meta: null });
const list = (rows: ApprovalPending[], page = 1, totalPages = 1) => ({ success: true, data: rows, meta: { page, per_page: 100, total: rows.length, total_pages: totalPages } });

describe("PR-05-35: konteks dan pembacaan persetujuan", () => {
    it("memblokir konteks pemohon yang belum tersedia meski reservasi dan ketersediaan lengkap", () => {
        expect(decisionBlockers(complete(), permissions)).toEqual([]);
        expect(decisionBlockers({ ...complete(), requesterContextComplete: false }, permissions).join(" ")).toContain("riwayat keterlambatan dan kewajiban belum tersedia");
    });
    it("menolak langkah usang, scope izin, objek/pemohon tidak cocok dan data ketersediaan hilang", () => {
        for (const review of [{ ...complete(), pending: null }, { ...complete(), pending: { ...pending, urutan: 2 } }, { ...complete(), pending: { ...pending, pemohon: { id: 99, nama: "Asing" } } }, { ...complete(), room: { ...room, approval_instance_id: 99 } }, { ...complete(), history: { ...history, status: "DISETUJUI" as const } }, { ...complete(), availability: null }, { ...complete(), availability: { resourceListed: false, dates: [] } }]) expect(decisionBlockers(review, permissions).length).toBeGreaterThan(0);
        expect(decisionBlockers(complete(), {}).join(" ")).toContain("izin");
    });
    it("menemukan penugasan pada halaman berikutnya tanpa menganggap halaman pertama lengkap", async () => {
        const pages: number[] = [];
        const api = apiWith(async (config) => { const page = Number(config.params.page); pages.push(page); return { config, headers: {}, status: 200, statusText: "OK", data: list(page === 2 ? [pending] : [], page, 2) }; });
        expect(await findPending(api, 7, signal())).toEqual(pending); expect(pages).toEqual([1, 2]);
    });
    it("jenis tanpa detail tetap dapat dibaca; tidak mengakses domain lain atau memalsukan konteks lengkap", async () => {
        const calls: string[] = [];
        const api = apiWith(async (config) => { calls.push(config.url!); return { config, headers: {}, status: 200, statusText: "OK", data: config.url!.endsWith("history") ? envelope({ ...history, jenis_pengajuan: "PENGHAPUSAN" }) : list([{ ...pending, jenis_pengajuan: "PENGHAPUSAN" }]) }; });
        const review = await loadReview(api, 7, permissions, signal());
        expect(review.room).toBeNull(); expect(review.requesterContextComplete).toBe(false); expect(calls).toEqual(["/approvals/7/history", "/approvals/pending"]);
        expect(decisionBlockers(review, permissions).join(" ")).toContain("belum tersedia");
    });
    it("detail reservasi sukses tetap tidak membuka keputusan; ketersediaan membedakan slot sendiri dan benturan", async () => {
        const api = apiWith(async (config) => { const data = config.url!.endsWith("history") ? envelope(history) : config.url === "/approvals/pending" ? list([pending]) : config.url === "/reservations/8" ? envelope(room) : envelope({ dari: room.waktu_mulai, sampai: room.waktu_selesai, zona_waktu: "Asia/Jakarta", granularitas_menit: 30, jam_operasional: { hari: [1, 2, 3, 4, 5], mulai: "07:00", selesai: "17:00" }, hari_libur: [], ruangan: [{ id: "3", kode: "A", nama: "Aula", jenis: "AULA", kapasitas: 20, gedung: { id: "1", nama: "Gedung" } }], slot: [{ ruangan_id: "3", mulai: room.waktu_mulai, selesai: room.waktu_selesai, keadaan: "MENUNGGU_PERSETUJUAN", label: null, reservasi: { id: "8", nomor: "RSV-8", pemohon: "Pemohon" } }, { ruangan_id: "3", mulai: room.waktu_mulai, selesai: room.waktu_selesai, keadaan: "JADWAL_TETAP", label: null, reservasi: null }] }); return { config, headers: {}, status: 200, statusText: "OK", data }; });
        const review = await loadReview(api, 7, permissions, signal()); expect(review.contextError).toBeNull(); expect(review.availability?.dates[0]).toMatchObject({ held: true, conflicts: 1, closed: false }); expect(review.requesterContextComplete).toBe(false); expect(decisionBlockers(review, permissions)).not.toEqual([]);
    });
    it("linimasa berbeda ID ditolak sebelum membaca data domain", async () => {
        const api = apiWith(async (config) => ({ config, headers: {}, status: 200, statusText: "OK", data: envelope({ ...history, instance_id: 99 }) }));
        await expect(loadReview(api, 7, permissions, signal())).rejects.toThrow("tidak cocok");
    });
    it("SLA memakai menit kerja server, termasuk lewat tenggat", () => {
        expect(slaLabel(pending.sla)).toBe("Sisa 1 jam kerja"); expect(slaLabel({ sisa_menit_kerja: -4, terlambat: true })).toBe("Melewati SLA"); expect(slaLabel(null)).toContain("belum tersedia");
    });
});

describe("PR-05-35: keputusan sekali, retry manual dan RE-09", () => {
    it("alasan Tolak/Revisi wajib sebelum otorisasi maupun HTTP", async () => {
        let requests = 0;
        const attempt = new DecisionAttempt({ authorize: async () => { requests++; }, post: async () => { requests++; return result; } }, () => "key");
        for (const keputusan of ["DITOLAK", "PERLU_REVISI"] as const) await expect(attempt.send({ ...body, keputusan, catatan: "   " }, signal())).rejects.toThrow("wajib");
        expect(requests).toBe(0);
    });
    it("membaca ulang konteks sebelum POST dan menolak konteks wajib yang belum lengkap", async () => {
        let posts = 0;
        const attempt = new DecisionAttempt({ authorize: async () => { const reasons = decisionBlockers({ ...complete(), requesterContextComplete: false }, permissions); if (reasons.length) throw new Error(reasons.join(" ")); }, post: async () => { posts++; return result; } }, () => "key");
        await expect(attempt.send(body, signal())).rejects.toThrow("konteks wajib"); expect(posts).toBe(0); expect(attempt.uncertain).toBe(false);
    });
    it("hasil hilang/5xx/REQUEST_IN_PROGRESS memakai body+key sama tanpa membuat niat baru", async () => {
        for (const error of [new MobileApiError(0, "NETWORK_ERROR", "lost"), new MobileApiError(500, "SERVER_ERROR", "lost"), new MobileApiError(409, "REQUEST_IN_PROGRESS", "wait")]) {
            const calls: Array<{ body: ApprovalDecision; key: string }> = []; let reads = 0; let keys = 0;
            const attempt = new DecisionAttempt({ authorize: async () => { reads++; }, post: async (input, key) => { calls.push({ body: input, key }); if (calls.length === 1) throw error; return result; } }, () => `key-${++keys}`);
            await expect(attempt.send(body, signal())).rejects.toBe(error); expect(attempt.uncertain).toBe(true);
            await expect(attempt.send({ ...body, keputusan: "DITOLAK", catatan: "Berubah" }, signal())).rejects.toThrow("isi yang sama");
            expect(await attempt.send(body, signal())).toEqual(result); expect(calls[0]).toEqual(calls[1]); expect(reads).toBe(1); expect(keys).toBe(1); expect(attempt.uncertain).toBe(false);
        }
    });
    it("tap bersamaan tidak mengirim dua POST", async () => {
        let resolve!: () => void; let posts = 0;
        const attempt = new DecisionAttempt({ authorize: () => new Promise<void>((done) => { resolve = done; }), post: async () => { posts++; return result; } }, () => "key");
        const first = attempt.send(body, signal()); await expect(attempt.send(body, signal())).rejects.toThrow("sedang dikirim"); resolve(); await first; expect(posts).toBe(1);
    });
    it("RE-09 menampilkan pelaku/waktu dan melepas niat yang ditolak definitif", async () => {
        const conflict = new MobileApiError(409, "APPROVAL_ALREADY_DECIDED", "decided", [{ field: "diputuskan_oleh", message: "Approver B" }, { field: "diputuskan_pada", message: time }]);
        const attempt = new DecisionAttempt({ authorize: async () => undefined, post: async () => { throw conflict; } }, () => "key");
        await expect(attempt.send(body, signal())).rejects.toBe(conflict); expect(attempt.uncertain).toBe(false); expect(approvalConflict(conflict)).toEqual({ name: "Approver B", at: time }); expect(approvalConflict(new Error())).toBeNull();
    });
    it("abort saat otorisasi mencegah POST setelah keluar layar", async () => {
        const abort = new AbortController(); let posts = 0;
        const attempt = new DecisionAttempt({ authorize: async () => { abort.abort(); }, post: async () => { posts++; return result; } }, () => "key");
        await expect(attempt.send(body, abort.signal)).rejects.toThrow("dibatalkan"); expect(posts).toBe(0);
    });
    it("abort sesudah POST mempertahankan key untuk pemeriksaan hasil manual", async () => {
        const abort = new AbortController(); const keys: string[] = [];
        const attempt = new DecisionAttempt({ authorize: async () => undefined, post: async (_body, key) => { keys.push(key); if (keys.length === 1) abort.abort(); return result; } }, () => "same-key");
        await expect(attempt.send(body, abort.signal)).rejects.toThrow("dibatalkan"); expect(attempt.uncertain).toBe(true);
        await expect(attempt.send(body, abort.signal)).rejects.toThrow("dibatalkan"); expect(keys).toHaveLength(1);
        expect(await attempt.send(body, signal())).toEqual(result); expect(keys).toEqual(["same-key", "same-key"]);
    });
});
