// Foto dari kamera/galeri untuk lampiran daring (keputusan 21 log phase-07): dikompresi MOB-MED-01, diunggah lewat
// presign, lalu dikonfirmasi checksum-nya sebelum file_id ditautkan (SDD-FS-03). Tidak diantrekan saat luring.
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { fetch } from "expo/fetch";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { discardPreparedPhoto, preparePhoto } from "./native";
import type { UploadedDocument } from "./document";

export type PhotoKind = "PROCUREMENT_ATTACHMENT" | "PROCUREMENT_RECEIPT_DOCUMENT" | "PROCUREMENT_REJECTION_PHOTO" | "DISPOSAL_ATTACHMENT" | "DISPOSAL_EXECUTION_PHOTO";
const Confirmed = z.object({ data: z.object({ scan_status: z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]) }) });

/** `null` bila pengguna membatalkan kamera/galeri. */
export async function pickAndUploadPhoto(api: AxiosInstance, jenis: PhotoKind, camera: boolean): Promise<UploadedDocument | null> {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Izin kamera ditolak. Pilih foto dari galeri.");
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], exif: false, quality: 1 };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return null;
    const photo = await preparePhoto(asset.uri);
    try {
        const file = new File(photo.path);
        const order = z.object({ data: z.object({ file_id: z.string().regex(/^[1-9]\d*$/), upload_url: z.url() }) }).parse((await api.post("/files/presign", { jenis, mime: "image/jpeg", ukuran: photo.size })).data).data;
        if (!(await fetch(order.upload_url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: file })).ok) throw new Error("Foto belum terunggah. Periksa koneksi, lalu coba lagi.");
        const confirmed = Confirmed.parse((await api.post("/files/confirm", { file_id: Number(order.file_id), checksum: photo.checksum })).data).data;
        return { file_id: Number(order.file_id), nama_berkas: `foto-${order.file_id}.jpg`, checksum: photo.checksum, scan_status: confirmed.scan_status };
    } finally { await discardPreparedPhoto(photo).catch(() => undefined); }
}
