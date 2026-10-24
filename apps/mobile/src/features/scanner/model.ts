import type { AxiosInstance } from "axios";
import { z } from "zod";
import type { AssetDetail } from "@sigm4/schemas";
import { MaterialDetailResponseSchema,parseMaterialQr } from "@sigm4/schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseAssetQr(value: string, trustedOrigin: string): string {
    try {
        const url = new URL(value.trim());
        const id = url.pathname.slice(3);
        if (url.protocol === "https:" && url.origin === new URL(trustedOrigin).origin && !url.username && !url.password && !url.search && !url.hash && url.pathname.startsWith("/a/") && UUID.test(id)) return id.toLowerCase();
    } catch { /* QR non-URL ditolak. */ }
    throw new Error("QR tidak dikenali. Masukkan kode aset secara manual.");
}
const Id = z.object({ id: z.string().regex(/^\d+$/) });
export async function resolveQr(api: AxiosInstance, value: string, origin: string, signal: AbortSignal): Promise<string> {
    return Id.parse((await api.get(`/assets/by-uuid/${parseAssetQr(value, origin)}`, { signal })).data.data).id;
}
export async function resolveQrTarget(api:AxiosInstance,value:string,origin:string,signal:AbortSignal,permissions:Permissions){
 const materialUuid=parseMaterialQr(value,origin);
 if(materialUuid){
  if(!allowed(permissions,"material.view"))throw new Error("Anda tidak memiliki izin melihat bahan.");
  const material=MaterialDetailResponseSchema.parse((await api.get(`/materials/by-uuid/${materialUuid}`,{signal})).data).data;
  return {jenis:"BAHAN" as const,id:material.id,nama:material.nama,label:`Bahan / ${material.satuan.simbol}`};
 }
 // UUID dari namespace /b/ tidak pernah diteruskan ke resolver aset.
 parseAssetQr(value,origin);
 if(!allowed(permissions,"asset.view"))throw new Error("Anda tidak memiliki izin melihat aset.");
 return {jenis:"ASET" as const,id:await resolveQr(api,value,origin,signal)};
}
export async function resolveCode(api: AxiosInstance, value: string, signal: AbortSignal): Promise<string> {
    const code = value.trim();
    if (!code || code.length > 150) throw new Error("Masukkan kode aset yang lengkap (maksimum 150 karakter).");
    let page = 1;
    while (!signal.aborted) {
        const result = z.object({ data: z.array(Id.extend({ kode_barang: z.string() })), meta: z.object({ total_pages: z.number().int().positive() }) })
            .parse((await api.get("/assets", { params: { q: code, page, per_page: 100 }, signal })).data);
        const exact = result.data.find((asset) => asset.kode_barang.toLowerCase() === code.toLowerCase());
        if (exact) return exact.id;
        if (page++ >= result.meta.total_pages) break;
    }
    if (signal.aborted) throw new Error("Pencarian dibatalkan.");
    throw new Error("Kode aset tidak ditemukan atau tidak dapat Anda akses. Periksa kode dan coba lagi.");
}
export type Permissions = Readonly<Record<string, string>>;
export function allowed(permissions: Permissions, permission: string) { return Object.hasOwn(permissions, permission); }
export function contextualActions(asset: Pick<AssetDetail, "status" | "dihapuskan" | "dapat_dipinjam">, permissions: Permissions) {
    if (asset.dihapuskan || asset.status === "TIDAK_TERSEDIA") return allowed(permissions,"workorder.view")?[{label:"Riwayat servis",available:true,reason:""}]:[];
    const actions: { label: string; reason: string; available: boolean }[] = [];
    const add = (permission: string, label: string, context = "", available = false) => {
        if (allowed(permissions, permission)) actions.push({ label, available, reason: available ? "" : `${context}Layar ${label.toLowerCase()} belum tersedia di aplikasi.` });
    };
    if (asset.status === "DIRESERVASI") add("loan.manage", "Serah terima", "Memerlukan reservasi yang disetujui. ");
    if (asset.status === "DIPINJAM") add("loan.manage", "Pengembalian", "Memerlukan peminjaman aktif. ");
    add("damage.create", "Lapor kerusakan", "", true);
    add("audit.execute", "Catat opname", "Memerlukan sesi opname aktif dan penugasan Anda. ");
    if (asset.status === "DALAM_PERBAIKAN") add("workorder.execute", "Perbarui work order", "",true);
    if (asset.status === "TERSEDIA" && asset.dapat_dipinjam) add("reservation.create", "Ajukan reservasi");
    if (allowed(permissions, "workorder.view")) add("workorder.view", "Riwayat servis","",true);
    return actions;
}
/** Satu permintaan kamera pada satu waktu; duplikat sukses diabaikan selama sesi. */
export class ScanGate {
    private busy = false;
    private seen = new Set<string>();
    async run(key: string, operation: () => Promise<void>): Promise<boolean> {
        if (this.busy || this.seen.has(key)) return false;
        this.busy = true;
        try { await operation(); this.seen.add(key); return true; } finally { this.busy = false; }
    }
    reset() { this.seen.clear(); }
}
