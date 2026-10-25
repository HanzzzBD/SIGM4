// PR-06-09: reproducible EXPLAIN on a disposable database. Never accepts a normal app database.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { ANALYTICS_TYPES, AnalyticsQuerySchema } from "../../packages/schemas/dist/index.js";
import { createAnalyticsProviders, analyticsExplainStatements, AnalyticsService } from "../../apps/api/dist/modules/m16-analytics/index.js";
import { createAuthContext } from "../../apps/api/dist/shared/auth/index.js";
import { FixedClock } from "../../apps/api/dist/shared/clock/index.js";
const url = new URL(process.env.DATABASE_URL ?? "");
if (!/^\/sigm4_pr0238_[a-f0-9]+$/.test(url.pathname) || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Benchmark requires the disposable local test DB launcher.");
execFileSync(process.execPath, ["scripts/migrate.mjs", "up"], { stdio: "pipe", windowsHide: true });
const client = new pg.Client({ connectionString: url.toString() }); await client.connect();
const result = { date: "2026-10-14", engine: "", dataset: { assets: 105001, conditionHistory: 105001, targetAssets: 5000, loans: 5000, damage: 5000, workOrders: 5000, materialIssues: 5000 }, plans: [], latencies: [], candidates: [] };
const output = resolve("docs/IMPLEMENTATION/audits/pr-06-09-plans-2026-10-14.json");
const persist = () => { mkdirSync(resolve("docs/IMPLEMENTATION/audits"), { recursive: true }); writeFileSync(output, JSON.stringify(result, null, 2)); };
let statements = [];
const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url.toString(), max: 2 }) }), log: e => { if (e.level === "query") statements.push(e.query.sql); } });
const numberId = async (text, values = []) => Number((await client.query(text, values)).rows[0].id);
try {
    result.engine = (await client.query("select version() version")).rows[0].version;
    if (Number((await client.query("select count(*) n from assets")).rows[0].n) !== 0) throw new Error("Benchmark database must be empty.");
    const user1 = await numberId("insert into users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) values ('Benchmark A','benchmark-a@test.invalid','x','BEN-A',(select id from roles where kode='R-01'),'AKTIF',false) returning id"), user2 = await numberId("insert into users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) values ('Benchmark B','benchmark-b@test.invalid','x','BEN-B',(select id from roles where kode='R-02'),'AKTIF',false) returning id");
    const building = await numberId("insert into buildings(nama,kode) values ('Benchmark','BEN') returning id"), area = await numberId("insert into areas(building_id,nama,kode) values ($1,'Benchmark','BEN') returning id", [building]);
    const room = await numberId("insert into rooms(area_id,nama,kode,jenis,dapat_direservasi,created_at) values ($1,'Target','BEN-T','KELAS',true,'2025-09-01') returning id", [area]), backgroundRoom = await numberId("insert into rooms(area_id,nama,kode,jenis,created_at) values ($1,'Background','BEN-B','KELAS','2025-09-01') returning id", [area]);
    const category = await numberId("insert into asset_categories(nama,kode,umur_teknis_tahun) values ('Benchmark target','BEN-T',5) returning id"), backgroundCategory = await numberId("insert into asset_categories(nama,kode,umur_teknis_tahun) values ('Benchmark background','BEN-B',5) returning id");
    console.log("Seeding disposable benchmark: 105001 assets + history, 5000 rows per operational domain.");
    await client.query(`insert into assets(id,kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,status,nilai_perolehan,penanggung_jawab_id,dapat_dipinjam,created_at)
      select n,'BEN-'||n,'Benchmark asset '||n,case when n<=5000 then $1::bigint else $2::bigint end,2018,'PEMBELIAN',case when n<=5000 then $3::bigint else $4::bigint end,
      (case when n%4=0 then 'RUSAK_BERAT' else 'BAIK' end)::asset_condition,'TERSEDIA',100000.25,case when n%100=0 then $5::bigint else $6::bigint end,true,'2025-09-01' from generate_series(1,105001) n`, [category, backgroundCategory, room, backgroundRoom, user1, user2]);
    await client.query(`insert into asset_condition_history(asset_id,kondisi_lama,kondisi_baru,alasan,diubah_oleh,diubah_pada) select id,'BAIK',kondisi,'Benchmark history',$1,'2026-01-01' from assets`, [user1]);
    await client.query(`insert into reservations(id,nomor,jenis,pemohon_id,keperluan,waktu_mulai,waktu_selesai,status,created_at)
      select n,'RSV-BR-2026-'||lpad(n::text,6,'0'),'ASET',$1,'Benchmark','2025-10-15T01:00:00Z'::timestamptz+(n%300)*interval '1 day','2025-10-15T04:00:00Z'::timestamptz+(n%300)*interval '1 day','SELESAI','2025-10-01' from generate_series(1,5000) n`, [user1]);
    await client.query(`insert into loans(id,nomor,reservation_id,peminjam_id,petugas_serah_id,nama_penerima,tanggal_pinjam,tanggal_jatuh_tempo,tanggal_jatuh_tempo_asli,tanggal_kembali,status,kebijakan_denda)
      select id,'PJM-2026-'||lpad(id::text,6,'0'),id,$1,$2,'Benchmark',waktu_mulai,waktu_selesai,waktu_selesai,waktu_selesai,'DIKEMBALIKAN','{"excludeHolidays":false}'::jsonb from reservations`, [user1, user2]);
    await client.query(`insert into booking_slots(id,resource_type,resource_id,slot_range,status,origin,loan_id)
      select id,'asset',id,tstzrange(tanggal_pinjam,tanggal_kembali,'[)'),'RELEASED','loan',id from loans`);
    await client.query(`insert into loan_items(id,loan_id,asset_id,allocated_asset_id,slot_id,kondisi_awal,kondisi_akhir,status_kembali,tanggal_kembali) select id,id,id,id,id,'BAIK','BAIK','DIKEMBALIKAN',tanggal_kembali from loans`);
    await client.query(`insert into damage_reports(id,nomor,pelapor_id,asset_id,deskripsi,urgensi,status,created_at,diverifikasi_pada) select id,'KRS-2026-'||lpad(id::text,6,'0'),$1,id,'Benchmark','SEDANG','SELESAI',tanggal_pinjam,tanggal_kembali from loans`, [user1]);
    await client.query(`insert into work_orders(id,nomor,asset_id,damage_report_id,teknisi_id,prioritas,deskripsi,target_selesai,status,biaya,diverifikasi_pada,waktu_mulai,waktu_selesai)
      select id,'WO-2026-'||lpad(id::text,6,'0'),id,id,$1,'SEDANG','Benchmark',tanggal_pinjam::date,'SELESAI',1000,tanggal_kembali,tanggal_pinjam,tanggal_kembali from loans`, [user2]);
    await client.query(`insert into work_order_costs(work_order_id,deskripsi,jumlah,harga_satuan,total) select id,'Benchmark',1,1000,1000 from work_orders`);
    const mc = await numberId("insert into material_categories(nama,kode) values ('Benchmark bahan','BEN') returning id"), unit = Number((await client.query("select id from material_units order by id limit 1")).rows[0].id), material = await numberId("insert into materials(nama,material_category_id,satuan_id,room_id_default) values ('Benchmark bahan',$1,$2,$3) returning id", [mc, unit, room]);
    await client.query(`insert into material_requests(id,nomor,pemohon_id,keperluan,status,created_at,updated_at,created_by) select n,'PMB-2026-'||lpad(n::text,6,'0'),$1,'Benchmark','DISERAHKAN','2025-10-01','2025-10-01',$1 from generate_series(1,5000) n`, [user1]);
    await client.query(`insert into material_request_items(id,material_request_id,revision,material_id,room_id,satuan_id,snapshot,jumlah_diminta,jumlah_disetujui,jumlah_diserahkan) select id,id,1,$1,$2,$3,'{}',1,1,1 from material_requests`, [material, room, unit]);
    await client.query(`insert into material_issues(id,request_id,nama_penerima,tanggal_serah,created_at,created_by) select mr.id,mr.id,'Benchmark',l.tanggal_pinjam::date,l.tanggal_pinjam,$1 from material_requests mr join loans l on l.id=mr.id`, [user2]);
    await client.query(`insert into material_transactions(id,material_id,room_id,jenis,jumlah,saldo_sesudah,referensi_jenis,referensi_id,created_by,created_at) values(100001,$1,$2,'PENERIMAAN',5000,5000,'benchmark_receipt',1,$3,'2025-10-01')`, [material, room, user2]);
    // Preserve the immutable ledger/apply trigger, including its balance checks.
    await client.query(`insert into material_transactions(id,material_id,room_id,jenis,jumlah,saldo_sesudah,referensi_jenis,referensi_id,created_by,created_at) select id,$1,$2,'PENGELUARAN',-1,5000-id,'material_issue',id,$3,created_at from material_issues order by id`, [material, room, user2]);
    await client.query(`insert into material_issue_items(issue_id,item_id,jumlah,transaction_id) select id,id,1,id from material_issues`);
    await client.query("ANALYZE");
    await client.query("SET statement_timeout='60s'");
    const permissions = new Map(["report.view", "report.export", "asset.view", "asset.view_financial", "reservation.view", "loan.view", "damage.view", "maintenance.view_cost", "material.view", "procurement.view", "disposal.view"].map(p => [p, "all"]));
    const ctx = createAuthContext({ userId: user1, roleCode: "R-01", scopes: permissions }), own = createAuthContext({ userId: user1, roleCode: "R-01", scopes: new Map([...permissions].map(([p, scope]) => [p, p.startsWith("report.") ? "own" : scope])) });
    const clock = new FixedClock(new Date("2026-10-14T03:00:00Z")), providers = createAnalyticsProviders();
    const query = AnalyticsQuerySchema.parse({ tanggal_mulai: "2025-10-15", tanggal_selesai: "2026-10-14", room_id: room });
    const flatten = node => [node, ...(node.Plans ?? []).flatMap(flatten)];
    async function explain(type, label, statement) {
        const q = statement.compile(db), r = await client.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + q.sql, [...q.parameters]);
        const plan = r.rows[0]["QUERY PLAN"][0], scans = flatten(plan.Plan).filter(n => /Scan/.test(n["Node Type"])).map(n => ({ type: n["Node Type"], relation: n["Relation Name"], index: n["Index Name"], rows: n["Actual Rows"], loops: n["Actual Loops"] }));
        const item = { type, label, sql: q.sql, parameters: q.parameters, executionMs: plan["Execution Time"], planningMs: plan["Planning Time"], scans, plan }; result.plans.push(item); persist(); console.log(`${type} ${label}: ${item.executionMs.toFixed(1)}ms`); return item;
    }
    for (const type of ANALYTICS_TYPES) {
        const prepared = analyticsExplainStatements(ctx, type, query, clock, providers);
        for (const name of ["rows", "summary", "http"]) await explain(type, `target-5000-${name}`, prepared[name]);
        const times = [], counts = []; const service = new AnalyticsService(db, clock, providers);
        for (let n = 0; n < 5; n++) { statements = []; const start = performance.now(); const response = await service.report(ctx, type, query); times.push(performance.now() - start); counts.push(statements.filter(s => /^\s*(with|select)\b/i.test(s)).length); if (response.data.length === 0) throw new Error(`Benchmark ${type} unexpectedly has no rows`); }
        times.sort((a,b) => a-b); result.latencies.push({ type, p95Ms: times.at(-1), samplesMs: times, businessSqlQueries: counts }); persist();
    }
    // Restore the baseline only inside this verified disposable DB, so the evidence remains reproducible after migration 0071.
    await client.query("DROP INDEX IF EXISTS assets_analytics_owner_idx"); await client.query("ANALYZE assets");
    const statementsBefore = analyticsExplainStatements(own, "rekapitulasi-aset", AnalyticsQuerySchema.parse({ tanggal_mulai: "2025-10-15", tanggal_selesai: "2026-10-14" }), clock, providers);
    const before = await explain("rekapitulasi-aset", "own-105001-before", statementsBefore.http);
    // Candidate is evaluated here ONLY after its own selective scan has been recorded above.
    if (before.scans.some(s => s.type === "Seq Scan" && s.relation === "assets")) {
        await client.query("CREATE INDEX benchmark_assets_owner ON assets(penanggung_jawab_id,id)"); await client.query("ANALYZE assets");
        const after = await explain("rekapitulasi-aset", "own-105001-after-candidate", statementsBefore.http);
        result.candidates.push({ index: "assets(penanggung_jawab_id,id)", beforeMs: before.executionMs, afterMs: after.executionMs, selected: !after.scans.some(s => s.type === "Seq Scan" && s.relation === "assets") && after.executionMs < before.executionMs }); persist();
    }
    result.queryBudget = { reportData: 1, filterOptions: 1, excludes: "BEGIN/COMMIT/SET and authentication; current+previous computed in the same SQL statement" }; persist();
    if (result.latencies.some(r => r.p95Ms > 5000 || r.businessSqlQueries.some(n => n !== 1))) throw new Error("Report exceeds the local latency/query budget; inspect retained EXPLAIN artifacts.");
    console.log(`Benchmark complete: ${output}`);
} finally { await db.destroy(); await client.end(); persist(); }
