// Unggah dokumen dari penyimpanan ponsel (keputusan paket 3 log phase-07: expo-document-picker). Byte menuju
// object storage lewat presign; checksum dikonfirmasi sebelum file_id ditautkan (SDD-FS-03).
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { fetch } from "expo/fetch";
import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { DOCUMENT_TYPES, documentMime } from "./document-policy";

export interface UploadedDocument { file_id: number; nama_berkas: string; scan_status: "PENDING" | "CLEAN" | "INFECTED" | "FAILED" }
/** `null` bila pengguna membatalkan pemilihan. */
export async function pickAndUploadDocument(api: AxiosInstance, jenis: "ASSET_DOCUMENT" | "MATERIAL_RECEIPT_DOCUMENT"): Promise<UploadedDocument | null> {
    const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, copyToCacheDirectory: true, multiple: false });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return null;
    const file = new File(asset.uri), check = documentMime(asset.name, asset.size ?? file.size);
    if ("error" in check) throw new Error(check.error);
    const checksum = [...new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes()))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const order = z.object({ data: z.object({ file_id: z.string().regex(/^[1-9]\d*$/), upload_url: z.url() }) }).parse((await api.post("/files/presign", { jenis, mime: check.mime, ukuran: file.size })).data).data;
    if (!(await fetch(order.upload_url, { method: "PUT", headers: { "content-type": check.mime }, body: file })).ok) throw new Error("Berkas belum terunggah. Periksa koneksi, lalu coba lagi.");
    const confirmed = z.object({ data: z.object({ scan_status: z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]) }) }).parse((await api.post("/files/confirm", { file_id: Number(order.file_id), checksum })).data).data;
    if (file.exists) file.delete();
    return { file_id: Number(order.file_id), nama_berkas: asset.name, scan_status: confirmed.scan_status };
}
