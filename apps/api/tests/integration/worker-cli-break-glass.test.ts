// PR-02-08 — CLI break-glass (FR-01.6, BR-070b) dan kode aktivasi 2FA darurat (FR-01.5 A6,
// BR-070d) terhadap PostgreSQL nyata. Dijalankan lewat `BreakGlassCli` yang sama dengan yang
// dirakit `rakitCli()`/`jalankanPerintah()` di `worker/cli.ts` — bukan proses `node` terpisah,
// karena yang diuji adalah LOGIKA-nya (basis data, audit, outbox), bukan penguraian shell.
//
// Yang dibuktikan: hanya akun Administrator (R-01) AKTIF yang dapat dipulihkan; ditolak bila ada
// Administrator LAIN yang aktif dan login < 24 jam kecuali --force (dicatat); 2FA dilepas + kode
// cadangan dan kode aktivasi lama dihapus; password sementara DAN kode aktivasi baru diterbitkan
// (tampil satu kali, tak pernah masuk log); SELURUH sesi DI SISTEM tercabut — termasuk milik
// pengguna LAIN yang sama sekali tidak disentuh alur mana pun sebelumnya; pelaku activity log
// adalah `SYSTEM:CLI` (bukan `SYSTEM` pekerjaan terjadwal, bukan baris `users` mana pun); event
// outbox terbit dalam transaksi yang sama; alarm OBS-05 tercatat setelah commit.

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
    AdaAdminLainAktif,
    AkunTidakAktif,
    BukanAdministrator,
    BukanRoleWajibDuaFaktor,
    DuaFaktorSudahAktif,
    TargetTidakDitemukan,
    buatBreakGlassCli,
} from "../../src/modules/m01-auth/index.js";
import type { BreakGlassCli } from "../../src/modules/m01-auth/index.js";
import { jalankanPerintah } from "../../src/worker/cli.js";
import { AuditLogger, ensurePartitions } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { hashPassword, verifyPassword } from "../../src/shared/security/index.js";
import { daftarkanTotpUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const T0 = new Date("2026-09-25T03:00:00Z");
const JAM = 3_600_000;

interface AkunUji {
    readonly id: number;
    readonly email: string;
}

describe.skipIf(!ADA)("PR-02-08 — CLI break-glass + kode aktivasi darurat (PostgreSQL nyata)", () => {
    let clock: FixedClock;
    let cli: BreakGlassCli;
    let audit: AuditLogger;
    let peringatan: { pesan: string; field?: Record<string, unknown> }[];
    let hashSandi: string;
    // Dibersihkan sesudah SETIAP uji (`afterEach`), bukan hanya di akhir berkas: guard "ada
    // Administrator lain aktif" (FR-01.6 AC) memindai SELURUH tabel `users`, sehingga akun R-01
    // yang ditinggalkan satu uji akan mencemari uji berikutnya bila baru dibersihkan di `afterAll`.
    let idPengguna: number[] = [];

    beforeAll(async () => {
        dbmate("up");
        clock = new FixedClock(T0);
        await ensurePartitions(getDb(), clock);
        hashSandi = await hashPassword("Sandi-Lama-Tidak-Terpakai-1");
        peringatan = [];
        const logger = new Logger({
            clock,
            modulBawaan: "cli-uji",
            // OBS-05: menangkap alarm tanpa menulis ke stdout selama uji.
            tulis: (baris) => {
                const entri = JSON.parse(baris) as { level: string; msg: string; [k: string]: unknown };
                if (entri.level === "warn") peringatan.push({ pesan: entri.msg, field: entri });
            },
        });
        audit = new AuditLogger({ clock, logger });
        cli = buatBreakGlassCli({ db: getDb(), auditLogger: audit, clock, logger });
    });

    async function bersihkanPengguna(): Promise<void> {
        if (idPengguna.length === 0) return;
        const daftar = idPengguna.join(",");
        await kueri(`DELETE FROM event_outbox WHERE event_name IN ('SessionRevoked', 'AdminBreakGlassRecovery') AND aggregate_id IN (${daftar})`);
        await kueri(`DELETE FROM refresh_tokens WHERE user_id IN (${daftar})`);
        await kueri(`DELETE FROM totp_backup_codes WHERE user_id IN (${daftar})`);
        await kueri(`DELETE FROM totp_activation_codes WHERE user_id IN (${daftar}) OR issued_by IN (${daftar})`);
        await kueri(`DELETE FROM activity_logs WHERE modul = 'm01-auth' AND (entitas_id IN (${daftar}) OR user_id IN (${daftar}))`);
        await kueri(`DELETE FROM users WHERE id IN (${daftar})`);
        idPengguna = [];
        peringatan = [];
    }

    afterEach(bersihkanPengguna);
    afterAll(bersihkanPengguna);

    async function seed(role: string, opsi: { status?: "AKTIF" | "NONAKTIF"; loginTerakhir?: Date | null } = {}): Promise<AkunUji> {
        const email = `cli-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
        const [baris] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password, login_terakhir_pada)
            VALUES ('Uji CLI', '${email}', '${hashSandi}', 'NIPCLI${randomUUID().replace(/-/g, "").slice(0, 12)}',
                    (SELECT id FROM roles WHERE kode = '${role}'), '${opsi.status ?? "AKTIF"}', false,
                    ${opsi.loginTerakhir === undefined ? "now()" : opsi.loginTerakhir === null ? "NULL" : `'${opsi.loginTerakhir.toISOString()}'`})
            RETURNING id::text`);
        if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
        const id = Number(baris.id);
        idPengguna.push(id);
        return { id, email };
    }

    async function seedRefreshToken(userId: number): Promise<string> {
        const fam = randomUUID();
        await kueri(`INSERT INTO refresh_tokens (user_id, family_id, token_hash, platform, expires_at)
            VALUES (${String(userId)}, '${fam}', decode('${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}', 'hex'), 'ANDROID', now() + interval '1 day')`);
        return fam;
    }

    const baris = <T extends Record<string, unknown>>(sql: string): Promise<T[]> => kueri<T>(sql);
    const userState = async (id: number) =>
        (await baris<{ hash: string; wajib_ganti: boolean; enc: Buffer | null; aktif: string | null; langkah: number | null }>(
            `SELECT password_hash AS hash, must_change_password AS wajib_ganti, totp_secret_enc AS enc, totp_enabled_at::text AS aktif, totp_last_step AS langkah FROM users WHERE id = ${String(id)}`,
        ))[0];
    const kodeAktivasiAktif = async (id: number) =>
        (await baris<{ hash: string; issued_by: string | null; metode: string | null; verified_at: string | null; berlaku_jam: number }>(
            `SELECT code_hash AS hash, issued_by::text AS issued_by, metode_verifikasi::text AS metode, verified_at::text,
                    EXTRACT(EPOCH FROM (expires_at - issued_at))::float / 3600 AS berlaku_jam
             FROM totp_activation_codes WHERE user_id = ${String(id)} AND consumed_at IS NULL`,
        ))[0];
    const auditPelaku = (id: number, aksi: string) =>
        baris<{ user_id: string | null; user_nama: string | null; role: string | null; nilai: string; teks: string }>(
            `SELECT user_id::text, user_nama, role, nilai_sesudah::text AS nilai, activity_logs::text AS teks
             FROM activity_logs WHERE modul = 'm01-auth' AND aksi = '${aksi}' AND entitas_id = ${String(id)}`,
        );
    const eventOutbox = (id: number, nama: string) =>
        baris<{ payload: string; actor_id: string | null }>(
            `SELECT payload::text AS payload, actor_id::text FROM event_outbox WHERE aggregate_id = ${String(id)} AND event_name = '${nama}' ORDER BY id`,
        );
    const sesiAktif = async (userId: number) =>
        (await baris<{ n: string }>(`SELECT count(*)::text AS n FROM refresh_tokens WHERE user_id = ${String(userId)} AND revoked_at IS NULL`))[0]?.n;

    // ---------------------------------------------------------------------------------------------
    describe("admin:recover — pemulihan darurat (FR-01.6, SDD-04 §4.5)", () => {
        it("sukses: 2FA dilepas, kode cadangan+aktivasi lama hilang, password+kode baru terbit, SELURUH sesi sistem tercabut", async () => {
            const target = await seed("R-01", { loginTerakhir: null });
            await daftarkanTotpUji(getDb(), target.id, clock.now());
            await kueri(`UPDATE users SET totp_last_step = 9 WHERE id = ${String(target.id)}`);
            await kueri(`INSERT INTO totp_activation_codes (user_id, code_hash, issued_at, expires_at)
                VALUES (${String(target.id)}, 'sisa-lama', now(), now() + interval '1 day')`);
            const famTarget = await seedRefreshToken(target.id);

            // pihak KETIGA yang tak tersentuh alur mana pun — membuktikan pencabutan benar-benar
            // lintas sistem, bukan hanya milik target.
            const lain = await seed("R-05");
            const famLain = await seedRefreshToken(lain.id);
            const famLainDicabutDuluan = randomUUID();
            await kueri(`INSERT INTO refresh_tokens (user_id, family_id, token_hash, platform, expires_at, revoked_at, revoke_reason)
                VALUES (${String(lain.id)}, '${famLainDicabutDuluan}', decode('${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}', 'hex'), 'IOS', now() + interval '1 day', now(), 'logout')`);

            const keluaran: string[] = [];
            await jalankanPerintah(cli, { perintah: "admin:recover", email: target.email.toUpperCase(), paksa: false }, (b) => keluaran.push(b));

            const teks = keluaran.join("\n");
            expect(teks).toContain(target.email);
            expect(teks).toContain(`id ${String(target.id)}`);
            expect(teks).toContain("Sesi dicabut di seluruh sistem: 2.");
            expect(teks).not.toContain("--force");

            // `.*` (bukan `[^:]*`): keterangan memuat timestamp ISO yang sendiri mengandung `:`.
            const [, passwordLine] = /Password sementara.*\): (\S+)/.exec(teks) ?? [];
            const [, kodeLine] = /Kode aktivasi 2FA.*\): (\S+)/.exec(teks) ?? [];
            expect(passwordLine).toBeDefined();
            expect(kodeLine).toBeDefined();

            const u = await userState(target.id);
            expect(u).toMatchObject({ wajib_ganti: true, enc: null, aktif: null, langkah: null });
            expect(await verifyPassword(u?.hash ?? "", passwordLine ?? "")).toBe(true);
            expect(await baris(`SELECT 1 FROM totp_backup_codes WHERE user_id = ${String(target.id)}`)).toHaveLength(0);

            const kode = await kodeAktivasiAktif(target.id);
            expect(kode).toMatchObject({ issued_by: null, metode: null });
            expect(kode?.verified_at).toBeNull();
            expect(kode?.berlaku_jam).toBe(72);
            expect(await verifyPassword(kode?.hash ?? "", (kodeLine ?? "").replace("-", ""))).toBe(true);
            expect(await baris(`SELECT 1 FROM totp_activation_codes WHERE user_id = ${String(target.id)} AND code_hash = 'sisa-lama'`)).toHaveLength(0);

            // SELURUH sistem, bukan hanya target: kedua keluarga (target dan pihak ketiga) tercabut.
            expect(await sesiAktif(target.id)).toBe("0");
            expect(await sesiAktif(lain.id)).toBe("0");
            const famTargetRow = await baris<{ alasan: string | null }>(`SELECT revoke_reason AS alasan FROM refresh_tokens WHERE family_id = '${famTarget}'`);
            const famLainRow = await baris<{ alasan: string | null }>(`SELECT revoke_reason AS alasan FROM refresh_tokens WHERE family_id = '${famLain}'`);
            expect(famTargetRow[0]?.alasan).toBe("admin_break_glass_recovery");
            expect(famLainRow[0]?.alasan).toBe("admin_break_glass_recovery");
            // baris yang SUDAH tercabut sebelumnya (logout) TIDAK ditimpa alasannya.
            const famDuluanRow = await baris<{ alasan: string | null }>(`SELECT revoke_reason AS alasan FROM refresh_tokens WHERE family_id = '${famLainDicabutDuluan}'`);
            expect(famDuluanRow[0]?.alasan).toBe("logout");

            // audit: pelaku SYSTEM:CLI, bukan target, bukan SYSTEM pekerjaan terjadwal; TANPA nilai password/kode.
            const [log] = await auditPelaku(target.id, "ADMIN_BREAK_GLASS_RECOVERY");
            expect(log).toMatchObject({ user_id: null, user_nama: "SYSTEM:CLI", role: "SYSTEM:CLI" });
            expect(JSON.parse(log?.nilai ?? "{}")).toMatchObject({ email: target.email, dipaksa: false, sesi_dicabut: 2 });
            expect(log?.teks).not.toContain(passwordLine);
            expect(log?.teks).not.toContain(kodeLine);
            expect(log?.teks).not.toContain((kodeLine ?? "").replace("-", ""));

            // event outbox: SessionRevoked per keluarga (dua) + satu AdminBreakGlassRecovery, dalam transaksi yang sama.
            const evRecovery = await eventOutbox(target.id, "AdminBreakGlassRecovery");
            expect(evRecovery).toHaveLength(1);
            expect(JSON.parse(evRecovery[0]?.payload ?? "{}")).toMatchObject({ dipaksa: false, sesi_dicabut: 2 });
            const evSesiTarget = await eventOutbox(target.id, "SessionRevoked");
            const evSesiLain = await eventOutbox(lain.id, "SessionRevoked");
            expect(evSesiTarget).toHaveLength(1);
            expect(evSesiLain).toHaveLength(1);

            // OBS-05: alarm tercatat SETELAH commit.
            expect(peringatan.some((p) => p.pesan.includes("Break-glass") && p.field?.["user_id"] === String(target.id))).toBe(true);
        });

        it("ditolak bila ADA Administrator lain aktif login < 24 jam — TANPA menyentuh apa pun; --force melewatinya dan tercatat", async () => {
            const target = await seed("R-01", { loginTerakhir: null });
            const lainAktif = await seed("R-01", { loginTerakhir: new Date(clock.now().getTime() - JAM) });
            void lainAktif;

            await expect(cli.pulihkan(target.email, false)).rejects.toThrow(AdaAdminLainAktif);
            expect((await userState(target.id))?.wajib_ganti).toBe(false);
            expect(await kodeAktivasiAktif(target.id)).toBeUndefined();

            const hasil = await cli.pulihkan(target.email, true);
            expect(hasil.dipaksa).toBe(true);
            const [log] = await auditPelaku(target.id, "ADMIN_BREAK_GLASS_RECOVERY");
            expect(JSON.parse(log?.nilai ?? "{}")).toMatchObject({ dipaksa: true });
        });

        it("Administrator lain yang login TEPAT 24 jam yang lalu masih dianggap 'aktif baru' (batas inklusif)", async () => {
            const target = await seed("R-01", { loginTerakhir: null });
            await seed("R-01", { loginTerakhir: new Date(clock.now().getTime() - 24 * JAM) });
            await expect(cli.pulihkan(target.email, false)).rejects.toThrow(AdaAdminLainAktif);
        });

        it("Administrator lain yang login LEBIH dari 24 jam lalu, atau NONAKTIF, atau tak pernah login, TIDAK memicu penolakan", async () => {
            const target = await seed("R-01", { loginTerakhir: null });
            await seed("R-01", { loginTerakhir: new Date(clock.now().getTime() - 24 * JAM - 1000) });
            await seed("R-01", { status: "NONAKTIF", loginTerakhir: new Date(clock.now().getTime() - JAM) });
            await seed("R-01", { loginTerakhir: null });
            await expect(cli.pulihkan(target.email, false)).resolves.toBeDefined();
        });

        it("target sendiri tidak dihitung sebagai 'Administrator lain' walau login_terakhir_pada-nya baru", async () => {
            const target = await seed("R-01", { loginTerakhir: new Date(clock.now().getTime() - JAM) });
            await expect(cli.pulihkan(target.email, false)).resolves.toBeDefined();
        });

        it("penolakan: tidak ditemukan, bukan Administrator (R-03), akun NONAKTIF — tanpa menyentuh apa pun", async () => {
            await expect(cli.pulihkan("tidak-ada@sekolah.sch.id", false)).rejects.toThrow(TargetTidakDitemukan);

            const pimpinan = await seed("R-03");
            await expect(cli.pulihkan(pimpinan.email, false)).rejects.toThrow(BukanAdministrator);
            expect((await userState(pimpinan.id))?.wajib_ganti).toBe(false);

            const nonaktif = await seed("R-01", { status: "NONAKTIF" });
            await expect(cli.pulihkan(nonaktif.email, false)).rejects.toThrow(AkunTidakAktif);
            expect((await userState(nonaktif.id))?.wajib_ganti).toBe(false);
        });

        it("password sementara TIDAK memuat potongan nama/email/NIP target (kebijakan NFR-S-03a tetap berlaku)", async () => {
            const target = await seed("R-01", { loginTerakhir: null });
            const hasil = await cli.pulihkan(target.email, false);
            const lokal = target.email.split("@")[0]?.toLowerCase() ?? "";
            expect(hasil.passwordSementara.toLowerCase()).not.toContain(lokal);
        });
    });

    // ---------------------------------------------------------------------------------------------
    describe("admin:activation-code — kode aktivasi darurat (FR-01.5 A6, BR-070d)", () => {
        it("sukses untuk R-01 dan R-03 yang belum ber-2FA: issued_by/metode NULL, menggantikan kode lama, tanpa alarm/sesi tersentuh", async () => {
            for (const role of ["R-01", "R-03"]) {
                const target = await seed(role);
                const famSebelum = await seedRefreshToken(target.id);
                await kueri(`INSERT INTO totp_activation_codes (user_id, code_hash, issued_at, expires_at)
                    VALUES (${String(target.id)}, 'sisa-lama-${role}', now(), now() + interval '1 day')`);

                const keluaran: string[] = [];
                await jalankanPerintah(cli, { perintah: "admin:activation-code", email: target.email, paksa: false }, (b) => keluaran.push(b));
                const teks = keluaran.join("\n");
                const [, kodeLine] = /Kode \(TAMPIL.*\): (\S+)/.exec(teks) ?? [];
                expect(kodeLine, role).toBeDefined();

                const kode = await kodeAktivasiAktif(target.id);
                expect(kode, role).toMatchObject({ issued_by: null, metode: null, verified_at: null });
                expect(kode?.berlaku_jam, role).toBe(72);
                expect(await verifyPassword(kode?.hash ?? "", (kodeLine ?? "").replace("-", "")), role).toBe(true);
                expect(await baris(`SELECT 1 FROM totp_activation_codes WHERE user_id = ${String(target.id)} AND code_hash = 'sisa-lama-${role}'`), role).toHaveLength(0);
                expect(await baris(`SELECT 1 FROM totp_activation_codes WHERE user_id = ${String(target.id)} AND consumed_at IS NULL`), role).toHaveLength(1);

                // TIDAK ada dampak di luar tabel kode aktivasi: sesi dan password tak tersentuh.
                expect(await sesiAktif(target.id), role).toBe("1");
                const famRow = await baris<{ alasan: string | null }>(`SELECT revoke_reason AS alasan FROM refresh_tokens WHERE family_id = '${famSebelum}'`);
                expect(famRow[0]?.alasan, role).toBeNull();
                expect((await userState(target.id))?.wajib_ganti, role).toBe(false);

                const [log] = await auditPelaku(target.id, "TWO_FA_ACTIVATION_CODE_ISSUED");
                expect(log, role).toMatchObject({ user_id: null, user_nama: "SYSTEM:CLI", role: "SYSTEM:CLI" });
                expect(log?.teks, role).not.toContain(kodeLine);
            }
        });

        it("penolakan: tidak ditemukan, NONAKTIF, role opsional (R-05), sudah ber-2FA — tanpa menyisipkan kode", async () => {
            await expect(cli.terbitkanKodeAktivasi("tidak-ada@sekolah.sch.id")).rejects.toThrow(TargetTidakDitemukan);

            const nonaktif = await seed("R-01", { status: "NONAKTIF" });
            await expect(cli.terbitkanKodeAktivasi(nonaktif.email)).rejects.toThrow(AkunTidakAktif);

            const guru = await seed("R-05");
            await expect(cli.terbitkanKodeAktivasi(guru.email)).rejects.toThrow(BukanRoleWajibDuaFaktor);

            const sudah = await seed("R-01");
            await daftarkanTotpUji(getDb(), sudah.id, clock.now());
            await expect(cli.terbitkanKodeAktivasi(sudah.email)).rejects.toThrow(DuaFaktorSudahAktif);

            for (const u of [nonaktif, guru, sudah]) {
                expect(await kodeAktivasiAktif(u.id), u.email).toBeUndefined();
            }
        });
    });

    // ---------------------------------------------------------------------------------------------
    describe("uji-mutasi tambahan: batas guard 24 jam persis di tepi", () => {
        it("23 jam 59 menit yang lalu (di dalam jendela) tetap ditolak", async () => {
            const target = await seed("R-01", { loginTerakhir: null });
            await seed("R-01", { loginTerakhir: new Date(clock.now().getTime() - (24 * JAM - 60_000)) });
            await expect(cli.pulihkan(target.email, false)).rejects.toThrow(AdaAdminLainAktif);
        });
    });
});
