import { Directory, File, Paths } from "expo-file-system";
import { fetch } from "expo/fetch";
import { createStocktakeSender } from "./sender";
import type { AxiosInstance } from "axios";
import type { PreparedPhoto } from "../uploads";
import { stocktakeDatabase } from "../../shared/stocktake-native";
import type { QueueDatabase } from "../../shared/upload/queue";

import { StocktakeQueue } from "./queue";

const directory = new Directory(Paths.document, "sigm4-stocktake-photos");
const originalDirectory = new Directory(Paths.document, "sigm4-upload-queue");
export const removeStocktakePhoto = async (path: string) => {
    if (!new URL(path).href.startsWith(directory.uri.replace(/\/?$/, "/"))) throw new Error("Foto bukan milik antrean opname.");
    const file = new File(path); if (file.exists) file.delete();
};
export function stageStocktakePhoto(photo: PreparedPhoto): PreparedPhoto {
    if (!new URL(photo.path).href.startsWith(originalDirectory.uri.replace(/\/?$/, "/"))) throw new Error("Foto belum disiapkan oleh aplikasi.");
    directory.create({ idempotent: true, intermediates: true }); const target = new File(directory, `${photo.id}.jpg`); new File(photo.path).move(target); return { ...photo, path: target.uri };
}
export async function openStocktakeQueue() {
    directory.create({ idempotent: true, intermediates: true });
    const db = await stocktakeDatabase(), queue = new StocktakeQueue(db as unknown as QueueDatabase, { remove: removeStocktakePhoto }, Date.now); await queue.initialize();
    const rows = await db.getAllAsync<{ photos: string }>("SELECT photos FROM stocktake_pending");
    const retained = new Set(rows.flatMap(r => (JSON.parse(r.photos) as { path: string }[]).map(p => p.path)));
    for (const file of directory.list()) if (file instanceof File && !retained.has(file.uri)) file.delete();
    return queue;
}
export function stocktakeSender(api: AxiosInstance, queue: StocktakeQueue, currentAccount: () => string | null) {
    return createStocktakeSender(api, queue, currentAccount, async (url, path, signal) => {
        const response = await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: new File(path), signal }); return response.ok;
    });
}
