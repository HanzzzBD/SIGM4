import axios from "axios";
import type { AxiosAdapter } from "axios";
import { describe, expect, it, vi } from "vitest";
import { DamageSubmission, objectParams, openReport, readablePhotoUrl } from "../src/features/damage/model";
import type { SubmissionInput } from "../src/features/damage/model";
import { MobileApiError } from "../src/shared/api/client";
import type { UploadQueue } from "../src/shared/upload/queue";

const photo = { id: "local", path: "file:///private/local.jpg", checksum: "a".repeat(64), size: 100, createdAt: 1000 };
const input: SubmissionInput = { object: { kind: "ASET", id: "8", label: "AST-8" }, description: "Layar pecah", urgency: "TINGGI", existingId: null, photos: [photo] };
const signal = () => new AbortController().signal;
const success = { success: true, data: { id: "9", nomor: "KRS-2026-0001", status: "DILAPORKAN", foto_tertunda: 1 }, meta: null };
function setup(adapter: AxiosAdapter, failQueue = false) {
    const events: string[] = []; const entries: unknown[] = []; let account = "1";
    const enqueue = vi.fn(async (entry) => { events.push("enqueue"); if (failQueue) throw new Error("Disk penuh"); entries.push(entry); });
    const setOwner = vi.fn(async () => { events.push("owner"); });
    const api = axios.create({ adapter: async (config) => { events.push(config.url!); return adapter(config); } });
    const submit = new DamageSubmission(api, { enqueue, setOwner } as unknown as UploadQueue, "1", () => account);
    return { submit, api, enqueue, setOwner, events, entries, changeAccount: () => { account = "2"; } };
}
const basic: AxiosAdapter = async (config) => ({ config, status: 201, statusText: "Created", headers: {}, data: config.url === "/files/presign" ? { data: { file_id: "42" } } : success });

describe("PR-05-34: laporan, tiket eksisting dan byte foto persisten", () => {
    it("menyimpan berkas sebelum POST tiket; SQLite tidak menerima isian/token/URL", async () => {
        const test = setup(basic); const result = await test.submit.send(input, signal());
        expect(test.events).toEqual(["/files/presign", "enqueue", "/damage-reports", "owner"]); expect(result).toMatchObject({ reportId: "9", pending: 1, note: false });
        expect(test.entries).toEqual([{ ...photo, accountId: "1", ownerType: "DAMAGE_PHOTO", ownerId: null, fileId: "42" }]);
        expect(test.setOwner).toHaveBeenCalledWith("local", "1", "9");
    });
    it("disk gagal: tidak pernah membuat tiket yang akan kehilangan foto", async () => {
        const test = setup(basic, true); await expect(test.submit.send(input, signal())).rejects.toThrow("Disk penuh"); expect(test.events).toEqual(["/files/presign", "enqueue"]);
    });
    it("BR-044 dan validasi isian dilakukan sebelum memesan berkas", async () => {
        for (const invalid of [{ ...input, photos: [] }, { ...input, photos: Array(6).fill(photo) }, { ...input, photos: [photo, photo] }, { ...input, description: "   " }, { ...input, object: { ...input.object, id: "0" } }]) {
            const test = setup(basic); await expect(test.submit.send(invalid, signal())).rejects.toThrow(); expect(test.events).toEqual([]);
        }
    });
    it("catatan tiket eksisting boleh tanpa foto dan dikirim ke endpoint notes", async () => {
        const test = setup(async (config) => ({ config, status: 201, statusText: "Created", headers: {}, data: { success: true, meta: null, data: { id: "10", keterangan: "Info", penulis: { id: "1", nama: "Penulis" }, dibuat_pada: "2026-10-13T08:00:00+07:00", foto: [] } } }));
        expect(await test.submit.send({ ...input, existingId: "9", photos: [] }, signal())).toMatchObject({ note: true, reportId: "9", pending: 0 }); expect(test.events).toEqual(["/damage-reports/9/notes"]);
    });
    it("respons POST hilang/5xx memblokir niat ulang tanpa menambah catatan atau foto", async () => {
        for (const error of [new MobileApiError(0, "NETWORK_ERROR", "Hilang"), new MobileApiError(500, "SERVER_ERROR", "Hilang"), new MobileApiError(408, "TIMEOUT", "Hilang")]) {
            const test = setup(async (config) => { if (config.url !== "/files/presign") throw error; return basic(config); });
            await expect(test.submit.send(input, signal())).rejects.toBe(error); expect(test.submit.uncertain).toBe(true);
            await expect(test.submit.send(input, signal())).rejects.toThrow("belum pasti"); expect(test.events.filter((event) => event === "/damage-reports")).toHaveLength(1); expect(test.enqueue).toHaveBeenCalledTimes(1);
        }
    });
    it("konflik tiket memberi kesempatan menambahkan info dengan file_id sama", async () => {
        let failed = false; const bodies: unknown[] = [];
        const test = setup(async (config) => { bodies.push(JSON.parse(config.data as string)); if (config.url === "/damage-reports" && !failed) { failed = true; throw new MobileApiError(409, "DUPLICATE_CODE", "Tiket ada"); } return basic(config); });
        await expect(test.submit.send(input, signal())).rejects.toThrow("Tiket ada"); expect(test.submit.uncertain).toBe(false);
        await test.submit.send(input, signal()); expect(test.enqueue).toHaveBeenCalledTimes(1); expect(test.events.filter((event) => event === "/files/presign")).toHaveLength(1); expect(bodies.slice(1)).toEqual([{ asset_id: 8, deskripsi: "Layar pecah", urgensi: "TINGGI", foto_file_ids: [42] }, { asset_id: 8, deskripsi: "Layar pecah", urgensi: "TINGGI", foto_file_ids: [42] }]);
    });
    it("metadata owner gagal setelah sukses tidak mengulang POST", async () => {
        const test = setup(basic); test.setOwner.mockRejectedValueOnce(new Error("Disk")); const result = await test.submit.send(input, signal()); expect(result.queueWarning).toBe(true);
        expect(await test.submit.send(input, signal())).toEqual(result); expect(test.events.filter((event) => event === "/damage-reports")).toHaveLength(1);
    });
    it("akun berganti sesudah presign: tidak mengantrekan foto atau mengirim bisnis", async () => {
        const test = setup(async (config) => { test.changeAccount(); return basic(config); });
        await expect(test.submit.send(input, signal())).rejects.toThrow("Sesi berubah"); expect(test.enqueue).not.toHaveBeenCalled(); expect(test.events).toEqual(["/files/presign"]);
    });
    it("tap bersamaan terkunci sebelum HTTP; abort awal tidak membuat pesanan", async () => {
        let done!: () => void;
        const test = setup(async (config) => { if (config.url === "/files/presign") await new Promise<void>((resolve) => { done = resolve; }); return basic(config); });
        const first = test.submit.send(input, signal()); await expect(test.submit.send(input, signal())).rejects.toThrow("sedang dikirim"); done(); await first;
        const abort = new AbortController(); abort.abort(); const other = setup(basic); await expect(other.submit.send(input, abort.signal)).rejects.toThrow("dibatalkan"); expect(other.events).toEqual([]);
    });
    it("ruangan memakai room_id, tiket terbuka diparse tanpa membaca detail pelapor lain", async () => {
        const object = { kind: "RUANGAN" as const, id: "3", label: "Aula" }; expect(objectParams(object)).toEqual({ room_id: 3 });
        const calls: string[] = []; const api = axios.create({ adapter: async (config) => { calls.push(config.url!); expect(config.params).toEqual({ room_id: 3 }); return { config, headers: {}, status: 200, statusText: "OK", data: { success: true, meta: null, data: { id: "9", nomor: "KRS-2026-0001", status: "DILAPORKAN", urgensi: "TINGGI", dilaporkan_pada: "2026-10-13T08:00:00+07:00", milik_sendiri: false } } }; } });
        expect(await openReport(api, object, signal())).toMatchObject({ milik_sendiri: false, id: "9" }); expect(calls).toEqual(["/damage-reports/open"]);
    });
    it("URL privat hanya dibaca setelah CLEAN dan protokol aman", () => {
        expect(readablePhotoUrl({ status: "CLEAN", url: "https://storage.test/photo?signature=x" })).toBe("https://storage.test/photo?signature=x");
        for (const status of ["PENDING", "BELUM_TERUNGGAH", "INFECTED", "FAILED"]) expect(readablePhotoUrl({ status, url: "https://storage.test/photo" })).toBeNull();
        for (const url of [null, "http://storage.test/photo", "file:///secret", "javascript:alert(1)", "https://user@storage.test/photo"]) expect(readablePhotoUrl({ status: "CLEAN", url })).toBeNull();
    });
    it("catatan dengan respons hilang tidak dikirim ulang otomatis atau manual dari niat sama", async () => {
        const test = setup(async () => { throw new MobileApiError(0, "NETWORK_ERROR", "Hilang"); });
        const note = { ...input, existingId: "9", photos: [] };
        await expect(test.submit.send(note, signal())).rejects.toThrow("Hilang"); await expect(test.submit.send(note, signal())).rejects.toThrow("belum pasti"); expect(test.events).toEqual(["/damage-reports/9/notes"]);
    });
});
