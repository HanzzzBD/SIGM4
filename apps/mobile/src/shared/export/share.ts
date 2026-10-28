// Ekspor tersimpan di perangkat (keputusan 24 log phase-07): berkas diunduh ke cache aplikasi lalu dibuka di lembar
// bagikan OS — pengguna memilih Files/Drive/Unduhan atau aplikasi lain. Cache dibersihkan OS; tidak ada salinan lain.
import type { AxiosInstance } from "axios";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { MIME, formatOf, safeFileName } from "./format";
import type { ExportFormat } from "./format";
export type { ExportFormat } from "./format";

async function share(file: File, format: ExportFormat, title: string) {
    if (!(await Sharing.isAvailableAsync())) throw new Error("Lembar bagikan tidak tersedia di perangkat ini.");
    await Sharing.shareAsync(file.uri, { mimeType: MIME[format], UTI: format === "pdf" ? "com.adobe.pdf" : "org.openxmlformats.spreadsheetml.sheet", dialogTitle: title });
}
/** Endpoint ekspor langsung ber-otorisasi (respons biner), mis. inventaris ruangan dan arsip penghapusan. */
export async function shareFromApi(api: AxiosInstance, path: string, params: Readonly<Record<string, unknown>>, name: string, format: ExportFormat) {
    const response = await api.get<ArrayBuffer>(path, { params, responseType: "arraybuffer" });
    const file = new File(Paths.cache, safeFileName(name, format));
    if (file.exists) file.delete();
    file.create(); file.write(new Uint8Array(response.data));
    await share(file, format, `Simpan ${file.name}`);
}
/** URL presign (ekspor latar belakang, berita acara) — tanpa header otorisasi. */
export async function shareFromUrl(url: string, name: string) {
    if (!/^https?:\/\//i.test(url)) throw new Error("Tautan unduhan tidak sah.");
    const format = formatOf(name), target = new File(Paths.cache, safeFileName(name, format));
    if (target.exists) target.delete();
    const file = await File.downloadFileAsync(url, target);
    await share(file, format, `Simpan ${file.name}`);
}
