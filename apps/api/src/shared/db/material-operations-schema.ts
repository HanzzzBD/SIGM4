import type { ColumnType, Generated } from "kysely";
interface Operation { id: Generated<string>; material_id: string; room_id: string; jumlah: number; transaction_id: ColumnType<string | null, string | null | undefined, string>; created_at: ColumnType<Date, Date, never>; created_by: string; }
export interface MaterialReceiptsTable extends Operation { tanggal_terima: ColumnType<Date | string, string, never>; nomor_dokumen: string; catatan: string | null; }
export interface MaterialReceiptFilesTable { receipt_id: string; file_id: string; nama_berkas: string; }
export interface ProcurementReceiptMaterialsTable { receipt_item_id: string; material_id: string; room_id: string; transaction_id: string; }
export interface MaterialAdjustmentsTable extends Operation { arah: "TAMBAH" | "KURANG"; alasan: string; }
