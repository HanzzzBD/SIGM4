import axios from "axios";
import type { AxiosAdapter } from "axios";
import { describe, expect, it } from "vitest";
import { contextualActions, parseAssetQr, resolveCode, resolveQr,resolveQrTarget, ScanGate } from "../src/features/scanner/model";
import { parseMaterialQr } from "@sigm4/schemas";

const origin = "https://sigm4.sekolah.test";
const uuid = "93a2d3fe-1c97-40fb-98fe-b4ad03ecf479";
const apiWith = (adapter: AxiosAdapter) => axios.create({ adapter });

describe("QR Bahan: namespace dan saldo privat",()=>{
 it("hanya menerima /b/ UUIDv4 persis pada origin sekolah",()=>{
  expect(parseMaterialQr(`${origin}/b/${uuid.toUpperCase()}`,origin)).toBe(uuid);
  for(const value of [`${origin}/a/${uuid}`,`https://evil.test/b/${uuid}`,`http://sigm4.sekolah.test/b/${uuid}`,`${origin}/b/${uuid}/`,`${origin}/b/${uuid}?stock=1`,`${origin}/b/${uuid}#x`,`https://user@sigm4.sekolah.test/b/${uuid}`,uuid])expect(parseMaterialQr(value,origin)).toBeNull();
 });
 it("Bahan tidak pernah memanggil assets, meskipun UUID sama; izin dicek sebelum HTTP",async()=>{
  const calls:string[]=[],api=apiWith(config=>{calls.push(config.url!);return Promise.resolve({data:{success:true,meta:null,data:{id:"42",uuid,nama:"Kertas",kategori:{id:"1",nama:"ATK"},satuan:{id:"1",nama:"Rim",simbol:"rim"},stok_minimum:2,saldo_total:3,stok_menipis:false,status_stok:"TERSEDIA",boleh_diminta_siswa:false,lokasi_bawaan:{id:"1",nama:"Gudang"},status:"AKTIF",keterangan:null,qr_url:`${origin}/b/${uuid}`,saldo_lokasi:[{room_id:"1",lokasi:"Gudang",saldo:3}],satuan_terkunci:true}},status:200,statusText:"OK",headers:{},config});});
  const signal=new AbortController().signal;
  await expect(resolveQrTarget(api,`${origin}/b/${uuid}`,origin,signal,{"asset.view":"all"})).rejects.toThrow("izin melihat bahan");expect(calls).toEqual([]);
  expect(await resolveQrTarget(api,`${origin}/b/${uuid}`,origin,signal,{"material.view":"all"})).toMatchObject({jenis:"BAHAN",id:"42",nama:"Kertas"});expect(calls).toEqual([`/materials/by-uuid/${uuid}`]);
  await expect(resolveQrTarget(api,`${origin}/a/${uuid}`,origin,signal,{"material.view":"all"})).rejects.toThrow("izin melihat aset");expect(calls).toHaveLength(1);
 });
});
describe("pemindai native: batas kepercayaan dan resolusi aset", () => {
    it("hanya menerima HTTPS origin sekolah, path UUIDv4 persis tanpa query, kredensial atau fragment", () => {
        expect(parseAssetQr(`${origin}/a/${uuid.toUpperCase()}`, `${origin}/api/v1`)).toBe(uuid);
        for (const value of [uuid, `http://sigm4.sekolah.test/a/${uuid}`, `https://evil.test/a/${uuid}`, `${origin}/a/${uuid}/`, `${origin}/a/${uuid}?next=evil`, `${origin}/a/${uuid}#x`, `https://user@sigm4.sekolah.test/a/${uuid}`, `${origin}/a/not-uuid`, `${origin}/assets/${uuid}`]) expect(() => parseAssetQr(value, origin)).toThrow("QR tidak dikenali");
    });
    it("QR asing tidak memanggil HTTP; UUID sah memakai API privat", async () => {
        const calls: string[] = [];
        const api = apiWith((config) => { calls.push(config.url!); return Promise.resolve({ data: { data: { id: "42" } }, status: 200, statusText: "OK", headers: {}, config }); });
        await expect(resolveQr(api, `https://evil.test/a/${uuid}`, origin, new AbortController().signal)).rejects.toThrow();
        expect(calls).toEqual([]);
        expect(await resolveQr(api, `${origin}/a/${uuid}`, origin, new AbortController().signal)).toBe("42");
        expect(calls).toEqual([`/assets/by-uuid/${uuid}`]);
    });
    it("kode manual harus cocok persis, menyisir halaman tanpa memilih hasil pencarian mirip", async () => {
        const pages: number[] = [];
        const api = apiWith((config) => { const page = Number(config.params.page); pages.push(page); return Promise.resolve({ data: { data: [{ id: String(page), kode_barang: page === 1 ? "AST-420" : "AST-42" }], meta: { total_pages: 2 } }, status: 200, statusText: "OK", headers: {}, config }); });
        expect(await resolveCode(api, " ast-42 ", new AbortController().signal)).toBe("2");
        expect(pages).toEqual([1, 2]);
        await expect(resolveCode(api, "unknown", new AbortController().signal)).rejects.toThrow("tidak ditemukan");
    });
    it("mengunci scan paralel, mengabaikan duplikat sukses, dan mengizinkan retry setelah galat", async () => {
        const gate = new ScanGate(); let finish!: () => void;
        const first = gate.run("one", () => new Promise<void>((resolve) => { finish = resolve; }));
        expect(await gate.run("two", async () => undefined)).toBe(false); finish(); expect(await first).toBe(true);
        expect(await gate.run("one", async () => undefined)).toBe(false);
        await expect(gate.run("error", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
        expect(await gate.run("error", async () => undefined)).toBe(true); gate.reset(); expect(await gate.run("one", async () => undefined)).toBe(true);
    });
    it("aksi memakai permission aktual dan status; aset dihapuskan/tidak tersedia tidak punya transaksi", () => {
        const asset = { status: "DIRESERVASI" as const, dihapuskan: false, dapat_dipinjam: true };
        expect(contextualActions(asset, {})).toEqual([]);
        expect(contextualActions(asset, { "loan.manage": "all", "damage.create": "own" }).map((action) => action.label)).toEqual(["Serah terima", "Lapor kerusakan"]);
        expect(contextualActions({ ...asset, status: "DIPINJAM" }, { "loan.manage": "all" })[0]!.label).toBe("Pengembalian");
        expect(contextualActions({ ...asset, dihapuskan: true }, { "loan.manage": "all" })).toEqual([]);
        expect(contextualActions({ ...asset, status: "TIDAK_TERSEDIA" }, { "damage.create": "own" })).toEqual([]);
        expect(contextualActions({ ...asset, status: "DALAM_PERBAIKAN" }, { "workorder.execute": "assigned" })[0]).toMatchObject({label:"Perbarui work order",available:true});
    });
});
