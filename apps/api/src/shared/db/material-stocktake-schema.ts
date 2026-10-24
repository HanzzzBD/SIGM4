import type { ColumnType,Generated } from "kysely";
export interface AuditMaterialItemsTable {
 id:Generated<string>;session_id:string;material_id:string;room_id:string;nama:string;uuid:string;satuan_id:string;satuan_nama:string;satuan_simbol:string;lokasi:string;saldo_sistem:number;
 jumlah_fisik:ColumnType<number|null,number|null|undefined,number|null>;basis_saldo:ColumnType<number|null,number|null|undefined,number|null>;
 basis_ledger_id:ColumnType<string|null,string|null|undefined,string|null>;revision:Generated<number>;
 keterangan:ColumnType<string|null,string|null|undefined,string|null>;diperiksa_oleh:ColumnType<string|null,string|number|null|undefined,string|number|null>;diperiksa_pada:ColumnType<Date|null,Date|null|undefined,Date|null>;
}
