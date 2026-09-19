// SettingService (FR-20.1, `m20-settings.md` §7). Batas transaksi SDD-07:
// perubahan parameter dan entri `SETTING_UPDATED` (§11) satu transaksi.
//
// Pembacaan langsung ke basis data, tanpa cache: perubahan berlaku pada
// permintaan berikutnya (FR-20.1 langkah 4). Cache 60 detik `SDD-14` menunggu
// konsumen pertama parameter ini (SDD-05 §4.7a).

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { ListSettingsFilter, SettingRow } from "../repositories/setting.repository.js";
import { createSettingRepository } from "../repositories/setting.repository.js";
import { validasiNilai } from "./setting-validator.js";

const MODUL = "m20-settings";

export interface ListSettingsResult {
    readonly rows: readonly SettingRow[];
    readonly page: number;
    readonly perPage: number;
    readonly total: number;
    readonly totalPages: number;
}

export interface SettingViolation {
    readonly key: string;
    readonly message: string;
}

export class SettingService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    /** `GET /settings` — tanpa entri log: §11 hanya mewajibkan `SETTING_UPDATED`. */
    async list(ctx: AuthContext, filter: ListSettingsFilter): Promise<ListSettingsResult> {
        const hasil = await createSettingRepository(this.db).list(ctx, filter);
        return {
            rows: hasil.rows,
            page: filter.page,
            perPage: filter.perPage,
            total: hasil.total,
            totalPages: Math.max(1, Math.ceil(hasil.total / filter.perPage)),
        };
    }

    /**
     * `PUT /settings` (FR-20.1 langkah 3). Semua nilai divalidasi lebih dulu;
     * satu saja tidak sah menolak seluruh permintaan tanpa mengubah apa pun
     * (A1). Hanya nilai yang berubah ditulis dan dicatat.
     */
    async update(ctx: AuthContext, input: Readonly<Record<string, unknown>>): Promise<readonly SettingRow[]> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createSettingRepository(scope.tx);
                const kunci = Object.keys(input);
                const baris = new Map(
                    (await repo.findByKeysForUpdate(scope.ctx, kunci)).map((r) => [r.key, r] as const),
                );

                const pelanggaran: SettingViolation[] = [];
                for (const key of kunci) {
                    const definisi = baris.get(key);
                    if (definisi === undefined) {
                        pelanggaran.push({ key, message: "Parameter tidak dikenal." });
                        continue;
                    }
                    const pesan = validasiNilai(definisi, input[key]);
                    if (pesan !== undefined) pelanggaran.push({ key, message: pesan });
                }
                if (pelanggaran.length > 0) {
                    throw new DomainError("VALIDATION_ERROR", "Satu atau lebih parameter tidak sah.", {
                        errors: pelanggaran,
                    });
                }

                const sebelum: Record<string, unknown> = {};
                const sesudah: Record<string, unknown> = {};
                for (const key of kunci) {
                    const lama = baris.get(key)?.value;
                    // Parameter hanya skalar (`setting_type`), sehingga `!==` cukup.
                    if (lama === input[key]) continue;
                    await repo.updateValue(scope.ctx, key, input[key]);
                    sebelum[key] = lama;
                    sesudah[key] = input[key];
                }

                if (Object.keys(sesudah).length > 0) {
                    await this.audit.write(scope, {
                        modul: MODUL,
                        aksi: "SETTING_UPDATED",
                        entitas: "system_settings",
                        nilaiSebelum: sebelum,
                        nilaiSesudah: sesudah,
                    });
                }

                // Hanya parameter yang diminta (sudah tervalidasi = ada), dibaca ulang.
                return (await repo.findByKeysForUpdate(scope.ctx, kunci)).toSorted((a, b) =>
                    a.key < b.key ? -1 : 1,
                );
            },
            this.db,
        );
    }
}
