// Kamus DSL kondisi approval — Lampiran D.2 (field) dan D.3 (operator) PRD
// `approval-rule-dsl.md`. Dibagi API (validasi simpan, RE-08) dan web (penyusun
// kondisi P-69 hanya menawarkan field yang berlaku, RE-02) supaya keduanya tidak
// menyimpang (SDD-FE-05; PR-02-34). Nilai enum adalah KODE TEKNIS (SDD-DB-02).

export type TipeField = "enum" | "integer" | "decimal" | "boolean" | "integer_array";

export type Operator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "between" | "is_true" | "is_false";

/** Bab 11.3 "Jenis Pengajuan (Approval)" = enum `approval_request_type`. */
export const JENIS_PENGAJUAN = [
    "RESERVASI_RUANGAN",
    "RESERVASI_ASET",
    "PERPANJANGAN_PEMINJAMAN",
    "PENGADAAN_BARANG",
    "PENGHAPUSAN_ASET",
    "PERMINTAAN_BAHAN",
] as const;

export type JenisPengajuan = (typeof JENIS_PENGAJUAN)[number];

const SEMUA: readonly JenisPengajuan[] = JENIS_PENGAJUAN;

export interface DefinisiField {
    readonly tipe: TipeField;
    /** D.2 kolom "Berlaku pada jenis pengajuan". */
    readonly berlaku: readonly JenisPengajuan[];
    /** Himpunan tertutup bagi enum Bab 11.3; `undefined` = terbuka (mis. kode role). */
    readonly nilaiSah?: readonly string[];
}

/** D.2 — daftar TERTUTUP; field di luar ini ditolak saat simpan (RE-08). */
export const FIELD_DSL: Readonly<Record<string, DefinisiField>> = {
    requester_role: { tipe: "enum", berlaku: SEMUA },
    requester_id: { tipe: "integer", berlaku: SEMUA },
    requester_has_overdue: { tipe: "boolean", berlaku: SEMUA },
    total_value: { tipe: "decimal", berlaku: ["PENGADAAN_BARANG", "PENGHAPUSAN_ASET"] },
    item_count: { tipe: "integer", berlaku: ["RESERVASI_ASET", "PENGADAAN_BARANG", "PENGHAPUSAN_ASET", "PERMINTAAN_BAHAN"] },
    material_category_id: { tipe: "integer_array", berlaku: ["PERMINTAAN_BAHAN"] },
    material_qty_total: { tipe: "integer", berlaku: ["PERMINTAAN_BAHAN"] },
    material_value_total: { tipe: "decimal", berlaku: ["PERMINTAAN_BAHAN"] },
    duration_days: { tipe: "integer", berlaku: ["RESERVASI_ASET", "PERPANJANGAN_PEMINJAMAN"] },
    duration_hours: { tipe: "integer", berlaku: ["RESERVASI_RUANGAN"] },
    asset_category_id: { tipe: "integer_array", berlaku: ["RESERVASI_ASET", "PENGHAPUSAN_ASET"] },
    asset_value_max: { tipe: "decimal", berlaku: ["RESERVASI_ASET"] },
    room_type: {
        tipe: "enum",
        berlaku: ["RESERVASI_RUANGAN"],
        nilaiSah: ["KELAS", "LABORATORIUM", "AULA", "PERPUSTAKAAN", "KANTOR", "GUDANG", "LAPANGAN", "LAINNYA"],
    },
    room_id: { tipe: "integer_array", berlaku: ["RESERVASI_RUANGAN"] },
    participant_count: { tipe: "integer", berlaku: ["RESERVASI_RUANGAN"] },
    is_recurring: { tipe: "boolean", berlaku: ["RESERVASI_RUANGAN"] },
    is_outside_operating_hours: { tipe: "boolean", berlaku: ["RESERVASI_RUANGAN"] },
    lead_time_hours: { tipe: "integer", berlaku: ["RESERVASI_RUANGAN", "RESERVASI_ASET"] },
    disposal_reason: {
        tipe: "enum",
        berlaku: ["PENGHAPUSAN_ASET"],
        nilaiSah: ["RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI", "HILANG", "HABIS_UMUR_TEKNIS", "LAINNYA"],
    },
    priority: { tipe: "enum", berlaku: ["PENGADAAN_BARANG"], nilaiSah: ["RENDAH", "SEDANG", "TINGGI", "MENDESAK"] },
};

/**
 * D.3 — operator yang sah per tipe. `eq`/`neq` pada field ARRAY ditolak (keputusan
 * 66): kesamaan himpunan bukan pertanyaan yang diajukan aturan persetujuan.
 */
export const OPERATOR_PER_TIPE: Readonly<Record<TipeField, readonly Operator[]>> = {
    enum: ["eq", "neq", "in", "not_in"],
    integer: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
    decimal: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
    boolean: ["eq", "neq", "is_true", "is_false"],
    integer_array: ["in", "not_in"],
};

/** D.1 — kedalaman GRUP maksimum (grup akar = 1; predikat tidak menambah tingkat, keputusan 66). */
export const KEDALAMAN_GRUP_MAKS = 3;

/** D.2 yang berlaku bagi satu jenis pengajuan, urutan tabel D.2 (RE-02). */
export function fieldBerlaku(jenis: JenisPengajuan): readonly string[] {
    return Object.keys(FIELD_DSL).filter((f) => FIELD_DSL[f]?.berlaku.includes(jenis) === true);
}
