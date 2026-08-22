# Information Architecture — SIGM4 UX

> **Dokumentasi UX SIGM4** — [Overview](UX-SPEC.md) · **Information Architecture** · [Navigation](NAVIGATION.md) · [Page Specification](PAGE-SPECIFICATION.md) · [User Flows](USER-FLOWS.md) · [Decisions](DECISIONS.md)

**Berkas ini memuat:** [§3 Information Architecture](#3-information-architecture) · [§4 Sitemap](#4-sitemap)

Penomoran bagian dipertahankan dari UX-SPEC v1.0 agar seluruh rujukan silang tetap sahih — peta lengkap ada di [Peta bagian → berkas](UX-SPEC.md#peta-bagian--berkas). Prinsip desain, role, dan lingkup yang mendasari bagian ini berada di [`UX-SPEC.md`](UX-SPEC.md).

| Berkas tetangga | Kaitan |
|---|---|
| [`NAVIGATION.md`](NAVIGATION.md) | §5 menjabarkan bagaimana struktur IA §3 diwujudkan sebagai sidebar, topbar, dan breadcrumb |
| [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) | §6 memuat inventaris lengkap seluruh route yang muncul pada sitemap §4 |
| [`DECISIONS.md`](DECISIONS.md) | **UXD-01** adalah dasar pengelompokan lima grup domain kerja pada §3.1 |

---

# 3. Information Architecture

## 3.1 Prinsip penyusunan

21 modul PRD **tidak** dipetakan satu-ke-satu menjadi 21 entri menu. Ia dikelompokkan menjadi **lima grup domain kerja** (**UXD-01**) karena tiga alasan:

1. Tiga modul tidak pernah menjadi entri menu tersendiri — **M-15 Dashboard** adalah beranda, **M-17 Notifikasi** adalah pusat notifikasi + ikon lonceng, **M-19 Chatbot** adalah panel global.
2. Beberapa modul memiliki lebih dari satu entri menu — **M-04** memunculkan *Inventaris Aset* dan *Kategori Aset*; **M-09** memunculkan *Peminjaman* dan *Denda & Kewajiban*; **M-10** memunculkan *Persetujuan Saya* dan *Approval Rules* yang berada di grup berbeda.
3. Modul yang dipakai bersama dalam satu pekerjaan diletakkan berdekatan, sehingga pengguna jarang-pakai tidak perlu mengingat batas modul (`UX-06`).

## 3.2 Peta Information Architecture

```mermaid
flowchart TD
    ROOT["SIGM4"]

    ROOT --> BER["BERANDA"]
    ROOT --> AST["ASET & LOKASI"]
    ROOT --> PMF["PEMANFAATAN"]
    ROOT --> PRW["PERAWATAN"]
    ROOT --> PGW["PENGAWASAN"]
    ROOT --> SIS["SISTEM"]
    ROOT --> PRB["AKUN SAYA"]

    BER --> B1["Dashboard · M-15"]
    BER --> B2["Pusat Notifikasi · M-17"]

    AST --> A1["Inventaris Aset · M-04"]
    AST --> A2["Kategori Aset · M-04"]
    AST --> A3["Lokasi · M-03"]
    AST --> A4["Label QR · M-05"]
    AST --> A5["Dokumen Aset · M-06"]
    AST --> A6["Scan QR · M-05"]

    PMF --> P1["Kalender Ruangan · M-07"]
    PMF --> P2["Katalog Barang · M-08"]
    PMF --> P3["Reservasi · M-07 · M-08"]
    PMF --> P4["Peminjaman · M-09"]
    PMF --> P5["Denda & Kewajiban · M-09"]
    PMF --> P6["Persetujuan Saya · M-10"]

    PRW --> W1["Laporan Kerusakan · M-11"]
    PRW --> W2["Work Order · M-12"]
    PRW --> W3["Jadwal Pemeliharaan · M-12"]

    PGW --> G1["Stock Opname · M-13"]
    PGW --> G2["Pengadaan · M-14"]
    PGW --> G3["Penghapusan Aset · M-21"]
    PGW --> G4["Statistik & Analitik · M-16"]

    SIS --> S1["Pengguna & Role · M-02"]
    SIS --> S2["Permintaan Reset Password · M-01"]
    SIS --> S3["Approval Rules · M-10"]
    SIS --> S4["Parameter Sistem · M-20"]
    SIS --> S5["Activity Log · M-18"]
    SIS --> S6["Monitoring Chatbot · M-19"]

    PRB --> R1["Profil · M-01"]
    PRB --> R2["Keamanan & 2FA · M-01"]
    PRB --> R3["Preferensi Notifikasi · M-17"]

    GLB(["Panel Chatbot · M-19 — global, bukan entri menu"]) -.-> ROOT
```

## 3.3 Pemetaan 21 modul ke lokasi antarmuka

Tidak ada modul yang tidak terwakili. Kolom terakhir membuktikannya.

| Modul | Nama | Lokasi antarmuka |
|---|---|---|
| M-01 | Autentikasi & Akun | Layar publik (`/login`, `/lupa-password`) + grup **Akun Saya** + `/permintaan-reset-password` (grup Sistem) |
| M-02 | User & Role | Grup **Sistem** → Pengguna & Role |
| M-03 | Lokasi | Grup **Aset & Lokasi** → Lokasi |
| M-04 | Inventaris Aset | Grup **Aset & Lokasi** → Inventaris Aset + Kategori Aset |
| M-05 | QR Code | Grup **Aset & Lokasi** → Label QR + Scan QR; halaman publik `/a/{uuid}`; tab Scan mobile |
| M-06 | Dokumen Aset | Grup **Aset & Lokasi** → Dokumen Aset; tab *Dokumen* pada detail aset |
| M-07 | Reservasi Ruangan | Grup **Pemanfaatan** → Kalender Ruangan + Reservasi; tab *Jadwal Tetap* pada detail ruangan |
| M-08 | Reservasi Barang | Grup **Pemanfaatan** → Katalog Barang + Reservasi |
| M-09 | Peminjaman | Grup **Pemanfaatan** → Peminjaman + Denda & Kewajiban |
| M-10 | Approval Engine | Grup **Pemanfaatan** → Persetujuan Saya; grup **Sistem** → Approval Rules; komponen *Linimasa Approval* pada setiap detail pengajuan |
| M-11 | Laporan Kerusakan | Grup **Perawatan** → Laporan Kerusakan; aksi kontekstual pada scan QR |
| M-12 | Maintenance | Grup **Perawatan** → Work Order + Jadwal Pemeliharaan; tab *Riwayat Pemeliharaan* pada detail aset |
| M-13 | Audit & Opname | Grup **Pengawasan** → Stock Opname |
| M-14 | Pengadaan | Grup **Pengawasan** → Pengadaan |
| M-15 | Dashboard | **Beranda** — halaman `/` |
| M-16 | Analitik | Grup **Pengawasan** → Statistik & Analitik |
| M-17 | Notifikasi | Ikon lonceng pada topbar + halaman `/notifikasi` + **Akun Saya** → Preferensi Notifikasi |
| M-18 | Activity Log | Grup **Sistem** → Activity Log; tombol *Riwayat Perubahan* pada halaman detail entitas (`FR-18.2 A2`) |
| M-19 | Chatbot AI | Panel global (tombol mengambang) + `/chat` untuk riwayat; grup **Sistem** → Monitoring Chatbot |
| M-20 | Konfigurasi | Grup **Sistem** → Parameter Sistem (termasuk Kalender Akademik & Unit Kerja) |
| M-21 | Penghapusan Aset | Grup **Pengawasan** → Penghapusan Aset |

## 3.4 Kedalaman hierarki

Maksimum **tiga tingkat** dari beranda ke layar kerja mana pun.

```
Tingkat 1   Grup sidebar          ASET & LOKASI
Tingkat 2   Halaman daftar        Inventaris Aset            /aset
Tingkat 3   Halaman detail        Detail Aset LAB-KOM-0002   /aset/3021
            Tab dalam detail      Riwayat Pemeliharaan       /aset/3021/servis
```

Formulir panjang (wizard reservasi, editor approval rule, rekonsiliasi opname) berada pada **tingkat 3** sebagai route tersendiri, bukan tingkat 4 — sehingga tetap dapat ditautkan langsung (`UXP-01`).

---

# 4. Sitemap

## 4.1 Sitemap web — area publik & gerbang sesi

Urutan gerbang mencerminkan urutan middleware server (`SDD-AUTH-09`, `SDD-MOB` §4.5) sehingga klien tidak pernah menampilkan layar yang akan ditolak server.

```mermaid
flowchart TD
    PUB["/a/{asset_uuid}<br/>Halaman Publik Aset<br/>tanpa login · FR-05.2 A3"]
    PRIV["/privasi<br/>Pemberitahuan Privasi<br/>tanpa login · DP-01"]

    LOGIN["/login<br/>Login"]
    F2A["/login/2fa<br/>Verifikasi 2FA"]
    S2A["/login/2fa/aktivasi<br/>Aktivasi 2FA"]
    LUPA["/lupa-password<br/>Ajukan Reset"]
    GANTI["/ganti-password<br/>Ganti Password Wajib"]
    HOME["/<br/>Dashboard"]

    PUB -->|"Masuk untuk aksi lanjutan"| LOGIN
    LOGIN --> LUPA
    LUPA -->|"Pesan netral · FR-01.3 A1"| LOGIN
    LOGIN -->|"2FA aktif"| F2A
    LOGIN -->|"Role wajib 2FA, belum terdaftar"| S2A
    S2A --> HOME
    F2A --> HOME
    LOGIN -->|"must_change_password"| GANTI
    F2A -->|"must_change_password"| GANTI
    GANTI --> HOME
    LOGIN -->|"Tanpa 2FA & password normal"| HOME
    LOGIN --> PRIV
```

## 4.2 Sitemap web — area terautentikasi

```mermaid
flowchart LR
    HOME["/ · Dashboard"]

    subgraph AST["ASET & LOKASI"]
        A1["/aset"] --> A1D["/aset/{id}"]
        A1 --> A1N["/aset/baru"]
        A1 --> A1I["/aset/impor"]
        A1 --> A1M["/aset/mutasi"]
        A1D --> A1E["/aset/{id}/ubah"]
        A2["/kategori-aset"]
        A3["/lokasi"] --> A3R["/lokasi/ruangan/{id}"]
        A4["/label-qr"]
        A5["/dokumen-aset"]
        A6["/scan"]
    end

    subgraph PMF["PEMANFAATAN"]
        P1["/kalender-ruangan"] --> P3N["/reservasi/baru"]
        P2["/katalog-barang"] --> P3N
        P3N --> P3D["/reservasi/{id}"]
        P3["/reservasi"] --> P3D
        P4["/peminjaman"] --> P4D["/peminjaman/{id}"]
        P4S["/peminjaman/serah-terima"] --> P4D
        P5["/denda"] --> P5D["/denda/{id}"]
        P6["/persetujuan"] --> P6D["/persetujuan/{id}"]
    end

    subgraph PRW["PERAWATAN"]
        W1["/kerusakan"] --> W1D["/kerusakan/{id}"]
        W1 --> W1N["/kerusakan/baru"]
        W1D --> W2N["/work-order/baru"]
        W2["/work-order"] --> W2D["/work-order/{id}"]
        W2N --> W2D
        W3["/jadwal-pemeliharaan"] --> W3D["/jadwal-pemeliharaan/{id}"]
    end

    subgraph PGW["PENGAWASAN"]
        G1["/opname"] --> G1D["/opname/{id}"]
        G1 --> G1N["/opname/baru"]
        G1D --> G1R["/opname/{id}/rekonsiliasi"]
        G2["/pengadaan"] --> G2D["/pengadaan/{id}"]
        G2 --> G2N["/pengadaan/baru"]
        G2D --> G2R["/pengadaan/{id}/penerimaan"]
        G2R --> A1
        G3["/penghapusan"] --> G3D["/penghapusan/{id}"]
        G3 --> G3N["/penghapusan/baru"]
        G4["/analitik"] --> G4D["/analitik/{jenis}"]
    end

    subgraph SIS["SISTEM"]
        S1["/pengguna"] --> S1D["/pengguna/{id}"]
        S1 --> S1N["/pengguna/baru"]
        S1 --> S1I["/pengguna/impor"]
        S1 --> S1K["/pengguna/kenaikan-kelas"]
        S2["/role"] --> S2D["/role/{id}"]
        S3["/permintaan-reset-password"]
        S4["/approval-rules"] --> S4D["/approval-rules/{id}"]
        S4 --> S4N["/approval-rules/baru"]
        S5["/pengaturan"]
        S6["/activity-log"] --> S6D["/activity-log/{id}"]
        S7["/monitoring-chatbot"]
    end

    subgraph PRB["AKUN SAYA"]
        R1["/profil"]
        R2["/profil/keamanan"]
        R3["/profil/notifikasi"]
        R4["/notifikasi"]
        R5["/chat"]
    end

    HOME --> AST
    HOME --> PMF
    HOME --> PRW
    HOME --> PGW
    HOME --> SIS
    HOME --> PRB
```

## 4.3 Sitemap mobile

Mobile **tidak** mencerminkan seluruh 21 modul — hanya alur yang PRD nyatakan berjalan di lapangan (`SDD-MOB` §4.1, `UX-01`).

```mermaid
flowchart TD
    GATE["Gerbang startup<br/>versi · sesi · password · 2FA<br/>SDD-MOB §4.5"]
    GATE --> TABS

    subgraph TABS["Bottom Tab Bar — UXD-03"]
        T1["Beranda"]
        T2["Tugas<br/>adaptif per role"]
        T3["SCAN"]
        T4["Notifikasi"]
        T5["Profil"]
    end

    T1 --> M_KAT["Katalog & Kalender"]
    T1 --> M_AJU["Ajukan Reservasi"]
    T1 --> M_LPR["Lapor Kerusakan"]
    T1 --> M_CHAT["Chatbot"]

    T2 -->|"Teknisi"| M_WO["Work Order Saya"]
    T2 -->|"Petugas Sarpras"| M_ST["Serah Terima & Pengembalian"]
    T2 -->|"Petugas Sarpras"| M_OPN["Sesi Opname"]
    T2 -->|"Approver"| M_APR["Persetujuan Saya"]
    T2 -->|"Guru · Staf · Siswa"| M_MINE["Pengajuan & Peminjaman Saya"]

    T3 --> M_SCAN["Hasil Scan + aksi kontekstual"]
    M_SCAN --> M_ASET["Detail Aset"]
    M_SCAN --> M_ST
    M_SCAN --> M_LPR
    M_SCAN --> M_WO
    M_SCAN --> M_OPN

    T4 --> M_DEEP["Deep link ke objek"]
    T5 --> M_PROF["Profil · Keamanan · Preferensi Notifikasi"]

    M_WO --> M_EXE["Eksekusi Work Order"]
    M_OPN --> M_SCANOPN["Scan Beruntun Opname"]
    M_MINE --> M_LOAN["Detail Peminjaman"]
    M_LOAN --> M_EXT["Ajukan Perpanjangan"]
    M_MINE --> M_FINE["Denda Saya"]
```

## 4.4 Halaman sistem (tanpa entri menu)

Halaman berikut tidak pernah muncul di navigasi tetapi wajib ada — ia menutup `UX-05`.

| Route | Halaman | Dipicu oleh |
|---|---|---|
| `/tidak-punya-akses` | Tanpa Hak Akses | `403 FORBIDDEN` · `SDD-AUTH-08` · `MOB-DL-03` |
| `/tidak-ditemukan` | Halaman Tidak Ditemukan | Route tidak dikenali |
| `/data-tidak-tersedia` | Data Tidak Lagi Tersedia | Deep link ke objek terhapus/dibatalkan (`FR-17.1 A1`, `MOB-DL-04`) |
| `/gangguan` | Gangguan Sistem | `500` / `503`; menampilkan `request_id` yang dapat disalin (31.5) |
| *(mobile)* | Pembaruan Wajib | `426 UPGRADE_REQUIRED` (`MOB-VER-03`) — tidak dapat dilewati |
