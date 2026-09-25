// Penghentian proses yang rapi — drain worker `SDD-INF-05` dan penggantian
// instance API `SDD-INF-04` (keputusan 57–60).
//
// Mengapa berkas ini perlu: `node` sebagai PID 1 container MENGABAIKAN SIGTERM
// bila tidak ada penangkapnya. Terbukti saat audit: `docker stop -t 15` baru
// selesai pada detik ke-16 dengan exit 137 (SIGKILL), sedangkan dengan penangkap
// selesai seketika dengan exit 0. Tanpa berkas ini setiap deploy menunggu
// `stop_grace_period` penuh lalu memotong pekerjaan dan permintaan yang berjalan.
//
// Satu mekanisme untuk kedua proses (keputusan 58): yang berbeda hanya daftar
// langkahnya, milik masing-masing entrypoint.

import type { Server } from "node:http";
import type { Logger } from "../observability/index.js";

export interface LangkahHenti {
    readonly nama: string;
    jalankan(): Promise<void>;
    /**
     * Dipanggil bila tenggat habis selagi langkah ini berjalan (keputusan 59) —
     * mis. menutup worker BullMQ tanpa menunggu job aktif.
     */
    paksa?(): Promise<void>;
}

export interface OpsiPenghenti {
    /**
     * Tenggat internal, sengaja di bawah `stop_grace_period` container: proses
     * berhenti sendiri dengan jejak di log, bukan dibunuh SIGKILL tanpa jejak.
     */
    readonly batasMs: number;
    readonly logger: Logger;
}

export type Sinyal = "SIGTERM" | "SIGINT";

/** Batas waktu langkah paksa setelah tenggat habis; sesudahnya proses keluar juga. */
export const BATAS_PAKSA_MS = 1_000;

/** Permukaan `process` yang dipakai — dipersempit agar uji tidak menyentuh proses nyata. */
export interface ProsesTarget {
    once(sinyal: Sinyal, penangkap: () => void): unknown;
    exit(kode: number): void;
}

/** Kode keluar: 0 bila seluruh langkah selesai, 1 bila ada yang gagal atau tenggat habis. */
export type KodeKeluar = 0 | 1;

export class Penghenti {
    private berjalan: Promise<KodeKeluar> | undefined;

    constructor(
        private readonly langkah: readonly LangkahHenti[],
        private readonly opsi: OpsiPenghenti,
    ) {}

    /**
     * Menjalankan seluruh langkah tepat sekali. Panggilan berikutnya — mis. SIGINT
     * menyusul SIGTERM — menunggu penghentian yang sama, bukan memulai yang kedua.
     */
    hentikan(sebab: string): Promise<KodeKeluar> {
        this.berjalan ??= this.jalankan(sebab);
        return this.berjalan;
    }

    /** Memasang penangkap sinyal. Hanya dipanggil penjaga entrypoint, tidak pernah oleh uji. */
    pasang(proses: ProsesTarget = process): void {
        for (const sinyal of ["SIGTERM", "SIGINT"] as const) {
            proses.once(sinyal, () => {
                void this.hentikan(sinyal).then((kode) => proses.exit(kode));
            });
        }
    }

    private async jalankan(sebab: string): Promise<KodeKeluar> {
        const { batasMs, logger } = this.opsi;
        logger.info("Proses berhenti — drain dimulai", {
            sebab,
            batas_ms: batasMs,
        });

        let aktif: LangkahHenti | undefined;
        let kode: KodeKeluar = 0;
        let habis = false;

        const urutan = (async () => {
            for (const l of this.langkah) {
                if (habis) return;
                aktif = l;
                try {
                    await l.jalankan();
                } catch (galat) {
                    // Langkah berikutnya tetap dijalankan: koneksi yang tidak ditutup
                    // karena langkah sebelumnya gagal hanya menambah kerusakan.
                    kode = 1;
                    logger.error(`Langkah henti "${l.nama}" gagal`, galat);
                }
            }
            aktif = undefined;
        })();

        let timer: ReturnType<typeof setTimeout> | undefined;
        const tenggat = new Promise<"habis">((selesai) => {
            timer = setTimeout(() => selesai("habis"), batasMs);
        });
        const hasil = await Promise.race([
            urutan.then(() => "selesai" as const),
            tenggat,
        ]);
        clearTimeout(timer);

        if (hasil === "habis") {
            habis = true;
            const terpotong: LangkahHenti | undefined = aktif;
            logger.warn("Tenggat drain habis — penghentian dipaksa", {
                langkah: terpotong?.nama ?? null,
                batas_ms: batasMs,
            });
            // Pemaksaan pun dibatasi: langkah paksa yang ikut menggantung — mis.
            // `Worker.close(true)` yang mengembalikan promise penutupan yang sudah
            // menunggu job aktif — tidak boleh menahan proses sampai SIGKILL.
            let timerPaksa: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([
                    terpotong?.paksa?.(),
                    new Promise<void>((selesai) => {
                        timerPaksa = setTimeout(selesai, BATAS_PAKSA_MS);
                    }),
                ]);
            } catch (galat) {
                logger.error("Pemaksaan penghentian gagal", galat);
            } finally {
                clearTimeout(timerPaksa);
            }
            return 1;
        }

        if (kode === 0) logger.info("Proses berhenti dengan rapi", { sebab });
        return kode;
    }
}

/** Jeda penyapuan koneksi keep-alive yang menganggur selama server menutup. */
const SAPU_IDLE_MS = 100;

/**
 * Menutup server HTTP tanpa memotong permintaan yang sedang berjalan.
 *
 * Sejak dipanggil: port berhenti menerima koneksi baru (proxy berpindah ke
 * instance lain), permintaan yang tiba lewat koneksi keep-alive lama dijawab
 * dengan `Connection: close`, dan koneksi yang menganggur ditutup.
 *
 * Penyapuan diulang, bukan sekali: `server.close()` hanya menutup koneksi yang
 * menganggur SAAT dipanggil. Koneksi yang baru menganggur setelah respons
 * berjalannya selesai akan bertahan sampai `keepAliveTimeout` — dan selama itu
 * proxy masih dapat mengirim permintaan baru lewatnya.
 */
export function tutupServer(server: Server): Promise<void> {
    return new Promise((selesai, gagal) => {
        server.on("request", (_req, res) => {
            res.setHeader("Connection", "close");
        });
        const penyapu = setInterval(
            () => server.closeIdleConnections(),
            SAPU_IDLE_MS,
        );
        server.close((galat) => {
            clearInterval(penyapu);
            const kode = (galat as NodeJS.ErrnoException | undefined)?.code;
            if (galat !== undefined && kode !== "ERR_SERVER_NOT_RUNNING")
                gagal(galat);
            else selesai();
        });
        server.closeIdleConnections();
    });
}
