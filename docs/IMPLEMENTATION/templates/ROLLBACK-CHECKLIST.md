# Daftar Periksa Rollback

Mekanisme rollback ditetapkan `CD-05` ([PRD](../../PRD/03-architecture/deployment-ops.md)) dan [`SDD-16` §4.4](../../SDD/16-infrastructure-deployment.md). Target: **rollback aplikasi ≤ 15 menit**; **RTO pemulihan data ≤ 4 jam** (`BR-DR-05`).

Daftar ini dibaca saat sedang terjadi masalah. Karena itu ia dimulai dengan satu pertanyaan, bukan dengan penjelasan.

---

## Langkah 0 — Tentukan jenisnya

```
Apakah skema basis data sudah melewati tahap CONTRACT
untuk perubahan yang bermasalah?

  TIDAK  →  Bagian A: Rollback aplikasi        ≤ 15 menit
   YA    →  Bagian B: Pemulihan data           RTO ≤ 4 jam

Apakah data rusak atau hilang (bukan sekadar aplikasi gagal)?

   YA    →  Bagian B, apa pun jawaban di atas
```

Menurut [`../DELIVERY-PLAN.md` §6](../DELIVERY-PLAN.md), seluruh contract proyek ini disatukan pada `PR-08-11` di Phase 08. **Selama Phase 00–07, jawabannya selalu "TIDAK".** Bagian A berlaku, dan biaya kegagalan tetap 15 menit.

---

## A. Rollback aplikasi

Berlaku bila skema masih dalam tahap `expand` atau `migrate` — kedua bentuk data hidup berdampingan, kode versi lama masih dapat membacanya (`CD-04`).

### A.1 Segera

- [ ] Nyatakan insiden; tentukan siapa yang memimpin — satu orang, bukan rapat
- [ ] Catat waktu mulai
- [ ] Aktifkan mode pemeliharaan bila pengguna terdampak

### A.2 Kembalikan

- [ ] Deploy image versi sebelumnya (5 rilis terakhir dipertahankan, `CD-05`)
- [ ] **Jangan** menjalankan migration `down` — tahap expand/migrate tidak memerlukannya, dan menjalankannya justru merusak
- [ ] Tunggu gerbang readiness lolos (`SDD-INF-04`)
- [ ] Drain + kembalikan worker ke versi sebelumnya (`SDD-INF-05`)

### A.3 Verifikasi

- [ ] `/health/ready` melaporkan seluruh dependensi (`NFR-A-07`)
- [ ] Smoke test lolos: login · cari aset · ajukan reservasi · scan QR · buat tiket kerusakan (`CD-07`)
- [ ] Nonaktifkan mode pemeliharaan
- [ ] Catat waktu selesai — bandingkan dengan target 15 menit

### A.4 Setelahnya

- [ ] Umumkan pemulihan
- [ ] Catat di log phase bagian 7 ([`../logs/`](../logs/))
- [ ] Post-mortem tertulis dalam 5 hari kerja
- [ ] Bila penyebabnya lolos dari pipeline — tambahkan uji yang akan menangkapnya (`CD-01`)

**Butir terakhir menentukan apakah insiden ini berguna.** Rollback yang tidak menghasilkan uji baru berarti kegagalan yang sama masih dapat lolos besok.

---

## B. Pemulihan data

Berlaku bila `contract` sudah dijalankan, atau bila data rusak/hilang. Mengikuti DR runbook [`SDD-16` §4.6](../../SDD/16-infrastructure-deployment.md), yang wajib ada dan terverifikasi sebelum go-live (`GL-06`, `BR-DR-05`).

- [ ] 0 · Deklarasi insiden oleh pihak berwenang — Kepala Sekolah atau Administrator
- [ ] 1 · Tetapkan titik pemulihan (*timestamp* PITR) — sebelum kerusakan, sedekat mungkin dengannya
- [ ] 2 · Sediakan instance PostgreSQL baru
- [ ] 3 · Pulihkan base backup + putar WAL sampai titik pemulihan (`BR-DR-01`)
- [ ] 4 · Verifikasi: jumlah baris kunci · sidik jari rantai hash activity log · transaksi terakhir
- [ ] 5 · Arahkan aplikasi ke instance baru lewat variabel lingkungan
- [ ] 6 · Pulihkan object storage bila terdampak (`BR-DR-02`)
- [ ] 7 · Jalankan smoke test alur kritis (`CD-07`)
- [ ] 8 · Umumkan pemulihan; **catat kehilangan data aktual dibandingkan RPO**
- [ ] 9 · Post-mortem tertulis dalam 5 hari kerja

**Langkah 4 tidak boleh dilewati.** Basis data yang berhasil dipulihkan tetapi tidak diverifikasi hanyalah asumsi bahwa data benar. Verifikasi rantai hash activity log adalah satu-satunya cara mengetahui apakah riwayat utuh.

**Langkah 8 mencatat angka, bukan kalimat.** "Kehilangan data minimal" tidak dapat dievaluasi terhadap RPO.

---

## C. Rollback tingkat phase (selama pengembangan)

Berlaku pada staging, bukan produksi. Rincian per phase ada di bagian 11 tiap berkas phase.

- [ ] Kenali cakupannya: satu PR, beberapa PR, atau seluruh phase
- [ ] Periksa apakah PR yang di-revert punya PR hilir yang bergantung padanya (kolom **Bergantung** pada tabel PR phase)
- [ ] `git revert` PR terkait — revert, bukan `reset`, agar riwayat tetap terbaca
- [ ] Bila menyertakan migration `expand`: kolom baru boleh tetap ada; ia nullable dan tidak dibaca siapa pun
- [ ] Bila menyertakan migration yang harus dibatalkan: jalankan `down` yang **sudah teruji** (`CD-05`)
- [ ] Jalankan ulang pipeline pada `develop`
- [ ] Deploy ulang staging; smoke test lolos
- [ ] Catat di log phase bagian 3 "Penyimpangan dari rencana"

### Catatan per phase

| Phase | Yang perlu diperhatikan |
|:---:|---|
| 00 | Reset repo penuh masih sah — belum ada data |
| 01 | Kolom `unit_kerja` lama masih ada; kode versi lama tetap dapat membacanya |
| 02 | **Paling berisiko.** Perubahan skema `booking_slots` menjalar ke Phase 03–05; revert setelah ada slot hidup di staging memerlukan pemeriksaan data |
| 03–05 | Data operasional sudah ada di staging; periksa dampak revert terhadapnya |
| 06 | Terendah — seluruh isinya baca-saja; `DROP INDEX` aman |
| 07 | Perbaikan cacat; revert biasanya lokal |
| 08 | `PR-08-10` dan `PR-08-11` menyentuh produksi dan skema permanen → Bagian B |

---

## Yang tidak boleh dilakukan saat rollback

| Jangan | Sebab |
|---|---|
| Memperbaiki di tempat tanpa pengujian | Cara insiden kecil menjadi insiden besar |
| Menjalankan migration `down` pada tahap expand/migrate | Tidak diperlukan, dan justru merusak data yang sudah dimigrasi |
| Melakukan rollback sendirian di produksi | Verifikasi memerlukan orang kedua |
| Menutup insiden tanpa post-mortem | Kegagalan yang sama akan terulang |
| Mengubah dua hal sekaligus untuk mempercepat | Bila hasilnya salah, tidak ada yang tahu mana penyebabnya |

---

*Daftar ini menegakkan `CD-05`, `BR-DR-01` … `BR-DR-06`, dan [`SDD-16` §4.4–4.6](../../SDD/16-infrastructure-deployment.md). Ia tidak menetapkan aturan pemulihan baru.*
