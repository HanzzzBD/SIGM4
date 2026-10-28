// Sapuan AL-01 gerbang Phase 01 untuk route tulis Phase 03–06 (keputusan pemilik produk
// 24 Oktober 2026: route baru ikut sapuan gerbang, bukan dikecualikan). Setiap langkah memanggil
// route lewat HTTP penuh dengan masukan sah dan memeriksa aksi activity log yang ditetapkan
// indeks log PRD (`docs/PRD/_generated/activity-log-index.md`).
//
// Keadaan yang di produksi dicapai lewat keputusan approval (adapter domain SDD-APR-17 tidak
// dipasang di gerbang) atau lewat waktu berjalan disiapkan langsung dengan SQL; yang diuji tetap
// route itu sendiri.

import { randomUUID } from "node:crypto";
import { ROOM_SCHEDULE_IMPORT_COLUMNS } from "@sigm4/schemas";
import { kueri } from "./db.js";

export interface BalasanSapuan {
    readonly status: number;
    readonly json: { data?: unknown };
}

/** Satu langkah sapuan: route, path konkret, badan, aksi log yang wajib bertambah satu, header, pelaku. */
export type LangkahSapuan = (
    pola: string,
    path: string,
    body: unknown,
    aksi: readonly string[],
    headers?: Record<string, string>,
    pelaku?: number,
) => Promise<BalasanSapuan>;

export interface KonteksSapuan {
    readonly langkah: LangkahSapuan;
    /** Pembacaan pendukung (GET) sebagai Administrator; tidak dihitung sebagai langkah sapuan. */
    readonly baca: (path: string) => Promise<BalasanSapuan>;
    readonly admin: number;
    /** Hari ini menurut jam gerbang (YYYY-MM-DD). */
    readonly hariIni: string;
    /** Jam gerbang. */
    readonly sekarang: Date;
}

const idem = () => ({ "idempotency-key": randomUUID() });
const data = <T>(h: BalasanSapuan) => h.json.data as T;
const satu = async (q: string): Promise<string> => {
    const [b] = await kueri<{ id: string }>(q);
    if (b === undefined) throw new Error(`Fixture sapuan kosong: ${q}`);
    return b.id;
};

export async function sapuFase03Sampai06(k: KonteksSapuan): Promise<void> {
    const { langkah, baca, admin, hariIni, sekarang } = k;
    const sfx = randomUUID().slice(0, 6).toUpperCase();
    const besok = (hari: number) => new Date(sekarang.getTime() + hari * 86_400_000).toISOString().slice(0, 10);

    // --- Fixture bersama
    const pengguna = (peran: string, status = "AKTIF") =>
        satu(`INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
              VALUES ('Sapuan ${peran} ${sfx}', '${randomUUID()}@sapuan.sch.id', 'x', 'SAPUAN${randomUUID().replace(/-/g, "").slice(0, 12)}',
                      (SELECT id FROM roles WHERE kode = '${peran}'), '${status}', false) RETURNING id::text`).then(Number);
    const teknisi = await pengguna("R-04");
    const pimpinan = await pengguna("R-03");
    const peminjam = await pengguna("R-05");
    const gedung = await satu(`INSERT INTO buildings (nama, kode) VALUES ('Sapuan ${sfx}', 'SG${sfx}') RETURNING id::text`);
    const area = await satu(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Sapuan', 'SA${sfx}') RETURNING id::text`);
    const ruang = (kode: string, jenis = "GUDANG") =>
        satu(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi) VALUES (${area}, 'Ruang ${kode}', '${kode}${sfx}', '${jenis}', 30, true) RETURNING id::text`).then(Number);
    const gudang = await ruang("SR");
    const ruangOpname = await ruang("SO");
    const ruangOpname2 = await ruang("SP");
    const kategori = Number(await satu(`INSERT INTO asset_categories (nama, kode) VALUES ('Sapuan ${sfx}', 'SK${sfx}') RETURNING id::text`));
    const unitKerja = Number(await satu(`INSERT INTO work_units (nama, kode, jenis) VALUES ('Sapuan ${sfx}', 'SU${sfx}', 'MANAJEMEN') RETURNING id::text`));
    let nomorAset = 0;
    const aset = async (kondisi = "BAIK", nilai: string | null = "10000", lokasi = gudang) => {
        const kode = `SAPUAN-${sfx}-${String(++nomorAset)}`;
        const status = ["HILANG", "RUSAK_BERAT"].includes(kondisi) ? "TIDAK_TERSEDIA" : "TERSEDIA";
        const id = await satu(`INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, status, nilai_perolehan, dapat_dipinjam, boleh_dipinjam_siswa)
              VALUES ('${kode}', 'Aset Sapuan', ${kategori}, 2026, 'PEMBELIAN', ${lokasi}, '${kondisi}', '${status}', ${nilai ?? "NULL"}, true, true) RETURNING id::text`);
        return { id: Number(id), kode };
    };
    /** Berkas privat CLEAN milik pengunggah (pemindaian AV dibuktikan m06-file-scan). */
    const berkas = (jenis: string, pemilik: number, mime = "image/jpeg", scan = "CLEAN") =>
        satu(`INSERT INTO stored_files (object_key, mime, ukuran, checksum, scan_status, owner_type, uploaded_by)
              VALUES ('sapuan/${randomUUID()}', '${mime}', 100, ${scan === "CLEAN" ? `'${"a".repeat(64)}'` : "NULL"}, '${scan}', '${jenis}', ${pemilik}) RETURNING id::text`).then(Number);

    // --- M-02: pseudonimisasi akun nonaktif (FR-02.6)
    const nonaktif = await pengguna("R-05", "NONAKTIF");
    await langkah("POST /users/:id/pseudonymize", `/users/${nonaktif}/pseudonymize`,
        { alasan: "Permintaan penghapusan telah diverifikasi.", referensi_permintaan: `DP-${sfx}`, metode_verifikasi: "KARTU_IDENTITAS_TATAP_MUKA" }, ["USER_PSEUDONYMIZED"]);

    // --- M-07: impor jadwal tetap ruangan (FR-07.5 A3) — ≤ 200 baris diproses sinkron
    const ruangKelas = await ruang("SJ", "KELAS");
    const kodeKelas = (await kueri<{ kode: string }>(`SELECT kode FROM rooms WHERE id = ${ruangKelas}`))[0]?.kode ?? "";
    const baris: Record<string, string> = { kode_ruangan: kodeKelas, hari: "Senin", jam_mulai: "10:00", jam_selesai: "11:00", label_kegiatan: "KBM", berlaku_mulai: besok(2), berlaku_sampai: besok(40) };
    const csv = [ROOM_SCHEDULE_IMPORT_COLUMNS.join(","), ROOM_SCHEDULE_IMPORT_COLUMNS.map((c) => baris[c] ?? "").join(",")].join("\r\n");
    await langkah("POST /room-fixed-schedules/import", "/room-fixed-schedules/import", { filename: "jadwal.csv", content_base64: Buffer.from(csv).toString("base64") },
        ["ROOM_SCHEDULE_IMPORT_REQUESTED", "ROOM_SCHEDULE_IMPORTED"], idem());

    // --- M-16: pengajuan ekspor laporan (FR-16.3) — job dibuat, render oleh worker
    await langkah("POST /analytics/:jenis/export", "/analytics/rekapitulasi-aset/export", { format: "XLSX", filter: {} }, ["REPORT_EXPORT_REQUESTED"], idem());
    await langkah("POST /reservations/export", "/reservations/export", { format: "XLSX", filter: {} }, ["REPORT_EXPORT_REQUESTED"], idem());
    await langkah("POST /damage-reports/export", "/damage-reports/export", { format: "XLSX", filter: {} }, ["REPORT_EXPORT_REQUESTED"], idem());

    // --- M-09: peminjaman, pengembalian, perpanjangan, denda & ganti rugi
    await kueri("UPDATE system_settings SET value = '1000' WHERE key = 'denda.tarif_per_hari'");
    await kueri("UPDATE system_settings SET value = '5000' WHERE key = 'denda.cap_nominal'");
    const serahTerima = async (unit: { id: number; kode: string }) => ({
        langsung: { peminjam_id: peminjam, tanggal_jatuh_tempo: new Date(sekarang.getTime() + 7_200_000).toISOString(), keperluan: "Uji gerbang AL-01", lokasi_penggunaan: "Kelas", alasan: "Kegiatan mendesak." },
        nama_penerima: "Peminjam Sapuan",
        diwakilkan: false,
        signature_file_id: await berkas("HANDOVER_PHOTO", admin, "image/png"),
        unit: [{ asset_id: unit.id, verification_code: unit.kode, kondisi_awal: "BAIK", foto_file_ids: [await berkas("HANDOVER_PHOTO", admin)] }],
    });
    const kembali = async (pinjam: string, unit: { kode: string }, kondisi = "BAIK") => ({
        unit: [{
            loan_item_id: Number(await satu(`SELECT id::text FROM loan_items WHERE loan_id = ${pinjam}`)),
            verification_code: unit.kode,
            kondisi_akhir: kondisi,
            foto_file_ids: [await berkas("HANDOVER_PHOTO", admin)],
            ...(kondisi === "BAIK" ? {} : { catatan: "Hasil pemeriksaan fisik.", kelalaian: true }),
        }],
    });
    const unitTepat = await aset();
    const pinjamTepat = data<{ id: string }>(await langkah("POST /loans/checkout", "/loans/checkout", await serahTerima(unitTepat), ["LOAN_CHECKOUT"], idem())).id;
    await langkah("POST /loans/{id}/extend", `/loans/${pinjamTepat}/extend`, { tanggal_jatuh_tempo: new Date(sekarang.getTime() + 86_400_000).toISOString(), alasan: "Kegiatan berlanjut" },
        ["LOAN_EXTENSION_REQUESTED"], idem(), peminjam);
    await langkah("POST /loans/{id}/checkin/preview", `/loans/${pinjamTepat}/checkin/preview`, await kembali(pinjamTepat, unitTepat), []);
    await langkah("POST /loans/{id}/checkin", `/loans/${pinjamTepat}/checkin`, await kembali(pinjamTepat, unitTepat), ["LOAN_CHECKIN"], idem());

    // Keterlambatan: peminjaman dimundurkan tiga hari (waktu berjalan) sebelum pengembalian (BR-028).
    const unitTelat = await aset();
    const pinjamTelat = data<{ id: string }>(await langkah("POST /loans/checkout", "/loans/checkout", await serahTerima(unitTelat), ["LOAN_CHECKOUT"], idem())).id;
    await kueri(`UPDATE loans SET tanggal_pinjam = tanggal_pinjam - interval '3 days', tanggal_jatuh_tempo = tanggal_jatuh_tempo - interval '3 days' WHERE id = ${pinjamTelat}`);
    await langkah("POST /loans/{id}/checkin", `/loans/${pinjamTelat}/checkin`, await kembali(pinjamTelat, unitTelat), ["LOAN_CHECKIN", "FINE_ISSUED"], idem());
    const dendaTelat = await satu(`SELECT f.id::text FROM fines f JOIN loan_items li ON li.id = f.loan_item_id WHERE li.loan_id = ${pinjamTelat}`);
    // Penerbitan memakai jam basis data (created_at), gerbang memakai jam beku T1: disamakan.
    await kueri(`UPDATE fines SET created_at = '${sekarang.toISOString()}' WHERE id = ${dendaTelat}`);
    await langkah("PATCH /fines/{id}/pay", `/fines/${dendaTelat}/pay`, { tanggal_bayar: sekarang.toISOString(), nomor_bukti: `KW-${sfx}` }, ["FINE_PAID"], idem());
    await langkah("PATCH /fines/{id}/reopen", `/fines/${dendaTelat}/reopen`, { alasan: "Salah pencatatan" }, ["FINE_REOPENED"], idem());
    await langkah("PATCH /fines/{id}/waive", `/fines/${dendaTelat}/waive`, { alasan: "Kegiatan sekolah" }, ["FINE_WAIVED"], idem());

    // Ganti rugi tanpa nilai perolehan: menunggu penetapan nilai lewat usulan (BR-028c/d/e).
    const unitHilang = await aset("BAIK", null);
    const pinjamHilang = data<{ id: string }>(await langkah("POST /loans/checkout", "/loans/checkout", await serahTerima(unitHilang), ["LOAN_CHECKOUT"], idem())).id;
    await langkah("POST /loans/{id}/checkin", `/loans/${pinjamHilang}/checkin`, await kembali(pinjamHilang, unitHilang, "HILANG"), ["LOAN_CHECKIN", "LOAN_MARKED_LOST"], idem());
    const gantiRugi = await satu(`SELECT f.id::text FROM fines f JOIN loan_items li ON li.id = f.loan_item_id WHERE li.loan_id = ${pinjamHilang} AND f.jenis = 'GANTI_RUGI'`);
    const usulan = data<{ id: string }>(await langkah("POST /fines/{id}/replacement-proposals", `/fines/${gantiRugi}/replacement-proposals`, { jumlah: "12000", alasan: "Harga unit pengganti" },
        ["COMPENSATION_PROPOSED"], idem())).id;
    await langkah("POST /fines/{id}/replacement-proposals/{proposalId}/decide", `/fines/${gantiRugi}/replacement-proposals/${usulan}/decide`, { keputusan: "DISETUJUI", catatan: "Harga wajar" },
        ["COMPENSATION_DECIDED"], idem(), pimpinan);
    await langkah("PATCH /fines/{id}/waive-compensation", `/fines/${gantiRugi}/waive-compensation`, { alasan: "Keputusan Pimpinan", jumlah: "2000" }, ["COMPENSATION_WAIVED"], idem(), pimpinan);

    // --- M-12: jadwal preventif dan siklus work order
    const jadwal = { nama: `Preventif ${sfx}`, category_id: kategori, interval_hari: 30, tanggal_mulai: besok(7), checklist: ["Periksa kabel"], teknisi_default_id: teknisi };
    const idJadwal = data<{ id: string }>(await langkah("POST /maintenance-schedules", "/maintenance-schedules", jadwal, ["MAINTENANCE_SCHEDULE_CREATED"], idem())).id;
    await langkah("PUT /maintenance-schedules/:id", `/maintenance-schedules/${idJadwal}`, { ...jadwal, interval_hari: 60 }, ["MAINTENANCE_SCHEDULE_UPDATED"], idem());
    await langkah("POST /maintenance-schedules/:id/skip", `/maintenance-schedules/${idJadwal}/skip`, { alasan: "Libur semester" }, ["MAINTENANCE_SCHEDULE_SKIPPED"], idem());
    await langkah("POST /maintenance-schedules/:id/deactivate", `/maintenance-schedules/${idJadwal}/deactivate`, { alasan: "Uji gerbang AL-01" }, ["MAINTENANCE_SCHEDULE_DEACTIVATED"], idem());

    const perintah = async () => data<{ id: string }>(await langkah("POST /work-orders", "/work-orders",
        { asset_id: (await aset()).id, teknisi_id: teknisi, target_selesai: besok(10), deskripsi: "Perbaiki unit", prioritas: "TINGGI", estimasi_biaya: 1000, nonaktifkan_aset: true },
        ["WORKORDER_CREATED"], idem())).id;
    const fotoWo = () => berkas("WORK_ORDER_PHOTO", teknisi);
    const wo = await perintah();
    await langkah("PATCH /work-orders/:id/start", `/work-orders/${wo}/start`, {}, ["WORKORDER_STARTED"], idem(), teknisi);
    await langkah("PATCH /work-orders/:id/progress", `/work-orders/${wo}/progress`, { catatan_teknisi: "Motor diganti" }, ["WORKORDER_PROGRESS_UPDATED"], idem(), teknisi);
    const fotoLepas = await fotoWo();
    await langkah("POST /work-orders/:id/photos", `/work-orders/${wo}/photos`, { foto_file_ids: [fotoLepas] }, ["WORKORDER_PROGRESS_UPDATED"], idem(), teknisi);
    await langkah("DELETE /work-orders/:id/photos/:fileId", `/work-orders/${wo}/photos/${fotoLepas}`, {}, ["WORKORDER_PROGRESS_UPDATED"], idem(), teknisi);
    await langkah("POST /work-orders/:id/pause", `/work-orders/${wo}/pause`, { alasan: "Menunggu suku cadang", tanggal_lanjut: besok(3) }, ["WORKORDER_PROGRESS_UPDATED"], idem(), teknisi);
    await langkah("PATCH /work-orders/:id/start", `/work-orders/${wo}/start`, {}, [], idem(), teknisi);
    await kueri("UPDATE system_settings SET value = '1500' WHERE key = 'maintenance.ambang_persetujuan_estimasi'");
    await langkah("POST /work-orders/:id/estimate", `/work-orders/${wo}/estimate`, { estimasi: 2000, alasan: "Motor lebih besar" }, ["WORKORDER_PROGRESS_UPDATED"], idem(), teknisi);
    await langkah("POST /work-orders/:id/estimate/decide", `/work-orders/${wo}/estimate/decide`, { keputusan: "DISETUJUI", catatan: "Harga terverifikasi" }, ["WORKORDER_PROGRESS_UPDATED"], idem());
    await langkah("POST /work-orders/:id/photos", `/work-orders/${wo}/photos`, { foto_file_ids: [await fotoWo()] }, ["WORKORDER_PROGRESS_UPDATED"], idem(), teknisi);
    await langkah("POST /work-orders/:id/complete", `/work-orders/${wo}/complete`, { hasil: "Motor diganti dan diuji" }, ["WORKORDER_COMPLETED"], idem(), teknisi);
    await langkah("POST /work-orders/:id/verify", `/work-orders/${wo}/verify`, { keputusan: "TUTUP", kondisi_pasca: "BAIK" }, ["WORKORDER_VERIFIED"], idem());
    const woRusak = await perintah();
    await langkah("PATCH /work-orders/:id/start", `/work-orders/${woRusak}/start`, {}, ["WORKORDER_STARTED"], idem(), teknisi);
    await langkah("POST /work-orders/:id/photos", `/work-orders/${woRusak}/photos`, { foto_file_ids: [await fotoWo()] }, ["WORKORDER_PROGRESS_UPDATED"], idem(), teknisi);
    await langkah("POST /work-orders/:id/irreparable", `/work-orders/${woRusak}/irreparable`, { rekomendasi: "Ganti unit" }, ["WORKORDER_COMPLETED"], idem(), teknisi);

    // --- M-20 / M-22: satuan, kategori, master Bahan, transaksi stok, permintaan
    const satuan = data<{ id: string }>(await langkah("POST /material-units", "/material-units", { nama: `Karung ${sfx}`, simbol: `krg${sfx.toLowerCase()}` }, ["MATERIAL_UNIT_CREATED"], idem())).id;
    await langkah("PATCH /material-units/:id/status", `/material-units/${satuan}/status`, { status: "NONAKTIF" }, ["MATERIAL_UNIT_UPDATED"], idem());
    const katBahan = data<{ id: string }>(await langkah("POST /material-categories", "/material-categories", { nama: `ATK ${sfx}`, kode: `MB${sfx}` }, ["MATERIAL_CATEGORY_CREATED"], idem())).id;
    await langkah("PUT /material-categories/:id", `/material-categories/${katBahan}`, { nama: `ATK ${sfx} B`, kode: `MB${sfx}` }, ["MATERIAL_CATEGORY_UPDATED"], idem());
    const katBuang = data<{ id: string }>(await langkah("POST /material-categories", "/material-categories", { nama: `Buang ${sfx}`, kode: `MX${sfx}` }, ["MATERIAL_CATEGORY_CREATED"], idem())).id;
    await langkah("DELETE /material-categories/:id", `/material-categories/${katBuang}`, {}, ["MATERIAL_CATEGORY_DELETED"], idem());
    const rim = Number(await satu("SELECT id::text FROM material_units WHERE simbol = 'rim'"));
    const bahan = data<{ id: string }>(await langkah("POST /materials", "/materials",
        { nama: `Kertas ${sfx}`, material_category_id: Number(katBahan), satuan_id: rim, room_id_default: gudang, stok_minimum: 5 }, ["MATERIAL_CREATED"], idem())).id;
    await langkah("PATCH /materials/:id", `/materials/${bahan}`, { stok_minimum: 3 }, ["MATERIAL_UPDATED"], idem());
    await langkah("POST /materials/:id/receipts", `/materials/${bahan}/receipts`,
        { room_id: gudang, jumlah: 20, tanggal_terima: hariIni, nomor_dokumen: `INV-${sfx}`, dokumen: [{ file_id: await berkas("MATERIAL_RECEIPT_DOCUMENT", admin, "application/pdf"), nama_berkas: "Faktur.pdf" }] },
        ["MATERIAL_RECEIVED"], idem());
    await langkah("POST /materials/:id/adjustments", `/materials/${bahan}/adjustments`, { room_id: gudang, arah: "KURANG", jumlah: 1, alasan: "Rusak terkena air" }, ["MATERIAL_ADJUSTED"], idem());
    await langkah("POST /materials/qr/print", "/materials/qr/print", { material_ids: [Number(bahan)], tata_letak: "A4_3X8", nama: true }, ["MATERIAL_QR_PRINTED"], idem());
    await langkah("PUT /materials/:id/request-threshold", `/materials/${bahan}/request-threshold`, { batas: 5 }, ["SETTING_UPDATED"], idem());
    await langkah("DELETE /materials/:id/request-threshold", `/materials/${bahan}/request-threshold`, {}, ["SETTING_UPDATED"], idem());

    // Ambang default permintaan Bahan wajib diisi Administrator (FR-22.4); di bawah ambang tanpa approval.
    await kueri("UPDATE system_settings SET value = '10' WHERE key = 'bahan.ambang_permintaan_default'");
    const minta = { keperluan: "Kegiatan belajar", items: [{ material_id: Number(bahan), room_id: gudang, jumlah: 2 }] };
    const permintaan = data<{ id: string; items: { id: string }[] }>(await langkah("POST /material-requests", "/material-requests", minta, ["MATERIAL_REQUEST_SUBMITTED"], idem()));
    await langkah("POST /material-requests/:id/issue", `/material-requests/${permintaan.id}/issue`,
        { nama_penerima: "Guru kelas", tanggal_serah: hariIni, items: [{ item_id: Number(permintaan.items[0]?.id), jumlah: 1 }] }, ["MATERIAL_ISSUED"], idem());
    await langkah("POST /material-requests/:id/close", `/material-requests/${permintaan.id}/close`, { alasan: "Kebutuhan cukup" }, ["MATERIAL_REQUEST_CLOSED"], idem());
    // Revisi diminta pemutus approval (FR-22.4 A2): keadaan PERLU_REVISI disiapkan langsung.
    const revisi = data<{ id: string }>(await langkah("POST /material-requests", "/material-requests", minta, ["MATERIAL_REQUEST_SUBMITTED"], idem())).id;
    await kueri(`UPDATE material_requests SET status = 'PERLU_REVISI' WHERE id = ${revisi}`);
    await langkah("PUT /material-requests/:id", `/material-requests/${revisi}`, { ...minta, items: [{ ...minta.items[0], jumlah: 1 }] }, ["MATERIAL_REQUEST_SUBMITTED"], idem());
    await langkah("POST /material-requests/:id/cancel", `/material-requests/${revisi}/cancel`, { alasan: "Kegiatan batal" }, ["MATERIAL_REQUEST_CANCELLED"], idem());

    // --- M-13: opname Aset (sesi penuh sampai disetujui) dan opname Bahan
    const ditemukan = await aset("BAIK", "10000", ruangOpname);
    const hilang = await aset("BAIK", "10000", ruangOpname);
    const sesi = data<{ id: string }>(await langkah("POST /audit-sessions", "/audit-sessions",
        { nama: `Opname ${sfx}`, periode_mulai: hariIni, periode_selesai: besok(5), cakupan: { jenis: "RUANGAN", id: ruangOpname }, pelaksana_ids: [admin] }, ["AUDIT_SESSION_CREATED"], idem())).id;
    const fotoTertunda = await berkas("STOCKTAKE_PHOTO", admin, "image/jpeg", "PENDING");
    await langkah("POST /audit-sessions/:id/scan", `/audit-sessions/${sesi}/scan`,
        { client_scan_id: randomUUID(), asset_id: ditemukan.id, room_id: ruangOpname, kondisi: "BAIK", foto_file_ids: [fotoTertunda] }, ["AUDIT_ITEM_SCANNED"], idem());
    await langkah("POST /audit-sessions/:id/photos/:itemId/remove", `/audit-sessions/${sesi}/photos/${fotoTertunda}/remove`, { alasan: "Foto gagal terunggah" }, ["AUDIT_PHOTO_WITHDRAWN"], idem());
    const temuan = data<{ item_id: string }>(await langkah("POST /audit-sessions/:id/findings", `/audit-sessions/${sesi}/findings`,
        { client_scan_id: randomUUID(), deskripsi: "Kursi belum terdaftar", category_id: kategori, room_id: ruangOpname, kondisi: "BAIK" }, ["AUDIT_ITEM_SCANNED"], idem())).item_id;
    await langkah("POST /audit-sessions/:id/complete-location", `/audit-sessions/${sesi}/complete-location`, { room_id: ruangOpname }, ["AUDIT_LOCATION_COMPLETED"], idem());
    await langkah("POST /audit-sessions/:id/finalize", `/audit-sessions/${sesi}/finalize`, {}, ["AUDIT_SESSION_FINALIZED"], idem());
    const butirHilang = await satu(`SELECT id::text FROM audit_items WHERE session_id = ${sesi} AND asset_id = ${hilang.id}`);
    await langkah("PUT /audit-sessions/:id/items/:itemId/reconcile", `/audit-sessions/${sesi}/items/${butirHilang}/reconcile`,
        { keterangan: "Sudah diperiksa ulang", tindakan: "HILANG", basis: { room_id: ruangOpname, kondisi: "BAIK" } }, ["AUDIT_RECONCILIATION_UPDATED"], idem());
    await langkah("PUT /audit-sessions/:id/findings/:itemId", `/audit-sessions/${sesi}/findings/${temuan}`,
        { keterangan: "Hibah baru ditemukan", nama: "Kursi temuan", category_id: kategori, room_id: ruangOpname, kondisi: "BAIK", tahun_perolehan: 2026, sumber_perolehan: "HIBAH", nilai_perolehan: null },
        ["AUDIT_RECONCILIATION_UPDATED"], idem());
    await langkah("POST /audit-sessions/:id/submit", `/audit-sessions/${sesi}/submit`, {}, ["AUDIT_SESSION_SUBMITTED"], idem());
    await langkah("POST /audit-sessions/:id/approve", `/audit-sessions/${sesi}/approve`, { keputusan: "SETUJU", catatan: "Disetujui" }, ["AUDIT_SESSION_APPROVED"], idem(), pimpinan);
    // Pembuatan PDF berita acara gagal di worker (SDD-07): status disiapkan, pengulangan manual diuji.
    await kueri(`UPDATE audit_sessions SET report_status = 'GAGAL' WHERE id = ${sesi}`);
    await langkah("POST /audit-sessions/:id/report/retry", `/audit-sessions/${sesi}/report/retry`, {}, ["AUDIT_REPORT_RETRY_REQUESTED"], idem());
    await aset("BAIK", "10000", ruangOpname2);
    const sesiBatal = data<{ id: string }>(await langkah("POST /audit-sessions", "/audit-sessions",
        { nama: `Opname batal ${sfx}`, periode_mulai: hariIni, periode_selesai: besok(5), cakupan: { jenis: "RUANGAN", id: ruangOpname2 }, pelaksana_ids: [admin] }, ["AUDIT_SESSION_CREATED"], idem())).id;
    await langkah("POST /audit-sessions/:id/cancel", `/audit-sessions/${sesiBatal}/cancel`, { alasan: "Uji gerbang AL-01" }, ["AUDIT_SESSION_CANCELLED"], idem());

    const sesiBahan = data<{ id: string }>(await langkah("POST /audit-sessions", "/audit-sessions",
        { domain: "BAHAN", nama: `Opname Bahan ${sfx}`, periode_mulai: hariIni, periode_selesai: besok(5), cakupan: { jenis: "RUANGAN", id: gudang }, pelaksana_ids: [admin] }, ["AUDIT_SESSION_CREATED"], idem())).id;
    const butirBahan = async () => data<{ id: string; saldo_sekarang: number; ledger_id_sekarang: string | null; revision: number; material_id: string }[]>(
        await baca(`/audit-sessions/${sesiBahan}/material-items?per_page=500`)).find((i) => i.material_id === bahan);
    const stok = await butirBahan();
    await langkah("POST /audit-sessions/:id/material-counts", `/audit-sessions/${sesiBahan}/material-counts`,
        { client_scan_id: randomUUID(), material_id: Number(bahan), room_id: gudang, jumlah_fisik: (stok?.saldo_sekarang ?? 0) - 1, basis: { saldo: stok?.saldo_sekarang, ledger_id: stok?.ledger_id_sekarang }, revision: stok?.revision, keterangan: "Satu rim rusak" },
        ["AUDIT_MATERIAL_COUNTED"], idem());
    await langkah("POST /audit-sessions/:id/complete-location", `/audit-sessions/${sesiBahan}/complete-location`, { room_id: gudang }, ["AUDIT_LOCATION_COMPLETED"], idem());
    await langkah("POST /audit-sessions/:id/finalize", `/audit-sessions/${sesiBahan}/finalize`, {}, ["AUDIT_SESSION_FINALIZED"], idem());
    const revisiStok = (await butirBahan())?.revision;
    await langkah("PUT /audit-sessions/:id/material-items/:itemId/reconcile", `/audit-sessions/${sesiBahan}/material-items/${stok?.id ?? ""}/reconcile`,
        { keterangan: "Selisih sudah diperiksa", revision: revisiStok }, ["AUDIT_RECONCILIATION_UPDATED"], idem());

    // --- M-14: siklus pengadaan
    const usulanPengadaan = (mode: string, tahun = 2026) => ({
        mode, judul: "Kursi laboratorium", work_unit_id: unitKerja, tahun_anggaran: tahun, prioritas: "TINGGI", justifikasi: "Kursi lama rusak",
        items: [{ jenis: "ASET", nama_barang: "Kursi", category_id: kategori, spesifikasi: "Kayu", jumlah: 2, satuan: "unit", estimasi_harga_satuan: 123.45 }],
    });
    const pengadaan = data<{ id: string }>(await langkah("POST /procurements", "/procurements", usulanPengadaan("DRAF"), ["PROCUREMENT_CREATED"], idem())).id;
    await langkah("PUT /procurements/:id", `/procurements/${pengadaan}`, usulanPengadaan("DRAF"), ["PROCUREMENT_UPDATED"], idem());
    await langkah("POST /procurements/:id/submit", `/procurements/${pengadaan}/submit`, {}, ["PROCUREMENT_SUBMITTED"], idem());
    // Keputusan approval berjenjang (FR-14.2) diterapkan adapter domain; di gerbang disiapkan langsung.
    const setujui = async (id: string) => {
        await kueri(`UPDATE procurement_items SET jumlah_disetujui = jumlah_diusulkan WHERE procurement_id = ${id}`);
        await kueri(`UPDATE procurements SET status = 'DISETUJUI' WHERE id = ${id}`);
    };
    await setujui(pengadaan);
    const butirPengadaan = await satu(`SELECT id::text FROM procurement_items WHERE procurement_id = ${pengadaan}`);
    await langkah("POST /procurements/:id/receipts", `/procurements/${pengadaan}/receipts`, {
        tanggal_terima: hariIni, nomor_dokumen: `INV-${sfx}`,
        dokumen: [{ file_id: await berkas("PROCUREMENT_RECEIPT_DOCUMENT", admin, "application/pdf"), nama_berkas: "Faktur.pdf", jenis: "FAKTUR" }],
        items: [{ item_id: Number(butirPengadaan), jumlah: 2, status: "DITERIMA", room_id: gudang, nilai_perolehan: 120, kondisi: "BAIK" }],
    }, ["PROCUREMENT_RECEIVED", "PROCUREMENT_ASSETS_GENERATED"], idem());
    const pengadaanLama = data<{ id: string }>(await langkah("POST /procurements", "/procurements", usulanPengadaan("AJUKAN", 2025), ["PROCUREMENT_CREATED"], idem())).id;
    await setujui(pengadaanLama);
    await langkah("POST /procurements/:id/close", `/procurements/${pengadaanLama}/close`, { alasan: "Anggaran tidak direalisasikan" }, ["PROCUREMENT_CLOSED"], idem());

    // --- M-21: penghapusan aset hilang, revisi, pelaksanaan, pemulihan
    const usulHapus = async (unit: number) => {
        const bukti = await berkas("DISPOSAL_ATTACHMENT", admin, "application/pdf");
        return {
            alasan: "HILANG", justifikasi: "Tidak ditemukan setelah opname", tindak_lanjut_fisik: "ADMINISTRATIF",
            items: [{ asset_id: unit, bukti_kehilangan_file_id: bukti }],
            lampiran: [{ file_id: bukti, nama_berkas: "Berita acara kehilangan.pdf", jenis: "KEHILANGAN" }],
        };
    };
    // Aturan approval aktif yang berakhir pada Pimpinan wajib ada sebelum pengusulan (FR-21.2).
    const aturanHapus = await satu("INSERT INTO approval_rules (jenis_pengajuan, prioritas, kondisi, status_aktif) VALUES ('PENGHAPUSAN_ASET', 100, '{}', true) RETURNING id::text");
    await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_user_id, sla_jam) VALUES (${aturanHapus}, 1, 'user', ${pimpinan}, 8)`);
    const unitHapus = (await aset("HILANG")).id;
    const hapus = data<{ id: string }>(await langkah("POST /asset-disposals", "/asset-disposals", await usulHapus(unitHapus), ["ASSET_DISPOSAL_PROPOSED"], idem())).id;
    // Revisi diminta pemutus approval (FR-21.2): keadaan PERLU_REVISI disiapkan langsung.
    await kueri(`UPDATE asset_disposals SET status = 'PERLU_REVISI' WHERE id = ${hapus}`);
    await kueri(`UPDATE approval_instances SET status = 'PERLU_REVISI', diselesaikan_pada = '${sekarang.toISOString()}' WHERE id = (SELECT approval_instance_id FROM asset_disposals WHERE id = ${hapus})`);
    await langkah("PUT /asset-disposals/:id", `/asset-disposals/${hapus}`, await usulHapus(unitHapus), ["ASSET_DISPOSAL_PROPOSED"], idem());
    await kueri(`UPDATE asset_disposal_items SET disetujui = true WHERE disposal_id = ${hapus}`);
    await kueri(`UPDATE asset_disposals SET status = 'DISETUJUI', disetujui_oleh = ${pimpinan}, disetujui_pada = '${sekarang.toISOString()}' WHERE id = ${hapus}`);
    await langkah("POST /asset-disposals/:id/execute", `/asset-disposals/${hapus}/execute`, { tanggal: hariIni, tindak_lanjut: "ADMINISTRATIF", saksi: ["Petugas saksi"] }, ["ASSET_DISPOSAL_EXECUTED"], idem());
    await kueri(`UPDATE asset_disposals SET report_status = 'GAGAL' WHERE id = ${hapus}`);
    await langkah("POST /asset-disposals/:id/report/retry", `/asset-disposals/${hapus}/report/retry`, {}, ["ASSET_DISPOSAL_REPORT_RETRY_REQUESTED"], idem());
    await langkah("POST /assets/:id/reinstate", `/assets/${unitHapus}/reinstate`, { alasan: "Aset ditemukan kembali", room_id: gudang, kondisi: "BAIK" }, ["ASSET_REINSTATED"], idem());
    const batal = data<{ id: string }>(await langkah("POST /asset-disposals", "/asset-disposals", await usulHapus((await aset("HILANG")).id), ["ASSET_DISPOSAL_PROPOSED"], idem())).id;
    await langkah("POST /asset-disposals/:id/cancel", `/asset-disposals/${batal}/cancel`, { alasan: "Aset ditemukan" }, ["ASSET_DISPOSAL_CANCELLED"], idem());

    // --- M-19: percakapan pribadi, umpan balik, laporan berizin, moderasi, penghapusan
    const sesiChat = data<{ id: string }>(await langkah("POST /chat/sessions", "/chat/sessions", {}, ["CHAT_SESSION_CREATED"], idem())).id;
    await langkah("POST /chat/messages", "/chat/messages", { session_id: sesiChat, pesan: "Di mana proyektor?", client_message_id: randomUUID() }, ["CHAT_MESSAGE_SENT"], idem());
    const jawaban = await satu(`SELECT id::text FROM chat_messages WHERE session_id = ${sesiChat} AND peran = 'ASSISTANT' ORDER BY id DESC LIMIT 1`);
    await langkah("POST /chat/messages/:id/feedback", `/chat/messages/${jawaban}/feedback`, { nilai: "DOWN" }, ["CHAT_FEEDBACK_UPDATED"], idem());
    await langkah("POST /chat/sessions/:id/report", `/chat/sessions/${sesiChat}/report`, { message_id: jawaban, alasan: "Jawaban kurang tepat", izinkan_berbagi: true }, ["CHAT_SESSION_REPORTED"], idem());
    await langkah("POST /chat/reports/:id/access", `/chat/reports/${sesiChat}/access`, { blocked: true, alasan: "Uji moderasi" }, ["CHAT_ACCESS_RESTRICTED"], idem());
    await langkah("POST /chat/reports/:id/access", `/chat/reports/${sesiChat}/access`, { blocked: false, alasan: "Pemulihan" }, ["CHAT_ACCESS_RESTRICTED"], idem());
    await langkah("DELETE /chat/sessions/:id", `/chat/sessions/${sesiChat}`, {}, ["CHAT_SESSION_DELETED"], idem());
}
