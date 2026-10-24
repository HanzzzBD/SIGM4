import type { ColumnType, Generated } from "kysely";
export type MaterialRequestStatus = "MENUNGGU_PERSETUJUAN" | "PERLU_REVISI" | "DISETUJUI" | "DISETUJUI_SEBAGIAN" | "DITOLAK" | "DISERAHKAN_SEBAGIAN" | "DISERAHKAN" | "DIBATALKAN" | "DITUTUP";
export interface MaterialRequestsTable {
    id: Generated<string>; nomor: string; pemohon_id: string; keperluan: string; status: MaterialRequestStatus; revision: Generated<number>;
    approval_instance_id: ColumnType<string | null, string | null | undefined, string | null>; diserahkan_oleh: Generated<string | null>; diserahkan_pada: Generated<Date | null>; catatan_penutupan: Generated<string | null>;
    approved_at: Generated<Date | null>;
    created_at: ColumnType<Date, Date, never>; updated_at: Date; created_by: string; updated_by: string | null;
}
export interface MaterialRequestItemsTable { id: Generated<string>; material_request_id: string; revision: number; material_id: string; room_id: string; satuan_id: string; snapshot: unknown; jumlah_diminta: number; jumlah_disetujui: number | null; jumlah_diserahkan: Generated<number>; }
export interface MaterialRequestCyclesTable { request_id: string; revision: number; approval_instance_id: string | null; threshold_snapshot: unknown; items_snapshot: unknown; created_at: Date; }
export interface MaterialApprovalThresholdsTable { material_id: string; batas: number; updated_at: Date; updated_by: string; }
export interface MaterialIssuesTable { id: Generated<string>; request_id: string; nama_penerima: string; tanggal_serah: ColumnType<Date | string, string, never>; catatan: string | null; created_at: Date; created_by: string; }
export interface MaterialIssueItemsTable { issue_id: string; item_id: string; jumlah: number; transaction_id: string; }
