import { describe,it,expect,vi } from "vitest";
import type { AxiosInstance } from "axios";
import { WorkOrderAttempt,queueWorkOrderPhoto,requireUploadedWorkOrderPhotos } from "../src/features/workorders/model";
import { createUploadSender } from "../src/shared/upload/sender";
import { MobileApiError } from "../src/shared/api/client";
import type { UploadQueue,UploadEntry,NewUpload } from "../src/shared/upload/queue";
import { internalPath } from "../src/shared/navigation";
const detail={id:"10",nomor:"WO-2027-0010",jenis:"KOREKTIF",asset_id:"8",room_id:null,damage_report_id:null,teknisi_id:"4",prioritas:"TINGGI",deskripsi:"Uji",target_selesai:"2027-11-20",estimasi_biaya:"1000.00",status:"DIKERJAKAN",garansi_aktif:null,objek:{jenis:"ASET",id:"8",label:"Pompa",kode:"PMP"},teknisi:{id:"4",nama:"Teknisi"},checklist:[],waktu_mulai:"2027-11-15T03:00:00Z",waktu_selesai:null,created_at:"2027-11-15T03:00:00Z",catatan_teknisi:null,hasil:null,biaya:"0.00",rincian_biaya:[],foto:[],foto_tertunda:0,alasan_tertunda:null,tanggal_lanjut:null,rekomendasi:null,kondisi_pasca:null,diverifikasi_pada:null,catatan_verifikasi:null,estimasi_diusulkan:null,status_estimasi:"TIDAK_ADA",alasan_estimasi:null,foto_pelapor:[]};
const entry:UploadEntry={id:"00000000-0000-4000-8000-000000000001",accountId:"4",path:"file:///queue/foto.jpg",ownerType:"WORK_ORDER_PHOTO",ownerId:"10",fileId:null,checksum:"a".repeat(64),size:100,createdAt:1000,attempts:0,nextAttemptAt:1000};
describe("PR-04-08 mobile: transaksi daring, foto persisten dan pemisahan akun",()=>{
 it("penyelesaian menunggu foto lokal WO ini, tanpa diblokir foto pekerjaan lain",async()=>{const list=vi.fn(async()=>[entry]);await expect(requireUploadedWorkOrderPhotos({list},"4","10")).rejects.toThrow("masih di antrean");expect(list).toHaveBeenCalledWith("4");await expect(requireUploadedWorkOrderPhotos({list},"4","11")).resolves.toBeUndefined();});
 it("respons bisnis hilang memakai idempotency key sama; isian lain diblokir sampai hasil pasti",async()=>{
  const patch=vi.fn().mockRejectedValueOnce(new Error("Respons hilang")).mockResolvedValueOnce({data:{success:true,data:detail,meta:null}}),uuid=vi.fn(()=>"key-1"),action=new WorkOrderAttempt({patch} as unknown as AxiosInstance,uuid,"4",()=>"4"),signal=new AbortController().signal;
  await expect(action.send("10","progress",{catatan_teknisi:"Uji"},signal)).rejects.toThrow("hilang");expect(action.uncertain).toBe(true);
  await expect(action.send("10","complete",{hasil:"Selesai"},signal)).rejects.toThrow("belum pasti");
  expect((await action.send("10","progress",{catatan_teknisi:"Uji"},signal)).id).toBe("10");expect(uuid).toHaveBeenCalledTimes(1);expect(patch.mock.calls[0]![2]).toMatchObject({headers:{"Idempotency-Key":"key-1"}});expect(patch.mock.calls[1]![2]).toMatchObject({headers:{"Idempotency-Key":"key-1"}});expect(action.uncertain).toBe(false);
 });
 it("luring gagal eksplisit dan perubahan akun tidak meneruskan tindakan",async()=>{
  const post=vi.fn().mockRejectedValue(new MobileApiError(0,"OFFLINE","Luring")),action=new WorkOrderAttempt({post} as unknown as AxiosInstance,()=>"key","4",()=>"4");await expect(action.send("10","complete",{hasil:"Selesai"},new AbortController().signal)).rejects.toThrow("Luring");expect(action.uncertain).toBe(false);
  const wrong=new WorkOrderAttempt({post} as unknown as AxiosInstance,()=>"key","4",()=>"5");await expect(wrong.send("10","complete",{},new AbortController().signal)).rejects.toThrow("Sesi berubah");expect(post).toHaveBeenCalledTimes(1);
 });
 it("foto boleh masuk antrean sebelum presign tanpa mencatat progres/biaya atau token",async()=>{
  const enqueue=vi.fn<(entry:NewUpload)=>Promise<void>>().mockResolvedValue(undefined),photo={id:entry.id,path:entry.path,checksum:entry.checksum,size:entry.size,createdAt:entry.createdAt};await queueWorkOrderPhoto({enqueue} as unknown as UploadQueue,photo,"4","10");expect(enqueue.mock.calls[0]![0]).toEqual({...photo,accountId:"4",ownerType:"WORK_ORDER_PHOTO",ownerId:"10",fileId:null});await expect(queueWorkOrderPhoto({enqueue} as unknown as UploadQueue,photo,"4","../5")).rejects.toThrow("diketahui");
 });
 it("unggahan yang telah dikonfirmasi menautkan foto secara idempoten tanpa PUT ulang",async()=>{
  const post=vi.fn<(path:string,body?:unknown,config?:unknown)=>Promise<{data:unknown}>>().mockResolvedValue({data:{}}),put=vi.fn(),send=createUploadSender({post} as unknown as AxiosInstance,{setFileId:vi.fn()} as unknown as UploadQueue,()=>"4",()=>undefined,put);
  await send({...entry,fileId:"55"},new AbortController().signal);expect(post.mock.calls.map(c=>c[0])).toEqual(["/files/confirm","/work-orders/10/photos"]);expect(post.mock.calls[1]![2]).toMatchObject({headers:{"Idempotency-Key":entry.id}});expect(put).not.toHaveBeenCalled();
 });
 it("foto luring memesan ID saat daring, menyimpan checkpoint sebelum byte dikirim dan menautkan sesudah confirm",async()=>{
  const post=vi.fn().mockResolvedValueOnce({data:{data:{file_id:"55",upload_url:"https://storage.test/first"}}}).mockRejectedValueOnce(new MobileApiError(422,"VALIDATION_ERROR","Belum terunggah",[{field:"file_id",message:"Belum terunggah"}])).mockResolvedValueOnce({data:{data:{file_id:"55",upload_url:"https://storage.test/put"}}}).mockResolvedValue({data:{}}),setFileId=vi.fn(async()=>undefined),put=vi.fn(async()=>true);
  const send=createUploadSender({post} as unknown as AxiosInstance,{setFileId} as unknown as UploadQueue,()=>"4",()=>undefined,put);await send(entry,new AbortController().signal);
  expect(post.mock.calls.map(c=>c[0])).toEqual(["/files/presign","/files/confirm","/files/55/presign","/files/confirm","/work-orders/10/photos"]);expect(setFileId.mock.invocationCallOrder[0]).toBeLessThan(put.mock.invocationCallOrder[0]!);
 });
 it("deep link WO yang kanonik dibuka; traversal tidak menjadi tujuan",()=>{expect(internalPath("/work-order/10")).toBe("/work-order/10");expect(internalPath("/work-order/../10")).toBeNull();});
});
