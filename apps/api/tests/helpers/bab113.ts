// Pembacaan Bab 11.3 PRD dan penurunan kode tekniknya. Dipakai uji berkas
// (tests/enums.test.ts) maupun uji integrasi, sehingga keduanya membandingkan
// terhadap sumber yang sama persis.

import { readFileSync } from 'node:fs';

/** Akar repositori, dari apps/api/tests/helpers/ naik empat tingkat. */
export const AKAR = new URL('../../../../', import.meta.url);

/**
 * Label Bab 11.3 -> kode teknis, sesuai ketetapan audit Bab 11.3: huruf besar,
 * tanpa spasi. Rujukan ID dalam kurung — mis. "BAHAN (`BR-093`)" — dibuang
 * karena ia catatan bagi pembaca, bukan bagian nilainya.
 */
export function kodeTeknis(label: string): string {
  return label
    .replace(/\([^)]*\)/g, '')
    .replace(/`/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Membaca tabel Bab 11.3 dari berkas PRD-nya: nama kelompok -> daftar kode. */
export function bacaBab113(): ReadonlyMap<string, readonly string[]> {
  const teks = readFileSync(new URL('docs/PRD/03-architecture/data-model.md', AKAR), 'utf8');
  const bagian = teks.split('## 11.3 Reference Data')[1]?.split('## 11.4')[0];
  if (bagian === undefined) throw new Error('Bab 11.3 tidak ditemukan pada data-model.md');

  const kelompok = new Map<string, readonly string[]>();
  for (const baris of bagian.split('\n')) {
    const cocok = /^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*$/.exec(baris);
    if (cocok === null) continue;
    const [, nama, nilai] = cocok;
    if (nama === undefined || nilai === undefined) continue;
    kelompok.set(nama.trim(), nilai.split(',').map(kodeTeknis));
  }
  return kelompok;
}

/** Kelompok Bab 11.3 -> nama tipe PostgreSQL (`<domain>_<konsep>`, SDD-05 §4.1). */
export const NAMA_TIPE: ReadonlyMap<string, string> = new Map([
  ['Kondisi Aset', 'asset_condition'],
  ['Status Aset', 'asset_status'],
  ['Sumber Perolehan', 'asset_acquisition_source'],
  ['Jenis Ruangan', 'room_type'],
  ['Status Reservasi', 'reservation_status'],
  ['Status Peminjaman', 'loan_status'],
  ['Status Denda', 'fine_status'],
  ['Jenis Kewajiban Finansial', 'financial_obligation_type'],
  ['Urgensi Kerusakan', 'damage_urgency'],
  ['Status Laporan Kerusakan', 'damage_report_status'],
  ['Jenis Work Order', 'work_order_type'],
  ['Status Work Order', 'work_order_status'],
  ['Status Sesi Opname', 'stocktake_session_status'],
  ['Hasil Pemeriksaan Opname', 'stocktake_result'],
  ['Status Pengadaan', 'procurement_status'],
  ['Keputusan Approval', 'approval_decision'],
  ['Jenis Dokumen Aset', 'asset_document_type'],
  ['Status Penghapusan Aset', 'disposal_status'],
  ['Status Permintaan Bahan', 'material_request_status'],
  ['Jenis Transaksi Bahan', 'material_transaction_type'],
  ['Domain Sesi Opname', 'stocktake_domain'],
  ['Alasan Penghapusan', 'disposal_reason'],
  ['Tindak Lanjut Fisik Penghapusan', 'disposal_physical_action'],
  ['Status Slot Pemesanan', 'booking_status'],
  ['Jenis Pengajuan (Approval)', 'approval_request_type'],
  ['Kanal Notifikasi', 'notification_channel'],
  ['Prioritas', 'priority_level'],
  ['Jenis Hari Libur', 'holiday_type'],
  ['Hasil Aktivitas', 'activity_result'],
]);
