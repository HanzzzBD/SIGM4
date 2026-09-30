// Permukaan publik satu-satunya paket bersama (SDD-REPO-05).
// Isinya: skema Zod (SDD-FE-05, SDD-API-11) dan peta kode -> label enum
// (SDD-FE-08, SDD-MOB-01). Keduanya ditambahkan oleh modul yang membutuhkannya.
// Berkas ini menetapkan bahwa satu-satunya jalur berbagi lintas pohon melewati sini.
export {
    LABEL_ALASAN_PENGHAPUSAN,
    LABEL_JENIS_PENGAJUAN,
    LABEL_JENIS_RUANGAN,
    LABEL_PRIORITAS,
    LABEL_KONDISI_ASET,
    LABEL_STATUS_ASET,
    LABEL_STATUS_INSTANCE_APPROVAL,
    labelEnum,
} from "./enum-labels.js";
export type { DefinisiField, JenisPengajuan, Operator, TipeField } from "./approval-dsl.js";
export { FIELD_DSL, JENIS_PENGAJUAN, KEDALAMAN_GRUP_MAKS, OPERATOR_PER_TIPE, fieldBerlaku } from "./approval-dsl.js";
