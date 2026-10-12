import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { createUploadSender } from "../src/shared/upload/sender.js";
import { MobileApiError } from "../src/shared/api/client.js";
import type { UploadEntry, UploadQueue } from "../src/shared/upload/queue.js";

const item: UploadEntry = { id: "a", accountId: "1", path: "file:///queue/a.jpg", ownerType: "DAMAGE_PHOTO", ownerId: "4", fileId: "5", checksum: "a".repeat(64), size: 100, createdAt: 1000, attempts: 0, nextAttemptAt: 1000 };
function setup(post: ReturnType<typeof vi.fn>, account = "1") {
    const setFileId = vi.fn(async () => undefined); const put = vi.fn(async () => true);
    const send = createUploadSender({ post } as unknown as AxiosInstance, { setFileId } as unknown as UploadQueue, () => account, () => undefined, put);
    return { send, setFileId, put };
}
describe("PR-04-16 unggah berkas tertunda", () => {
    it("respons confirm sebelumnya hilang: confirm idempoten sukses, tidak menerbitkan URL/menimpa CLEAN", async () => {
        const post = vi.fn(async () => ({ data: {} })); const { send, put } = setup(post);
        await send(item, new AbortController().signal);
        expect(post).toHaveBeenCalledExactlyOnceWith("/files/confirm", { file_id: 5, checksum: item.checksum }, expect.anything());
        expect(put).not.toHaveBeenCalled();
    });
    it("objek belum terunggah: URL diperbarui memakai file_id yang sama, checkpoint sebelum PUT, lalu confirm", async () => {
        const post = vi.fn().mockRejectedValueOnce(new MobileApiError(422, "VALIDATION_ERROR", "Belum terunggah", [{ field: "file_id", message: "Belum terunggah" }])).mockResolvedValueOnce({ data: { data: { file_id: "5", upload_url: "https://storage.test/put" } } }).mockResolvedValueOnce({ data: {} });
        const { send, setFileId, put } = setup(post);
        await send(item, new AbortController().signal);
        expect(post.mock.calls.map((call) => call[0])).toEqual(["/files/confirm", "/files/5/presign", "/files/confirm"]);
        expect(setFileId).toHaveBeenCalledWith("a", "1", "5");
        expect(setFileId.mock.invocationCallOrder[0]).toBeLessThan(put.mock.invocationCallOrder[0] ?? 0);
        expect(put).toHaveBeenCalledWith("https://storage.test/put", item.path, expect.anything());
    });
    it("checksum berbeda/berkas asing tidak pernah meminta URL baru", async () => {
        for (const error of [new MobileApiError(422, "VALIDATION_ERROR", "Checksum berbeda", [{ field: "checksum", message: "Berbeda" }]), new MobileApiError(404, "NOT_FOUND", "Tidak ditemukan")]) {
            const post = vi.fn().mockRejectedValue(error); const { send, put } = setup(post);
            await expect(send(item, new AbortController().signal)).rejects.toBe(error);
            expect(post).toHaveBeenCalledTimes(1); expect(put).not.toHaveBeenCalled();
        }
    });
    it("akun berbeda/pembatalan/transaksi belum tercatat tidak mengirim berkas", async () => {
        const post = vi.fn(); const { send } = setup(post, "2");
        await expect(send(item, new AbortController().signal)).rejects.toThrow("Sesi berubah");
        const valid = setup(post); const controller = new AbortController(); controller.abort();
        await expect(valid.send(item, controller.signal)).rejects.toThrow("dibatalkan");
        await expect(valid.send({ ...item, ownerId: null }, new AbortController().signal)).rejects.toThrow("transaksi server");
        expect(post).not.toHaveBeenCalled();
    });
});
