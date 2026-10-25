import type { ColumnType,Generated } from "kysely";
interface Master {id:Generated<string>;nama:string;keterangan:string|null;status:Generated<"AKTIF"|"NONAKTIF">;created_at:Generated<Date>;updated_at:Generated<Date>;created_by:string|null;updated_by:string|null;}
export interface MaterialUnitsTable extends Master {simbol:string;}
export interface MaterialCategoriesTable extends Master {kode:string;}
export interface MaterialsTable extends Master {uuid:Generated<string>;material_category_id:string;satuan_id:string;stok_minimum:number;room_id_default:string;}
export interface MaterialBalancesTable {id:Generated<string>;material_id:string;room_id:string;saldo:Generated<number>;}
export interface MaterialTransactionsTable {id:Generated<string>;material_id:string;room_id:string;jenis:"PENERIMAAN"|"PENGELUARAN"|"PENYESUAIAN"|"OPNAME";jumlah:number;saldo_sesudah:number;referensi_jenis:string;referensi_id:string;alasan:string|null;created_by:string;created_at:ColumnType<Date,Date,never>;}
