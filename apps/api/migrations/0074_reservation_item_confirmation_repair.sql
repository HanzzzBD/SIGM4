-- UX-012: repair schema drift without changing the already applied 0053.
-- confirmed_at is approval/allocation confirmation, not a migration timestamp.
-- migrate:up
ALTER TABLE reservation_items ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- Preserve existing confirmations and unapproved allocations. A completed
-- approval (including the recurring parent) or an actual loan is evidence;
-- do not infer confirmation from slot creation time or the current clock.
UPDATE reservation_items AS item
SET confirmed_at = evidence.confirmed_at
FROM (
    SELECT r.id, COALESCE(
        (SELECT min(l.tanggal_pinjam) FROM loans l WHERE l.reservation_id = r.id),
        (SELECT max(a.diselesaikan_pada) FROM approval_instances a
         WHERE a.jenis_pengajuan = 'RESERVASI_ASET' AND a.status = 'DISETUJUI'
           AND a.referensi_id IN (r.id, r.parent_id))
    ) AS confirmed_at
    FROM reservations r
    WHERE r.jenis = 'ASET' AND r.status IN ('DISETUJUI', 'BERLANGSUNG', 'SELESAI')
) AS evidence
WHERE item.reservation_id = evidence.id AND item.confirmed_at IS NULL
  AND evidence.confirmed_at IS NOT NULL;

-- migrate:down
-- Intentionally retain the additive column and historical confirmations.
-- It may already belong to 0053 on fresh installs. Removing it here would
-- destroy pre-existing data and break the preceding application release.
SELECT 1;
