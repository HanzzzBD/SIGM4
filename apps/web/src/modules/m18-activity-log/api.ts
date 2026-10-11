// Kontrak M-18 di klien web (m18 §7; FR-18.2, AL-10; PR-01-25). Respons diurai skema `zod/mini` (SDD-FE-05).
// Saringan diteruskan sebagai `filter[...]` (Bab 17.1); tanggal WIB dikonversi ke batas instan hari itu.

import { keepPreviousData, queryOptions } from "@tanstack/react-query";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ApiError, api } from "../../shared/api";

const Entri = z.object({
    id: z.string(),
    waktu: z.string(),
    user_id: z.nullable(z.string()),
    user_nama: z.nullable(z.string()),
    role: z.nullable(z.string()),
    ip: z.nullable(z.string()),
    user_agent: z.nullable(z.string()),
    modul: z.string(),
    aksi: z.string(),
    entitas: z.nullable(z.string()),
    entitas_id: z.nullable(z.string()),
    nilai_sebelum: z.unknown(),
    nilai_sesudah: z.unknown(),
    keterangan: z.nullable(z.string()),
    hasil: z.enum(["SUKSES", "GAGAL"]),
    request_id: z.nullable(z.string()),
});
export type Entri = z.infer<typeof Entri>;
const Meta = z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() });

/** Saringan P-73 di URL. `dari`/`sampai` = tanggal kalender WIB (YYYY-MM-DD). */
export interface SaringanLog {
    readonly dari?: string | undefined;
    readonly sampai?: string | undefined;
    readonly user?: string | undefined;
    readonly role?: string | undefined;
    readonly modul?: string | undefined;
    readonly aksi?: string | undefined;
    readonly entitas?: string | undefined;
    readonly entitas_id?: string | undefined;
    readonly page?: number | undefined;
    /**
     * Batas atas penelusuran (waktu entri terbaru saat halaman 1 dimuat). Setiap penelusuran MENULIS
     * ACTIVITY_LOG_VIEWED (m18 §11) — tanpa batas ini paginasi offset bergeser satu baris setiap halaman.
     */
    readonly snap?: string | undefined;
}

/** Batas instan hari WIB (UTC+7, tanpa DST). */
const awalHari = (ymd: string) => `${ymd}T00:00:00.000+07:00`;
const akhirHari = (ymd: string) => `${ymd}T23:59:59.999+07:00`;

export function paramSaringan(s: SaringanLog): Record<string, string> {
    const p: Record<string, string> = {};
    if (s.dari !== undefined) p["filter[dari]"] = awalHari(s.dari);
    const batasAtas = [s.sampai === undefined ? undefined : akhirHari(s.sampai), s.snap].filter((x): x is string => x !== undefined).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    if (batasAtas !== undefined) p["filter[sampai]"] = batasAtas;
    if (s.user !== undefined) p["filter[user_id]"] = s.user;
    if (s.role !== undefined) p["filter[role]"] = s.role;
    if (s.modul !== undefined) p["filter[modul]"] = s.modul;
    if (s.aksi !== undefined) p["filter[aksi]"] = s.aksi;
    if (s.entitas !== undefined) p["filter[entitas]"] = s.entitas;
    if (s.entitas_id !== undefined) p["filter[entitas_id]"] = s.entitas_id;
    return p;
}

export const daftarLogQuery = (s: SaringanLog) =>
    queryOptions({
        queryKey: ["activity-logs", "daftar", s],
        // Baris lama tetap tampil selama saringan/potret/halaman berganti (tanpa kedip ke kerangka).
        placeholderData: keepPreviousData,
        // Jejak audit selalu segar: potret (snap) hanya boleh lahir dari respons terkini, bukan cache 30 detik.
        staleTime: 0,
        queryFn: async () => z.object({ data: z.array(Entri), meta: Meta }).parse((await api.get("/activity-logs", { params: { ...paramSaringan(s), page: s.page ?? 1, per_page: 25 } })).data),
    });

export const entriQuery = (id: string) =>
    queryOptions({
        queryKey: ["activity-logs", "entri", id],
        queryFn: async () => z.object({ data: Entri }).parse((await api.get(`/activity-logs/${id}`)).data).data,
        retry: (n, e) => !(e instanceof ApiError && (e.status === 403 || e.status === 404)) && n < 2,
    });

const Pengguna = z.object({ id: z.string(), nama: z.string() });
/** Pilihan pengguna untuk saringan — hanya bagi pemegang `user.view`; seluruh halaman. */
export const penggunaQuery = queryOptions({
    queryKey: ["users", "pilihan-log"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
        const hasil: { id: string; nama: string }[] = [];
        for (let page = 1; ; page++) {
            const h = z.object({ data: z.array(Pengguna), meta: Meta }).parse((await api.get("/users", { params: { page, per_page: 100 } })).data);
            hasil.push(...h.data);
            if (page >= h.meta.total_pages) return hasil;
        }
    },
});

/**
 * Ekspor XLSX atas saringan aktif (FR-18.2 langkah 5, AL-10). Galat dibaca sendiri dari badan Blob agar pesan
 * server (mis. `FR-18.2 A1` hasil terlalu besar) tampil; 401 diulang lewat jalur biasa agar penyegaran sesi berlaku.
 */
export async function eksporLog(s: SaringanLog): Promise<void> {
    const params = paramSaringan(s);
    let r = await api.get<Blob>("/activity-logs/export", { params, responseType: "blob", validateStatus: () => true });
    // 401: satu kali lewat jalur biasa (interseptor menyegarkan sesi atau mengakhiri sesi).
    if (r.status === 401) r = await api.get<Blob>("/activity-logs/export", { params, responseType: "blob" });
    if (r.status >= 400) {
        let amplop: { error?: { code?: string; message?: string; details?: { field: string; message: string }[] }; request_id?: string } = {};
        try {
            amplop = JSON.parse(await r.data.text()) as typeof amplop;
        } catch {
            // Badan bukan JSON: pesan generik di bawah.
        }
        throw new ApiError(r.status, amplop.error?.code ?? "INTERNAL_ERROR", amplop.error?.message ?? "Ekspor gagal. Coba lagi beberapa saat lagi.", amplop.request_id ?? null, amplop.error?.details ?? []);
    }
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "activity-logs.xlsx";
    a.click();
    // Memberi peramban kesempatan memulai unduhan sebelum URL dilepas.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

const WAKTU = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "medium" });
export const waktuWib = (iso: string) => `${WAKTU.format(new Date(iso))} WIB`;
/** Pelaku sistem disimpan sebagai kode teknis (`AuditLogger`: PELAKU_SISTEM / PELAKU_CLI) — ditampilkan berlabel. */
const PELAKU_TEKNIS: Readonly<Record<string, string>> = { SYSTEM: "Sistem", "SYSTEM:CLI": "Sistem (CLI)" };

/**
 * Nama pelaku: nama tersimpan/terhubung (API), pelaku sistem berlabel, dan tanpa pengguna sama sekali = permintaan
 * tanpa sesi (mis. LOGIN_FAILED, `AuditLogger.writeAnonim`) — BUKAN "Sistem".
 */
export function pelaku(e: Entri): string {
    if (e.user_nama !== null) return PELAKU_TEKNIS[e.user_nama] ?? e.user_nama;
    return e.user_id === null ? "Anonim (tanpa sesi)" : `Pengguna #${e.user_id}`;
}
