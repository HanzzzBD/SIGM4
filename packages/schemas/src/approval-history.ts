// Kontrak linimasa persetujuan `GET /approvals/{id}/history` (FR-10.3, SDD-02 §4.5a; SDD-API-01, NFR-M-05).
// Dipindah dari skema lokal M-10 di PR-03-27 agar layar P-31 memakai definisi yang sama (SDD-FE-05).

import { z } from "zod";

const Nama = z.object({ id: z.number(), nama: z.string().nullable() });

export const HistoryResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        instance_id: z.number(),
        jenis_pengajuan: z.string(),
        referensi_id: z.number(),
        status: z.enum(["MENUNGGU", "DISETUJUI", "DITOLAK", "PERLU_REVISI", "DIBATALKAN"]),
        pemohon: Nama,
        aturan: z.object({ rule_id: z.number().nullable(), versi: z.number().nullable() }),
        langkah_aktif: z.number().nullable(),
        dibuat_pada: z.string(),
        diselesaikan_pada: z.string().nullable(),
        ditolak_otomatis: z.boolean(),
        langkah: z.array(
            z.object({
                urutan: z.number(),
                status: z.enum(["DISETUJUI", "DITOLAK", "PERLU_REVISI", "DILEWATI", "AKTIF", "BELUM_AKTIF", "TIDAK_DIJALANKAN"]),
                approver: z.object({ tipe: z.enum(["role", "user"]), role: Nama.nullable(), user: Nama.nullable() }),
                fallback: z.boolean(),
                catatan: z.string().nullable(),
                diputuskan_oleh: Nama.nullable(),
                atas_nama: Nama.nullable(),
                diputuskan_pada: z.string().nullable(),
                alasan_dilewati: z.string().nullable(),
                eskalasi: z.object({ pada: z.string(), dari: Nama.nullable() }).nullable(),
                eskalasi_habis_pada: z.string().nullable(),
                sla: z.object({ deadline: z.string().nullable(), sisa_menit_kerja: z.number(), terlambat: z.boolean() }).nullable(),
                durasi_menit_kerja: z.number().nullable(),
            }),
        ),
    }),
    meta: z.null(),
});

export type LinimasaPersetujuan = z.infer<typeof HistoryResponseSchema>["data"];
