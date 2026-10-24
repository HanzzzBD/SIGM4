import type { AnalyticsType } from "@sigm4/schemas";
export const SOURCE_PERMISSIONS = { assets: "asset.view", reservations: "reservation.view", loans: "loan.view", damage: "damage.view", maintenance: "maintenance.view_cost", procurement: "procurement.view", disposal: "disposal.view", material_consumption: "material.view" } as const;
export type AnalyticsSource = keyof typeof SOURCE_PERMISSIONS;
export const ANALYTICS_DEFINITIONS: Readonly<Record<AnalyticsType, { judul: string; primary: AnalyticsSource; sources: readonly AnalyticsSource[]; filters: readonly ("room_id" | "category_id" | "work_unit_id" | "requester_role")[] }>> = {
    "kondisi-aset": { judul: "Kondisi Aset", primary: "assets", sources: ["assets"], filters: ["room_id", "category_id"] },
    "pemanfaatan-fasilitas": { judul: "Pemanfaatan Fasilitas", primary: "reservations", sources: ["assets", "reservations", "loans"], filters: ["room_id", "category_id", "work_unit_id", "requester_role"] },
    "biaya-pemeliharaan": { judul: "Biaya Pemeliharaan", primary: "maintenance", sources: ["assets", "maintenance"], filters: ["room_id", "category_id"] },
    "tren-kerusakan": { judul: "Tren Kerusakan", primary: "damage", sources: ["assets", "damage"], filters: ["room_id", "category_id", "work_unit_id", "requester_role"] },
    "aktivitas-peminjaman": { judul: "Aktivitas Peminjaman", primary: "loans", sources: ["assets", "loans"], filters: ["room_id", "category_id", "work_unit_id", "requester_role"] },
    "konsumsi-bahan": { judul: "Konsumsi Bahan", primary: "material_consumption", sources: ["material_consumption"], filters: ["room_id", "category_id", "work_unit_id", "requester_role"] },
    "kebutuhan-pengadaan": { judul: "Kebutuhan Pengadaan", primary: "assets", sources: ["assets", "reservations"], filters: ["room_id", "category_id"] },
    "rekapitulasi-aset": { judul: "Rekapitulasi Aset", primary: "assets", sources: ["assets"], filters: ["room_id", "category_id"] },
};
