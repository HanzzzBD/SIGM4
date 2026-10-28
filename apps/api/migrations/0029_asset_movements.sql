-- 0029 — Tabel `asset_movements` (PR-02-14, FR-04.4, `m04-assets.md` §8).
-- Append-only (pola `asset_condition_history`, 0026): TANPA kolom baku —
-- `tanggal` (dipilih pengguna, FR-04.4 langkah 2) bermakna sendiri, `id`
-- (urutan penyisipan) jadi penentu urutan sekunder pada tanggal yang sama.

-- migrate:up

CREATE TABLE asset_movements (
    id             bigserial PRIMARY KEY,
    asset_id       bigint    NOT NULL REFERENCES assets(id),
    room_asal_id   bigint    NOT NULL REFERENCES rooms(id),
    room_tujuan_id bigint    NOT NULL REFERENCES rooms(id),
    tanggal        date      NOT NULL,
    alasan         text      NOT NULL,
    dilakukan_oleh bigint    NOT NULL REFERENCES users(id)
);

-- FR-04.4 AC: riwayat mutasi ditampilkan kronologis pada halaman detail aset.
CREATE INDEX asset_movements_asset_id_idx ON asset_movements (asset_id, tanggal DESC, id DESC);

-- migrate:down
DROP TABLE IF EXISTS asset_movements;
