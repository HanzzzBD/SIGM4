// ErrorMapper (SDD-06 §4.4). Yang diuji bukan hanya pemetaannya, melainkan tiga
// hal yang mudah rusak diam-diam: katalog kode tetap cerminan Bab 17.3, galat 500
// tidak pernah membocorkan pesan asli (NFR-R-10), dan 23514 memicu alarm.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    AuthError,
    DomainError,
    ForbiddenError,
    KODE_GALAT,
    NotFoundError,
    mapError,
} from "../../src/shared/errors/index.js";
import { AKAR } from "../helpers/bab113.js";

describe("katalog kode galat terhadap Bab 17.3", () => {
    // Dibaca dari berkas PRD saat uji berjalan, bukan disalin ke sini — pola yang
    // sama dengan enums.test.ts. Kode yang ditambahkan ke salah satu sisi saja
    // langsung merah.
    const bab173 = readFileSync(
        new URL("docs/PRD/03-architecture/api-conventions.md", AKAR),
        "utf8",
    )
        .split("## 17.3")[1]!
        .split("## 17.4")[0]!;
    const dariPrd = new Set(
        [...bab173.matchAll(/^\| (\d{3}) \| [^|]* \| ([^|]+) \|/gm)].flatMap(
            (m) =>
                [...m[2]!.matchAll(/`([A-Z_]+)`/g)].map(
                    (k) => `${m[1]}:${k[1]}`,
                ),
        ),
    );

    it("membaca katalog dari PRD, bukan dari daftar di dalam uji ini", () => {
        expect(dariPrd.size).toBeGreaterThan(20);
    });

    it("setiap kode Bab 17.3 ada di katalog dengan status HTTP yang sama", () => {
        const selisih = [...dariPrd].filter((baris) => {
            const [status, kode] = baris.split(":") as [
                string,
                keyof typeof KODE_GALAT,
            ];
            return KODE_GALAT[kode] !== Number(status);
        });
        expect(selisih).toEqual([]);
    });

    it("katalog tidak memuat kode di luar Bab 17.3", () => {
        const kodePrd = new Set([...dariPrd].map((b) => b.split(":")[1]));
        expect(Object.keys(KODE_GALAT).filter((k) => !kodePrd.has(k))).toEqual(
            [],
        );
    });
});

describe("mapError (SDD-06 §4.4)", () => {
    const pg = (code: string, constraint?: string) =>
        constraint === undefined ? { code } : { code, constraint };

    it.each([
        ["ZodError", { name: "ZodError", issues: [] }, 400, "INVALID_REQUEST"],
        [
            "DomainError BORROWER_BLOCKED",
            new DomainError("BORROWER_BLOCKED"),
            422,
            "BORROWER_BLOCKED",
        ],
        [
            "DomainError DURATION_EXCEEDED",
            new DomainError("DURATION_EXCEEDED"),
            422,
            "DURATION_EXCEEDED",
        ],
        [
            "DomainError INSUFFICIENT_BALANCE",
            new DomainError("INSUFFICIENT_BALANCE"),
            422,
            "INSUFFICIENT_BALANCE",
        ],
        [
            "DomainError EXCEEDS_APPROVED_QTY",
            new DomainError("EXCEEDS_APPROVED_QTY"),
            422,
            "EXCEEDS_APPROVED_QTY",
        ],
        [
            "DomainError CORE_PERMISSION_LOCKED",
            new DomainError("CORE_PERMISSION_LOCKED"),
            403,
            "CORE_PERMISSION_LOCKED",
        ],
        ["AuthError", new AuthError(), 401, "UNAUTHENTICATED"],
        ["ForbiddenError", new ForbiddenError(), 403, "FORBIDDEN"],
        ["NotFoundError", new NotFoundError(), 404, "NOT_FOUND"],
        ["pg 23505", pg("23505"), 409, "DUPLICATE_CODE"],
        ["galat tak dikenal", new Error("apa pun"), 500, "INTERNAL_ERROR"],
    ])("%s -> %d %s", (_nama, galat, status, kode) => {
        const hasil = mapError(galat);
        expect(hasil.status).toBe(status);
        expect(hasil.kode).toBe(kode);
    });

    it("23P01 pada ruangan -> RESERVATION_CONFLICT (CI-04)", () => {
        expect(mapError(pg("23P01", "booking_slots_room_no_overlap")).kode).toBe(
            "RESERVATION_CONFLICT",
        );
    });

    it("23P01 pada aset -> ASSET_NOT_AVAILABLE, dibedakan dari nama constraint", () => {
        expect(
            mapError(pg("23P01", "booking_slots_asset_no_overlap")).kode,
        ).toBe("ASSET_NOT_AVAILABLE");
    });

    it("23514 -> INSUFFICIENT_BALANCE dan WAJIB alarm — jaring terakhir SDD-DB-14 tertembus", () => {
        const hasil = mapError(pg("23514"));
        expect(hasil.kode).toBe("INSUFFICIENT_BALANCE");
        expect(hasil.alarm).toBe(true);
    });

    it("galat 500 tidak membawa pesan asli ke klien (NFR-R-10)", () => {
        const hasil = mapError(
            new Error("koneksi ke 10.0.0.5 gagal: password salah"),
        );
        expect(JSON.stringify(hasil)).not.toContain("10.0.0.5");
        expect(JSON.stringify(hasil)).not.toContain("password");
        expect(hasil.alarm).toBe(true);
    });

    it("galat domain biasa TIDAK memicu alarm — hanya yang menandakan cacat kode", () => {
        expect(mapError(new DomainError("BORROWER_BLOCKED")).alarm).toBe(false);
    });

    it("detail tanpa `field`/`errors` bukan kontrak klien — tidak diteruskan sama sekali", () => {
        const hasil = mapError(
            new DomainError("DURATION_EXCEEDED", "Durasi melebihi batas.", {
                maksJam: 8,
            }),
        );
        expect(hasil.details).toBeUndefined();
        expect(JSON.stringify(hasil)).not.toContain("maksJam");
    });

    it("objek bukan-galat tidak menjatuhkan mapper", () => {
        for (const aneh of [null, undefined, "teks", 42, {}, []]) {
            expect(mapError(aneh).kode).toBe("INTERNAL_ERROR");
        }
    });
});

// Bab 17.2: `error.message` dan `error.details` hanya membawa apa yang sengaja
// ditulis pengembang pada DomainError galat klien. Yang dijaga: bentuk kontrak,
// dan tiga hal yang tidak boleh lolos — kunci detail di luar kontrak, pesan galat
// 5xx/otorisasi, dan pesan galat sistem.
describe("mapError — pesan dan details ke klien (Bab 17.2, NFR-R-10, SDD-AUTH-08)", () => {
    it("DomainError berpesan pada galat klien: pesan diteruskan, {field} menjadi details[{field, message}]", () => {
        const hasil = mapError(
            new DomainError(
                "DUPLICATE_CODE",
                "Nama tahun ajaran sudah digunakan.",
                { field: "nama" },
            ),
        );
        expect(hasil).toEqual({
            status: 409,
            kode: "DUPLICATE_CODE",
            alarm: false,
            pesan: "Nama tahun ajaran sudah digunakan.",
            details: [
                { field: "nama", message: "Nama tahun ajaran sudah digunakan." },
            ],
        });
    });

    it("{ errors: [{ field, message }] } diteruskan butir per butir; butir yang bentuknya salah dibuang", () => {
        const hasil = mapError(
            new DomainError("VALIDATION_ERROR", "Satu atau lebih parameter tidak sah.", {
                errors: [
                    { field: "a.b", message: "Nilai harus antara 1 dan 168." },
                    { field: "c", message: "Parameter tidak dikenal." },
                    { key: "lama", message: "bentuk lama tanpa field" },
                    { field: 7, message: "field bukan teks" },
                    null,
                    "teks",
                ],
            }),
        );
        expect(hasil.details).toEqual([
            { field: "a.b", message: "Nilai harus antara 1 dan 168." },
            { field: "c", message: "Parameter tidak dikenal." },
        ]);
    });

    it("kunci detail di luar kontrak (rule, kewajiban, permissions) TIDAK ikut ke klien", () => {
        const hasil = mapError(
            new DomainError("VALIDATION_ERROR", "Penonaktifan ditolak.", {
                field: "status",
                rule: "SL-04",
                kewajiban: [{ jenis: "PINJAMAN", nomor: "PJM-RAHASIA-1" }],
                permissions: ["user.create"],
            }),
        );
        expect(hasil.details).toEqual([
            { field: "status", message: "Penonaktifan ditolak." },
        ]);
        const teks = JSON.stringify(hasil);
        for (const bocor of ["SL-04", "PJM-RAHASIA-1", "user.create", "kewajiban"]) {
            expect(teks).not.toContain(bocor);
        }
    });

    it("DomainError tanpa pesan tertulis: hanya kode — message berisi kode bukan kalimat pengguna, jadi tidak dikirim", () => {
        const hasil = mapError(new DomainError("BORROWER_BLOCKED", undefined, { field: "x" }));
        expect(hasil.pesan).toBeUndefined();
        expect(hasil.details).toBeUndefined();
    });

    it("DomainError berpesan tanpa {field}/{errors}: pesan ada, details tidak", () => {
        const hasil = mapError(new DomainError("VALIDATION_ERROR", "Gedung masih memiliki ruangan aktif.", { rule: "BR-015" }));
        expect(hasil.pesan).toBe("Gedung masih memiliki ruangan aktif.");
        expect(hasil.details).toBeUndefined();
    });

    it("NotFoundError: pesan tertulis diteruskan, tanpa pesan tidak", () => {
        expect(mapError(new NotFoundError("Unit kerja tidak ditemukan.")).pesan).toBe("Unit kerja tidak ditemukan.");
        expect(mapError(new NotFoundError()).pesan).toBeUndefined();
    });

    it.each([
        ["INTERNAL_ERROR (500)", new DomainError("INTERNAL_ERROR", "rahasia postgres://x:y@db", { field: "f" })],
        ["STORAGE_UNAVAILABLE (503)", new DomainError("STORAGE_UNAVAILABLE", "bucket s3://rahasia mati", { field: "f" })],
        ["SERVICE_NOT_READY (503)", new DomainError("SERVICE_NOT_READY", "redis 10.0.0.5 mati", { field: "f" })],
    ])("galat server %s: pesan dan details tidak pernah dikirim (NFR-R-10)", (_nama, galat) => {
        const hasil = mapError(galat);
        expect(hasil.pesan).toBeUndefined();
        expect(hasil.details).toBeUndefined();
        expect(JSON.stringify(hasil)).not.toMatch(/rahasia|10\.0\.0\.5/);
    });

    it.each([
        ["AuthError", new AuthError()],
        ["AuthError TOKEN_EXPIRED", new AuthError("TOKEN_EXPIRED")],
        ["ForbiddenError", new ForbiddenError()],
        ["DomainError FORBIDDEN berpesan", new DomainError("FORBIDDEN", "objek 42 ada tetapi bukan milik Anda", { field: "id" })],
        ["DomainError INSUFFICIENT_PERMISSION berpesan", new DomainError("INSUFFICIENT_PERMISSION", "butuh permission asset.export")],
        ["DomainError UNAUTHENTICATED berpesan", new DomainError("UNAUTHENTICATED", "token milik user 7")],
    ])("%s: jawaban autentikasi/otorisasi seragam — tanpa pesan maupun details (SDD-AUTH-08)", (_nama, galat) => {
        const hasil = mapError(galat);
        expect(hasil.pesan).toBeUndefined();
        expect(hasil.details).toBeUndefined();
    });

    it("CORE_PERMISSION_LOCKED (403 aturan bisnis, bukan otorisasi objek) tetap membawa pesannya", () => {
        const hasil = mapError(new DomainError("CORE_PERMISSION_LOCKED", "Permission inti tidak dapat dicabut dari Administrator: user.create."));
        expect(hasil.status).toBe(403);
        expect(hasil.pesan).toBe("Permission inti tidak dapat dicabut dari Administrator: user.create.");
    });

    it("galat bukan-DomainError (Zod, PostgreSQL, Error biasa) tidak pernah membawa pesan atau details", () => {
        const galatZod = { name: "ZodError", issues: [{ path: ["email"], message: "Invalid email address" }], message: "Invalid email address" };
        const galatPg = { code: "23505", constraint: "users_email_uq", message: "Key (email)=(rahasia@sekolah.sch.id) already exists." };
        for (const galat of [galatZod, galatPg, new Error("password salah untuk user 7")]) {
            const hasil = mapError(galat);
            expect(hasil.pesan).toBeUndefined();
            expect(hasil.details).toBeUndefined();
            expect(JSON.stringify(hasil)).not.toMatch(/rahasia|password|Invalid email/);
        }
    });
});
