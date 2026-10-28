// Acceptance PR-02-35 (keputusan 87; FR-17.1, SDD-08 §4.2a, SDD-07 §4.3): setiap event M-01
// yang sudah terbit menghasilkan notifikasi ke penerimanya — lewat outbox + OutboxDispatcher
// sungguhan terhadap PostgreSQL NYATA, dengan kontrak payload SDD-07 §4.3.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEMPLAT, pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { waktuWib } from "../../src/modules/m17-notifications/services/templates.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher, publish } from "../../src/shared/events/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { eventHandlers } from "../../src/worker/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
/** Rabu 30 September 2026, 14.05 WIB — waktu kejadian (outbox `occurred_at`). */
const clock = new FixedClock(new Date("2026-09-30T07:05:00Z"));
const pelaku = createSystemAuthContext("uji-notifikasi-m01");

const penggunaUji: number[] = [];
async function pengguna(kodeRole: string, nama: string, status: "AKTIF" | "NONAKTIF" = "AKTIF"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('${nama}', 'm01n-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPM01N${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), '${status}', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

/** Terbitkan event ke outbox (transaksi terpisah, sudah commit), lalu jalankan konsumen seperti worker. */
async function terbitkan(name: string, aggregateId: number, payload: Record<string, unknown>, dijadwalkan: number[] = []): Promise<void> {
    await withTransaction(pelaku, (s) => publish(s, { name, aggregateType: "user", aggregateId, payload }), getDb());
    // `occurred_at` diisi basis data (DEFAULT now()); dipatok agar `{waktu}` dapat diperiksa kata per kata.
    await kueri(`UPDATE event_outbox SET occurred_at = '${clock.now().toISOString()}' WHERE processed_at IS NULL`);
    const registry = new EventHandlerRegistry();
    pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => pelaku, jadwalkanPush: (ids) => (dijadwalkan.push(...ids), Promise.resolve()) });
    await new OutboxDispatcher({ registry, clock, db: getDb(), logger: new Logger({ clock, tulis: () => undefined }) }).drain();
}

type Notif = { id: string; user_id: string; kode: string; isi: string; deep_link: string | null; wajib: boolean; jenis: string };
const notif = (kode: string) => kueri<Notif>(`SELECT id::text, user_id::text, kode, isi, deep_link, wajib, jenis::text FROM notifications WHERE kode = '${kode}' ORDER BY user_id`);
const penerima = async (kode: string) => (await notif(kode)).map((n) => Number(n.user_id)).sort((a, b) => a - b);

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM notifications");
    await kueri("DELETE FROM event_outbox");
    if (penggunaUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${penggunaUji.splice(0).join(",")})`);
}

describe.skipIf(!ADA_DB)("PR-02-35 — konsumen notifikasi M-01 (acceptance)", () => {
    let admin: number;
    let admin2: number;
    let pimpinan: number;
    let siswa: number;

    beforeAll(() => {
        dbmate("up");
    });
    beforeEach(async () => {
        await bersihkan();
        // Penerima berbasis role: sisakan hanya pemegang milik uji ini yang AKTIF (pola notifications-publish).
        await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE role_id IN (SELECT id FROM roles WHERE kode IN ('R-01', 'R-03')) AND status = 'AKTIF'`);
        admin = await pengguna("R-01", "Admin Satu");
        admin2 = await pengguna("R-01", "Admin Dua");
        await pengguna("R-01", "Admin Nonaktif", "NONAKTIF");
        pimpinan = await pengguna("R-03", "Kepala Sekolah");
        siswa = await pengguna("R-07", "Budi Siswa");
    });
    afterAll(bersihkan);

    it("{waktu} = PATTERNS §5.3 dalam WIB", () => {
        expect(waktuWib("2026-09-30T07:05:00.000Z")).toBe("30 September 2026 14.05 WIB");
        expect(waktuWib("bukan tanggal")).toBe("");
    });

    it("NT-37: permintaan reset → seluruh Administrator AKTIF; menyebut pemohon; tautan P-67; dijadwalkan push", async () => {
        const dijadwalkan: number[] = [];
        await terbitkan("PasswordResetRequested", siswa, { permintaan_id: 91, user_id: String(siswa) }, dijadwalkan);
        expect(await penerima("NT-37")).toEqual([admin, admin2].sort((a, b) => a - b));
        const [n] = await notif("NT-37");
        expect(n).toMatchObject({ isi: "Budi Siswa mengajukan reset password.", deep_link: "/permintaan-reset-password", wajib: true, jenis: "AKUN_SISTEM" });
        expect(dijadwalkan).toHaveLength(2);
    });

    it("NT-38: password sementara → HANYA Administrator penerbit (`oleh`); in-app saja, tanpa push", async () => {
        const dijadwalkan: number[] = [];
        await terbitkan("PasswordResetIssued", siswa, { permintaan_id: 91, user_id: String(siswa), oleh: String(admin2), kedaluwarsa_pada: "2026-10-03T07:05:00.000Z" }, dijadwalkan);
        expect(await penerima("NT-38")).toEqual([admin2]);
        expect((await notif("NT-38"))[0]?.isi).toBe("Password sementara untuk Budi Siswa diterbitkan 30 September 2026 14.05 WIB. Serahkan langsung kepada yang bersangkutan.");
        expect(dijadwalkan).toEqual([]);
    });

    it("NT-38a: password diganti setelah reset → pengguna itu sendiri; push", async () => {
        const dijadwalkan: number[] = [];
        await terbitkan("PasswordChangedAfterReset", siswa, { user_id: String(siswa), permintaan_id: 91 }, dijadwalkan);
        expect(await penerima("NT-38a")).toEqual([siswa]);
        expect((await notif("NT-38a"))[0]).toMatchObject({ isi: "Password Anda berhasil diperbarui pada 30 September 2026 14.05 WIB. Bila ini bukan Anda, segera hubungi Administrator.", deep_link: "/profil" });
        expect(dijadwalkan).toHaveLength(1);
    });

    it("NT-39: akun terkunci → pemilik akun (ke profil) + Administrator (ke detail pengguna); tanpa push", async () => {
        const dijadwalkan: number[] = [];
        await terbitkan("AccountLocked", siswa, { user_id: String(siswa), terkunci_sampai: "2026-09-30T07:20:00.000Z" }, dijadwalkan);
        const semua = await notif("NT-39");
        expect(semua.map((n) => [Number(n.user_id), n.deep_link]).sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual(
            [
                [siswa, "/profil"],
                [admin, `/pengguna/${String(siswa)}`],
                [admin2, `/pengguna/${String(siswa)}`],
            ].sort((a, b) => Number(a[0]) - Number(b[0])),
        );
        expect(semua.every((n) => n.isi === "Akun Budi Siswa terkunci sementara akibat 5 percobaan login gagal.")).toBe(true);
        expect(dijadwalkan).toEqual([]);
    });

    it("NT-39: Administrator yang akunnya terkunci menerimanya SEKALI (sebagai pemilik), bukan dua kali", async () => {
        await terbitkan("AccountLocked", admin, { user_id: String(admin), terkunci_sampai: "2026-09-30T07:20:00.000Z" });
        expect(await penerima("NT-39")).toEqual([admin, admin2].sort((a, b) => a - b));
        expect((await notif("NT-39")).find((n) => Number(n.user_id) === admin)?.deep_link).toBe("/profil");
    });

    it("NT-39a: 2FA diaktifkan → Administrator; menyebut platform sesi (keputusan 87d); tanpa platform frasa dilewati", async () => {
        const dijadwalkan: number[] = [];
        await terbitkan("TwoFactorEnabled", pimpinan, { user_id: String(pimpinan), sesi_dicabut: 1, platform: "ANDROID" }, dijadwalkan);
        expect(await penerima("NT-39a")).toEqual([admin, admin2].sort((a, b) => a - b));
        expect((await notif("NT-39a"))[0]).toMatchObject({
            isi: "Kepala Sekolah mengaktifkan 2FA pada 30 September 2026 14.05 WIB dari Android. Bila pengguna tidak mengenalinya, reset 2FA dari detail pengguna.",
            deep_link: `/pengguna/${String(pimpinan)}`,
        });
        expect(dijadwalkan).toEqual([]);
        await kueri("DELETE FROM notifications");
        await terbitkan("TwoFactorEnabled", pimpinan, { user_id: String(pimpinan), sesi_dicabut: 0, platform: null });
        expect((await notif("NT-39a"))[0]?.isi).toBe("Kepala Sekolah mengaktifkan 2FA pada 30 September 2026 14.05 WIB. Bila pengguna tidak mengenalinya, reset 2FA dari detail pengguna.");
    });

    it("NT-53: break-glass → seluruh Pimpinan Sekolah AKTIF (bukan Administrator); push", async () => {
        const dijadwalkan: number[] = [];
        await terbitkan("AdminBreakGlassRecovery", admin, { user_id: String(admin), email: "admin@sekolah.sch.id", dipaksa: false, sesi_dicabut: 3 }, dijadwalkan);
        expect(await penerima("NT-53")).toEqual([pimpinan]);
        expect((await notif("NT-53"))[0]?.isi).toBe("Pemulihan darurat dijalankan untuk akun Administrator admin@sekolah.sch.id pada 30 September 2026 14.05 WIB. Seluruh sesi di sistem telah dikeluarkan; pastikan ini sah.");
        expect(dijadwalkan).toHaveLength(1);
    });

    it("NT-54: pemakaian ulang refresh token → Administrator; push generik (keputusan 87a/87c)", async () => {
        const dijadwalkan: number[] = [];
        await terbitkan("RefreshTokenReuseDetected", siswa, { user_id: String(siswa), family_id: randomUUID(), token_dicabut: 2 }, dijadwalkan);
        expect(await penerima("NT-54")).toEqual([admin, admin2].sort((a, b) => a - b));
        expect((await notif("NT-54"))[0]).toMatchObject({
            isi: "Pemakaian ulang token sesi terdeteksi pada akun Budi Siswa pada 30 September 2026 14.05 WIB. Seluruh sesi turunannya telah dicabut; bila berulang, periksa akun ini.",
            deep_link: `/pengguna/${String(siswa)}`,
            wajib: true,
        });
        expect(dijadwalkan).toHaveLength(2);
        expect(TEMPLAT["NT-54"]?.isiPush).not.toContain("Budi");
    });

    it("idempoten: event yang diproses ulang (at-least-once, SDD-EVT-07) tidak menggandakan notifikasi", async () => {
        await terbitkan("PasswordResetRequested", siswa, { permintaan_id: 92, user_id: String(siswa) });
        const [ev] = await kueri<{ id: string }>("SELECT id::text FROM event_outbox WHERE event_name = 'PasswordResetRequested' ORDER BY id DESC LIMIT 1");
        await kueri(`UPDATE event_outbox SET processed_at = NULL WHERE id = ${String(ev?.id)}`);
        const registry = new EventHandlerRegistry();
        pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => pelaku });
        await new OutboxDispatcher({ registry, clock, db: getDb(), logger: new Logger({ clock, tulis: () => undefined }) }).drain();
        expect(await penerima("NT-37")).toEqual([admin, admin2].sort((a, b) => a - b));
    });

    it("ketujuh event M-01 terpasang di worker sungguhan (SDD-08 §4.2a)", () => {
        for (const e of ["PasswordResetRequested", "PasswordResetIssued", "PasswordChangedAfterReset", "AccountLocked", "TwoFactorEnabled", "AdminBreakGlassRecovery", "RefreshTokenReuseDetected"]) {
            expect(eventHandlers.handlersFor(e).length, e).toBeGreaterThan(0);
        }
    });

    it("kanal katalog: kode \"In-app\" M-02 (NT-40/48/52) tidak lagi dipush; kode push M-10 tetap (keputusan 87b)", () => {
        expect(["NT-40", "NT-48", "NT-52", "NT-38", "NT-39", "NT-39a"].map((k) => TEMPLAT[k]?.push)).toEqual([false, false, false, false, false, false]);
        expect(["NT-02", "NT-03", "NT-04", "NT-05", "NT-06", "NT-07", "NT-47", "NT-37", "NT-38a", "NT-53", "NT-54"].every((k) => TEMPLAT[k]?.push === true)).toBe(true);
    });
});
