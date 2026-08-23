# 30. Quality Assurance & Test Strategy

> PRD sebelumnya memiliki Acceptance Criteria per requirement, tetapi tidak memiliki strategi pengujian: tidak ada level pengujian, kriteria masuk/keluar, definisi keparahan, rencana UAT, maupun pengujian konkurensi — padahal *race condition* (RS-11) dan kebocoran lintas hak akses (RS-10) adalah dua risiko berdampak tertinggi.

## 30.1 Piramida Pengujian & Target Cakupan

| Level | Cakupan | Target | Penanggung jawab |
|---|---|---|---|
| Unit | Logika bisnis murni: evaluasi approval rule, perhitungan denda & cap, perhitungan keterlambatan, validasi durasi, algoritma ketersediaan | ≥ 80% pada modul inti (menaikkan NFR-M-03 untuk area kritis) | Developer |
| Integrasi | Endpoint + basis data + transaksi + otorisasi | 100% endpoint pada Bab 17 memiliki minimal jalur sukses, jalur validasi gagal, dan jalur ditolak otorisasi | Developer |
| Kontrak API | Kesesuaian implementasi dengan OpenAPI | 100% endpoint | Developer + QA |
| E2E Web | 15 alur bisnis kritis (30.2) | 100% alur kritis | QA |
| E2E Mobile | 8 alur lapangan kritis | 100% alur kritis | QA |
| Non-fungsional | Beban, keamanan, aksesibilitas | Sesuai Bab 9 | QA + Security |

## 30.2 Alur Kritis Wajib Diuji Ujung-ke-Ujung

| # | Alur | Platform |
|---|---|---|
| 1 | Login → 2FA → dashboard sesuai role | Web + Mobile |
| 2 | Ganti password paksa setelah reset administratif | Web |
| 3 | Impor 500 aset → cetak QR → tempel → scan | Web + Mobile |
| 4 | Reservasi ruangan → approval berjenjang → penggunaan → selesai | Web + Mobile |
| 5 | Reservasi aset → approval → serah terima → pengembalian tepat waktu | Web + Mobile |
| 6 | Pengembalian terlambat → denda terbit → tandai lunas → blokir terbuka | Web |
| 7 | Pengembalian sebagian dengan keterlambatan berbeda per unit | Web |
| 8 | Perpanjangan peminjaman disetujui dan ditolak | Mobile |
| 9 | Aset hilang → ganti rugi terbit → pembebasan oleh Pimpinan | Web |
| 9a | Permintaan bahan di bawah ambang → langsung diserahkan → saldo berkurang tepat | Web |
| 9b | Permintaan bahan di atas ambang → approval → penyerahan sebagian → saldo & sisa benar | Web |
| 9c | Stock opname bahan → selisih → persetujuan Pimpinan → transaksi OPNAME menyesuaikan saldo | Web + Mobile |
| 10 | Lapor kerusakan berfoto → verifikasi → work order → eksekusi → verifikasi → tutup | Mobile |
| 11 | Jadwal preventif → work order otomatis terbit H-7 | Web |
| 12 | Sesi opname → scan 100 unit → rekonsiliasi → persetujuan → penyesuaian data | Mobile |
| 13 | Usulan pengadaan → approval bertingkat → penerimaan → aset + QR terbentuk | Web |
| 14 | Usulan penghapusan → persetujuan → eksekusi → berita acara | Web |
| 15 | Chatbot: pertanyaan dalam cakupan, di luar cakupan, dan permintaan aksi tulis | Web + Mobile |

## 30.3 Pengujian Konkurensi (Wajib — menutup RS-11)

| Kode | Skenario | Hasil yang diharapkan |
|---|---|---|
| CC-01 | 50 permintaan simultan memesan slot ruangan yang sama | Tepat 1 sukses; 49 menerima `409 RESERVATION_CONFLICT` |
| CC-02 | 50 permintaan simultan memesan unit aset terakhir | Tepat 1 sukses; 49 menerima `409 ASSET_NOT_AVAILABLE` |
| CC-03 | 2 approver menekan Setujui bersamaan pada langkah yang sama | Tepat 1 keputusan tersimpan; yang kalah menerima `409 APPROVAL_ALREADY_DECIDED` (RE-09) |
| CC-04 | Permintaan `checkout` yang sama dikirim dua kali dengan `Idempotency-Key` identik | Satu transaksi peminjaman; respons kedua identik dengan yang pertama (ID-03) |
| CC-05 | Pemesanan multi-unit yang saling bersilangan urutannya | Tidak terjadi *deadlock* (CI-02) |
| CC-06 | Dua instance worker menjalankan job harian bersamaan | Job dieksekusi tepat satu kali (JOB-02) |
| CC-07 | Approval disetujui bersamaan dengan pembatalan oleh pemohon | Salah satu menang secara deterministik; tidak ada status tidak konsisten |

## 30.4 Pengujian Otorisasi & Keamanan

| Kode | Requirement |
|---|---|
| SEC-T-01 | Matriks uji otomatis: setiap endpoint × 7 role × (data sendiri / data orang lain) — membuktikan tidak ada IDOR (ST-05) |
| SEC-T-02 | Verifikasi bahwa respons API untuk role Siswa/OSIS **tidak pernah** memuat field finansial, meski disaring di klien |
| SEC-T-03 | Red-teaming chatbot per role dengan minimal 40 percobaan ekstraksi data, aksi tulis, dan *prompt injection* (ST-06) |
| SEC-T-04 | Uji bahwa activity log tidak dapat disunting atau dihapus melalui jalur API mana pun |
| SEC-T-05 | Uji bahwa berkas berstatus `pending`/`infected` tidak dapat diunduh |
| SEC-T-06 | Uji rate limit dan penguncian akun sesuai NFR-S-07 |

## 30.5 Strategi Data Uji & Pengujian Pekerjaan Terjadwal

| Kode | Requirement |
|---|---|
| TD-01 | Tersedia *seeder* yang membangun dataset representatif: 5.000 aset, 1.000 pengguna, 30 ruangan, 12 bulan riwayat transaksi |
| TD-02 | Data uji bersifat deterministik (seed tetap) agar hasil pengujian dapat direproduksi |
| TD-03 | Data produksi dilarang dipakai sebagai data uji tanpa anonimisasi (DP-08) |
| TD-04 | **Test hook wajib**: sistem menyediakan cara memicu setiap pekerjaan terjadwal secara manual pada lingkungan non-produksi, dan cara mengatur "waktu sistem" untuk pengujian jatuh tempo, TTL, SLA, dan eskalasi. Tanpa ini, 8 pekerjaan harian pada Bab 12.4 tidak dapat diuji secara wajar |

## 30.6 Matriks Perangkat & Peramban

| Kategori | Wajib diuji |
|---|---|
| Peramban desktop | Chrome & Edge (terbaru), Firefox (terbaru), Safari (terbaru) |
| Peramban mobile | Chrome Android, Safari iOS |
| Android — kelas bawah | Android 8, RAM 2 GB — batas bawah dukungan (NFR-C-03) |
| Android — **kelas menengah** (definisi NFR-P-10) | Android 12+, RAM 4 GB, prosesor 8 inti kelas menengah, terbit ≤ 3 tahun terakhir |
| Android — kelas atas | Android 14+, RAM ≥ 8 GB |
| iOS | iPhone dengan iOS 14 (batas bawah) dan iOS terbaru |
| Resolusi web | 320 px, 768 px, 1366 px, 1920 px (NFR-C-02) |

## 30.7 Kriteria Masuk & Keluar Pengujian

**Kriteria masuk (build dapat diuji QA)**
- Build ter-*deploy* otomatis ke staging dan `/health` melaporkan seluruh dependensi sehat
- Unit test dan integration test lulus di pipeline
- Catatan rilis mencantumkan requirement yang tercakup

**Kriteria keluar (siap UAT)**
- 100% test case alur kritis dieksekusi
- Nol defect Kritis dan Tinggi yang terbuka
- Defect Sedang terbuka ≤ 5 dengan jalan pintas terdokumentasi
- Seluruh target Bab 9.1 tercapai pada uji beban

## 30.8 User Acceptance Testing

| Kode | Requirement |
|---|---|
| UAT-01 | UAT dilakukan oleh pengguna nyata sesuai persona: Petugas Sarpras, Guru, Teknisi, Staf TU, siswa OSIS, Pimpinan, dan Administrator |
| UAT-02 | UAT dijalankan di staging dengan data yang menyerupai kondisi sekolah, termasuk hasil pendataan aset awal |
| UAT-03 | Skenario UAT diturunkan dari Bab 7 (User Journey), bukan dari daftar fitur — pengujian dilakukan sebagai pekerjaan sehari-hari, bukan sebagai klik per menu |
| UAT-04 | UAT mencakup pengujian di lokasi nyata (gudang, laboratorium, aula) untuk memverifikasi kualitas jaringan dan pemindaian QR di lapangan |
| UAT-05 | Berita acara UAT ditandatangani Petugas Sarpras, Wakasek Sarpras, dan Kepala Sekolah (GL-02) |

## 30.9 Definisi Keparahan Defect

| Keparahan | Definisi | SLA perbaikan sebelum rilis |
|---|---|---|
| **Kritis** | Kehilangan/kerusakan data, kebocoran lintas hak akses, alur inti buntu total | Wajib, penghambat rilis |
| **Tinggi** | Fungsi utama gagal tanpa jalan pintas | Wajib, penghambat rilis |
| **Sedang** | Fungsi terganggu namun ada jalan pintas | Boleh ditunda dengan persetujuan Product Owner |
| **Rendah** | Kosmetik, teks, penyelarasan | Boleh ditunda |

---
