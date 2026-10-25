import { describe, expect, it } from "vitest";
import { canCancel, exceedsBalance, requestBody } from "../src/features/materials/requests.js";
import { visibleMenu } from "../src/features/menu/model.js";
import { nativeChatPath } from "../src/features/chat/model.js";

const row = (patch = {}) => ({ key: "a", material: "3", room: "8", quantity: "2", ...patch });

describe("MS-56 Ajukan Permintaan Bahan (FR-22.4, BR-086)", () => {
    it("requires material, stocked location, whole quantity, and purpose", () => {
        expect(requestBody("Praktik", [row({ room: "" })])).toEqual({ error: "Pilih bahan dan lokasi bersaldo pada setiap baris." });
        expect(requestBody("Praktik", [row({ quantity: "0" })])).toHaveProperty("error");
        expect(requestBody("  ", [row()])).toHaveProperty("error");
        expect(requestBody("Praktik", [row()])).toEqual({ body: { keperluan: "Praktik", items: [{ material_id: 3, room_id: 8, jumlah: 2 }] } });
    });
    it("rejects the same material at the same location twice", () => {
        expect(requestBody("Praktik", [row(), row({ key: "b" })])).toEqual({ error: "Jenis bahan dan lokasi hanya dipilih sekali." });
    });
    it("warns when the quantity exceeds the current location balance without blocking", () => {
        expect(exceedsBalance("5", 4)).toBe(true);
        expect(exceedsBalance("4", 4)).toBe(false);
        expect(exceedsBalance("9", undefined)).toBe(false);
    });
});

describe("MS-58 batalkan permintaan", () => {
    const user = { id: "1", role_kode: "R-05" }, perms = { "material.request": "own" };
    it("lets the requester (or Administrator) cancel before handover only", () => {
        expect(canCancel({ status: "MENUNGGU_PERSETUJUAN", pemohon_id: "1" }, user, perms)).toBe(true);
        expect(canCancel({ status: "DISERAHKAN_SEBAGIAN", pemohon_id: "1" }, user, perms)).toBe(false);
        expect(canCancel({ status: "DISETUJUI", pemohon_id: "2" }, user, perms)).toBe(false);
        expect(canCancel({ status: "DISETUJUI", pemohon_id: "2" }, { id: "9", role_kode: "R-01" }, perms)).toBe(true);
        expect(canCancel({ status: "DISETUJUI", pemohon_id: "1" }, user, {})).toBe(false);
    });
});

describe("UXD-17 dicabut di kode (UXD-19)", () => {
    it("shows the material catalogue and requests in the Pemanfaatan menu for material.view", () => {
        expect(visibleMenu({ "material.view": "own" }).find((g) => g.group === "PEMANFAATAN")?.entries.map((e) => e.path)).toEqual(["/katalog-bahan", "/permintaan-bahan"]);
    });
    it("opens material request links from the chatbot natively", () => {
        expect(nativeChatPath("/permintaan-bahan/4", { "material.view": "own" })).toBe("/permintaan-bahan/4");
    });
});
