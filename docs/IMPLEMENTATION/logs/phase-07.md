# Log Phase 07 — Integrasi Lintas Modul & UAT

| | |
|---|---|
| **Phase** | [`phases/phase-07.md`](../phases/phase-07.md) |
| **Milestone PRD** | `M6 (sebagian)` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | — |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-07.md`](../phases/phase-07.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 25 Oktober 2026 | Pemilik produk meminta seluruh fitur web tersedia di mobile untuk semua role dengan UI yang lebih visual. Lima putaran `AskUserQuestion` (keputusan 1–5). `PR-07-15` menurunkannya ke PRD (`MOB-SCP-01`…`04`), SDD (`SDD-MOB-13`), UX (**UXD-19**…**22**, 67 layar `MS-24`…`MS-90`) dan DESIGN (**DSD-11**/**12**, C-30…C-38), lalu merencanakan 20 PR implementasi `PR-07-16`…`35`. Pemilik produk kemudian memilih pelaksanaan dalam enam paket per domain (keputusan 6). | `PR-07-15` |
| 25 Oktober 2026 | `PR-07-15` (#185) tergabung. Paket 1 Fondasi & Akun dikerjakan di `feature/PR-07-16-fondasi-akun-mobile`: tiga commit `PR-07-16`, `PR-07-17`, `PR-07-18`. Dua putaran `AskUserQuestion` menghasilkan keputusan 7–10. | `PR-07-16`…`18` |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 1 | **Cakupan:** semua fitur web di mobile untuk semua role, kecuali cetak label QR dan impor massal berkas (pemilik produk) | Pilihan "kecuali yang butuh perangkat khusus"; ditolak: paritas mutlak, bertahap lapangan saja | Ya — `MOB-SCP-01`/`02`, `UX-01`, **UXD-19** (mencabut **UXD-17**) |
| 2 | **Visual:** design system dikembangkan, bukan diganti — token & hierarki warna tetap, komponen C-30…C-38 ditambah (pemilik produk) | Ditolak: arah visual baru terpisah dari web | Ya — **DSD-11**/**12**, `MOB-SCP-04` |
| 3 | **Navigasi:** bottom tab Beranda · Tugas · Scan · Chatbot · Menu; Menu berisi pencarian modul + lima grup + fitur per permission; notifikasi ke lonceng header; chatbot juga dari layar lain (usulan pemilik produk) | Lima slot tidak menampung 67 layar | Ya — **UXD-20**…**22** |
| 4 | **Header ringkas satu baris** — kembali/ikon, judul, info, lonceng (pemilik produk) | Header lama dua baris teks + subjudul | Ya — **UXD-21**, C-30 |
| 5 | **Proses:** docs dulu (`PR-07-15`), lalu satu PR per modul; urutan pemohon → petugas/teknisi → pimpinan/admin (pemilik produk) | Aturan repo: keputusan lahir di docs sebelum kode | Tidak — rencana phase |
| 6 | **Paket:** `PR-07-16`…`35` dilaksanakan dalam **enam PR paket per domain** (Fondasi & Akun → Pemanfaatan → Aset & Bahan → Perawatan & Opname → Pengadaan & Penghapusan → Pimpinan & Admin), satu commit per ID PR, berurutan tanpa PR bertumpuk; menggantikan urutan per PR pada keputusan 5 (pemilik produk) | Layar bersama (`MS-51`, `MS-53`, `MS-58`) dibangun sekali; lebih sedikit putaran merge. Ditolak: 3 paket per tahap role (layar bersama dikerjakan dua kali), tetap 20 PR | Tidak — rencana phase (§7 Paket pelaksanaan) |
| 7 | **`MS-26` Pemberitahuan Privasi ditunda ke `PR-08-12`** (pemilik produk) | Isi pemberitahuan (`DP-01`, `DP-AI-04`, `TBD-FS-A`) dan layar padanannya `P-07` milik `PR-08-12`; web pun belum mendaftarkan `P-07`. Ditolak: kerangka tanpa isi, menulis isi dari PRD saat implementasi | Tidak — rencana phase (`PR-07-18`, `PR-08-12`) |
| 8 | **Menu `MS-31` hanya merender layar yang terdaftar di build** — registri `shared/screens.ts`, pola `HALAMAN_TERDAFTAR` web (pemilik produk) | Entri tanpa layar mobile akan menjadi tautan mati; ditolak: membuka padanan web sementara (bercampur dengan entri ↗ web `MOB-SCP-02`) | Ya — **UXD-23** |
| 9 | **Chatbot dikeluarkan dari Aksi Cepat Beranda** (pemilik produk) | Sudah ada tab + C-38; fitur "tanpa grup" tidak punya accent kotak ikon C-31. Ditolak: varian kotak netral/teal (varian komponen baru) | Ya — **UXD-23** |
| 10 | **Aksi Cepat tanpa layar terdaftar disembunyikan** — "Ajukan reservasi" muncul saat `MS-46` ada (pemilik produk) | Konsisten dengan keputusan 8; ditolak: tile nonaktif (varian baru C-31) | Ya — **UXD-23** |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| Phase 07 hanya E2E, uji otorisasi, dan perbaikan cacat; `PR-07-14` menolak permintaan fitur | 21 PR paritas mobile `PR-07-15`…`35` ditambahkan **sebelum** E2E/UAT | Keputusan pemilik produk 25 Oktober 2026 (keputusan 1–5); UAT harus menguji mobile untuk seluruh role | E2E `PR-07-02`…`08` dan UAT menunggu tahap A–C; rencana total 230 → 251 PR |
| Satu PR GitHub per ID PR (keputusan 5) | Enam PR paket berukuran L, masing-masing memuat beberapa ID PR | Keputusan 6 | Tidak ada; jumlah ID PR tetap 251 |
| `PR-07-18` memuat `MS-26` Privasi | `MS-26` tidak dibuat; tautan Privasi di Login/Profil belum dirender | Keputusan 7 | `PR-08-12` memuat `MS-26` (baris phase-08 diperbarui) |
| `PR-07-17` menata ulang 25 layar | Seluruh layar memperoleh header C-30 + ikon info C-36, kartu/badge bertoken & berikon, dan batas dua kalimat (diuji). Daftar Tugas, Notifikasi, Persetujuan Saya, Tiket Kerusakan, Work Order Saya, Sesi Opname, Beranda ditata ulang dengan C-31…C-34/C-37. Isi layar detail & formulir lapangan (Detail Aset, Hasil Scan, Lapor Kerusakan, Eksekusi WO, Scan Opname) hanya menerima komponen bersama | Menjaga "perilaku layar lama tidak berubah" dan batas ukuran paket; susunan isi detail lebih tepat ditata saat paket domainnya menyentuh layar itu | Paket 3 (`MS-09`), 4 (`MS-17`, `MS-19`, `MS-15`) menata isi detailnya dengan C-32/C-34 |
| Rute mobile lama | `/notifikasi` keluar dari tab ke tumpukan akar; `/profil` dan `/chat` pindah ke grup tab Menu/Chatbot dengan **path yang sama** | **UXD-20**/**21** | Tidak ada — deep link (`SDD-MOB-12`) tetap berlaku |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-07.md` §7](../phases/phase-07.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| `PR-07-15`…`PR-07-35` | Paritas mobile seluruh role + mobile visual-first | Rencana awal mengikuti `UX-01`/UX §6.3: mobile hanya alur lapangan. Permintaan baru pemilik produk setelah uji lokal mobile; tidak ada phase yang memiliki pekerjaan ini |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] **Angka baseline pra-implementasi `IMP-04`** — durasi opname manual, rata-rata waktu persetujuan disposisi kertas, tingkat pengembalian tepat waktu versi manual. Tanpa angka ini `SC-03`, `SC-06`, `SC-07`, `SC-08` tidak dapat dibuktikan selamanya
- [ ] Klasifikasi setiap temuan UAT: **cacat** (diperbaiki di phase ini) atau **permintaan fitur** (menjadi CR)
- [ ] Bukti penutupan `GL-01`, `GL-02`, `GL-05`, `GL-09`

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| Paket 1 hanya diverifikasi lewat typecheck, lint, uji unit, dan bundel `expo export`; tampilan di perangkat/emulator tidak diperiksa di sesi implementasi | Tata letak (tinggi bottom sheet, posisi C-38 di atas tab, header menyusut) belum terlihat di layar nyata | Uji manual di dev build Android/iOS sebelum merge paket 1 | Ya |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| Baris produksi `apps/mobile/src` per commit paket 1 | `PR-07-16` L · `PR-07-17` L · `PR-07-18` M (≤ 400) | `PR-07-16` +522/−52 · `PR-07-17` +301/−96 · `PR-07-18` +286/−32 | §7 phase-07 |
| Uji mobile (`npm test -w apps/mobile`) | Hijau | 18 berkas, 139 uji lulus (sebelumnya 13 berkas, 108 uji) | `CD-01` |
| Uji mutasi serial pada aturan inti paket 1 | Seluruh mutan mati | 9/9 mati (registri Menu, ikon di atas kuning, C-38 di pemindai, badge 99+, Aksi Cepat terdaftar, push bergantung in-app, kelompok terkunci, cabut sesi sendiri, batas dua kalimat); sumber pulih byte-per-byte | CLAUDE.md "uji yang gagal bila logikanya dicabut" |
| Bundel Android `expo export` | Berhasil | Berhasil, 4,85 MB (Hermes bytecode) | `SDD-MOB-10` |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-07.md` §9 dan §12](../phases/phase-07.md).

- [ ] Seluruh 14 PR tergabung
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| `MS-26` Pemberitahuan Privasi mobile + tautannya di Login/Profil | `PR-08-12` | Keputusan 7 — isi `DP-01` milik `PR-08-12` |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
