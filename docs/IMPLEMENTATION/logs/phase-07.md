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
| 25 Oktober 2026 | Pemilik produk meminta seluruh fitur web tersedia di mobile untuk semua role dengan UI yang lebih visual. Lima putaran `AskUserQuestion` (keputusan 1–5). `PR-07-15` menurunkannya ke PRD (`MOB-SCP-01`…`04`), SDD (`SDD-MOB-13`), UX (**UXD-19**…**22**, 67 layar `MS-24`…`MS-90`) dan DESIGN (**DSD-11**/**12**, C-30…C-38), lalu merencanakan 20 PR implementasi `PR-07-16`…`35`. | `PR-07-15` |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 1 | **Cakupan:** semua fitur web di mobile untuk semua role, kecuali cetak label QR dan impor massal berkas (pemilik produk) | Pilihan "kecuali yang butuh perangkat khusus"; ditolak: paritas mutlak, bertahap lapangan saja | Ya — `MOB-SCP-01`/`02`, `UX-01`, **UXD-19** (mencabut **UXD-17**) |
| 2 | **Visual:** design system dikembangkan, bukan diganti — token & hierarki warna tetap, komponen C-30…C-38 ditambah (pemilik produk) | Ditolak: arah visual baru terpisah dari web | Ya — **DSD-11**/**12**, `MOB-SCP-04` |
| 3 | **Navigasi:** bottom tab Beranda · Tugas · Scan · Chatbot · Menu; Menu berisi pencarian modul + lima grup + fitur per permission; notifikasi ke lonceng header; chatbot juga dari layar lain (usulan pemilik produk) | Lima slot tidak menampung 67 layar | Ya — **UXD-20**…**22** |
| 4 | **Header ringkas satu baris** — kembali/ikon, judul, info, lonceng (pemilik produk) | Header lama dua baris teks + subjudul | Ya — **UXD-21**, C-30 |
| 5 | **Proses:** docs dulu (`PR-07-15`), lalu satu PR per modul; urutan pemohon → petugas/teknisi → pimpinan/admin (pemilik produk) | Aturan repo: keputusan lahir di docs sebelum kode | Tidak — rencana phase |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| Phase 07 hanya E2E, uji otorisasi, dan perbaikan cacat; `PR-07-14` menolak permintaan fitur | 21 PR paritas mobile `PR-07-15`…`35` ditambahkan **sebelum** E2E/UAT | Keputusan pemilik produk 25 Oktober 2026 (keputusan 1–5); UAT harus menguji mobile untuk seluruh role | E2E `PR-07-02`…`08` dan UAT menunggu tahap A–C; rencana total 230 → 251 PR |

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
| — | — | — | — |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| — | — | — | — |

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
| — | — | — |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
