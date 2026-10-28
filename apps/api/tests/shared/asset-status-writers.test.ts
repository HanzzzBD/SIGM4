import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { statusWriterViolations, STATUS_WRITERS } from "../helpers/asset-status-writers.js";

const root = fileURLToPath(new URL("../../src/", import.meta.url));
function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sources(join(dir, entry.name)) : /\.[cm]?tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [join(dir, entry.name)] : []);
}
const outsider = "modules/m11-damage-reports/repositories/rogue.repository.ts";
describe("PR-02-49 / SDD-AVL-11: pemilik assets.status", () => {
    it("seluruh source API dan worker hanya mempunyai empat pemilik", () => {
        expect(new Set(Object.values(STATUS_WRITERS)).size).toBe(4);
        const errors = sources(root).flatMap((path) => statusWriterViolations(relative(root, path).replaceAll("\\", "/"), readFileSync(path, "utf8")));
        expect(errors).toEqual([]);
    });
    it.each([
        `db.updateTable("assets").set({status:"DIPINJAM"});`,
        `db.updateTable('public.assets as a').set('status', 'TERSEDIA');`,
        `const status = "DIRESERVASI"; const data = {status}; const q = db.updateTable("assets"); q.set({...data});`,
        `const key = "status"; db.updateTable("assets").set({[key]:"TERSEDIA"});`,
        `db.updateTable("assets").set(input);`,
        `db.updateTable("assets").set(eb => ({status: eb.val("TERSEDIA")}));`,
        `db.insertInto("assets").values({status:"TERSEDIA"});`,
        `db.insertInto("assets").values({nama:"A"}).onConflict(oc => oc.column("id").doUpdateSet({status:"TERSEDIA"}));`,
        'sql`UPDATE assets SET status = ${value} WHERE id = ${id}`;',
        "sql.raw('UPDATE \"assets\" a SET \"status\" = value');",
        `sql.raw("INSERT INTO assets (id,status) VALUES (1,'TERSEDIA')");`,
        `repo.updateKondisi(ctx, 1, data);`,
        `repo.tetapkanDireservasi(ctx, now);`,
        `sinkronkanStatusDireservasi(scope, audit, now);`,
    ])("menolak penulis/pemanggil baru: %s", (source) => {
        expect(statusWriterViolations(outsider, source).length).toBeGreaterThan(0);
    });
    it.each([
        `// UPDATE assets SET status='TERSEDIA'\nconst note = 'assets.status';`,
        `db.updateTable("assets").set({nama:"Baru"}).where("status", "=", "TERSEDIA");`,
        `const qr = {qr_terpasang:true}; db.updateTable("assets").set(qr);`,
        `db.updateTable("asset_movements").set({status:"SIAP"});`,
        `db.selectFrom("assets").select("status");`,
    ])("membolehkan baca, komentar dan perubahan atribut lain: %s", (source) => {
        expect(statusWriterViolations(outsider, source)).toEqual([]);
    });
    it.each(Object.keys(STATUS_WRITERS))("adapter terdaftar diizinkan: %s", (path) => {
        expect(statusWriterViolations(path, `db.updateTable("assets").set({status:"TERSEDIA"});`)).toEqual([]);
    });
});
