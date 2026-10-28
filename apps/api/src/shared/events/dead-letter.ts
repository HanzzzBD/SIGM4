// Ringkasan dead letter untuk kartu "Efek Tertunda Gagal" Dashboard Administrator
// (19.2, SDD-EVT-10; SDD-14 §4.3a, keputusan 82). BACA SAJA: tidak ada jalan memproses
// ulang dari sini. Payload tidak pernah dikembalikan — bisa memuat data pribadi.

import { sql } from "kysely";
import type { TransactionScope } from "../db/index.js";
import { MAX_ATTEMPTS } from "./dispatcher.js";

export interface DeadLetter {
    readonly id: number;
    readonly event_name: string;
    readonly occurred_at: Date;
    readonly last_error: string | null;
}

/** Predikat dead letter sama dengan dispatcher: belum diproses dan percobaan habis (`SDD-07 §4.2`). */
export async function ringkasanDeadLetter(scope: TransactionScope, batas: number): Promise<{ jumlah: number; daftar: readonly DeadLetter[] }> {
    const mati = scope.tx.selectFrom("event_outbox").where("processed_at", "is", null).where("attempts", ">=", MAX_ATTEMPTS);
    const [n] = await mati.select(sql<string>`count(*)`.as("n")).execute();
    const daftar = await mati.select(["id", "event_name", "occurred_at", "last_error"]).orderBy("occurred_at", "desc").orderBy("id", "desc").limit(batas).execute();
    return { jumlah: Number(n?.n ?? 0), daftar: daftar.map((d) => ({ id: Number(d.id), event_name: d.event_name, occurred_at: d.occurred_at, last_error: d.last_error })) };
}
