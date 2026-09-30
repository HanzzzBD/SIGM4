// Rentang waktu dashboard (19.1; keputusan 82h) — dipisah agar router tidak menarik halaman ke bundel awal.
export const RENTANG = ["7_hari", "30_hari", "semester", "tahun_ajaran"] as const;
export type Rentang = (typeof RENTANG)[number];
export const LABEL_RENTANG: Record<Rentang, string> = { "7_hari": "7 hari", "30_hari": "30 hari", semester: "Semester berjalan", tahun_ajaran: "Tahun ajaran" };
