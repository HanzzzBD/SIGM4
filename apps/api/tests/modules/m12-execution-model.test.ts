import { describe,it,expect } from "vitest";
import { costRows,requireCompletion,editable } from "../../src/modules/m12-maintenance/services/execution-model.js";
describe("PR-04-08/09 gerbang hasil dan perhitungan biaya",()=>{
 it("rincian pecahan dihitung dalam rupiah/sen tanpa akumulasi galat float",()=>{expect(costRows([{deskripsi:"Baut",jumlah:3.125,harga_satuan:0.1},{deskripsi:"Jasa",jumlah:2,harga_satuan:0.2}])).toMatchObject({rows:[{total:"0.31"},{total:"0.40"}],total:"0.71"});});
 it("nilai nominal terlalu besar tidak melimpah ke numeric basis data",()=>{expect(()=>costRows([{deskripsi:"Biaya",jumlah:999999,harga_satuan:999999999}])).toThrow("batas nominal");});
 it("hasil belum lengkap atau fotonya pending/terinfeksi tidak dapat diajukan",()=>{
  const clean={checksum:"a",scan_status:"CLEAN"};expect(()=>requireCompletion([{selesai:false}],[clean],false)).toThrow("checklist");
  expect(()=>requireCompletion([],[],false)).toThrow("Minimal satu foto");
  for(const scan_status of ["PENDING","INFECTED","FAILED"])expect(()=>requireCompletion([],[clean,{checksum:"a",scan_status}],false)).toThrow("Tunggu seluruh foto");
  expect(()=>requireCompletion([],[clean],true)).toThrow("persetujuan");expect(()=>requireCompletion([{selesai:true}],[clean],false)).not.toThrow();
 });
 it("progres tidak dapat ditulis setelah diajukan/ditutup",()=>{for(const s of ["DITUGASKAN","MENUNGGU_VERIFIKASI","SELESAI","DIBATALKAN","TIDAK_DAPAT_DIPERBAIKI"])expect(()=>editable(s)).toThrow("Progres");expect(()=>editable("DIKERJAKAN")).not.toThrow();expect(()=>editable("TERTUNDA")).not.toThrow();});
});
