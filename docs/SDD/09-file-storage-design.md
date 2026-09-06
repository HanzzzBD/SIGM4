# SDD-09 — Desain Penyimpanan Berkas

**Area:** `FS` · **Status:** Draft · **Basis:** [`m06-documents.md`](../PRD/02-modules/m06-documents.md), [`security.md`](../PRD/03-architecture/security.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Dokumen aset | `FR-06.1` |
| Foto kondisi & kerusakan | `FR-09.1`, `FR-09.2`, `FR-11.1`, `FR-12.3`, `FR-13.2` |
| Keamanan berkas | `NFR-S-08`, `NFR-S-18`, `DP-05`, `DP-06` |
| Alur unggah | Bab 17.5 poin 6 |
| Penyimpanan | `INF-02`, `NFR-SC-04` |
| Media mobile | `MOB-MED-01` … `MOB-MED-04`, `MOB-OFF-02` … `MOB-OFF-04` |
| Retensi | Bab 11.4 |

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-FS-01** | Unggah memakai **presigned PUT** langsung ke object storage. Byte berkas tidak pernah melewati proses API. |
| **SDD-FS-02** | Setiap berkas terdaftar di tabel `stored_files` dengan `scan_status`. Entitas bisnis (dokumen aset, foto kerusakan) merujuk `stored_files.id`, bukan menyimpan path sendiri. |
| **SDD-FS-03** | Berkas berstatus `pending` atau `infected` **tidak dapat diunduh** — ditegakkan di service pembuat URL unduhan, bukan di UI (`NFR-S-18`). |
| **SDD-FS-04** | Pemindaian anti-malware memakai **ClamAV sebagai proses terpisah**, dipanggil worker lewat antrean setelah event `FileUploaded`. |
| **SDD-FS-05** | Unduhan memakai **presigned GET berumur 15 menit** (`FR-06.1`), diterbitkan per permintaan setelah pemeriksaan permission. |
| **SDD-FS-06** | Kunci objek bersifat **buram**: `{jenis}/{yyyy}/{mm}/{uuid}.{ext}`. Tidak memuat nama asli berkas, ID entitas, maupun identitas pengguna. |
| **SDD-FS-07** | Turunan gambar (thumbnail) dibuat asinkron untuk **daftar dan katalog**; berkas asli tetap disimpan utuh. |
| **SDD-FS-08** | Bucket bersifat **privat sepenuhnya**. Tidak ada objek yang dapat diakses tanpa tanda tangan, termasuk foto pada halaman publik QR — karena halaman itu memang tidak menampilkan foto (`DP-05`). |
| **SDD-FS-09** | Berkas yatim (terunggah tetapi tidak pernah ditautkan ke entitas) dibersihkan job harian setelah **24 jam**. |
| **SDD-FS-11** | Foto berwajah **tidak ikut dipseudonimkan maupun dihapus** saat `DP-04` dilayani (`DP-05a`). Tidak ada pipeline pengaburan wajah di sistem ini. Perlindungan foto tetap bersandar sepenuhnya pada `DP-05`: permission eksplisit, URL bertanda tangan berbatas waktu, dan larangan mutlak muncul di halaman publik QR (`SDD-FS-08`). Menutup `TBD-FS-A` (keputusan pemilik produk, 25 Agustus 2026; `UXD-14`). |
| **SDD-FS-12** | PDF yang dihasilkan sistem (§4.5 — berita acara `FR-13.3`/`FR-21.2`, label QR `NFR-P-07`) dirender **worker** dari HTML+CSS cetak memakai **Playwright (Chromium)**, mesin yang sama dengan E2E Web (`SDD-REPO-11`). Kepatuhan `NFR-C-07` (PDF 1.7, A4) diverifikasi uji, bukan diasumsikan. Chromium ikut ke dalam image bersama (`SDD-INF-01`) — konsekuensinya dicatat [SDD-16 §5](16-infrastructure-deployment.md). |

---

## 3. Alasan

**SDD-FS-01 — presigned, bukan melalui API.** Tiga alasan: (1) `NFR-SC-04` mewajibkan berkas terpisah dari server aplikasi; (2) unggah 5 foto per tiket kerusakan (`FR-11.1`) akan menahan koneksi dan memori proses API; (3) mobile mengunggah dari jaringan sekolah yang lambat (`MOB-MED-03`) — koneksi panjang ke API akan bertabrakan dengan batas waktu permintaan.

**SDD-FS-02 — registri terpusat.** Tanpa `stored_files`, status pemindaian harus diduplikasi di setiap tabel yang menyimpan berkas (dokumen aset, foto kerusakan, foto opname, foto work order, foto serah terima). Satu registri berarti aturan `NFR-S-18` ditegakkan sekali.

**SDD-FS-03 — ditegakkan di service.** Ini titik yang mudah bocor: UI menyembunyikan tombol unduh, tetapi endpoint tetap menerbitkan URL. Karena URL bertanda tangan berlaku 15 menit dan melewati object storage langsung, pemeriksaan **harus** terjadi sebelum penerbitan — setelah itu tidak ada lagi kesempatan.

**SDD-FS-06 — kunci buram.** Nama berkas asli sering memuat informasi (`Faktur-Proyektor-Lab2-2026.pdf`) dan nama orang. Karena bucket privat, kebocoran nama objek seharusnya tidak terjadi — tetapi kunci buram menghilangkan seluruh kelas risiko itu, termasuk dari log akses object storage.

**SDD-FS-07 — thumbnail asinkron.** Katalog aset dan daftar tiket kerusakan menampilkan banyak gambar sekaligus. Menyalurkan foto 1600 px (`MOB-MED-01`) untuk setiap kartu akan melanggar anggaran `NFR-P-03` (LCP ≤ 2,5 detik pada 4G).

**SDD-FS-12 — satu mesin render, dipakai dua kali.** Dua keluaran PDF sistem ini menuntut hal yang berlawanan: 200 label QR (`NFR-P-07`, ≤ 30 detik) adalah tata letak berulang yang sederhana, sedangkan berita acara (`FR-13.3`, `FR-21.2`) adalah dokumen berformat yang isinya akan berubah seiring PRD. **pdfkit** unggul pada yang pertama — nol biner tambahan, memori kecil dan terduga pada worker satu instance (`JOB-02`) — dan mahal pada yang kedua, karena setiap perubahan tata letak menjadi penyesuaian koordinat.

Playwright dipilih karena `SDD-REPO-11` sudah memasukkannya ke dalam repositori untuk E2E Web: mesin rendernya sudah ada, dan tim sudah harus mengenalnya. Tata letak menjadi HTML+CSS cetak — grid label dan dokumen berformat sama-sama menjadi pekerjaan CSS biasa, dan pratinjaunya dapat dibuka di peramban saat ditulis. **@react-pdf/renderer** ditolak di tengah: ia menghindari Chromium tetapi hanya mendukung subset CSS, sehingga `NFR-C-07` dan tata letak cetak justru menjadi verifikasi tambahan tanpa menghilangkan pekerjaan tata letaknya.

Harganya tidak disembunyikan dan tidak kecil: Chromium ikut ke image yang dibagi API dan worker (`SDD-INF-01`), memperbesar image dan permukaan pindai `CD-01`. Ia diterima sebagai konsekuensi tercatat di [SDD-16 §5](16-infrastructure-deployment.md), dengan satu batas: bila ukuran image menjadi persoalan nyata, jalannya adalah **memisahkan image** — perubahan pada `SDD-INF-01` yang dinyatakan — bukan mengganti pembangkit PDF diam-diam. `NFR-P-07` diukur pada uji beban, bukan diasumsikan dari pilihan ini.

**SDD-FS-11 — foto mengikuti penalaran `DP-04`, bukan mengecualikannya.** `DP-04` sudah menghadapi pertanyaan yang sama untuk data teks dan menjawabnya: permintaan penghapusan dilayani lewat **pseudonimisasi**, bukan penghapusan, justru agar catatan transaksi bertahan bagi audit sekolah (`BR-008`, `AL-03`). Memperlakukan foto secara berbeda akan membalik penalaran itu pada satu jenis data saja, tanpa alasan yang membedakannya.

Yang membuat foto terasa berbeda adalah bahwa wajah tidak dapat dipseudonimkan — ia hanya dapat dikaburkan atau dihapus, dan keduanya merusak. Foto serah terima diwajibkan `BR-027` **karena** ia bukti; menghapusnya berarti menghilangkan satu-satunya rekaman visual pada peminjaman yang berujung denda atau ganti rugi, tepat pada kasus yang paling membutuhkannya.

Mengaburkan wajah ditolak dengan alasan yang berbeda dan sama beratnya. Ia menuntut pustaka deteksi wajah — komponen baru yang harus dipelihara sekolah, pada host yang [SDD-16 §4.2](16-infrastructure-deployment.md) sudah catat padat — dan operasinya tidak dapat dibalik. Deteksi yang meleset menghasilkan dua kegagalan yang sama-sama senyap: wajah yang lolos, atau bukti yang rusak. Tidak satu pun menghasilkan galat.

Yang **wajib** menyertai keputusan ini adalah keterbukaan. `DP-05a` mengharuskan hal ini dinyatakan pada Pemberitahuan Privasi, sehingga subjek data mengetahui batas hak penghapusannya **sebelum** memberikan data — bukan menemukannya saat permintaan penghapusan dilayani sebagian. Sebuah pengecualian yang tidak diumumkan bukanlah kebijakan, melainkan kelalaian yang kebetulan terdokumentasi.

---

## 4. Rancangan

### 4.1 Skema

```sql
CREATE TYPE file_scan_status AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

CREATE TABLE stored_files (
    id           bigserial PRIMARY KEY,
    object_key   text        NOT NULL UNIQUE,   -- SDD-FS-06
    mime         text        NOT NULL,
    ukuran       bigint      NOT NULL,
    checksum     text,                          -- SHA-256, diisi saat confirm
    scan_status  file_scan_status NOT NULL DEFAULT 'PENDING',
    scanned_at   timestamptz,
    owner_type   text,                          -- 'asset_document' | 'damage_photo' | …
    owner_id     bigint,                        -- NULL = yatim (SDD-FS-09)
    uploaded_by  bigint NOT NULL REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stored_files_orphan
    ON stored_files (created_at) WHERE owner_id IS NULL;
CREATE INDEX stored_files_pending_scan
    ON stored_files (created_at) WHERE scan_status = 'PENDING';
```

### 4.2 Alur unggah

```
1. POST /files/presign  { jenis, mime, ukuran }
     validasi MIME + ukuran terhadap kebijakan jenis (§4.3)
     -> { upload_url, object_key, file_id, expires_in: 300 }

2. Klien PUT langsung ke object storage           (byte tidak lewat API)

3. POST /files/confirm  { file_id, checksum }
     verifikasi objek benar-benar ada & ukurannya cocok
     stored_files.scan_status = PENDING
     terbitkan event FileUploaded                  -> SDD-07

4. Worker: ClamAV memindai
     bersih    -> CLEAN
     terinfeksi-> INFECTED + hapus objek + alarm keamanan
     gagal     -> FAILED, coba ulang maksimum 3x

5. Klien menautkan berkas ke entitas
     POST /assets/{id}/documents { file_id, jenis, keterangan, garansi_* }
     -> stored_files.owner_type/owner_id terisi (tidak lagi yatim)
```

Langkah 3 dan 5 sengaja terpisah: berkas dapat diunggah lebih dulu (mis. antrean unggah mobile, `MOB-OFF-02`) lalu ditautkan ketika transaksi bisnisnya siap.

### 4.3 Kebijakan per jenis berkas

| Jenis | MIME diizinkan | Maks | Sumber |
|---|---|---|---|
| Dokumen aset | PDF, JPG, PNG, DOCX, XLSX | 10 MB | `FR-06.1` |
| Foto kondisi serah terima / pengembalian | JPG, PNG | 2 MB | `MOB-MED-01` (hasil kompresi) |
| Foto kerusakan (1–5 berkas) | JPG, PNG | 2 MB/berkas | `FR-11.1`, `MOB-MED-01` |
| Foto hasil work order | JPG, PNG | 2 MB | `FR-12.3` |
| Foto opname | JPG, PNG | 2 MB | `FR-13.2` |
| Foto profil | JPG, PNG | 2 MB | `FR-01.4` |
| Berita acara PDF (dihasilkan sistem) | PDF | — | `FR-13.3`, `FR-21.2` |

Validasi MIME dilakukan **dua kali**: saat presign (berdasarkan deklarasi klien) dan saat pemindaian (berdasarkan *magic bytes* isi berkas). Ketidakcocokan menandai berkas `INFECTED`.

### 4.4 Unduhan

```
GET /assets/{id}/documents/{docId}/download
   1. permission asset_document.view + scope         PM-03
   2. stored_files.scan_status = CLEAN?  bila tidak -> 409 FILE_NOT_SCANNED
   3. terbitkan presigned GET, 15 menit               FR-06.1
   4. catat DOCUMENT_DOWNLOADED                       AL-* (FR-06.1 AC)
   -> 200 { url, expires_at }
```

Respons berupa URL, bukan redirect, agar klien dapat menampilkan pratinjau tanpa navigasi dan agar pencatatan unduhan tetap akurat.

### 4.5 Turunan gambar

| Turunan | Ukuran | Dipakai |
|---|---|---|
| `thumb` | 200 px sisi terpanjang | Katalog aset, daftar tiket, daftar opname |
| `medium` | 800 px | Pratinjau detail |
| asli | ≤1600 px (dari `MOB-MED-01`) | Unduhan, bukti |

Dibuat worker saat `FileUploaded` untuk MIME gambar. Kegagalan pembuatan turunan tidak menggagalkan apa pun; klien jatuh kembali ke berkas asli.

### 4.6 Retensi & penghapusan

| Kondisi | Tindakan |
|---|---|
| Berkas yatim > 24 jam | Objek dan baris dihapus (`SDD-FS-09`) |
| Entitas induk dihapuskan | Berkas **tetap** disimpan — Bab 11.4 mengikat masa hidup berkas pada entitas induk yang sendiri tidak pernah dihapus permanen (`BR-008`) |
| Dokumen dihapus pengguna | `stored_files` ditandai, objek dipertahankan, penghapusan tercatat (`FR-06.1 A2`) |
| Berkas `INFECTED` | Objek dihapus segera; baris dipertahankan sebagai jejak |
| Pseudonimisasi subjek data (`DP-04`) | Foto **tidak disentuh** — tidak dikaburkan, tidak dihapus (`DP-05a`, `SDD-FS-11`). Yang dipseudonimkan adalah kolom identitas pada `users`; foto tetap menjadi bukti, dilindungi `DP-05` |

---

## 5. Konsekuensi

- Object storage wajib mendukung presigned URL dan CORS untuk `PUT` dari domain aplikasi. Ini menjadi syarat pemilihan penyedia (`INF-02`).
- ClamAV menambah satu komponen yang harus dijalankan dan diperbarui basis datanya. Ditambahkan ke topologi (`SDD-SYS` §4.5 dan [SDD-16](16-infrastructure-deployment.md)).
- Jeda antara unggah dan `CLEAN` berarti UI harus menampilkan keadaan "sedang diperiksa" — bukan menganggap berkas langsung siap. Menjadi persyaratan [SDD-11](11-frontend-architecture.md) dan [SDD-12](12-mobile-architecture.md).
- Karena berkas tidak pernah dihapus mengikuti entitas, pertumbuhan penyimpanan bersifat monoton. Sizing awal 250 GB (`SDD-SYS`/PRD 27.3) perlu dipantau.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| ClamAV mati → berkas menumpuk `PENDING` | Pengguna tidak bisa mengunduh apa pun yang baru | Alarm pada kedalaman antrean pindai (`OBS-05`); status ditampilkan jelas di UI |
| Presigned URL bocor | Akses tanpa permission selama masa berlaku | Masa berlaku 15 menit; kunci buram; unduhan tercatat sehingga terdeteksi |
| Klien mengunggah tanpa pernah `confirm` | Objek yatim di storage | Job pembersih 24 jam (`SDD-FS-09`) |
| MIME dipalsukan | Berkas berbahaya lolos validasi awal | Verifikasi *magic bytes* saat pemindaian (§4.3) |
| CORS salah konfigurasi | Unggah gagal di produksi saja | Uji asap pasca-deploy menyertakan satu unggah nyata (`CD-07`) |
| Foto memuat wajah tersebar lewat URL | Pelanggaran `DP-05` | Bucket privat penuh; tidak ada foto di halaman publik QR |

---

## 7. Requirement Terkait

`FR-01.4` `FR-06.1` `FR-09.1` `FR-09.2` `FR-11.1` `FR-12.3` `FR-13.2` `FR-13.3` `FR-21.2` ·
`NFR-S-08` `NFR-S-18` `NFR-SC-04` `NFR-P-03` · `DP-03` `DP-05` `DP-06` · `INF-02` ·
`MOB-MED-01` … `MOB-MED-04` `MOB-OFF-02` `MOB-OFF-03` `MOB-OFF-04` · Bab 11.4 · Bab 17.5 poin 6 · `CD-07`

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-FS-B** | Apakah berkas perlu disalin ke penyimpanan dingin setelah entitasnya tidak aktif bertahun-tahun, atau cukup satu kelas penyimpanan. Berkaitan dengan estimasi biaya (PRD 27.9). |

**Tertutup 25 Agustus 2026:** `TBD-FS-A` → `SDD-FS-11` · `DP-05a`.
