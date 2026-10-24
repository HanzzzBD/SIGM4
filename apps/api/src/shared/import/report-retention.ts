export const IMPORT_REPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
interface ImportReport {
    readonly id: string;
    readonly status: string;
    readonly selesai_pada: Date | null;
    readonly nama_berkas: string;
    readonly laporan_gagal: readonly unknown[];
    readonly pesan_galat: string | null;
    readonly report_purged_at?: Date | null;
}
/** Read-time expiry is independent from the worker's cleanup schedule. */
export function importReportView<T extends ImportReport>(job: T, now: Date) {
    const terminal = ["SELESAI", "GAGAL"].includes(job.status);
    const expires = terminal && job.selesai_pada ? new Date(job.selesai_pada.getTime() + IMPORT_REPORT_RETENTION_MS) : null;
    const expired = !!job.report_purged_at || expires !== null && expires <= now;
    return { ...job, ...(expired ? { nama_berkas: `impor-${job.id}`, laporan_gagal: [], pesan_galat: null, berkas: null } : {}),
        report_expires_at: expires?.toISOString() ?? null, report_expired: expired };
}
