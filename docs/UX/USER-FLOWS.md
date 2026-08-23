# User Flows — SIGM4 UX

> **Dokumentasi UX SIGM4** — [Overview](UX-SPEC.md) · [Information Architecture](INFORMATION-ARCHITECTURE.md) · [Navigation](NAVIGATION.md) · [Page Specification](PAGE-SPECIFICATION.md) · **User Flows** · [Decisions](DECISIONS.md)

**Berkas ini memuat:** [§9 User Flows](#9-user-flows) — 25 alur (`F-01`…`F-25`) beserta 23 diagram Mermaid. 15 di antaranya adalah alur kritis wajib diuji ujung-ke-ujung (Bab 30.2).

Penomoran bagian dipertahankan dari UX-SPEC v1.0 agar seluruh rujukan silang tetap sahih — peta lengkap ada di [Peta bagian → berkas](UX-SPEC.md#peta-bagian--berkas).

| Berkas tetangga | Kaitan |
|---|---|
| [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) | Setiap `P-xx` / `MS-xx` yang disebut alur di sini dispesifikasikan pada §6 dan §7; keadaan galat pada §7.3 |
| [`NAVIGATION.md`](NAVIGATION.md) | §5.6 memuat alur navigasi lintas-halaman yang menjadi kerangka seluruh alur di sini |
| [`DECISIONS.md`](DECISIONS.md) | Cabang Ganti Rugi pada F-15 mengikuti **UXD-08** |

---

# 9. User Flows

25 alur, seluruhnya berasal dari FR/BR yang ada. Kolom **Sumber** menyebut requirement yang menjadi dasarnya. Alur bertanda ⭐ termasuk 15 alur kritis wajib diuji ujung-ke-ujung (Bab 30.2).

| Kode | Alur | Sumber | Platform |
|---|---|---|---|
| F-01 ⭐ | Login & gerbang sesi | `FR-01.1`, `FR-01.5` | Web + Mobile |
| F-02 ⭐ | Reset password administratif | `FR-01.3` | Web |
| F-03 | Aktivasi & pemulihan 2FA | `FR-01.5`, `FR-01.6` | Web |
| F-04 ⭐ | Pendaftaran aset & pelabelan QR | `FR-04.1`, `FR-05.1` | Web + Mobile |
| F-05 | Impor massal | `FR-02.1 A4`, `FR-04.1 A2`, `E.5` | Web |
| F-06 | Perubahan kondisi & mutasi lokasi aset | `FR-04.3`, `FR-04.4` | Web + Mobile |
| F-07 | Keputusan persetujuan | `FR-10.2` | Web + Mobile |
| F-08 | SLA, eskalasi & delegasi | `FR-10.2 A2`, `A3`, `BR-039a` | Web + Mobile |
| F-09 ⭐ | Reservasi ruangan hingga selesai | `FR-07.1`…`FR-07.4` | Web + Mobile |
| F-10 ⭐ | Reservasi aset hingga disetujui | `FR-08.1`, `FR-08.2` | Web + Mobile |
| F-11 | Blokade jadwal tetap ruangan | `FR-07.5` | Web |
| F-12 ⭐ | Serah terima peminjaman | `FR-09.1` | Mobile + Web |
| F-13 ⭐ | Pengembalian, denda & kerusakan | `FR-09.2` | Mobile + Web |
| F-14 ⭐ | Perpanjangan peminjaman | `FR-09.5` | Mobile |
| F-15 ⭐ | Pengelolaan denda hingga blokir terbuka | `FR-09.4`, `BR-030` | Web |
| F-16 ⭐ | Kerusakan hingga work order tertutup | `FR-11.1`…`FR-12.4` | Mobile + Web |
| F-17 ⭐ | Pemeliharaan preventif otomatis | `FR-12.2` | Web |
| F-18 ⭐ | Stock opname hingga penyesuaian data | `FR-13.1`…`FR-13.3` | Mobile + Web |
| F-26 ⭐ | Permintaan bahan hingga diserahkan | `FR-22.4`, `FR-22.5` | Web |
| F-27 | Stock opname bahan hingga saldo tersesuaikan | `FR-13.4` | Mobile + Web |
| F-19 ⭐ | Pengadaan hingga aset terbentuk | `FR-14.1`…`FR-14.3` | Web |
| F-20 ⭐ | Penghapusan aset hingga berita acara | `FR-21.1`, `FR-21.2` | Web |
| F-21 | Laporan analitik & ekspor asinkron | `FR-16.1` | Web |
| F-22 ⭐ | Scan QR & aksi kontekstual | `FR-05.2` | Mobile + Web |
| F-23 | Notifikasi hingga deep link | `FR-17.1`, `FR-17.2` | Web + Mobile |
| F-24 ⭐ | Percakapan chatbot | `FR-19.1` | Web + Mobile |
| F-25 | Konfigurasi approval rule & pratinjau | `FR-10.1` | Web |

## 9.1 Autentikasi

### F-01 Login & gerbang sesi ⭐

```mermaid
flowchart TD
    A([Buka aplikasi]) --> B{Versi mobile didukung?}
    B -->|"Tidak - 426"| B1["MS-04 Pembaruan Wajib<br/>MOB-VER-03"]
    B -->|Ya| C{Sesi valid?}
    C -->|Ya| J
    C -->|Tidak| D["P-01 / MS-01 Login"]

    D --> E["Masukkan email & password"]
    E --> F{Validasi}
    F -->|"Salah - 401"| G["Pesan generik<br/>tidak membocorkan email terdaftar"] --> E
    F -->|"5x gagal - 423"| H["Akun terkunci<br/>tampilkan sisa waktu · FR-01.1 A2"] --> D
    F -->|"Nonaktif - 403"| I["Hubungi Administrator<br/>FR-01.1 A3"] --> D
    F -->|Benar| K{Role wajib 2FA?}

    K -->|"Ya, belum terdaftar"| L["P-03 Aktivasi 2FA<br/>QR secret + 10 kode cadangan"]
    K -->|"Ya, sudah aktif"| M["P-02 Verifikasi 2FA"]
    K -->|Tidak| N

    L --> L1{6 digit benar?}
    L1 -->|Tidak| L
    L1 -->|Ya| N

    M --> M1{Kode benar?}
    M1 -->|"Salah 5x"| H
    M1 -->|"Kode cadangan dipakai"| M2["Peringatan bila sisa kurang dari 3<br/>FR-01.5 AC"] --> N
    M1 -->|Ya| N

    N{must_change_password?}
    N -->|Ya| O["P-05 Ganti Password Wajib<br/>seluruh menu lain diblokir"]
    O --> O1{Password memenuhi kebijakan?}
    O1 -->|Tidak| O
    O1 -->|Ya| P["Sesi lain dicabut · NT-38a terbit"]
    P --> J
    N -->|Tidak| J

    J["P-12 / MS-05 Dashboard sesuai role"]
    J --> Q{Ada deep link tersimpan?}
    Q -->|Ya| R["Lanjutkan ke tujuan<br/>SDD-MOB §4.4"]
    Q -->|Tidak| S([Selesai])
    R --> S
```

**Ketentuan UX yang mengikat alur ini**

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| Urutan gerbang | Persis mengikuti middleware server sehingga klien tidak pernah menampilkan layar yang akan ditolak | `SDD-AUTH-09` · `SDD-MOB` §4.5 |
| Pesan galat | Tidak pernah membedakan "email tidak terdaftar" dari "password salah" | `FR-01.1 A1` |
| Sesi berakhir | Token kedaluwarsa di tengah sesi ditukar diam-diam; hanya bila penukaran gagal pengguna diarahkan ke Login | `FR-01.1 A5` · `SDD-FE-07` |
| Refresh paralel | Diserialisasi satu promise bersama; tanpa itu pengguna ter-logout tanpa sebab yang jelas | `SDD-FE-07` · `SDD-SESS-04` |
| Auto-logout web | Banner peringatan pada menit ke-28, logout pada menit ke-30 | `FR-01.2 A2` |

### F-02 Reset password administratif ⭐

```mermaid
flowchart TD
    A([Pengguna lupa password]) --> B["P-04 Lupa Password<br/>masukkan email"]
    B --> C["Pesan netral: Permintaan diterima<br/>FR-01.3 A1 - mencegah enumerasi"]
    C --> D{Email terdaftar?}
    D -->|Tidak| Z1([Tidak ada permintaan dibuat])
    D -->|Ya| E{"Kurang dari 3 permintaan aktif<br/>dalam 24 jam?"}
    E -->|Tidak| Z2(["Ditolak & dicatat<br/>anomali keamanan · FR-01.3 A4"])
    E -->|Ya| F["Permintaan berstatus Menunggu<br/>NT-37 ke Administrator"]

    F --> G["P-67 Permintaan Reset Password"]
    G --> H["Admin memverifikasi identitas<br/>tatap muka / atasan langsung"]
    H --> I["Pilih metode verifikasi - WAJIB<br/>FR-01.3 AC"]
    I --> J{Keputusan Admin}
    J -->|Tolak| K["Drawer alasan wajib<br/>pemohon diberi tahu luring · A2"] --> Z3([Selesai])
    J -->|Terbitkan| L["Password sementara tampil SATU KALI<br/>tidak pernah dikirim lewat kanal notifikasi"]
    L --> M["NT-38 ke Administrator penerbit"]
    M --> N["Admin menyerahkan langsung kepada pemohon"]
    N --> O{"Dipakai dalam 72 jam?"}
    O -->|Tidak| P(["Kedaluwarsa, permintaan ditutup<br/>FR-01.3 A3"])
    O -->|Ya| Q["F-01 Login -> P-05 Ganti Password Wajib"]
    Q --> R["NT-38a ke pengguna"] --> S([Akses pulih])
```

**Titik UX kritis:** password sementara ditampilkan **satu kali** dan tidak dapat dilihat ulang, termasuk oleh Administrator yang menerbitkannya. Antarmuka wajib menyatakan hal itu **sebelum** dialog ditutup, bukan sesudahnya — `FR-01.3 AC`.

### F-03 Aktivasi & pemulihan 2FA

| Skenario | Jalur UX | Rujukan |
|---|---|---|
| Aktivasi pertama | P-01 → P-03: QR secret + 10 kode cadangan, wajib dikonfirmasi dengan 6 digit sebelum dilanjutkan | `FR-01.5` |
| Kode cadangan menipis | Peringatan pada respons login **dan** spanduk pada P-77 saat tersisa 2 atau kurang, dengan tombol buat ulang | `FR-01.5 AC` |
| Perangkat authenticator hilang | Pengguna memakai kode cadangan; bila habis, mengajukan reset 2FA kepada Administrator (P-63 drawer) | `FR-01.5 A2`, `A3` |
| Reset 2FA oleh Admin | Pengguna wajib mendaftar ulang saat login berikutnya — diarahkan otomatis ke P-03 | `FR-01.5 A3` |
| Seluruh Administrator kehilangan akses | **Tidak ada jalur antarmuka.** Pemulihan hanya lewat CLI di server dengan otorisasi tertulis Kepala Sekolah | `FR-01.6` · `BR-070b` · `SDD-SESS-11` |

> `FR-01.6` sengaja tidak memiliki halaman. Mencantumkannya di sini justru penting: perancang tidak boleh membuat layar "Pemulihan Darurat" karena keberadaannya akan melanggar `BR-070b`.

## 9.2 CRUD

### F-04 Pendaftaran aset & pelabelan QR ⭐

```mermaid
flowchart TD
    A([Kebutuhan pencatatan aset]) --> B{Sumber data}
    B -->|"Satuan / beberapa unit"| C["P-16 Tambah Aset"]
    B -->|"Massal dari spreadsheet"| D["P-17 Impor Aset - lihat F-05"]
    B -->|"Dari penerimaan pengadaan"| E["P-54 Catat Penerimaan<br/>data terisi otomatis · FR-04.1 A3"]

    C --> F["Isi identitas, kategori, lokasi,<br/>kondisi awal, penanda kelayakan pinjam"]
    F --> G{Kategori tersedia?}
    G -->|Tidak| H["P-21 Kategori Aset<br/>buat lalu kembali · FR-04.1 A4"] --> F
    G -->|Ya| I["Tentukan jumlah unit N"]
    I --> J{Nomor seri unik?}
    J -->|Tidak| K["Tolak dengan pesan spesifik<br/>BR-003"] --> F
    J -->|Ya| L["Sistem membuat N record<br/>N kode aset + N UUID QR unik · BR-001"]

    D --> L
    E --> L

    L --> M["Halaman hasil: daftar N aset terbentuk<br/>+ tombol Cetak Label QR"]
    M --> N["P-24 Label QR<br/>pilih ukuran, tata letak, elemen"]
    N --> O["Unduh PDF - maksimum 200 label, 30 detik"]
    O --> P["Cetak & tempel label fisik"]
    P --> Q["Tandai qr_terpasang = true"]
    Q --> R{"Masih ada aset belum berlabel?"}
    R -->|Ya| S["Kartu peringatan dashboard<br/>Aset Belum Berlabel QR · 19.3"] --> N
    R -->|Tidak| T([Aset siap dioperasikan])
```

| Titik UX | Ketentuan | Rujukan |
|---|---|---|
| Jumlah unit | Satu formulir menghasilkan N record terpisah, bukan satu record berjumlah N — antarmuka wajib menyatakannya sebelum simpan | `BR-001` · `FR-04.1 AC` |
| Kode aset | Dihasilkan sistem mengikuti format terkonfigurasi; **tidak** dapat diketik manual | `BR-002` |
| Cetak ulang label | UUID tidak berubah, sehingga label lama tetap sah bila ditemukan kembali — dinyatakan pada dialog cetak ulang | `FR-05.1 A1` |
| Regenerasi UUID 🔒 | Hanya Administrator; dialog wajib menyatakan bahwa seluruh label lama menjadi tidak berlaku | `FR-05.1 A2` |

### F-05 Impor massal

Berlaku identik untuk Aset (`E.5.1`), Pengguna (`E.5.2`), dan Jadwal Tetap Ruangan (`E.5.3`).

```mermaid
flowchart TD
    A([Buka halaman impor]) --> B["Unduh templat + contoh isian<br/>IMPT-05"]
    B --> C["Unggah berkas CSV/XLSX"]
    C --> D{"Berkas sama diunggah ulang<br/>dalam 24 jam?"}
    D -->|Ya| E(["Dikenali idempoten, hasil sebelumnya<br/>ditampilkan · IMPT-03"])
    D -->|Tidak| F{Jumlah baris}
    F -->|"Lebih dari 200"| G["Diproses asinkron<br/>NT-42 saat selesai · IMPT-04"]
    F -->|"200 atau kurang"| H["Diproses langsung"]
    G --> I
    H --> I["Validasi baris per baris<br/>baris gagal tidak menggagalkan berkas · IMPT-01"]
    I --> J["Laporan hasil:<br/>jumlah sukses, jumlah gagal,<br/>alasan galat per nomor baris · IMPT-02"]
    J --> K{Ada baris gagal?}
    K -->|Ya| L["Unduh berkas koreksi berisi baris gagal"] --> C
    K -->|Tidak| M(["Daftar terfilter pada data baru"])
```

**Keadaan sukses impor bukan toast** — ia halaman ringkasan yang dapat ditinjau ulang (**UXD-06**), karena `IMPT-02` mewajibkan alasan galat per nomor baris.

### F-06 Perubahan kondisi & mutasi lokasi

```mermaid
flowchart TD
    A["P-18 Detail Aset"] --> B{Aksi}

    B -->|"Ubah Kondisi"| C["Drawer: kondisi baru + alasan WAJIB<br/>BR-007"]
    C --> D{Kondisi baru}
    D -->|"Rusak Berat"| E["Status jadi Tidak Tersedia<br/>reservasi mendatang dibatalkan<br/>pemohon dinotifikasi · FR-04.3 A1"]
    D -->|Hilang| F{"Ada referensi opname<br/>atau berita acara?"}
    F -->|Tidak| G["Tolak · BR-012"] --> C
    F -->|Ya| H["Status Tidak Tersedia<br/>NT-33 ke Pimpinan · FR-04.3 A2"]
    D -->|"Baik / Rusak Ringan"| I["Simpan riwayat kondisi"]

    B -->|"Mutasi Lokasi"| J{"Status aset"}
    J -->|Dipinjam| K["Tombol dinonaktifkan<br/>beserta alasan · BR-010"]
    J -->|"Ada slot aktif pada tanggal mutasi"| L["Tolak + tampilkan transaksi penghalang<br/>FR-04.4 A1"]
    J -->|"Tersedia / Dalam Perbaikan"| M["P-20: lokasi tujuan, tanggal,<br/>alasan, penanggung jawab baru"]
    M --> N["Perbarui lokasi, catat riwayat mutasi"]
    N --> O["Berita acara mutasi PDF"]

    E --> P
    H --> P
    I --> P
    O --> P["Riwayat tampil kronologis di tab Riwayat"]
    P --> Q([Selesai])
    K --> A
    L --> A
```

**Mutasi massal via scan QR** (`FR-04.4 A2`): pemindai mobile mode beruntun mengumpulkan hingga 50 unit, lalu satu lokasi tujuan diterapkan secara atomik — bila satu unit gagal, seluruh operasi dibatalkan (`FR-04.4 AC`).

## 9.3 Persetujuan

### F-07 Keputusan persetujuan

Satu alur untuk enam jenis pengajuan: Reservasi Ruangan, Reservasi Aset, Perpanjangan Peminjaman, Pengadaan Barang, Penghapusan Aset, dan Permintaan Bahan (`BR-035`).

```mermaid
flowchart TD
    A([Pengajuan terbentuk]) --> B["Approval engine memilih aturan<br/>prioritas tertinggi · RE-04"]
    B --> C{"Ada langkah tersisa<br/>yang tidak dilewati?"}
    C -->|"Seluruhnya dilewati<br/>konflik kepentingan"| D["Fallback approver · RE-11<br/>lihat UXD-09"]
    C -->|Ya| E["NT-01 ke approver langkah aktif"]
    D --> E

    E --> F["P-37 / MS-20 Persetujuan Saya"]
    F --> G["P-38 Detail Keputusan:<br/>pemohon, objek, jadwal, keperluan,<br/>riwayat pemohon, ketersediaan objek"]
    G --> H{Keputusan}

    H -->|Tolak| I["Alasan WAJIB · BR-042"]
    I --> J["Status Ditolak, alur berhenti<br/>slot dibebaskan · BR-038<br/>NT-03 ke pemohon"] --> Z([Selesai])

    H -->|"Perlu Revisi"| K["Catatan WAJIB"]
    K --> L["Status Perlu Revisi<br/>NT-04 ke pemohon"]
    L --> M["Pemohon menyunting & ajukan ulang"]
    M --> N["Alur dimulai kembali dari langkah 1<br/>FR-10.2 A1"] --> E

    H -->|Setujui| O{"Approver lain sudah memutuskan?"}
    O -->|Ya| P["409 APPROVAL_ALREADY_DECIDED<br/>tampilkan SIAPA dan KAPAN · RE-09"] --> F
    O -->|Tidak| Q{Masih ada level berikutnya?}
    Q -->|Ya| R["Langkah aktif naik satu<br/>NT-05 ke approver berikutnya"] --> E
    Q -->|Tidak| S{"Objek masih tersedia?"}
    S -->|Tidak| T["Persetujuan ditolak sistem<br/>penyebab ditampilkan · BR-043"] --> F
    S -->|Ya| U["Status Disetujui<br/>slot Tentative jadi Confirmed<br/>NT-02 ke pemohon"] --> Z
```

**Setujui Sebagian** hanya ditawarkan pada Pengadaan (`FR-14.2` langkah 5) dan Penghapusan (`FR-21.2 A2`). Pada jenis lain, tombol itu **tidak ada** — bukan dinonaktifkan.

### F-08 SLA, eskalasi & delegasi

```mermaid
flowchart TD
    A["Langkah menjadi aktif"] --> B["Tenggat SLA absolut ditetapkan<br/>dihitung dalam JAM KERJA · CAL-01"]
    B --> C{"Diputuskan sebelum tenggat?"}
    C -->|Ya| D([Lanjut ke F-07])
    C -->|Tidak| E{"Perilaku pada aturan"}

    E -->|remind| F["NT-06 ke approver + Petugas Sarpras<br/>maksimum 1x per hari per objek"] --> C
    E -->|escalate| G["Alihkan ke approver eskalasi<br/>NT-07 · linimasa menandai eskalasi"]
    G --> H{"Masih ada jalur eskalasi?"}
    H -->|Ya| C
    H -->|Tidak| I{"Perilaku terminal"}
    I -->|"hold_and_alert - bawaan"| J["Pengajuan TETAP menunggu<br/>NT-47 ke Petugas + Administrator<br/>tindakan manual diperlukan · BR-039a"]
    I -->|auto_reject| K["Status Ditolak, NT-03 ke pemohon"]

    L(["Approver berhalangan"]) --> M["Drawer Delegasikan:<br/>pengganti + rentang tanggal"]
    M --> N["Pengajuan diarahkan ke pengganti<br/>linimasa TETAP mencatat approver asli · RE-12"]
    N --> C

    J --> Z([Menunggu tindakan manual])
    K --> Z2([Selesai])
```

**Yang wajib terlihat di antarmuka:** persetujuan **tidak pernah** terjadi otomatis karena kelalaian approver (`BR-039a`). Karena itu editor aturan (P-69) tidak pernah menawarkan `auto_approve`, dan linimasa (P-38) menampilkan status "Menunggu tindakan manual" secara eksplisit, bukan diam.

## 9.4 Reservasi

### F-09 Reservasi ruangan hingga selesai ⭐

```mermaid
flowchart TD
    A([Kebutuhan ruangan]) --> B["P-27 Kalender Ruangan"]
    B --> C{"Slot terlihat"}
    C -->|"Jadwal Tetap / Pemeliharaan / Libur"| D["Tidak dapat dipilih<br/>label kegiatan ditampilkan · CAL-UI-05"] --> B
    C -->|"Menunggu Persetujuan / Disetujui"| E["Tidak dapat dipilih<br/>Siswa hanya melihat Terpakai · CAL-UI-06"] --> B
    C -->|Kosong| F["P-29 Wizard langkah 1<br/>slot terisi otomatis"]

    F --> G["Langkah 2: detail kegiatan,<br/>aset pendukung, pola pengulangan"]
    G --> H{Validasi}
    H -->|"Peserta melebihi kapasitas"| I["Sarankan ruangan berkapasitas cukup<br/>FR-07.2 A2"] --> G
    H -->|"Kurang dari H-1 tanpa reservation.urgent"| J["Tolak dengan penjelasan · BR-020"] --> G
    H -->|"Kuota pengajuan tertunda penuh"| K["Tampilkan jumlah berjalan & batas<br/>BR-023a"] --> Z1([Selesai])
    H -->|"Pemohon terblokir kewajiban"| L["Daftar kewajiban + tautan P-35<br/>BR-030"] --> Z1
    H -->|Lolos| M["Langkah 3: TINJAU<br/>ringkasan objek, tanggal turunan,<br/>tanggal bentrok yang dilewati,<br/>peringatan all-or-nothing · BR-024b"]

    M --> N{Ajukan}
    N -->|"409 slot diambil pihak lain"| O["Saran slot alternatif terdekat<br/>FR-07.2 A1"] --> M
    N -->|Berhasil| P["Slot Tentative terbentuk<br/>nomor RSV-RG-YYYY-NNNN · SEQ-01"]
    P --> Q["F-07 Persetujuan"]

    Q -->|Ditolak| R(["Slot dibebaskan, NT-03"])
    Q -->|"TTL habis"| S(["Kedaluwarsa, slot dibebaskan<br/>BR-023b · NT-46 · tombol Ajukan Ulang"])
    Q -->|Disetujui| T["Slot Confirmed, NT-02"]

    T --> U["Waktu mulai tiba: status Berlangsung"]
    U --> V["Waktu selesai: status Selesai otomatis<br/>FR-07.4"]
    V --> W{"Petugas menandai kondisi ruangan"}
    W -->|Baik| X([Selesai])
    W -->|"Perlu Perhatian"| Y["F-16 Lapor Kerusakan tertaut reservasi<br/>FR-07.4 A2"] --> X
    W -->|"Tidak digunakan"| AA(["Status Tidak Digunakan<br/>tercatat pada analitik utilisasi · FR-07.4 A1"])
```

### F-10 Reservasi aset hingga disetujui ⭐

Berbagi wizard yang sama (P-29) dan alur persetujuan yang sama (F-07). Yang berbeda hanya langkah 1 dan alokasi unit.

| Titik | Ketentuan | Rujukan |
|---|---|---|
| Ketersediaan | Dihitung dari `booking_slots`, **bukan** dari `assets.status`. Aset yang sedang `Dipinjam` hari ini tetap tampil tersedia untuk rentang mendatang yang tidak beririsan | `BR-005a` · `FR-08.1 AC` |
| Katalog kosong pada rentang | Menampilkan **tanggal terdekat saat unit kembali tersedia**, bukan sekadar "tidak tersedia" | `FR-08.1 A2` · `UX-05` |
| Alokasi unit | Otomatis; Petugas Sarpras dapat memilih unit tertentu secara manual | `FR-08.2` langkah 3 |
| Unit terambil saat proses | Sistem mengalokasikan unit pengganti setara; bila tidak ada, pengajuan ditolak **dengan penjelasan** | `FR-08.2 A1` |
| Durasi melebihi batas role | Tolak + **tampilkan batas yang berlaku** | `BR-021` · `FR-08.2 A2` |
| Setelah disetujui | Pemohon melihat **kode aset unit yang dialokasikan** | `FR-08.2 AC` |
| Konkurensi | 50 permintaan simultan atas unit terakhir menghasilkan tepat 1 sukses; 49 lainnya menerima `409 ASSET_NOT_AVAILABLE` dengan saran alternatif | `CC-02` · `CI-01` |
| Siswa/OSIS | Katalog terbatas `boleh_dipinjam_siswa` | `BR-022` · `FR-08.1 A1` |

### F-11 Blokade jadwal tetap ruangan

```mermaid
flowchart TD
    A["P-23 Detail Ruangan, tab Jadwal Tetap"] --> B{Jenis blokade}
    B -->|"Pola berulang"| C["Hari, jam mulai-selesai,<br/>tanggal berlaku, label kegiatan"]
    B -->|"Rentang tunggal"| D["Mis. Renovasi 10-20 Agustus"]
    B -->|"Impor massal"| E["Unggah CSV · E.5.3 · FR-07.5 A2"]

    C --> F{"Bentrok dengan reservasi<br/>yang sudah disetujui?"}
    D --> F
    E --> F
    F -->|Ya| G["Tampilkan daftar reservasi terdampak<br/>minta keputusan EKSPLISIT · FR-07.5 A1"]
    G --> H{Pilihan pengguna}
    H -->|"Batalkan reservasi tersebut"| I["Pembatalan beralasan<br/>pemohon dinotifikasi NT-08"]
    H -->|"Sesuaikan blokade"| C
    F -->|Tidak| J

    I --> J["Slot Confirmed origin fixed_schedule / manual_block<br/>untuk seluruh kemunculan dalam horizon"]
    J --> K["Tanggal libur otomatis dilewati<br/>FR-07.5 A4"]
    K --> L["Kalender menampilkan gaya visual berbeda<br/>+ label kegiatan · CAL-UI-05"]
    L --> M([Ruangan terblokade])
```

**Regenerasi horizon 90 hari untuk 30 ruangan dijalankan asinkron** (`FR-07.5 AC`) — antarmuka menampilkan progres, bukan membeku.

## 9.5 Peminjaman & Pengembalian

### F-12 Serah terima peminjaman ⭐

```mermaid
flowchart TD
    A([Peminjam datang]) --> B["MS-06 Tugas / P-33 Antrean Serah Terima"]
    B --> C["Pindai QR unit<br/>atau masukkan kode aset manual"]
    C --> D{"Unit sesuai alokasi reservasi?"}
    D -->|Tidak| E["Peringatan + drawer Substitusi Unit<br/>alasan WAJIB · FR-09.1 A1"]
    E --> F
    D -->|Ya| F["Pilih kondisi awal + unggah minimal 1 foto<br/>BR-027"]

    F --> G{"Kondisi menurun sejak disetujui?"}
    G -->|Ya| H["Tampilkan kondisi terkini<br/>peminjam menerima atau membatalkan · FR-09.1 A3"]
    H -->|Membatalkan| Z1([Reservasi dibatalkan])
    H -->|Menerima| I
    G -->|Tidak| I["Bukti serah terima digital:<br/>tanda tangan kanvas 300x150 px<br/>ATAU konfirmasi dari akun peminjam · 31.6"]

    I --> J{"Peminjam hadir?"}
    J -->|"Diwakilkan"| K["Catat nama penerima kuasa<br/>tanggung jawab tetap pada pemohon · BR-033"] --> L
    J -->|Ya| L["Konfirmasi Serahkan<br/>Idempotency-Key dikirim · ID-01"]

    L --> M{Koneksi tersedia?}
    M -->|Tidak| N["Gagal EKSPLISIT<br/>tidak pernah diantrekan · MOB-OFF-05"] --> L
    M -->|Ya| O["Transaksi peminjaman aktif<br/>unit jadi Dipinjam, jatuh tempo ditetapkan<br/>nomor PJM-YYYY-NNNN"]

    O --> P{"Foto berhasil terunggah?"}
    P -->|Tidak| Q["Masuk antrean unggah<br/>entitas ditandai Foto belum terunggah · MOB-OFF-04"] --> R
    P -->|Ya| R["Layar bukti serah terima<br/>NT-10 ke peminjam"]
    R --> S([Selesai])
```

**Peminjaman langsung tanpa reservasi** (`FR-09.1 A4`) hanya tersedia bagi pemegang `loan.direct`. Antarmuka wajib menyatakan bahwa sistem membentuk reservasi retroaktif berpenanda `bypass_approval` beserta alasan wajib, dan bahwa tindakan itu tercatat sebagai anomali pada laporan kepatuhan bulanan (`BR-026a`) — pengguna harus tahu konsekuensinya sebelum menekan tombol.

### F-13 Pengembalian, denda & kerusakan ⭐

```mermaid
flowchart TD
    A([Peminjam mengembalikan aset]) --> B["Pindai QR unit"]
    B --> C["Tampilkan peminjam, tanggal pinjam,<br/>jatuh tempo, kondisi awal + foto serah terima"]
    C --> D["Pilih kondisi kembali + minimal 1 foto akhir"]

    D --> E{Kondisi kembali}
    E -->|"Aset tidak dikembalikan"| F["Tandai Hilang - alasan WAJIB<br/>kondisi jadi Hilang, status Tidak Tersedia<br/>NT-33 ke Pimpinan"]
    F --> G["Terbitkan GANTI RUGI sebesar nilai perolehan<br/>atau nilai penggantian · BR-028d<br/>denda keterlambatan berhenti bertambah"] --> M
    E -->|"Rusak Berat / Tidak Lengkap"| H["Tiket kerusakan otomatis tertaut<br/>peminjam & transaksi · BR-032<br/>status Tidak Tersedia · Bab 12.2"] --> I
    E -->|"Rusak Ringan perlu perbaikan"| H2["Tiket kerusakan + work order langsung<br/>status Dalam Perbaikan"] --> I
    E -->|"Baik / Rusak Ringan layak pakai"| I["Status unit jadi Tersedia"]

    I --> J{"Tanggal kembali melewati jatuh tempo?"}
    J -->|Tidak| M
    J -->|Ya| K["Hitung per LOAN_ITEM, bukan per transaksi<br/>hari terlambat x tarif saat jatuh tempo<br/>BR-028a · BR-029"]
    K --> L["Terapkan cap maksimum persentase nilai perolehan<br/>BR-028b - rincian DITAMPILKAN sebelum konfirmasi"]
    L --> M["Konfirmasi Pengembalian"]

    M --> N{"Seluruh unit sudah kembali?"}
    N -->|Tidak| O(["Status Sebagian Dikembalikan<br/>transaksi induk tetap terbuka · FR-09.2 A3"])
    N -->|Ya| P["Status Dikembalikan"]

    P --> Q{Ada kewajiban terbit?}
    Q -->|Ya| R["NT-15 Denda terbit<br/>slot mendatang atas unit rusak dibatalkan · NT-27"] --> S
    Q -->|Tidak| S["NT-14 Pengembalian tercatat"]
    S --> T(["Ringkasan pengembalian:<br/>status unit, denda, tiket kerusakan"])
```

**Yang wajib terlihat sebelum konfirmasi:** rincian perhitungan denda — jumlah hari terlambat, tarif yang dipakai, dan apakah cap `BR-028b` diterapkan. `RS-16` mencatat denda sebagai sumber konflik dengan pengguna; transparansi perhitungan adalah mitigasinya.

### F-14 Perpanjangan peminjaman ⭐

```mermaid
flowchart TD
    A["MS-12 / P-34 Detail Peminjaman"] --> B{"Sudah lewat jatuh tempo?"}
    B -->|Ya| C(["Tombol tidak tersedia<br/>perpanjangan tidak menghapus keterlambatan<br/>BR-034 · FR-09.5 A2"])
    B -->|Tidak| D["MS-13 Ajukan Perpanjangan<br/>tanggal baru + alasan"]

    D --> E{Validasi}
    E -->|"Durasi total melebihi batas role"| F["Tolak + tampilkan batas · BR-021"] --> D
    E -->|"Batas jumlah perpanjangan tercapai"| G(["Tolak + arahkan mengembalikan lalu<br/>mengajukan reservasi baru · FR-09.5 A3"])
    E -->|"Unit sudah dipesan pihak lain"| H["Tampilkan TANGGAL JATUH TEMPO MAKSIMUM<br/>yang masih mungkin · FR-09.5 A1"] --> D
    E -->|Lolos| I["Slot Active diperpanjang secara tentative<br/>instance approval jenis Perpanjangan Peminjaman"]

    I --> J["F-07 Persetujuan"]
    J -->|Ditolak| K(["Jatuh tempo asli tetap berlaku<br/>slot tentative dilepas · FR-09.5 A4"])
    J -->|Disetujui| L["Jatuh tempo diperbarui<br/>pengingat H-1 dijadwalkan ulang"]
    L --> M{"Sudah ada denda terbit<br/>sebelum keputusan?"}
    M -->|Ya| N(["Denda tersebut TETAP BERLAKU<br/>perpanjangan hanya prospektif · FR-09.5 A5"])
    M -->|Tidak| O(["Selesai tanpa denda"])
```

### F-15 Pengelolaan denda hingga blokir terbuka ⭐

```mermaid
flowchart TD
    A(["Kewajiban terbit<br/>Keterlambatan atau Ganti Rugi"]) --> B["Status Belum Dibayar<br/>NT-15 ke pemohon"]
    B --> C{"Total belum dibayar melewati ambang?"}
    C -->|Ya| D["Pemohon DIBLOKIR dari pengajuan baru<br/>BR-030 · NT-18"]
    C -->|Tidak| E
    D --> E["P-35 / MS-14 Denda & Kewajiban<br/>rincian: hari terlambat, tarif, cap"]

    E --> F{Penyelesaian}
    F -->|"Dibayar luring"| G["Petugas: drawer Tandai Lunas<br/>tanggal bayar + nomor bukti"]
    G --> H["Status Lunas, NT-16"]
    F -->|"Dibebaskan"| I{Jenis kewajiban}
    I -->|Keterlambatan| J["Drawer Bebaskan, alasan WAJIB<br/>Admin atau Petugas Sarpras · BR-031"]
    I -->|"Ganti Rugi"| K["Drawer Bebaskan Ganti Rugi, alasan WAJIB<br/>penuh atau sebagian<br/>Pimpinan Sekolah saja - BR-028e"]
    J --> L["Status Dibebaskan, NT-17"]
    K --> Q{"Dibebaskan penuh?"}
    Q -->|Ya| L
    Q -->|Sebagian| R["Status Dibebaskan Sebagian<br/>sisa tagihan tetap dihitung BR-030 - NT-17"]

    H --> M{"Masih ada kewajiban<br/>Belum Dibayar melewati ambang?"}
    L --> M
    R --> M
    M -->|Ya| E
    M -->|Tidak| N["Blokir terbuka<br/>pemohon dapat mengajukan kembali"]
    N --> O([Selesai])
```

**Denda dicatat per `loan_item`, bukan per transaksi** (`BR-028a`). Konsekuensi UX: P-35 menampilkan satu baris per unit, bukan satu baris per peminjaman — sehingga pengembalian sebagian dengan keterlambatan berbeda per unit terlihat benar.

## 9.6 Perawatan

### F-16 Kerusakan hingga work order tertutup ⭐

```mermaid
flowchart TD
    A([Pengguna menemukan kerusakan]) --> B["Scan QR aset ATAU pilih manual<br/>ATAU pilih ruangan · FR-11.1 A4"]
    B --> C{"Sudah ada tiket terbuka<br/>untuk objek ini?"}
    C -->|Ya| D["Tampilkan tiket tersebut<br/>tawarkan Tambahkan informasi<br/>BUKAN membuat duplikat · FR-11.1 A1"] --> Z1([Selesai])
    C -->|Tidak| E["MS-15 / P-40: deskripsi, urgensi,<br/>1-5 foto - minimal 1 WAJIB · BR-044"]

    E --> F["Tiket Dilaporkan, nomor KRS-YYYY-NNNN<br/>NT-19 ke Petugas Sarpras"]
    F --> G{Urgensi Kritis?}
    G -->|Ya| H["NT-20 ke Pimpinan Sekolah<br/>maksimum 60 detik · FR-11.1 AC"] --> I
    G -->|Tidak| I["P-41 Petugas memverifikasi"]

    I --> J{"Aset masih bergaransi?"}
    J -->|Ya| K["Peringatan garansi + tautan dokumen penjamin<br/>BR-052 · FR-11.2 A3"] --> L
    J -->|Tidak| L{Hasil verifikasi}

    L -->|"Tidak valid"| M["Drawer Tolak, alasan WAJIB<br/>terlihat oleh pelapor · NT-21"] --> Z2([Selesai])
    L -->|"Perbaikan ringan langsung"| N["Tiket ditutup Selesai + catatan"] --> Z2
    L -->|"Perlu work order"| O["P-43 Buat Work Order:<br/>teknisi, prioritas, target selesai, estimasi biaya"]

    O --> P["Status aset jadi Dalam Perbaikan<br/>slot mendatang DIBATALKAN OTOMATIS<br/>pemohon dinotifikasi NT-27 · BR-048"]
    P --> Q["NT-22 ke teknisi, status Ditugaskan"]

    Q --> R["MS-16/MS-17 Teknisi: Mulai Kerjakan"]
    R --> S{Kendala}
    S -->|"Menunggu sparepart"| T["Tandai Tertunda + alasan + perkiraan lanjut<br/>NT ke Petugas · FR-12.3 A1"] --> R
    S -->|"Tidak dapat diperbaiki"| U["Tandai Tidak Dapat Diperbaiki + rekomendasi<br/>FR-12.3 A2"] --> V["Kondisi jadi Rusak Berat<br/>arahkan ke F-20 Penghapusan"] --> Z3([Selesai])
    S -->|"Biaya melebihi ambang"| W["Perbarui temuan + estimasi<br/>minta persetujuan ulang · FR-12.3 A3"] --> R
    S -->|Lancar| X["Isi checklist, tindakan, sparepart, biaya<br/>+ minimal 1 foto hasil · BR-049"]

    X --> Y["Ajukan Penyelesaian<br/>status Menunggu Verifikasi, NT-24"]
    Y --> AA["P-44 Petugas meninjau"]
    AA --> AB{Hasil memuaskan?}
    AB -->|Tidak| AC["Kembalikan ke Teknisi + catatan<br/>NT-25 · FR-12.4 A1"] --> R
    AB -->|Ya| AD["Tetapkan kondisi aset pasca-perbaikan<br/>WAJIB - WO tidak dapat ditutup tanpanya · BR-049"]
    AD --> AE{Kondisi ditetapkan}
    AE -->|"Layak pakai"| AF["Status aset jadi Tersedia"]
    AE -->|"Rusak Berat"| AG["Status tetap Tidak Tersedia<br/>dapat diusulkan penghapusan · FR-12.4 A2"]
    AF --> AH
    AG --> AH["WO Selesai, tiket kerusakan asal ikut TERTUTUP · BR-050<br/>NT-26 ke pelapor & teknisi"]
    AH --> AI(["Biaya masuk akumulasi per aset<br/>rekomendasi penggantian bila ambang terlampaui · BR-053"])
```

### F-17 Pemeliharaan preventif otomatis ⭐

```mermaid
flowchart TD
    A["P-21 Kategori Aset menetapkan<br/>interval_preventif_hari"] --> B["P-46 Buat Jadwal Pemeliharaan:<br/>aset/kategori, interval, tanggal mulai,<br/>checklist, teknisi bawaan"]
    B --> C["Sistem menghitung jatuh tempo berikutnya"]
    C --> D{"H-7 sebelum jatuh tempo"}
    D --> E["Work order preventif terbit OTOMATIS<br/>tanpa intervensi manual · BR-051<br/>NT-28 ke teknisi & Petugas"]

    E --> F{"Aset sedang dipinjam?"}
    F -->|Ya| G["WO ditandai Menunggu Ketersediaan Aset<br/>teknisi dinotifikasi setelah aset kembali · FR-12.2 A1"] --> H
    F -->|Tidak| H["F-16 mulai dari langkah eksekusi teknisi"]

    H --> I{"Pemeliharaan dilewati?"}
    I -->|Ya| J["Drawer Lewati, alasan WAJIB<br/>tercatat pada riwayat aset · FR-12.2 A3"]
    I -->|Tidak| K["WO diverifikasi & ditutup"]
    J --> L
    K --> L["Jatuh tempo berikutnya dihitung ulang<br/>dari TANGGAL PENYELESAIAN"]
    L --> D

    M(["Jadwal dinonaktifkan"]) --> N(["WO berikutnya tidak terbit<br/>WO yang sudah terbit tetap berjalan · FR-12.2 A2"])
```

## 9.7 Pengawasan

### F-18 Stock opname hingga penyesuaian data ⭐

```mermaid
flowchart TD
    A([Periode opname tiba]) --> B["P-48 Buat Sesi:<br/>nama, periode, cakupan, pelaksana"]
    B --> C{"Sudah ada sesi berjalan<br/>pada cakupan sama?"}
    C -->|Ya| D(["Ditolak - mencegah tumpang tindih<br/>BR-054 · FR-13.1 A1"])
    C -->|"Cakupan menghasilkan 0 aset"| E(["Peringatan, sesi tidak dibuat<br/>FR-13.1 A2"])
    C -->|Tidak| F["Snapshot daftar aset target DIBEKUKAN<br/>tidak berubah selama sesi · BR-055<br/>NT-30 ke pelaksana"]

    F --> G["MS-18 Pilih lokasi<br/>target dimuat PER LOKASI, hingga 500 unit<br/>MOB-PERF-02"]
    G --> H["MS-19 Scan beruntun<br/>hasil dikirim PER PEMINDAIAN · MOB-PERF-03"]
    H --> I{Hasil pencocokan}
    I -->|Sesuai| J["Ditemukan"]
    I -->|"Lokasi berbeda"| K["Salah Lokasi"]
    I -->|"Kondisi berbeda"| L["Perbedaan Kondisi - kedua nilai dicatat"]
    I -->|"Tidak ada di daftar target"| M["Temuan Baru - formulir terpisah<br/>FR-13.2 A3"]
    I -->|"QR rusak"| N["Input kode manual atau pilih dari daftar<br/>FR-13.2 A4"] --> I
    I -->|"Sudah pernah dipindai"| O["Tampilkan status tercatat<br/>TIDAK membuat entri kedua"] --> H

    J --> P
    K --> P
    L --> P
    M --> P{"Seluruh lokasi selesai?"}
    P -->|Belum| G
    P -->|Sudah| Q["Aset belum tercatat ditandai Tidak Ditemukan<br/>aset berstatus Dipinjam TIDAK dihitung selisih · BR-056"]

    Q --> R["P-50 Rekonsiliasi:<br/>total target, ditemukan, salah lokasi,<br/>perbedaan kondisi, tidak ditemukan, temuan baru"]
    R --> S{"Setiap Tidak Ditemukan<br/>sudah diberi keterangan?"}
    S -->|Belum| T["Tombol Kirim DIBLOKIR<br/>BR-058 · FR-13.3 A2"] --> R
    S -->|Sudah| U["Kirim ke Pimpinan<br/>NT-31"]

    U --> V{Keputusan Pimpinan}
    V -->|Tolak| W["Sesi kembali Berjalan + catatan perbaikan<br/>NT-32 · FR-13.3 A1"] --> R
    V -->|Setujui| X["Penyesuaian DITERAPKAN:<br/>lokasi, kondisi, status Hilang,<br/>pendaftaran temuan baru · BR-057"]
    X --> Y["Sesi Selesai - READ-ONLY bagi semua role<br/>BR-059"]
    Y --> AA(["Berita acara PDF<br/>seluruh penyesuaian tercatat di activity log"])

    AB(["Sesi dibatalkan Administrator"]) --> AC(["Hasil pemeriksaan tetap tersimpan sebagai arsip<br/>TIDAK diterapkan ke data aset · FR-13.3 A3"])
```

### F-19 Pengadaan hingga aset terbentuk ⭐

```mermaid
flowchart TD
    A([Kebutuhan barang teridentifikasi]) --> B["P-52 Buat Usulan:<br/>judul, unit kerja, tahun anggaran,<br/>prioritas, justifikasi"]
    B --> B2{"Berasal dari rekomendasi sistem?"}
    B2 -->|Ya| B3["Terisi otomatis dari aset Rusak Berat<br/>atau biaya melewati ambang · FR-14.1 A2"] --> C
    B2 -->|Tidak| C["Tambah baris item:<br/>nama, kategori, spesifikasi,<br/>jumlah, satuan, estimasi harga satuan"]

    C --> D["Total estimasi DIHITUNG SISTEM<br/>tidak diisi manual · BR-061"]
    D --> E{"Minimal 1 item?"}
    E -->|Tidak| F["Tolak pengajuan · BR-060"] --> C
    E -->|Ya| G{Aksi pengguna}
    G -->|"Simpan Draf"| H(["Draf hanya terlihat oleh pembuatnya<br/>FR-14.1 A1"]) --> G
    G -->|Ajukan| I["Status Menunggu Persetujuan<br/>nomor PGD-YYYY-NNNN · NT-34"]

    I --> J["F-07 Persetujuan<br/>nilai total menentukan jumlah level · FR-14.1 A4"]
    J -->|Ditolak| K(["Usulan ditutup + alasan · NT-35"])
    J -->|"Perlu Revisi"| L["Pengusul menyunting & ajukan ulang<br/>alur dimulai dari awal · FR-14.2 A2"] --> I
    J -->|"Setujui Sebagian"| M["Jumlah disetujui per item disimpan<br/>TERPISAH dari jumlah diusulkan · FR-14.2 AC"]
    J -->|Setujui| N
    M --> N["Status Disetujui / Disetujui Sebagian<br/>NT-35 ke pengusul"]

    N --> O["Barang tiba fisik"]
    O --> P["P-54 Catat Penerimaan:<br/>tanggal, nomor dokumen, jumlah per item"]
    P --> Q{"Jumlah diterima melebihi disetujui?"}
    Q -->|Ya| R["Tolak - kelebihan wajib lewat usulan baru<br/>BR-063 · FR-14.3 A3"] --> P
    Q -->|Tidak| S{"Sesuai spesifikasi?"}
    S -->|Tidak| T["Tandai Ditolak Saat Penerimaan<br/>alasan + foto WAJIB, item tidak jadi aset<br/>FR-14.3 A2"] --> W
    S -->|Ya| U["Lengkapi data aset: merek, model,<br/>nilai perolehan aktual, lokasi, kondisi,<br/>nomor seri per unit"]

    U --> V["Sistem membuat N record aset<br/>N kode aset + N QR unik · BR-064<br/>tertaut ke usulan asal · BR-011"]
    V --> V2["Dokumen penerimaan otomatis tertaut<br/>sebagai dokumen aset SELURUH unit · BR-065"]
    V2 --> W{"Seluruh item sudah diterima?"}
    W -->|Belum| X(["Status Diterima Sebagian<br/>FR-14.3 A1"]) --> O
    W -->|Sudah| Y["Status Selesai, NT-36 ke pengusul"]
    Y --> Z["Tombol Cetak QR Massal -> P-24"]
    Z --> AA([F-04 pelabelan])

    AB(["Tidak direalisasikan hingga<br/>akhir tahun anggaran"]) --> AC(["Drawer Tutup Usulan, alasan WAJIB<br/>status Tidak Direalisasikan · FR-14.3 A4"])
```

### F-20 Penghapusan aset hingga berita acara ⭐

```mermaid
flowchart TD
    A([Aset tidak layak dipertahankan]) --> B{Sumber usulan}
    B -->|"Filter kondisi Rusak Berat / Hilang"| C["P-56 Buat Usulan Penghapusan"]
    B -->|"WO Tidak Dapat Diperbaiki"| D["Data terisi otomatis<br/>FR-21.1 A4"] --> C
    B -->|"Rekomendasi penggantian"| E["Dari tab Riwayat Pemeliharaan<br/>FR-12.5 A1"] --> C

    C --> F{Prasyarat}
    F -->|"Ada slot aktif / sedang dipinjam"| G["Tolak + tampilkan transaksi penghalang<br/>BR-065b · FR-21.1 A1"] --> Z1([Selesai])
    F -->|"Hilang tanpa referensi opname / berita acara"| H["Tolak · BR-012 · FR-21.1 A3"] --> Z1
    F -->|"Masih bergaransi"| I["Peringatan + konfirmasi eksplisit beralasan<br/>FR-21.1 A2"] --> J
    F -->|Lolos| J["Sistem menampilkan data pendukung OTOMATIS:<br/>nilai perolehan, tahun, umur teknis,<br/>biaya pemeliharaan kumulatif, jumlah WO,<br/>referensi opname bila Hilang"]

    J --> K["Isi alasan, justifikasi, tindak lanjut fisik<br/>+ lampiran pendukung"]
    K --> L["Status Menunggu Persetujuan<br/>nomor HPS-YYYY-NNNN · NT-43<br/>aset DIBLOKIR dari pemesanan baru · BR-065c"]

    L --> M["F-07 Persetujuan - approver Pimpinan Sekolah"]
    M -->|Ditolak| N(["Usulan ditutup, blokir slot dilepas<br/>aset kembali sesuai kondisinya · FR-21.2 A1"])
    M -->|"Setujui Sebagian"| O["Hanya aset disetujui yang dihapuskan<br/>sisanya kembali ke status semula · FR-21.2 A2"] --> P
    M -->|Setujui| P["P-57 Petugas mencatat pelaksanaan fisik:<br/>tanggal, tindak lanjut, SAKSI, foto bukti"]

    P --> Q["Kondisi terminal ditetapkan<br/>status Tidak Tersedia, dihapuskan = true<br/>dikeluarkan dari katalog & perhitungan ketersediaan"]
    Q --> R["Berita Acara Penghapusan PDF<br/>NT-45 · BR-065f"]
    R --> S(["Aset TETAP dapat ditelusuri<br/>kode aset & UUID TIDAK pernah dipakai ulang<br/>BR-065d · BR-065e"])

    T(["Aset hilang ditemukan kembali"]) --> U["P-57 Pulihkan Aset - alasan WAJIB<br/>hanya Administrator · disposal.reinstate"]
    U --> V(["Aset aktif kembali dengan kode aset<br/>dan UUID YANG SAMA, riwayat utuh · BR-065g"])
```

## 9.8 Pelaporan

### F-21 Laporan analitik & ekspor asinkron

```mermaid
flowchart TD
    A["P-58 Statistik & Analitik"] --> B["Pilih salah satu dari tujuh laporan:<br/>Kondisi Aset · Pemanfaatan Fasilitas ·<br/>Biaya Pemeliharaan · Tren Kerusakan ·<br/>Aktivitas Peminjaman · Kebutuhan Pengadaan ·<br/>Rekapitulasi Aset"]
    B --> C["Tetapkan filter: rentang tanggal, lokasi,<br/>kategori, role pemohon"]
    C --> D{Ada data pada rentang?}
    D -->|Tidak| E["Keadaan kosong + saran rentang lain<br/>FR-16.1 A1"] --> C
    D -->|Ya| F["P-59: grafik + tabel<br/>grafik WAJIB punya label sumbu,<br/>legenda tekstual, tabel data alternatif"]

    F --> G{Aksi lanjutan}
    G -->|"Bandingkan periode"| H["Mode perbandingan: selisih terhadap<br/>periode sebelumnya · FR-16.1 A3"] --> F
    G -->|Drill-down| I["Daftar sumber terfilter · P-15/P-32/P-42/..."] 
    G -->|Ekspor| J{"Perkiraan waktu proses"}
    J -->|"5 detik atau kurang"| K["Unduhan langsung XLSX/PDF"]
    J -->|"Lebih dari 5 detik"| L["Diproses ASINKRON<br/>pengguna dapat meninggalkan halaman<br/>NFR-P-08 · FR-16.1 A2"]
    L --> M["NT-42 - Laporan siap diunduh"]
    M --> N["Unduh dari Pusat Notifikasi"]

    K --> O(["Ekspor PDF memuat kop laporan,<br/>filter yang dipakai, tanggal cetak, nama pencetak<br/>FR-16.1 AC · aksi tercatat REPORT_EXPORTED"])
    N --> O
    I --> P([Selesai])
```

> **Role Siswa/OSIS tidak memiliki akses ke modul ini sama sekali** (`FR-16.1 AC`) — entri sidebar tidak dirender, dan `/analitik` menghasilkan P-08 bila diakses langsung.

## 9.9 Alur lintas modul

### F-22 Scan QR & aksi kontekstual ⭐

```mermaid
flowchart TD
    A([Pengguna menghadapi aset fisik]) --> B{Alat pemindai}
    B -->|"Kamera bawaan ponsel"| C{"Aplikasi SIGM4 terpasang?"}
    C -->|Ya| D["App/Universal Link mengalihkan ke aplikasi<br/>MOB-DL-05"] --> F
    C -->|Tidak| E(["P-06 Halaman Publik Aset:<br/>kode, nama, kategori, lokasi, kondisi, status<br/>TANPA nilai, biaya, dokumen, identitas peminjam<br/>+ ajakan masuk untuk aksi lanjutan · DP-05"])
    B -->|"MS-07 aplikasi SIGM4"| F["Baca UUID, panggil detail aset"]
    B -->|"P-25 kamera peramban"| F

    F --> G{Hasil pembacaan}
    G -->|"QR tidak dikenali / rusak"| H["Galat + input kode aset manual<br/>SELALU terlihat · FR-05.2 A1"] --> F
    G -->|"Izin kamera ditolak"| I["Panduan mengaktifkan izin<br/>+ input kode manual · MOB-MED-06"] --> F
    G -->|"Aset dinonaktifkan"| J["Profil + penanda Aset tidak aktif<br/>aksi transaksional DISEMBUNYIKAN · FR-05.2 A2"] --> Z([Selesai])
    G -->|Berhasil| K["MS-08 Hasil Scan - profil aset, 3 detik"]

    K --> L{"Aksi kontekstual sesuai<br/>ROLE dan STATUS aset"}
    L -->|"loan.manage + Direservasi"| M["Proses Serah Terima -> F-12"]
    L -->|"loan.manage + Dipinjam"| N["Proses Pengembalian -> F-13"]
    L -->|"audit.execute + sesi opname aktif"| O["Catat Hasil Opname -> F-18"]
    L -->|"workorder.execute + WO aktif atas aset"| P["Perbarui Work Order -> F-16"]
    L -->|"damage.create - seluruh role"| Q["Lapor Kerusakan -> F-16"]
    L -->|"asset.update + mode mutasi massal"| R["Tambahkan ke daftar mutasi -> F-06"]
    L -->|"Tanpa aksi tersedia"| S(["Detail Aset saja<br/>bukan layar buntu · UX-05"])

    M --> Z
    N --> Z
    O --> Z
    P --> Z
    Q --> Z
    R --> Z
    S --> Z
```

**Aturan yang tidak boleh dilanggar perancang:** aksi kontekstual yang ditampilkan selalu sesuai permission **dan** status aset (`FR-05.2 AC`). Tombol yang tidak berlaku **tidak dirender**; tombol yang berlaku tetapi terhalang keadaan (mis. mutasi saat `Dipinjam`) dirender dinonaktifkan **beserta alasannya**.

### F-23 Notifikasi hingga deep link

```mermaid
flowchart TD
    A([Event bisnis terjadi]) --> B["Notifikasi ditulis di dalam transaksi<br/>pengiriman terjadi setelah commit · NTF-04"]
    B --> C{Kanal}

    C -->|Web| D{"Koneksi SSE aktif?"}
    D -->|Ya| E["Dorong ke klien + penghitung belum dibaca<br/>NTF-02 · NTF-05"]
    D -->|"Gagal 3x / diblokir proxy"| F["Beralih ke polling 60 detik<br/>UI MENJELASKAN penurunan ini · SDD-NTF-01"] --> E
    D -->|"Lebih dari 2 koneksi"| G["Koneksi terlama diputus<br/>UI menjelaskan mengapa · NTF-03"] --> E

    C -->|Mobile| H{"Izin notifikasi diberikan?"}
    H -->|Tidak| I["In-app tetap berjalan<br/>+ ajakan mengaktifkan izin · FR-17.2 A1"] --> J
    H -->|Ya| K["Push FCM ke seluruh perangkat aktif<br/>FR-17.2 A4"] --> J

    E --> J["Lonceng topbar / tab Notifikasi<br/>penghitung belum dibaca dari SERVER"]
    J --> L["P-13 Pusat Notifikasi<br/>filter jenis & status baca"]
    L --> M["Ketuk notifikasi: tandai terbaca<br/>+ ikuti deep link · SDD-NTF-09"]
    M --> N{Objek dapat diakses?}
    N -->|Ya| O(["Halaman detail objek"])
    N -->|"Di luar hak akses"| P(["P-08 Tanpa Hak Akses<br/>MOB-DL-03"])
    N -->|"Dihapus / dibatalkan"| Q(["P-09 Data Tidak Lagi Tersedia<br/>FR-17.1 A1 · MOB-DL-04"])

    R(["Preferensi pengguna"]) -.->|"Diperiksa saat KIRIM,<br/>bukan saat terbit · SDD-NTF-06"| C
    S(["Notifikasi wajib"]) -.->|"Selalu terkirim,<br/>mengabaikan preferensi · FR-17.3 A1"| C
```

### F-24 Percakapan chatbot ⭐

```mermaid
flowchart TD
    A([Pengguna membuka panel chatbot]) --> B["Ketik pertanyaan Bahasa Indonesia<br/>maksimum 500 karakter"]
    B --> C{Layanan LLM tersedia?}
    C -->|Tidak| D(["503 - pesan gangguan sementara<br/>arahkan ke pencarian manual<br/>TIDAK memengaruhi modul lain · NFR-A-05"])
    C -->|"Batas harian tercapai"| E(["Tampilkan waktu ketersediaan berikutnya<br/>FR-19.1 A5"])
    C -->|Ya| F["Server menyusun konteks:<br/>ROLE dan SCOPE saja<br/>nama & pengenal pribadi TIDAK dikirim · DP-AI-01"]

    F --> G["Model memilih tool; data difilter<br/>di LAPISAN QUERY dengan AuthContext<br/>BR-076 · SDD-AUTH-07"]
    G --> H["Jawaban di-STREAM<br/>token pertama 2 detik · AI-CTL-07"]
    H --> I{Jenis jawaban}

    I -->|"Data ditemukan"| J["Jawaban + RUJUKAN KONKRET<br/>kode aset, nama ruangan, nomor transaksi<br/>+ tautan aksi ke halaman terkait · 22.4"]
    I -->|"Data tidak ditemukan"| K(["Menyatakan tidak ditemukan<br/>DILARANG mengarang · BR-077"])
    I -->|"Di luar cakupan"| L(["Menyatakan keterbatasan<br/>+ arahkan ke menu relevan · FR-19.1 A1"])
    I -->|"Di luar hak akses pengguna"| M(["Tool mengembalikan data kosong<br/>chatbot menyatakan tidak dapat diakses<br/>FR-19.1 A6"])
    I -->|"Diminta melakukan aksi tulis"| N(["Menolak dengan sopan<br/>+ tautan ke form pengajuan · BR-075"])

    J --> O["Umpan balik jempol atas / bawah"]
    K --> O
    L --> O
    M --> O
    N --> O
    O --> P{Aksi pengguna}
    P -->|"Ikuti tautan"| Q(["Halaman terkait - panel menutup diri"])
    P -->|"Lanjut bertanya"| B
    P -->|"Lihat riwayat"| R(["P-14 Riwayat Chatbot<br/>hanya percakapan sendiri"])
```

**Batas yang tidak boleh dilewati perancang:** chatbot tidak pernah memiliki tombol yang mengubah data. Setiap saran aksi berbentuk **tautan ke formulir**, bukan aksi langsung (`BR-075`, `NO-11`).

### F-25 Konfigurasi approval rule & pratinjau

```mermaid
flowchart TD
    A["P-68 Approval Rules"] --> B["P-69 Editor: pilih jenis pengajuan"]
    B --> C["Susun kondisi: node grup AND/OR<br/>+ node predikat field/op/value<br/>maksimum 3 tingkat · Lampiran D.1"]
    C --> D{"Field yang ditawarkan"}
    D --> E["HANYA field yang berlaku bagi<br/>jenis pengajuan terpilih · Lampiran D.2"]
    E --> F["Susun langkah berurutan:<br/>approver role/pengguna, SLA jam,<br/>perilaku SLA, tujuan eskalasi"]
    F --> G["Tetapkan perilaku terminal:<br/>hold_and_alert bawaan atau auto_reject<br/>auto_approve TIDAK PERNAH ditawarkan · BR-039a"]
    G --> H["Tetapkan prioritas aturan"]

    H --> I{"Pratinjau"}
    I --> J["Masukkan skenario contoh"]
    J --> K["Panel menampilkan:<br/>aturan yang akan terpilih,<br/>seluruh aturan yang cocok + prioritasnya,<br/>rangkaian langkah yang akan terbentuk · RE-07"]
    K --> L{Hasil sesuai harapan?}
    L -->|Tidak| C
    L -->|Ya| M{Simpan}

    M -->|"422 INVALID_RULE_DEFINITION"| N["Galat ditampilkan PADA NODE bermasalah<br/>bukan satu pesan di atas formulir · RE-08"] --> C
    M -->|Berhasil| O["Aturan aktif, berlaku pada<br/>pengajuan BERIKUTNYA tanpa restart · PM-05"]
    O --> P(["Instance berjalan TETAP memakai<br/>snapshot aturan lama hingga selesai<br/>BR-040 · FR-10.1 A4"])
```

**Mengapa pratinjau adalah bagian dari alur, bukan fitur tambahan:** `RS-06` mencatat konfigurasi approval rules yang salah sebagai risiko berdampak **Tinggi** yang membuat pengajuan macet. Pratinjau adalah mitigasi yang PRD tetapkan (`FR-10.1 AC`), sehingga antarmuka wajib membuatnya sulit dilewati — panel pratinjau selalu terlihat, bukan tersembunyi di balik tombol.


---

### F-26 Permintaan bahan hingga diserahkan ⭐

```mermaid
flowchart TD
    A([Pemohon membutuhkan bahan]) --> B["P-84 Katalog Bahan:<br/>lihat saldo tersedia per lokasi"]
    B --> C["P-85 Ajukan: bahan, jumlah, keperluan"]
    C --> D{"Saldo mencukupi?"}
    D -->|Tidak| E["422 INSUFFICIENT_BALANCE<br/>tampilkan saldo + lokasi lain · BR-083"] --> B
    D -->|Ya| F{"Melampaui ambang<br/>approval? BR-086"}
    F -->|Tidak| G["Status: Disetujui<br/>TANPA instance approval"]
    F -->|Ya| H["Instance approval M-10<br/>Status: Menunggu Persetujuan"]
    H --> I{Keputusan approver}
    I -->|Tolak| J(["Status: Ditolak + alasan<br/>saldo TIDAK tersentuh"])
    I -->|Setuju Sebagian| K["Jumlah disetujui diturunkan"] --> G
    I -->|Setuju| G
    G --> L["NT-50 ke pemohon: siap diambil"]
    L --> M["Petugas buka P-87,<br/>catat jumlah diserahkan + penerima"]
    M --> N{"Melebihi jumlah disetujui?"}
    N -->|Ya| O["422 EXCEEDS_APPROVED_QTY · BR-089"] --> M
    N -->|Tidak| P["Saldo berkurang + transaksi PENGELUARAN<br/>saldo_sesudah tersimpan · BR-081 BR-092"]
    P --> Q{"Saldo menembus<br/>stok minimum?"}
    Q -->|Ya| R["NT-49 ke Petugas + Admin<br/>muncul di kartu Stok Menipis"] --> S
    Q -->|Tidak| S["NT-51 ke pemohon"]
    S --> T(["Selesai — TANPA jadwal pengembalian,<br/>tanpa denda, tanpa ganti rugi · BR-087"])
```

| Titik | Ketentuan | Rujukan |
|---|---|---|
| Permintaan disetujui | **Tidak** mengurangi saldo; saldo hanya berkurang saat penyerahan | `FR-22.4 AC` |
| Saldo berubah sebelum penyerahan | Penyerahan ditolak dan menampilkan saldo terkini; Petugas dapat menyerahkan sebagian | `FR-22.5 A2` |
| Pemisahan peran | Pemohon tidak pernah dapat menyerahkan kepada dirinya sendiri — `material.request` dan `material.issue` terpisah | `SDD-03 §4.3` |

**Mengapa cabang ambang berada di alur, bukan di konfigurasi belaka:** tanpa cabang `BR-086` yang terlihat, pengambilan satu spidol dan pengambilan satu dus tinta tampak identik bagi pengguna, padahal yang satu langsung dilayani dan yang lain menunggu approver. Cabang inilah yang membuat perbedaan waktu tunggu dapat dijelaskan di layar sejak awal.

### F-27 Stock opname bahan hingga saldo tersesuaikan

```mermaid
flowchart TD
    A([Petugas buat sesi opname domain BAHAN]) --> B["Sistem bekukan snapshot saldo<br/>per bahan per lokasi"]
    B --> C["MS-22 Sesi Opname Bahan:<br/>progres per lokasi penyimpanan"]
    C --> D["MS-23 Input Hitungan Fisik<br/>QR bahan melompat ke barisnya · BR-090"]
    D --> E["Sistem hitung selisih<br/>fisik vs saldo sistem"]
    E --> F{"Ada selisih<br/>tanpa keterangan?"}
    F -->|Ya| G["Laporan tidak dapat dikirim · BR-095"] --> D
    F -->|Tidak| H["Kirim laporan ke Pimpinan<br/>NT-31"]
    H --> I{Keputusan Pimpinan}
    I -->|Tolak| J["Sesi kembali Berjalan<br/>saldo TIDAK tersentuh"] --> D
    I -->|Setuju| K["Transaksi OPNAME sebesar selisih<br/>saldo tersesuaikan · BR-094"]
    K --> L(["Berita acara PDF + sesi read-only<br/>BR-059"])
```

Satu sesi hanya mencakup **satu domain** — memilih bahan dan aset sekaligus ditolak (`BR-093`). Alur aset yang sepadan adalah `F-18`.
