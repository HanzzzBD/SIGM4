-- PR-06-09: EXPLAIN on 105001 assets, 1050 owned assets.
-- Before: selective Seq Scan; report SQL 623.4 ms. Candidate: Bitmap/Index Scan; 25.6 ms.
-- Evidence: docs/IMPLEMENTATION/audits/pr-06-09-plans-2026-10-14.json.
-- migrate:up
CREATE INDEX assets_analytics_owner_idx ON assets(penanggung_jawab_id,id);
-- migrate:down
DROP INDEX assets_analytics_owner_idx;
