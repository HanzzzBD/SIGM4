import type { ColumnType, Generated } from "kysely";
export interface ReportExportsTable {
    id: Generated<string>; requester_id: ColumnType<string, string | number, never>;
    jenis: string; judul: string; format: "XLSX" | "PDF"; filter: ColumnType<unknown, string, never>;
    access_hash: string; scope_hash: string | null;
    status: ColumnType<"MENUNGGU" | "BERJALAN" | "SIAP" | "GAGAL" | "KEDALUWARSA" | "DIBATALKAN", "MENUNGGU" | undefined, "BERJALAN" | "SIAP" | "GAGAL" | "KEDALUWARSA" | "DIBATALKAN">;
    object_key: string; file_id: string | null; jumlah_baris: number | null; pesan_galat: string | null;
    object_removed_at: Date | null; selesai_pada: Date | null; berlaku_sampai: Date | null; created_at: Date; updated_at: Date;
}
