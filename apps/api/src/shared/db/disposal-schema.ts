import type { ColumnType, Generated } from "kysely";
export interface AssetDisposalsTable {
    created_at: ColumnType<Date, never, never>; updated_at: ColumnType<Date, never, never>;
    created_by: ColumnType<string | null, string | number | null, never>; updated_by: ColumnType<string | null, string | number | null, string | number | null>;
    id: Generated<string>; nomor: string; pengusul_id: string; alasan: "RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI" | "HILANG" | "HABIS_UMUR_TEKNIS" | "LAINNYA";
    justifikasi: string; tindak_lanjut_fisik: string; status: "MENUNGGU_PERSETUJUAN" | "PERLU_REVISI" | "DISETUJUI" | "DISETUJUI_SEBAGIAN" | "DITOLAK" | "DIBATALKAN" | "SELESAI";
    total_nilai: ColumnType<string, string, string>; approval_instance_id: Generated<string | null>;
    disetujui_oleh: Generated<string | null>; disetujui_pada: Generated<Date | null>; dilaksanakan_oleh: Generated<string | null>;
    tanggal_pelaksanaan: ColumnType<Date | null, string | undefined, string>; dilaksanakan_pada: Generated<Date | null>;
    saksi: Generated<unknown>; catatan: Generated<string | null>; report_snapshot: Generated<unknown>;
    report_status: Generated<"BELUM" | "MENUNGGU" | "SIAP" | "GAGAL">;
    report_file_id: Generated<string | null>; report_object_key: Generated<string | null>; report_redacted_file_id: Generated<string | null>; report_redacted_object_key: Generated<string | null>;
}
export interface AssetDisposalItemsTable {
    id: Generated<string>; disposal_id: string; asset_id: string; snapshot: unknown; disetujui: Generated<boolean | null>; keterangan: Generated<string | null>;
    bukti_kehilangan_file_id: string | null; konfirmasi_garansi: boolean; alasan_garansi: string;
    executed_at: Generated<Date | null>; reinstated_at: Generated<Date | null>; reinstated_by: Generated<string | null>; reinstatement_reason: Generated<string | null>;
}
export interface AssetDisposalClaimsTable { asset_id: string; disposal_id: string }
export interface AssetDisposalFilesTable { disposal_id: string; file_id: string; nama_berkas: string; jenis: string }
