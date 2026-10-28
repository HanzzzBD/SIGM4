// Pemeriksaan dependensi yang koneksinya sudah ada sejak Phase 00 (SDD-15 §4.5).
// Dependensi lain mendaftarkan pemeriksaannya bersama adapternya.

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Redis } from "ioredis";
import type { Database } from "../db/index.js";
import type { HealthCheck } from "./health.js";
import { pingCheck } from "./health.js";

export function databaseCheck(db: Kysely<Database>): HealthCheck {
    return pingCheck("database", () => sql`select 1`.execute(db));
}

export function redisCheck(redis: Redis): HealthCheck {
    return pingCheck("redis", () => redis.ping());
}
