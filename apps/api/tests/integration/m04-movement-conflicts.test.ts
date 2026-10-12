// PR-02-48: hasil dan rollback terhadap PostgreSQL nyata; fixture hanya dibersihkan menurut pemilik.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AssetService } from "../../src/modules/m04-assets/services/asset.service.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { SlotService } from "../../src/shared/booking/index.js";
import { dbmate, kueri } from "../helpers/db.js";

describe.skipIf(!process.env["DATABASE_URL"])("PR-02-48: slot tanggal mutasi dan atomisitas", () => {
    const tag = randomUUID().slice(0, 8), clock = new FixedClock(new Date("2026-10-12T00:00:00Z"));
    let user: string, building: string, area: string, source: string, target: string, category: string, reservation: string;
    let units: string[] = [], seq = 0, ctx: AuthContext;
    const service = () => new AssetService(getDb(), new AuditLogger({ clock }), clock);
    const input = () => ({ assetIds: units.map(Number), roomTujuanId: Number(target), tanggal: "2026-10-19", alasan: "Penataan", penanggungJawabBaruId: null });
    async function cleanUnits() {
        if (!user) return;
        await kueri(`DELETE FROM booking_slots WHERE created_by=${user}`);
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type='asset_movement_document' AND aggregate_id IN (SELECT id FROM asset_movement_documents WHERE created_by=${user})`);
        await kueri(`DELETE FROM asset_movements WHERE dilakukan_oleh=${user}`);
        await kueri(`DELETE FROM activity_logs WHERE user_id=${user}`);
        await kueri(`DELETE FROM asset_movement_documents WHERE created_by=${user}`);
        await kueri(`DELETE FROM assets WHERE created_by=${user}`);
        units = [];
    }
    async function reserve(options: { origin?: "reservation" | "loan" | "maintenance"; status?: "TENTATIVE" | "CONFIRMED"; start?: string; end?: string } = {}) {
        return withTransaction(ctx, (scope) => new SlotService(clock).reserve(scope, {
            sumberDaya: [{ jenis: "asset", id: Number(units[1]) }], asal: options.origin ?? "reservation",
            rentang: { mulai: new Date(options.start ?? "2026-10-19T03:00:00Z"), selesai: new Date(options.end ?? "2026-10-19T05:00:00Z") },
            ...(options.origin === "loan" ? { rujukan: { loanId: 123 } } : options.origin === "maintenance" ? {} : { rujukan: { reservationId: Number(reservation) } }),
            ...(options.status === "TENTATIVE" ? { status: "TENTATIVE", kedaluwarsa: new Date("2026-10-20T00:00:00Z") } : { status: "CONFIRMED" }),
        }), getDb());
    }
    beforeAll(async () => {
        dbmate("up");
        user = (await kueri<{ id: string }>(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('Konflik mutasi','move-conflict-${tag}@sekolah.sch.id','x','MC${tag}',(SELECT id FROM roles WHERE kode='R-02'),'AKTIF',false) RETURNING id::text`))[0]!.id;
        ctx = createAuthContext({ userId: Number(user), roleCode: "R-02", scopes: new Map([["asset.update", "all"]]) });
        building = (await kueri<{ id: string }>(`INSERT INTO buildings(nama,kode) VALUES ('Konflik','CB${tag}') RETURNING id::text`))[0]!.id;
        area = (await kueri<{ id: string }>(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Konflik','CA${tag}') RETURNING id::text`))[0]!.id;
        source = (await kueri<{ id: string }>(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Asal','CS${tag}','GUDANG') RETURNING id::text`))[0]!.id;
        target = (await kueri<{ id: string }>(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Tujuan','CT${tag}','GUDANG') RETURNING id::text`))[0]!.id;
        category = (await kueri<{ id: string }>(`INSERT INTO asset_categories(nama,kode) VALUES ('Konflik','CC${tag}') RETURNING id::text`))[0]!.id;
        reservation = (await kueri<{ id: string }>(`INSERT INTO reservations(nomor,jenis,pemohon_id,waktu_mulai,waktu_selesai,created_by) VALUES ('RSV-BR-2026-${String(Number(user)).padStart(4, "0")}','ASET',${user},'2026-10-19T03:00:00Z','2026-10-19T05:00:00Z',${user}) RETURNING id::text`))[0]!.id;
    });
    beforeEach(async () => {
        await cleanUnits();
        for (let i = 0; i < 2; i += 1) units.push((await kueri<{ id: string }>(`INSERT INTO assets(kode_barang,nama,category_id,room_id,tahun_perolehan,sumber_perolehan,kondisi,created_by) VALUES ('CONFLICT-${tag}-${seq++}','Komputer',${category},${source},2026,'PEMBELIAN','BAIK',${user}) RETURNING id::text`))[0]!.id);
    });
    afterAll(async () => {
        await cleanUnits();
        if (reservation) await kueri(`DELETE FROM reservations WHERE id=${reservation}`);
        if (category) await kueri(`DELETE FROM asset_categories WHERE id=${category}`);
        if (source && target) await kueri(`DELETE FROM rooms WHERE id IN (${source},${target})`);
        if (area) await kueri(`DELETE FROM areas WHERE id=${area}`);
        if (building) await kueri(`DELETE FROM buildings WHERE id=${building}`);
        if (user) await kueri(`DELETE FROM users WHERE id=${user}`);
    });
    it.each(["TENTATIVE", "CONFIRMED", "ACTIVE"] as const)("slot reservasi %s pada satu unit membatalkan kedua unit tanpa efek tertinggal", async (status) => {
        const [slot] = await reserve({ status: status === "TENTATIVE" ? "TENTATIVE" : "CONFIRMED" });
        if (status === "ACTIVE") await withTransaction(ctx, (scope) => new SlotService(clock).activate(scope, [Number(slot!.id)]), getDb());
        await expect(service().moveWithDocument(ctx, input())).rejects.toMatchObject({ kode: "ASSET_NOT_AVAILABLE", detail: { errors: [{ message: expect.stringContaining(`Reservasi #${reservation}`) }] } });
        expect(await kueri(`SELECT room_id::text,status FROM assets WHERE created_by=${user} ORDER BY id`)).toEqual([{ room_id: source, status: "TERSEDIA" }, { room_id: source, status: "TERSEDIA" }]);
        for (const table of ["asset_movement_documents", "asset_movements", "activity_logs", "event_outbox"]) {
            const column = table === "asset_movements" ? "dilakukan_oleh" : table === "activity_logs" ? "user_id" : table === "event_outbox" ? "actor_id" : "created_by";
            expect((await kueri<{ n: string }>(`SELECT count(*)::text n FROM ${table} WHERE ${column}=${user}`))[0]!.n).toBe("0");
        }
    });
    it("slot pinjaman CONFIRMED juga ditolak ketika status aset masih TERSEDIA", async () => {
        await reserve({ origin: "loan" });
        await expect(service().moveWithDocument(ctx, input())).rejects.toMatchObject({ kode: "ASSET_NOT_AVAILABLE", detail: { errors: [{ message: expect.stringContaining("Pinjaman #123") }] } });
    });
    it.each([
        { start: "2026-10-18T15:00:00Z", end: "2026-10-18T17:00:00Z" },
        { start: "2026-10-19T17:00:00Z", end: "2026-10-19T19:00:00Z" },
    ])("slot yang tepat berakhir/mulai di luar batas hari WIB tidak menghalangi: %j", async (range) => {
        await reserve(range);
        expect((await service().moveWithDocument(ctx, input())).assets).toHaveLength(2);
    });
    it("slot RELEASED tidak menghalangi; pemeliharaan tetap mengikuti status yang boleh dimutasi", async () => {
        const [slot] = await reserve();
        await withTransaction(ctx, (scope) => new SlotService(clock).release(scope, [Number(slot!.id)]), getDb());
        await reserve({ origin: "maintenance" });
        await kueri(`UPDATE assets SET status='DALAM_PERBAIKAN' WHERE id=${units[1]}`);
        expect((await service().moveWithDocument(ctx, input())).assets).toHaveLength(2);
    });
});
