# SDD-14 — Desain Performa

**Area:** `PERF` · **Status:** Draft · **Basis:** [`nfr.md`](../PRD/03-architecture/nfr.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Target performa | `NFR-P-01` … `NFR-P-12` |
| Skalabilitas | `NFR-SC-01` … `NFR-SC-06` |
| Keandalan | `NFR-R-09` |
| Ketersediaan | `NFR-A-01`, `NFR-A-02` |
| Ketersediaan aset | `AV-01` … `AV-05` |
| Uji beban | `CC-01` … `CC-07`, Bab 30 |
| Risiko | `RS-14` |

Skala terkonfirmasi: **±5.000 aset · 1.000 pengguna · 150 concurrent**, dengan target tetap terpenuhi hingga 15.000 aset dan 3.000 pengguna tanpa perubahan arsitektur (`NFR-SC-02`).

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-PERF-01** | Anggaran latensi ditetapkan **per kelas endpoint**, bukan satu angka global — dan dijadikan alarm, bukan sekadar target dokumen. |
| **SDD-PERF-02** | Pencegahan N+1 ditegakkan oleh **uji**, bukan disiplin: uji integrasi menghitung jumlah kueri per endpoint dan gagal bila melewati ambang. |
| **SDD-PERF-03** | Cache dibagi **tiga lapis dengan TTL berbeda**, dan hasil ketersediaan **tidak masuk lapis mana pun yang panjang** (`AV-04`). |
| **SDD-PERF-04** | Kueri daftar **selalu** dibatasi paginasi di lapisan repository; tidak ada metode repository yang mengembalikan koleksi tak terbatas. |
| **SDD-PERF-05** | Uji beban memakai **k6** dengan skenario yang mencerminkan pola nyata sekolah (lonjakan jam istirahat), bukan trafik merata. |
| **SDD-PERF-06** | Pekerjaan > 5 detik **wajib** asinkron (`NFR-P-08`, `NFR-SC-05`); tidak ada endpoint sinkron yang boleh melampauinya. |
| **SDD-PERF-07** | Indeks basis data ditinjau dari **`EXPLAIN ANALYZE` pada data uji berukuran nyata**, bukan diperkirakan dari bentuk kueri. |

---

## 3. Alasan

**SDD-PERF-01 — anggaran per kelas.** `NFR-P-01` menetapkan p95 ≤ 500 ms untuk API baca, tetapi "API baca" mencakup pencarian aset di 5.000 record dan pengambilan satu notifikasi. Menyamakan keduanya berarti target ketat pada yang murah dan longgar pada yang mahal. Anggaran per kelas membuat regresi terlihat di endpoint yang tepat.

**SDD-PERF-02 — N+1 diuji, bukan diingat.** Ini penyebab tunggal terbesar degradasi pada aplikasi berbasis ORM, dan ia tidak muncul di lingkungan pengembangan dengan 10 baris data. Menghitung kueri per endpoint dalam uji integrasi mengubahnya dari masalah produksi menjadi kegagalan CI.

**SDD-PERF-03 — ketersediaan tidak boleh di-cache lama.** Ini titik paling berbahaya untuk caching di sistem ini: menampilkan slot "tersedia" yang sebenarnya sudah terisi menghasilkan pengajuan yang ditolak dan pengguna yang kehilangan kepercayaan. `AV-04` membatasinya 30 detik; rancangan ini memilih **tanpa cache** untuk ketersediaan dan mengandalkan indeks GiST — cache dashboard yang bersifat agregat boleh 5 menit.

**SDD-PERF-05 — pola beban nyata.** Trafik sekolah tidak merata: reservasi menumpuk sebelum jam pelajaran, opname terjadi dalam blok beberapa jam, dan approval datang bergelombang setelah notifikasi. Uji beban merata akan lulus sementara produksi tersendat pada pukul 07.00.

**SDD-PERF-07 — indeks dari `EXPLAIN`, bukan tebakan.** Indeks yang "terlihat benar" kerap tidak dipakai perencana kueri — terutama pada kueri interval GiST dan kondisi berpredikat. Satu-satunya bukti adalah rencana eksekusi pada volume nyata.

---

## 4. Rancangan

### 4.1 Anggaran latensi per kelas

| Kelas | Contoh | p95 | Sumber |
|---|---|---|---|
| Baca ringan | `GET /notifications`, `GET /me` | 200 ms | `NFR-P-01` |
| Baca standar | detail aset, daftar peminjaman | 500 ms | `NFR-P-01` |
| Pencarian & katalog | `GET /assets` dengan filter | 2 detik | `NFR-P-05` |
| Ketersediaan | `/rooms/availability`, `/assets/availability` | 2 detik | `AV-03` |
| Kalender | 30 ruangan × 1 bulan | 2 detik | `FR-07.1` |
| Tulis standar | reservasi, approval, check-in | 800 ms | `NFR-P-02` |
| Tulis berat | impor 500 baris | 60 detik (asinkron) | `NFR-P-11` |
| Dashboard | seluruh kartu | 3 detik | `NFR-P-04` |
| Analitik | rentang 1 tahun | 5 detik, > 5 detik asinkron | `NFR-P-08` |
| Chatbot | jawaban lengkap | 8 detik; token pertama 2 detik | `FR-19.1`, `AI-CTL-07` |
| Notifikasi | event → tampil | 60 detik | `NFR-P-12` |

Setiap kelas menjadi label metrik; alarm menyala bila p95 melewati anggaran selama 10 menit (`OBS-05`).

### 4.2 Strategi indeks

Indeks kritis (didefinisikan pada SDD terkait, dirangkum di sini):

| Kueri | Indeks | Sumber |
|---|---|---|
| Ketersediaan slot | GiST `(resource_type, resource_id, slot_range)` berpredikat status aktif | `AV-01` |
| Kandidat aset | `assets(category_id, status, kondisi, dapat_dipinjam, boleh_dipinjam_siswa)` | `AV-02` |
| Pencarian aset | `assets(kode_barang)`, `assets(nomor_seri)` parsial, indeks teks pada `nama`+`merek` | `NFR-P-05` |
| Aset per lokasi | `assets(room_id)` berpredikat aktif | `FR-03.2` |
| Peminjaman aktif | `loans(status, tanggal_jatuh_tempo)` berpredikat belum kembali | `FR-09.3` |
| Approval menunggu | `approval_steps(instance_id, urutan)` berpredikat belum diputus | SDD-02 §4.6 |
| Saldo bahan per lokasi | `material_balances(material_id, room_id)` unik — pembacaan dan `FOR UPDATE` lewat indeks yang sama | `SDD-DB-14` |
| Kartu stok bahan | `material_transactions(material_id, room_id, dibuat_pada DESC)` | `FR-22.2` |
| Bahan di bawah stok minimum | Agregat `SUM(saldo)` per `material_id`, dibandingkan `materials.stok_minimum` | `BR-085` |
| SLA approval | `approval_steps(sla_deadline)` berpredikat belum diputus | SDD-02 §4.6 |
| Activity log | `(waktu DESC)`, `(user_id, waktu DESC)`, `(entitas, entitas_id, waktu DESC)` | `FR-18.2` |
| Notifikasi belum dibaca | `notifications(user_id)` berpredikat `dibaca_pada IS NULL` | `FR-17.1` |

Seluruhnya diverifikasi dengan `EXPLAIN ANALYZE` pada dataset `TD-01` (5.000 aset, 12 bulan riwayat).

### 4.3 Lapisan cache

| Lapis | Isi | TTL | Invalidasi |
|---|---|---|---|
| Permission per pengguna | Kode + scope | 60 detik | `role_version` (`SDD-AUTH-04`) |
| Agregat dashboard | Kartu KPI | 5 menit | Waktu; tombol muat ulang manual |
| Parameter sistem | `system_settings` | 60 detik | Dibatalkan saat `SETTING_UPDATED` |
| **Ketersediaan** | — | **tidak di-cache** | Mengandalkan indeks GiST (`AV-04`) |
| Data referensi | Enum, kategori, lokasi | 10 menit | Dibatalkan saat perubahan master data |

### 4.4 Pencegahan N+1

```ts
// Uji integrasi: hitung kueri per endpoint
test('GET /assets tidak N+1', async () => {
  const { queryCount } = await withQueryCounter(() =>
    api.get('/assets?per_page=100')
  );
  expect(queryCount).toBeLessThanOrEqual(3);   // data + count + join kategori
});
```

Ambang ditetapkan per endpoint dan menjadi bagian dari Definition of Done ([delivery-plan §29.5](../PRD/01-product/delivery-plan.md)).

### 4.5 Skenario uji beban

| Skenario | Profil | Memverifikasi |
|---|---|---|
| `steady` | 150 VU selama 30 menit, campuran baca 80% / tulis 20% | `NFR-P-09`, `NFR-R-09` |
| `morning-peak` | Naik 0→150 VU dalam 2 menit, dominan reservasi & kalender | Pola nyata (`SDD-PERF-05`) |
| `checkout-rush` | 50 VU serah terima serentak | `NFR-P-02` pada alur terberat |
| `stocktake` | 5 VU memindai 1.000 unit berturut-turut | `MOB-PERF-02/03` |
| `contention` | 50 VU merebut slot yang sama | `CC-01`, `CC-02` |
| `analytics` | 10 VU laporan 1 tahun bersamaan | `NFR-P-08` |
| `growth` | `steady` pada 15.000 aset & 3.000 pengguna | `NFR-SC-02` |

Kriteria lulus: p95 tiap kelas dalam anggaran §4.1, degradasi ≤ 20% dibanding beban rendah (`NFR-P-09`), galat 5xx ≤ 0,1% (`NFR-R-09`).

### 4.6 Pekerjaan asinkron

| Pekerjaan | Pemicu | Umpan balik |
|---|---|---|
| Impor aset/pengguna > 200 baris | `IMPT-04` | Notifikasi saat selesai (`NT-42`) |
| Ekspor laporan besar | `FR-16.1 A2` | Idem |
| Cetak QR massal | `FR-05.1` | Idem |
| Berita acara PDF | `FR-13.3`, `FR-21.2` | Idem |
| Pemindaian AV | `FileUploaded` | Status pada UI |
| Turunan gambar | `FileUploaded` | Diam-diam; fallback ke asli |
| Regenerasi blokade jadwal | `FR-07.5` | ≤ 10 detik, asinkron |

### 4.7 Anggaran frontend

| Metrik | Target | Sumber |
|---|---|---|
| LCP (4G) | ≤ 2,5 detik | `NFR-P-03` |
| Dashboard termuat | ≤ 3 detik | `NFR-P-04` |
| Cold start mobile | ≤ 3 detik | `NFR-P-10` |
| Ukuran aplikasi mobile | ≤ 40 MB | `MOB-PERF-05` |
| Bundel awal web | Dipantau; regresi memblokir rilis | — |

---

## 5. Konsekuensi

- Ketiadaan cache untuk ketersediaan menempatkan seluruh beban pada indeks GiST. Bila `AV-03` tidak tercapai pada uji beban, keputusan ini yang pertama ditinjau — dan solusinya menaikkan TTL ke batas `AV-04` (30 detik), bukan melampauinya.
- Uji hitung kueri menambah *scaffolding* pada uji integrasi, dan ambangnya perlu disesuaikan saat kueri berubah sah.
- Skenario `growth` memerlukan dataset 3× lebih besar; pembuatannya menjadi bagian `TD-01`.
- Anggaran latensi menjadi alarm operasional, sehingga tim menerima notifikasi regresi tanpa menunggu keluhan pengguna.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Pertumbuhan `activity_logs` memperlambat kueri (`RS-14`) | Penelusuran log melambat | Partisi bulanan sejak awal (`SDD-DB-07`); indeks per partisi |
| Kalender tidak mencapai 2 detik | `FR-07.1` gagal | Diukur sejak M2 pada 30 ruangan; virtualisasi klien + indeks GiST |
| Uji beban dijalankan di lingkungan tidak representatif | Hasil menyesatkan | Staging menyerupai produksi (`NFR-M-09`); spesifikasi dicatat bersama hasil |
| Antrean asinkron menumpuk | Notifikasi & ekspor terlambat | Metrik kedalaman antrean + alarm (`OBS-05`) |
| Offset paginasi melambat di halaman jauh | Latensi daftar naik | Indeks penunjang; UI membatasi lompatan halaman |
| Cache dashboard 5 menit dianggap real-time | Pimpinan melihat angka basi | Waktu pembaruan ditampilkan pada kartu; tombol muat ulang tersedia (19.1) |

---

## 7. Requirement Terkait

`NFR-P-01` … `NFR-P-12` · `NFR-SC-01` … `NFR-SC-06` · `NFR-R-09` · `NFR-A-01` `NFR-A-02` ·
`AV-01` … `AV-05` · `CC-01` … `CC-07` · `TD-01` `TD-02` · `MOB-PERF-01` … `MOB-PERF-05` ·
`FR-03.2` `FR-05.1` `FR-07.1` `FR-08.1` `FR-09.3` `FR-13.3` `FR-16.1` `FR-18.2` `FR-19.1` `FR-21.2` · `RS-14` · `OBS-05`

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-AVL-C** *(dari SDD-01)* | Ukuran connection pool — bergantung batas koneksi PostgreSQL dari penyedia. Ditetapkan setelah uji beban. |
| **TBD-AVL-D** *(dari SDD-01)* | TTL cache ketersediaan. Rancangan ini memilih tanpa cache; bila `AV-03` tidak tercapai, nilai dalam batas `AV-04` perlu ditetapkan. |
| **TBD-PERF-A** | Ambang jumlah kueri per endpoint (`SDD-PERF-02`) belum ditetapkan per endpoint — akan dikalibrasi saat endpoint pertama dibangun. |
