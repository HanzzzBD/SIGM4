import { randomUUID } from "node:crypto";
import { beforeAll,describe,it,expect,vi } from "vitest";
import { MaterialLedgerService } from "../../src/modules/m22-materials/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb,withTransaction } from "../../src/shared/db/index.js";
import { dbmate,kueri } from "../helpers/db.js";
const clock=new FixedClock(new Date("2026-10-14T03:00:00Z")),audit=new AuditLogger({clock}),marker=randomUUID().slice(0,6);
describe.skipIf(!process.env["DATABASE_URL"])("PR-05-15/17: ledger Bahan PostgreSQL",()=>{
 let actor=0,room=0,unit=0,category=0,counter=0;
 const id=async(query:string)=>Number((await kueri<{id:string}>(query))[0]!.id);
 const material=()=>id(`INSERT INTO materials(nama,material_category_id,satuan_id,room_id_default,stok_minimum) VALUES ('Bahan ${++counter}',${category},${unit},${room},2) RETURNING id::text`);
 const ctx=()=>createAuthContext({userId:actor,roleCode:"R-02",scopes:new Map([["material.receive","all"],["material.issue","all"],["material.adjust","all"],["audit.approve","all"]])});
 const write=(materialId:number,delta:number,jenis:"PENERIMAAN"|"PENGELUARAN"|"PENYESUAIAN"|"OPNAME"=delta>0?"PENERIMAAN":"PENGELUARAN",alasan?:string)=>withTransaction(ctx(),scope=>new MaterialLedgerService(clock,audit).record(scope,{materialId,roomId:room,delta,jenis,referenceKind:"fixture",referenceId:++counter,...(alasan?{alasan}:{})}),getDb());
 const balance=async(materialId:number)=>Number((await kueri<{saldo:number}>(`SELECT saldo FROM material_balances WHERE material_id=${materialId} AND room_id=${room}`))[0]?.saldo??0);
 beforeAll(async()=>{
  // Down 0065 lalu 0064 diuji atas direktori LENGKAP: pada suite gabungan DB sudah di migration
  // terbaru, dan 0066+ bergantung pada material_transactions — turunkan berurutan sampai 0064.
  dbmate("up");
  const turun:string[]=[];
  for(let i=0;i<40&&!turun.some(o=>o.includes("0064"));i+=1)turun.push(dbmate("down"));
  expect(turun.findIndex(o=>o.includes("0065"))).toBeGreaterThanOrEqual(0);
  expect(turun.findIndex(o=>o.includes("0065"))).toBeLessThan(turun.findIndex(o=>o.includes("0064")));
  dbmate("up");
  actor=await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('Petugas','${randomUUID()}@ledger.test','x','${randomUUID()}',(SELECT id FROM roles WHERE kode='R-02'),'AKTIF',false) RETURNING id::text`);
  const building=await id(`INSERT INTO buildings(nama,kode) VALUES ('Bahan','G${marker}') RETURNING id::text`),area=await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Bahan','A${marker}') RETURNING id::text`);
  room=await id(`INSERT INTO rooms(area_id,nama,kode,jenis,kapasitas) VALUES (${area},'Gudang','R${marker}','GUDANG',20) RETURNING id::text`);
  unit=await id(`INSERT INTO material_units(nama,simbol) VALUES ('Unit ${marker}','U${marker}') RETURNING id::text`);category=await id(`INSERT INTO material_categories(nama,kode) VALUES ('Kategori ${marker}','C${marker}') RETURNING id::text`);
 });
 it("seeds five units; SQL also locks the unit after the first transaction",async()=>{const seeds=await kueri<{simbol:string}>("SELECT simbol FROM material_units WHERE simbol IN ('rim','pcs','botol','liter','dus') ORDER BY simbol");expect(seeds.map(r=>r.simbol)).toEqual(["botol","dus","liter","pcs","rim"]);const m=await material(),next=await id(`INSERT INTO material_units(nama,simbol) VALUES ('Other ${marker}','O${marker}') RETURNING id::text`);await kueri(`UPDATE materials SET satuan_id=${next} WHERE id=${m}`);await write(m,1);await expect(kueri(`UPDATE materials SET satuan_id=${unit} WHERE id=${m}`)).rejects.toMatchObject({code:"23514"});expect(await balance(m)).toBe(1);});
 it("zero initial balance; signed ledger and final balance match",async()=>{const m=await material();expect(await balance(m)).toBe(0);await write(m,10);await write(m,-3);await write(m,-2,"PENYESUAIAN","Tumpah");expect(await balance(m)).toBe(5);const rows=await kueri<{jumlah:number;saldo_sesudah:number}>(`SELECT jumlah,saldo_sesudah FROM material_transactions WHERE material_id=${m} ORDER BY id`);expect(rows).toEqual([{jumlah:10,saldo_sesudah:10},{jumlah:-3,saldo_sesudah:7},{jumlah:-2,saldo_sesudah:5}]);});
 it("twenty simultaneous issues on ten stock produce exactly ten successes",async()=>{const m=await material();await write(m,10);const results=await Promise.allSettled(Array.from({length:20},()=>write(m,-1)));expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(10);expect(await balance(m)).toBe(0);expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM material_transactions WHERE material_id=${m}`))[0]!.n).toBe("11");});
 it("raw balance edits, deletion and unmatched ledger snapshots are rejected by SQL",async()=>{const m=await material();await write(m,2);await expect(kueri(`UPDATE material_balances SET saldo=50 WHERE material_id=${m}`)).rejects.toMatchObject({code:"23514"});await expect(kueri(`DELETE FROM material_balances WHERE material_id=${m}`)).rejects.toMatchObject({code:"23514"});await expect(kueri(`INSERT INTO material_transactions(material_id,room_id,jenis,jumlah,saldo_sesudah,referensi_jenis,referensi_id,created_by,created_at) VALUES (${m},${room},'PENERIMAAN',1,50,'fixture',1,${actor},'2026-10-14T03:00:00Z')`)).rejects.toMatchObject({code:"23514"});expect(await balance(m)).toBe(2);});
 it("ledger cannot be edited/deleted; blank adjustment reason is a SQL failure",async()=>{const m=await material();await write(m,2);await expect(kueri(`UPDATE material_transactions SET jumlah=1 WHERE material_id=${m}`)).rejects.toMatchObject({code:"23514"});await expect(kueri(`DELETE FROM material_transactions WHERE material_id=${m}`)).rejects.toMatchObject({code:"23514"});await expect(kueri(`INSERT INTO material_transactions(material_id,room_id,jenis,jumlah,saldo_sesudah,referensi_jenis,referensi_id,alasan,created_by,created_at) VALUES (${m},${room},'PENYESUAIAN',1,3,'fixture',1,' ',${actor},'2026-10-14T03:00:00Z')`)).rejects.toMatchObject({code:"23514"});expect(await balance(m)).toBe(2);});
 it("audit failure rolls back both ledger and aggregate",async()=>{const m=await material(),spy=vi.spyOn(audit,"write").mockRejectedValueOnce(new Error("audit unavailable"));try{await expect(write(m,3)).rejects.toThrow("audit unavailable");}finally{spy.mockRestore();}expect(await balance(m)).toBe(0);expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM material_transactions WHERE material_id=${m}`))[0]!.n).toBe("0");});
 it("permissions, direction, zero, fractional quantities and negative balances are rejected",async()=>{const m=await material();for(const delta of [0,1.5,-1])await expect(write(m,delta)).rejects.toMatchObject({kode:"VALIDATION_ERROR"});await expect(write(m,-1,"PENERIMAAN")).rejects.toMatchObject({kode:"VALIDATION_ERROR"});const none=createAuthContext({userId:actor,roleCode:"R-05",scopes:new Map()});await expect(withTransaction(none,s=>new MaterialLedgerService(clock,audit).record(s,{materialId:m,roomId:room,jenis:"PENERIMAAN",delta:2,referenceKind:"fixture",referenceId:1}),getDb())).rejects.toMatchObject({kode:"FORBIDDEN"});});
});
