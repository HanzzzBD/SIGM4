// Perintah CLI pada artefak worker (`SDD-SESS-11`, `PR-02-08`): pemulihan darurat Administrator
// (`FR-01.6`, `BR-070b`) dan kode aktivasi 2FA darurat (`FR-01.5 A6`, `BR-070d`).
//
// TIDAK PERNAH terdaftar sebagai route HTTP — berkas ini bukan bagian `apps/api/src/api/`,
// tidak membuka port, dan tidak dapat dijangkau lewat web maupun API (SDD-SESS-11, BR-070b).
// Satu-satunya jalan menjalankannya adalah akses shell ke server yang menjalankan image ini
// (`sigm4-worker`, `SDD-SYS-01`): itulah kontrol akses yang dimaksud BR-070b, bukan permission
// RBAC — sehingga berkas ini TIDAK menyentuh lapisan permission/`AuthContext` HTTP sama sekali.
//
//   node apps/api/dist/worker/cli.js admin:recover --email=<email> [--force]
//   node apps/api/dist/worker/cli.js admin:activation-code --email=<email>
//
// Business logic hidup di `modules/m01-auth` (`BreakGlassService`, dipanggil lewat pintu
// `buatBreakGlassCli` — SDD-SYS-03: berkas ini tidak mengimpor internal m01-auth). Di sini
// hanya penguraian argumen, perakitan konfigurasi/koneksi, dan pencetakan hasil.

import { pathToFileURL } from "node:url";
import { AuditLogger } from "../shared/audit/index.js";
import { SystemClock } from "../shared/clock/index.js";
import { readWorkerConfig, zonaProses } from "../shared/config/index.js";
import { ConfigError } from "../shared/config/index.js";
import { assertDatabaseTimeZoneUtc, closeDb, getDb } from "../shared/db/index.js";
import { GalatCli, buatBreakGlassCli } from "../modules/m01-auth/index.js";
import type { BreakGlassCli } from "../modules/m01-auth/index.js";
import { Logger } from "../shared/observability/index.js";

const PERINTAH_DIKENAL = ["admin:recover", "admin:activation-code"] as const;
type Perintah = (typeof PERINTAH_DIKENAL)[number];

export interface OpsiCli {
    readonly perintah: Perintah;
    readonly email: string;
    /** Hanya berlaku bagi `admin:recover` (FR-01.6 AC); diabaikan perintah lain. */
    readonly paksa: boolean;
}

export class GalatArgumenCli extends Error {}

/** Penguraian argumen murni — tanpa I/O, sehingga dapat diuji tanpa basis data. */
export function uraiArgumen(argv: readonly string[]): OpsiCli {
    const [perintahMentah, ...sisa] = argv;
    if (perintahMentah === undefined || !(PERINTAH_DIKENAL as readonly string[]).includes(perintahMentah)) {
        throw new GalatArgumenCli(
            `Perintah tidak dikenal. Yang tersedia: ${PERINTAH_DIKENAL.join(", ")}.`,
        );
    }
    let email: string | undefined;
    let paksa = false;
    for (const arg of sisa) {
        if (arg === "--force") {
            paksa = true;
        } else if (arg.startsWith("--email=")) {
            email = arg.slice("--email=".length).trim();
        } else {
            throw new GalatArgumenCli(`Argumen tidak dikenal: ${arg}`);
        }
    }
    if (email === undefined || email === "") {
        throw new GalatArgumenCli("--email=<email> wajib diisi.");
    }
    return { perintah: perintahMentah as Perintah, email, paksa };
}

/**
 * Menjalankan satu perintah lewat `BreakGlassCli` yang SUDAH dirakit (DB, audit, clock, logger
 * tersedia) dan mencetak hasilnya. Dipisah dari `main()` agar uji integrasi dapat memanggilnya
 * langsung terhadap PostgreSQL nyata tanpa membuka proses baru maupun memanggil `process.exit`.
 */
export async function jalankanPerintah(
    cli: BreakGlassCli,
    opsi: OpsiCli,
    tulis: (baris: string) => void = (b) => process.stdout.write(b + "\n"),
): Promise<void> {
    if (opsi.perintah === "admin:recover") {
        const hasil = await cli.pulihkan(opsi.email, opsi.paksa);
        tulis(`Break-glass recovery selesai untuk ${hasil.email} (id ${hasil.userId}).`);
        if (hasil.dipaksa) tulis("PERINGATAN: dijalankan dengan --force meski Administrator lain masih aktif.");
        tulis(`Sesi dicabut di seluruh sistem: ${String(hasil.sesiDicabut)}.`);
        tulis("");
        tulis(`Password sementara (TAMPIL SATU KALI, wajib diganti saat login): ${hasil.passwordSementara}`);
        tulis(`Kode aktivasi 2FA (TAMPIL SATU KALI, berlaku sampai ${hasil.kodeAktivasiBerlakuSampai.toISOString()}): ${hasil.kodeAktivasi}`);
        tulis("");
        tulis("Serahkan KEDUANYA langsung kepada Administrator yang bersangkutan (FR-01.6 langkah 5).");
        tulis("Setelah login: ganti password, daftarkan ulang 2FA dengan kode di atas, lalu WAJIB pastikan");
        tulis("minimal dua akun Administrator aktif (RS-19, BR-070a) sebelum menutup insiden ini.");
        return;
    }
    const hasil = await cli.terbitkanKodeAktivasi(opsi.email);
    tulis(`Kode aktivasi 2FA diterbitkan untuk ${hasil.email} (id ${hasil.userId}).`);
    tulis(`Kode (TAMPIL SATU KALI, berlaku sampai ${hasil.berlakuSampai.toISOString()}): ${hasil.kodeAktivasi}`);
    tulis("Serahkan langsung kepada pemilik akun; sistem tidak menyimpan nilainya di mana pun.");
}

/** Merakit `BreakGlassCli` dari konfigurasi lingkungan (`SDD-INF-08/09`) — dipisah agar diuji tanpa argv. */
export async function rakitCli(env: NodeJS.ProcessEnv = process.env, zona: string = zonaProses()): Promise<BreakGlassCli> {
    const config = readWorkerConfig(env, zona);
    await assertDatabaseTimeZoneUtc(getDb());
    const clock = new SystemClock();
    const logger = new Logger({ clock, modulBawaan: "cli", level: config.logLevel });
    const audit = new AuditLogger({ clock, logger });
    return buatBreakGlassCli({ db: getDb(), auditLogger: audit, clock, logger });
}

/**
 * Entrypoint proses. Mengembalikan kode keluar, tidak pernah memanggilnya sendiri — pemanggil
 * di bawah (guard `import.meta.url`) yang memutuskan `process.exit`, sama seperti `worker/index.ts`.
 */
export async function main(
    argv: readonly string[] = process.argv.slice(2),
    env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
    let opsi: OpsiCli;
    try {
        opsi = uraiArgumen(argv);
    } catch (galat) {
        console.error(galat instanceof Error ? galat.message : String(galat));
        console.error(`Pemakaian: node apps/api/dist/worker/cli.js <${PERINTAH_DIKENAL.join("|")}> --email=<email> [--force]`);
        return 1;
    }
    try {
        const cli = await rakitCli(env);
        try {
            await jalankanPerintah(cli, opsi);
            return 0;
        } finally {
            await closeDb();
        }
    } catch (galat) {
        if (galat instanceof ConfigError || galat instanceof GalatCli) {
            console.error(galat.message);
            return 1;
        }
        throw galat;
    }
}

// Hanya bila berkas ini dijalankan sebagai proses (perintah pada compose/shell operator),
// bukan saat diimpor uji — pola yang sama dengan `worker/index.ts` (SDD-SYS-08).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
        .then((kode) => process.exit(kode))
        .catch((galat: unknown) => {
            new Logger({ clock: new SystemClock(), modulBawaan: "cli", level: "error" }).error(
                "Perintah CLI gagal tak terduga",
                galat,
            );
            process.exit(1);
        });
}
