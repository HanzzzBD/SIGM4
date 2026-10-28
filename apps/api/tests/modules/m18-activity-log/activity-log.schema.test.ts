// Skema Zod M-18 (SDD-API-01). Uji negatif adalah acceptance PR-01-08 yang
// sebenarnya: permintaan yang tidak sah wajib ditolak SEBELUM lapisan layanan.

import { describe, expect, it } from "vitest";
import {
    ExportActivityLogsQuerySchema,
    ListActivityLogsQuerySchema,
} from "../../../src/modules/m18-activity-log/schemas/activity-log.schema.js";

describe("ListActivityLogsQuerySchema (FR-18.2 langkah 3)", () => {
    it("berbawaan page=1, per_page=25 tanpa filter apa pun", () => {
        const hasil = ListActivityLogsQuerySchema.parse({});
        expect(hasil.page).toBe(1);
        expect(hasil.per_page).toBe(25);
        expect(hasil.dari).toBeUndefined();
        expect(hasil.sampai).toBeUndefined();
    });

    it("menerima kombinasi filter tanggal, pengguna, role, modul, aksi, dan entitas", () => {
        const hasil = ListActivityLogsQuerySchema.parse({
            dari: "2026-09-01T00:00:00Z",
            sampai: "2026-09-30T23:59:59Z",
            user_id: "5",
            role: "R-01",
            modul: "m02-users",
            aksi: "USER_CREATED",
            entitas: "users",
            entitas_id: "5",
        });
        expect(hasil.dari).toBeInstanceOf(Date);
        expect(hasil.sampai).toBeInstanceOf(Date);
        expect(hasil.user_id).toBe(5);
        expect(hasil.role).toBe("R-01");
        expect(hasil.modul).toBe("m02-users");
        expect(hasil.aksi).toBe("USER_CREATED");
        expect(hasil.entitas).toBe("users");
        expect(hasil.entitas_id).toBe(5);
    });

    it("menolak dari > sampai", () => {
        expect(() =>
            ListActivityLogsQuerySchema.parse({
                dari: "2026-09-30T00:00:00Z",
                sampai: "2026-09-01T00:00:00Z",
            }),
        ).toThrow();
    });

    it("menerima dari === sampai (rentang satu titik waktu)", () => {
        const hasil = ListActivityLogsQuerySchema.parse({
            dari: "2026-09-01T00:00:00Z",
            sampai: "2026-09-01T00:00:00Z",
        });
        expect(hasil.dari?.getTime()).toBe(hasil.sampai?.getTime());
    });

    it("menolak per_page di atas 100", () => {
        expect(() => ListActivityLogsQuerySchema.parse({ per_page: "101" })).toThrow();
    });

    it("menolak user_id bukan angka positif", () => {
        expect(() => ListActivityLogsQuerySchema.parse({ user_id: "-1" })).toThrow();
    });
});

describe("ExportActivityLogsQuerySchema (FR-18.2 langkah 5, PR-01-09)", () => {
    it("TIDAK memiliki page/per_page — hasil filter diekspor utuh", () => {
        const hasil = ExportActivityLogsQuerySchema.parse({});
        expect(hasil).not.toHaveProperty("page");
        expect(hasil).not.toHaveProperty("per_page");
    });

    it("menerima filter yang sama seperti daftar", () => {
        const hasil = ExportActivityLogsQuerySchema.parse({
            modul: "m02-users",
            aksi: "USER_CREATED",
            entitas: "users",
            entitas_id: "5",
        });
        expect(hasil.modul).toBe("m02-users");
        expect(hasil.entitas_id).toBe(5);
    });

    it("menolak dari > sampai, sama seperti daftar", () => {
        expect(() =>
            ExportActivityLogsQuerySchema.parse({
                dari: "2026-09-30T00:00:00Z",
                sampai: "2026-09-01T00:00:00Z",
            }),
        ).toThrow();
    });
});
