// Pemeriksaan kesehatan dependensi (SDD-OBS-06, OBS-06, NFR-A-07).
//
// Satu registri, tiga jawaban (SDD-15 §4.5): hidup, siap, dan ringkasan untuk
// kartu Kesehatan Integrasi. Ia berada di shared kernel karena API DAN worker
// sama-sama menjawab /health (SDD-SYS-08), sementara keduanya dilarang saling
// mengimpor (SDD-00 §4.2).
//
// Pemeriksaan didaftarkan oleh pemilik koneksinya. Phase 00 hanya punya database
// dan Redis; object storage dan AV menyusul adapter Phase 03, FCM `PR-02-27`,
// LLM `PR-03-20`.

import { performance } from "node:perf_hooks";
import type { KodeGalat } from "../errors/index.js";
import { konteksSaatIni, requestIdBaru } from "./request-context.js";

export type HealthStatus = "up" | "degraded" | "down";

export interface CheckResult {
    readonly status: HealthStatus;
    readonly latency_ms?: number;
    readonly note?: string;
    readonly queue?: number;
}

/** Katalog dependensi SDD-15 §4.5. Tertutup: nama di luar daftar ini tidak dapat didaftarkan. */
export type DependencyName =
    "database" | "redis" | "object_storage" | "av_scanner" | "fcm" | "llm";

/**
 * Dependensi yang menentukan `/health/ready` (SDD-15 §4.5). Ditetapkan di sini
 * per NAMA, bukan oleh pendaftar: adapter FCM dan LLM yang lahir kemudian tidak
 * dapat menyatakan dirinya kritis. Gangguan keduanya tidak boleh mengeluarkan
 * instance dari rotasi (`NFR-A-05`, `NFR-A-06`, `AI-CTL-10`).
 */
const MENENTUKAN_KESIAPAN: Readonly<Record<DependencyName, boolean>> = {
    database: true,
    redis: true,
    object_storage: true,
    av_scanner: false,
    fcm: false,
    llm: false,
};

export interface HealthCheck {
    readonly name: DependencyName;
    probe(): Promise<CheckResult>;
}

export interface HealthSummary {
    readonly status: HealthStatus;
    readonly checks: Partial<Record<DependencyName, CheckResult>>;
}

/**
 * Batas satu probe. Probe yang menggantung dijawab `down`, tidak ditunggu:
 * readiness dipanggil berulang oleh proxy dan skrip deploy (`SDD-INF-04`), dan
 * jawaban yang tak kunjung datang sama buruknya dengan jawaban "tidak siap".
 */
const BATAS_PROBE_MS = 2_000;

export class HealthRegistry {
    private readonly checks = new Map<DependencyName, HealthCheck>();

    constructor(private readonly batasMs: number = BATAS_PROBE_MS) {}

    register(...checks: readonly HealthCheck[]): this {
        for (const check of checks) {
            if (this.checks.has(check.name)) {
                throw new Error(
                    `Pemeriksaan kesehatan ${check.name} didaftarkan dua kali.`,
                );
            }
            this.checks.set(check.name, check);
        }
        return this;
    }

    /** Ringkasan kartu Kesehatan Integrasi (`OBS-06`): seluruh pemeriksaan dijalankan. */
    summary(): Promise<HealthSummary> {
        return this.run([...this.checks.values()]);
    }

    /**
     * Kesiapan. Pemeriksaan non-penentu tidak sekadar diabaikan hasilnya — ia
     * tidak dipanggil sama sekali, sehingga penyedia luar tidak ikut dibebani
     * probe yang berulang tiap beberapa detik.
     */
    async readiness(): Promise<boolean> {
        const penentu = [...this.checks.values()].filter(
            (c) => MENENTUKAN_KESIAPAN[c.name],
        );
        return (await this.run(penentu)).status !== "down";
    }

    private async run(checks: readonly HealthCheck[]): Promise<HealthSummary> {
        const hasil = await Promise.all(
            checks.map(async (c) => [c.name, await this.probe(c)] as const),
        );
        const entri: Partial<Record<DependencyName, CheckResult>> = {};
        let status: HealthStatus = "up";
        for (const [nama, r] of hasil) {
            entri[nama] = r;
            if (r.status === "down" && MENENTUKAN_KESIAPAN[nama])
                status = "down";
            else if (r.status !== "up" && status === "up") status = "degraded";
        }
        return { status, checks: entri };
    }

    /** Satu probe, dibatasi waktu. Galat maupun batas waktu menjadi `down` — tidak pernah dilempar (`AI-CTL-10`). */
    private async probe(check: HealthCheck): Promise<CheckResult> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const batas = new Promise<CheckResult>((resolve) => {
            timer = setTimeout(
                () =>
                    resolve({
                        status: "down",
                        note: "tidak merespons dalam batas waktu",
                    }),
                this.batasMs,
            );
        });
        try {
            return await Promise.race([check.probe(), batas]);
        } catch {
            // Pesan galat sengaja tidak ikut: galat koneksi dapat memuat host dan nama
            // akun (SDD-16 §4.7), dan ringkasan ini tampil di antarmuka.
            return { status: "down", note: "pemeriksaan gagal" };
        } finally {
            clearTimeout(timer);
        }
    }
}

/**
 * Pemeriksaan berbasis ping: `up` beserta latensinya bila `ping` selesai. Latensi
 * diukur dengan jam monoton, bukan `Clock` — yang diukur durasi, bukan waktu
 * kejadian (`SDD-SYS-07`).
 */
export function pingCheck(
    name: DependencyName,
    ping: () => Promise<unknown>,
): HealthCheck {
    return {
        name,
        async probe() {
            const mulai = performance.now();
            await ping();
            return {
                status: "up",
                latency_ms: Math.round(performance.now() - mulai),
            };
        },
    };
}

export interface ProbeResponse {
    readonly statusCode: 200 | 503;
    readonly body:
        | {
              readonly success: true;
              readonly data: { readonly status: string };
              readonly meta: null;
          }
        | {
              readonly success: false;
              // Diikat ke katalog: mencabut kodenya dari Bab 17.3 gagal kompilasi.
              readonly error: {
                  readonly code: Extract<KodeGalat, "SERVICE_NOT_READY">;
                  readonly message: string;
              };
              readonly request_id: string;
          };
}

/** `/health/live` — 200 selama proses hidup, tanpa menyentuh dependensi (SDD-15 §4.5). */
export function liveResponse(): ProbeResponse {
    return {
        statusCode: 200,
        body: { success: true, data: { status: "up" }, meta: null },
    };
}

/**
 * `/health/ready`. Probe publik hanya menjawab siap atau tidak; rincian per
 * dependensi milik `/health` yang menuntut `setting.view` (`SDD-AUTH-01 §4.1`).
 */
export async function readyResponse(
    health: HealthRegistry,
): Promise<ProbeResponse> {
    return (await health.readiness())
        ? {
              statusCode: 200,
              body: { success: true, data: { status: "ready" }, meta: null },
          }
        : {
              statusCode: 503,
              // Amplop galat Bab 17.2 dengan `SERVICE_NOT_READY` (Bab 17.3).
              body: {
                  success: false,
                  error: {
                      code: "SERVICE_NOT_READY",
                      message: "Layanan belum siap menerima permintaan.",
                  },
                  request_id: konteksSaatIni()?.requestId ?? requestIdBaru(),
              },
          };
}
