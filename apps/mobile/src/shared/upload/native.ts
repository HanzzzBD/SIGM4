import { createUploadSender } from "./sender";
import { Directory, File, Paths } from "expo-file-system";
import { fetch } from "expo/fetch";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { openDatabaseAsync } from "expo-sqlite";
import type { AxiosInstance } from "axios";
import { UploadQueue } from "./queue";
import type { QueueDatabase } from "./queue";

const directory = new Directory(Paths.document, "sigm4-upload-queue");
export async function openUploadQueue(notice: (count: number) => void): Promise<UploadQueue> {
    directory.create({ idempotent: true, intermediates: true });
    const db = await openDatabaseAsync("sigm4-uploads.db");
    const queue = new UploadQueue(db as QueueDatabase, { remove: async (path) => {
        if (!new URL(path).href.startsWith(directory.uri.replace(/\/?$/, "/"))) throw new Error("Berkas bukan milik antrean.");
        const file = new File(path); if (file.exists) file.delete();
    } }, Date.now, notice);
    await queue.initialize();
    // Berkas tanpa baris (aplikasi mati di tengah enqueue/cleanup) tidak dipertahankan.
    const rows = await db.getAllAsync<{ path: string }>("SELECT path FROM uploads");
    const retained = new Set(rows.map((row) => row.path));
    for (const file of directory.list()) if (file instanceof File && !retained.has(file.uri)) file.delete();
    return queue;
}
/** MOB-MED-01/02: render native membuang EXIF; kualitas tetap 80%, dimensi diperkecil sampai <=500 KB. */
export interface PreparedPhoto { id: string; path: string; checksum: string; size: number; createdAt: number }
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    let longest = Math.min(1600, Math.max(original.width, original.height));
    const id = Crypto.randomUUID();
    let temporary: File;
    for (;;) {
        const factor = longest / Math.max(original.width, original.height);
        const image = await ImageManipulator.manipulate(uri).resize({ width: Math.max(1, Math.round(original.width * factor)), height: Math.max(1, Math.round(original.height * factor)) }).renderAsync();
        const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
        temporary = new File(result.uri);
        if (temporary.size <= 500 * 1024) break;
        temporary.delete();
        if (longest <= 320) throw new Error("Foto terlalu besar setelah kompresi. Pilih foto lain.");
        longest = Math.max(320, Math.floor(longest * 0.8));
    }
    const destination = new File(directory, `${id}.jpg`);
    temporary.move(destination);
    try {
        const checksum = [...new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await destination.bytes()))].map((b) => b.toString(16).padStart(2, "0")).join("");
        return { id, path: destination.uri, checksum, size: destination.size, createdAt: Date.now() };
    } catch (error) { if (destination.exists) destination.delete(); throw error; }
}
/** Panggil setelah presign dan transaksi server berhasil menautkan file_id ke entitas. */
export async function enqueuePreparedPhoto(queue: UploadQueue, photo: PreparedPhoto, accountId: string, ownerType: string, ownerId: string, fileId: string): Promise<void> {
    if (!/^[1-9]\d*$/.test(ownerId) || !/^[1-9]\d*$/.test(fileId)) throw new Error("Foto harus ditautkan ke transaksi server sebelum diantrekan.");
    await queue.enqueue({ ...photo, accountId, ownerType, ownerId, fileId });
}

export function uploadSender(api: AxiosInstance, queue: UploadQueue, currentAccount: () => string | null, progress: (id: string, message: string) => void) {
    return createUploadSender(api, queue, currentAccount, progress, async (url, path, signal) => {
        const response = await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: new File(path), signal });
        return response.ok;
    });
}
