// Manifes & data kartu dashboard (FR-15.1, Bab 19.1; SDD-14 §4.3a, keputusan 82).
// Tanpa tabel sendiri; M-15 §11 tanpa aksi activity log — kecuali jejak akses isi log
// milik m18 (keputusan 82f).

import { tanggalWib } from "../../m02-users/index.js";
import { periodeAkademikAktif } from "../../m20-settings/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import type { DefinisiKartu, LayananKartu, RentangTerhitung } from "./cards.js";
import { KARTU, TEMPLAT } from "./cards.js";

/** Cache agregat (SDD-14 §4.3): 5 menit. */
export const TTL_KARTU_DETIK = 300;
const HARI = 86_400_000;

export interface PenyimpanKartu {
    baca(kunci: string): Promise<string | null>;
    tulis(kunci: string, nilai: string, ttlDetik: number): Promise<void>;
}

export interface KartuManifes {
    readonly id: string;
    readonly judul: string;
    readonly zona: 1 | 2 | 3 | 4;
    readonly jenis: DefinisiKartu["jenis"];
    readonly berperiode: boolean;
    readonly drilldown: string | null;
}

export interface DataKartu {
    readonly id: string;
    readonly rentang: { readonly jenis: RentangTerhitung["jenis"]; readonly mulai: string; readonly akhir: string } | null;
    readonly diperbarui_pada: string;
    readonly isi: unknown;
}

/** PM-03: seluruh permission kartu dipegang. */
const boleh = (ctx: AuthContext, k: DefinisiKartu): boolean => k.permissions.every((p) => ctx.can(p));
const templat = (ctx: AuthContext): readonly string[] => TEMPLAT[ctx.roleCode] ?? [];
/** Awal hari WIB dari tanggal kalender `YYYY-MM-DD`. */
const awalHariWib = (tanggal: string): Date => new Date(`${tanggal}T00:00:00+07:00`);

export class DashboardService {
    constructor(
        private readonly clock: Clock,
        private readonly layanan: LayananKartu,
        private readonly cache: PenyimpanKartu,
    ) {}

    /** `GET /dashboard`: kartu terlarang TIDAK tercantum (FR-15.1 AC 4, PM-03). */
    manifes(ctx: AuthContext): { templat: string | null; kartu: readonly KartuManifes[] } {
        const ada = TEMPLAT[ctx.roleCode] !== undefined;
        const kartu = templat(ctx)
            .map((id) => KARTU.get(id)!)
            .filter((k) => boleh(ctx, k))
            .map(({ id, judul, zona, jenis, berperiode, drilldown }) => ({ id, judul, zona, jenis, berperiode, drilldown }));
        return { templat: ada ? ctx.roleCode : null, kartu };
    }

    /** `GET /dashboard/cards/{id}`: permission diperiksa SEBELUM cache dibaca. */
    async kartu(ctx: AuthContext, id: string, opsi: { rentang: RentangTerhitung["jenis"]; segarkan: boolean }): Promise<DataKartu> {
        const def = KARTU.get(id);
        if (def === undefined) throw new NotFoundError("Kartu dashboard tidak dikenal.");
        if (!templat(ctx).includes(id) || !boleh(ctx, def)) throw new ForbiddenError();

        const sekarang = this.clock.now();
        const rentang = def.berperiode ? await this.hitungRentang(ctx, opsi.rentang, sekarang) : null;
        const kunci = `dash:${id}:${rentang?.jenis ?? "-"}:${def.lingkup === "GLOBAL" ? "g" : String(ctx.userId)}`;

        let tersimpan = opsi.segarkan ? null : await this.cache.baca(kunci);
        if (tersimpan === null) {
            const isi = await def.muat({ ctx, sekarang, rentang, layanan: this.layanan });
            const data: DataKartu = {
                id,
                rentang: rentang === null ? null : { jenis: rentang.jenis, mulai: rentang.mulai.toISOString(), akhir: rentang.akhir.toISOString() },
                diperbarui_pada: sekarang.toISOString(),
                isi,
            };
            tersimpan = JSON.stringify(data);
            await this.cache.tulis(kunci, tersimpan, TTL_KARTU_DETIK);
        }
        const data = JSON.parse(tersimpan) as DataKartu;
        if (def.catatAkses !== undefined) {
            const catat = def.catatAkses;
            await withTransaction(ctx, (s) => catat(s, this.layanan.audit, data.isi), this.layanan.db);
        }
        return data;
    }

    /** Rentang 19.1 (keputusan 82h): semester/tahun ajaran dari periode akademik aktif. */
    private async hitungRentang(ctx: AuthContext, jenis: RentangTerhitung["jenis"], sekarang: Date): Promise<RentangTerhitung> {
        if (jenis === "7_hari" || jenis === "30_hari") {
            return { jenis, mulai: new Date(sekarang.getTime() - (jenis === "7_hari" ? 7 : 30) * HARI), akhir: sekarang };
        }
        const periode = await withTransaction(ctx, (s) => periodeAkademikAktif(s, tanggalWib(sekarang)), this.layanan.db);
        const p = jenis === "semester" ? periode.semester : periode.tahunAjaran;
        if (p === null) {
            throw new DomainError("VALIDATION_ERROR", jenis === "semester" ? "Semester berjalan belum dikonfigurasi." : "Tahun ajaran aktif belum dikonfigurasi.", { field: "rentang" });
        }
        return { jenis, mulai: awalHariWib(p.mulai), akhir: new Date(awalHariWib(p.akhir).getTime() + HARI) };
    }
}
