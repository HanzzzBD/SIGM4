-- 0002 — Seluruh tipe enum Bab 11.3 (SDD-DB-02, SDD-05 §4.5).
--
-- Nama tipe mengikuti konvensi <domain>_<konsep> (SDD-05 §4.1) dalam Bahasa
-- Inggris; NILAI-nya adalah kode teknis huruf besar yang diturunkan dari istilah
-- PRD, sesuai ketetapan pemisahan kode <-> label pada Bab 11.3. Label Bahasa
-- Indonesia dipetakan di lapisan penyajian, tidak pernah disimpan di sini —
-- itulah yang membuat perubahan istilah oleh sekolah tidak menuntut migrasi data.
--
-- Tiga nama tipe sudah dipakukan berkas lain dan dipakai apa adanya:
-- asset_condition dan material_transaction_type (SDD-05 §4.1/§4.8) serta
-- booking_status (SDD-01 §4.1). Dua tipe keluarga booking lain — booking_resource
-- dan booking_origin — TIDAK dibuat di sini: keduanya bukan bagian Bab 11.3 dan
-- lahir bersama tabel booking_slots di PR-02-16.
--
-- Menambah NILAI pada tipe yang sudah ada menuntut migration tersendiri dan tidak
-- dapat di-rollback dalam transaksi (SDD-05 §3, ALTER TYPE ... ADD VALUE). Yang
-- ada di sini hanya pembuatan tipe, sehingga aman dalam satu transaksi.

-- migrate:up

-- M-05 Aset
CREATE TYPE asset_condition          AS ENUM ('BAIK', 'RUSAK_RINGAN', 'RUSAK_BERAT', 'HILANG');
CREATE TYPE asset_status             AS ENUM ('TERSEDIA', 'DIRESERVASI', 'DIPINJAM', 'DALAM_PERBAIKAN', 'TIDAK_TERSEDIA');
CREATE TYPE asset_acquisition_source AS ENUM ('PEMBELIAN', 'HIBAH', 'BANTUAN_PEMERINTAH', 'SUMBANGAN', 'LAINNYA');
CREATE TYPE asset_document_type      AS ENUM ('FAKTUR', 'GARANSI', 'SERTIFIKAT', 'MANUAL', 'BERITA_ACARA', 'LAINNYA');

-- M-04 Lokasi
CREATE TYPE room_type AS ENUM ('KELAS', 'LABORATORIUM', 'AULA', 'PERPUSTAKAAN', 'KANTOR', 'GUDANG', 'LAPANGAN', 'LAINNYA');

-- M-07/M-08 Reservasi
CREATE TYPE reservation_status AS ENUM ('DRAF', 'MENUNGGU_PERSETUJUAN', 'DISETUJUI', 'DITOLAK', 'PERLU_REVISI', 'DIBATALKAN', 'KEDALUWARSA', 'BERLANGSUNG', 'SELESAI', 'TIDAK_DIGUNAKAN');

-- Slot pemesanan (SDD-01 §4.1). Huruf besar mengikuti SDD-DB-02; nama keadaan
-- pada prosa PRD 26.2 adalah label, bukan nilai kolom.
CREATE TYPE booking_status AS ENUM ('TENTATIVE', 'CONFIRMED', 'ACTIVE', 'RELEASED');

-- M-09 Peminjaman
CREATE TYPE loan_status AS ENUM ('DIPINJAM', 'SEBAGIAN_DIKEMBALIKAN', 'DIKEMBALIKAN', 'TERLAMBAT', 'HILANG');

-- M-10 Denda & kewajiban finansial
CREATE TYPE fine_status               AS ENUM ('BELUM_DIBAYAR', 'LUNAS', 'DIBEBASKAN', 'DIBEBASKAN_SEBAGIAN');
CREATE TYPE financial_obligation_type AS ENUM ('KETERLAMBATAN', 'GANTI_RUGI');

-- M-11 Kerusakan
CREATE TYPE damage_urgency       AS ENUM ('RENDAH', 'SEDANG', 'TINGGI', 'KRITIS');
CREATE TYPE damage_report_status AS ENUM ('DILAPORKAN', 'DIVERIFIKASI', 'DALAM_PERBAIKAN', 'SELESAI', 'DITOLAK');

-- M-12 Pemeliharaan
CREATE TYPE work_order_type   AS ENUM ('PREVENTIF', 'KOREKTIF');
CREATE TYPE work_order_status AS ENUM ('DITUGASKAN', 'DIKERJAKAN', 'TERTUNDA', 'MENUNGGU_VERIFIKASI', 'SELESAI', 'TIDAK_DAPAT_DIPERBAIKI', 'DIBATALKAN');

-- M-13 Stock opname
CREATE TYPE stocktake_session_status AS ENUM ('BERJALAN', 'MENUNGGU_PERSETUJUAN', 'SELESAI', 'DIBATALKAN');
CREATE TYPE stocktake_result         AS ENUM ('DITEMUKAN', 'SALAH_LOKASI', 'PERBEDAAN_KONDISI', 'TIDAK_DITEMUKAN', 'TEMUAN_BARU');
CREATE TYPE stocktake_domain         AS ENUM ('ASET', 'BAHAN');

-- M-14 Pengadaan
CREATE TYPE procurement_status AS ENUM ('DRAF', 'MENUNGGU_PERSETUJUAN', 'DISETUJUI', 'DISETUJUI_SEBAGIAN', 'DITOLAK', 'PERLU_REVISI', 'DITERIMA_SEBAGIAN', 'SELESAI', 'TIDAK_DIREALISASIKAN');

-- M-15 Approval
CREATE TYPE approval_decision    AS ENUM ('DISETUJUI', 'DITOLAK', 'PERLU_REVISI', 'DILEWATI');
CREATE TYPE approval_request_type AS ENUM ('RESERVASI_RUANGAN', 'RESERVASI_ASET', 'PERPANJANGAN_PEMINJAMAN', 'PENGADAAN_BARANG', 'PENGHAPUSAN_ASET', 'PERMINTAAN_BAHAN');

-- M-21 Penghapusan aset
CREATE TYPE disposal_status          AS ENUM ('DRAF', 'MENUNGGU_PERSETUJUAN', 'DISETUJUI', 'DISETUJUI_SEBAGIAN', 'DITOLAK', 'PERLU_REVISI', 'DILAKSANAKAN', 'DIBATALKAN');
CREATE TYPE disposal_reason          AS ENUM ('RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI', 'HILANG', 'HABIS_UMUR_TEKNIS', 'LAINNYA');
CREATE TYPE disposal_physical_action AS ENUM ('DIMUSNAHKAN', 'DIJUAL', 'DIHIBAHKAN', 'DISIMPAN_SEBAGAI_SUKU_CADANG');

-- M-22 Bahan habis pakai
CREATE TYPE material_request_status   AS ENUM ('DRAF', 'MENUNGGU_PERSETUJUAN', 'DISETUJUI', 'DITOLAK', 'DISERAHKAN_SEBAGIAN', 'DISERAHKAN', 'DIBATALKAN');
CREATE TYPE material_transaction_type AS ENUM ('PENERIMAAN', 'PENGELUARAN', 'PENYESUAIAN', 'OPNAME');

-- M-17 Notifikasi
CREATE TYPE notification_channel AS ENUM ('IN_APP', 'PUSH');

-- Lintas modul
CREATE TYPE priority_level AS ENUM ('RENDAH', 'SEDANG', 'TINGGI', 'MENDESAK');

-- migrate:down
DROP TYPE IF EXISTS priority_level;
DROP TYPE IF EXISTS notification_channel;
DROP TYPE IF EXISTS material_transaction_type;
DROP TYPE IF EXISTS material_request_status;
DROP TYPE IF EXISTS disposal_physical_action;
DROP TYPE IF EXISTS disposal_reason;
DROP TYPE IF EXISTS disposal_status;
DROP TYPE IF EXISTS approval_request_type;
DROP TYPE IF EXISTS approval_decision;
DROP TYPE IF EXISTS procurement_status;
DROP TYPE IF EXISTS stocktake_domain;
DROP TYPE IF EXISTS stocktake_result;
DROP TYPE IF EXISTS stocktake_session_status;
DROP TYPE IF EXISTS work_order_status;
DROP TYPE IF EXISTS work_order_type;
DROP TYPE IF EXISTS damage_report_status;
DROP TYPE IF EXISTS damage_urgency;
DROP TYPE IF EXISTS financial_obligation_type;
DROP TYPE IF EXISTS fine_status;
DROP TYPE IF EXISTS loan_status;
DROP TYPE IF EXISTS booking_status;
DROP TYPE IF EXISTS reservation_status;
DROP TYPE IF EXISTS room_type;
DROP TYPE IF EXISTS asset_document_type;
DROP TYPE IF EXISTS asset_acquisition_source;
DROP TYPE IF EXISTS asset_status;
DROP TYPE IF EXISTS asset_condition;
