// SDD-INF-09 sisi basis data — terhadap PostgreSQL NYATA.
//
// Basis data SENGAJA diberi zona bawaan Asia/Jakarta lebih dulu, seperti penyedia
// terkelola yang disetel ke waktu lokal. Tanpa prasyarat itu, PostgreSQL
// pengembangan yang kebetulan UTC membuat setiap uji di sini hijau tanpa
// membuktikan apa pun.

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    assertDatabaseTimeZoneUtc,
    createDb,
    readDatabaseConfig,
} from "../../src/shared/db/index.js";
import type { Database } from "../../src/shared/db/index.js";
import { DIR_MIGRATION, dbmate, kueri } from "../helpers/db.js";

const PROBE = "9101_probe_zona_sesi.sql";

async function zonaSesi(db: Kysely<Database>): Promise<string | undefined> {
    const { rows } = await sql<{
        zona: string;
    }>`select current_setting('TimeZone') as zona`.execute(db);
    return rows[0]?.zona;
}

describe.skipIf(process.env["DATABASE_URL"] === undefined)(
    "zona waktu sesi basis data (SDD-INF-09)",
    () => {
        let namaDb = "";
        let probeTerpasang = false;
        const aplikasi = createDb(readDatabaseConfig());
        const tanpaPaksaan = new Kysely<Database>({
            dialect: new PostgresDialect({
                pool: new pg.Pool({
                    connectionString: process.env["DATABASE_URL"],
                    max: 1,
                }),
            }),
        });

        beforeAll(async () => {
            const [baris] = await kueri<{ db: string }>(
                "SELECT current_database() AS db",
            );
            namaDb = baris!.db;
            await kueri(
                `ALTER DATABASE "${namaDb}" SET TimeZone TO 'Asia/Jakarta'`,
            );
        });

        afterAll(async () => {
            await kueri(`ALTER DATABASE "${namaDb}" RESET TimeZone`);
            if (probeTerpasang) dbmate("down");
            rmSync(join(DIR_MIGRATION, PROBE), { force: true });
            await aplikasi.destroy();
            await tanpaPaksaan.destroy();
        });

        it("prasyarat: sesi tanpa paksaan memang mewarisi Asia/Jakarta", async () => {
            expect(await zonaSesi(tanpaPaksaan)).toBe("Asia/Jakarta");
        });

        it("pool aplikasi tetap UTC meski zona bawaan basis data bukan UTC", async () => {
            expect(await zonaSesi(aplikasi)).toBe("UTC");
        });

        it("verifikasi startup lolos pada pool aplikasi dan menolak sesi tanpa paksaan", async () => {
            await expect(
                assertDatabaseTimeZoneUtc(aplikasi),
            ).resolves.toBeUndefined();
            await expect(
                assertDatabaseTimeZoneUtc(tanpaPaksaan),
            ).rejects.toThrow(/Zona waktu sesi basis data harus UTC/);
        });

        it("sesi jalur migration dipaksa UTC — batas partisi 0008 tidak bergeser", async () => {
            writeFileSync(
                join(DIR_MIGRATION, PROBE),
                "-- migrate:up\n" +
                    "CREATE TABLE probe_zona_sesi (zona text NOT NULL);\n" +
                    "INSERT INTO probe_zona_sesi SELECT current_setting('TimeZone');\n\n" +
                    "-- migrate:down\nDROP TABLE IF EXISTS probe_zona_sesi;\n",
                "utf8",
            );
            dbmate("up");
            probeTerpasang = true;

            const rows = await kueri<{ zona: string }>(
                "SELECT zona FROM probe_zona_sesi",
            );
            expect(rows).toEqual([{ zona: "UTC" }]);
        });
    },
);
