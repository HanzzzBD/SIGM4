# 12. System Workflow

## 12.1 Arsitektur Sistem Tingkat Tinggi

```mermaid
flowchart TB
    subgraph CLIENT["Lapisan Klien"]
        W["Web App<br/>React"]
        M["Mobile App<br/>React Native<br/>Android & iOS"]
        PUB["Halaman Publik Aset<br/>hasil scan QR"]
    end

    subgraph API["Lapisan Aplikasi — Express / Node.js"]
        GW["API Gateway & Middleware<br/>Auth · RBAC · Rate Limit · Logging"]
        SVC["Domain Services<br/>Aset · Lokasi · Reservasi · Peminjaman<br/>Approval · Maintenance · Audit · Pengadaan"]
        JOB["Scheduler & Worker<br/>Reminder · Status Terlambat<br/>WO Preventif · Ekspor Asinkron<br/>Slot Activation · TTL Expiry"]
        AI["AI Orchestrator<br/>Tool Calling · Guardrail Permission"]
        FILE["File Service<br/>Presigned URL · Validasi MIME"]
        AV["AV Scanner<br/>ClamAV"]
    end

    subgraph DATA["Lapisan Data"]
        DB[("Database Relasional<br/>PostgreSQL 15+")]
        CACHE[("Cache · Lock · Queue<br/>Redis")]
        OBJ[("Object Storage<br/>S3-compatible<br/>Dokumen · Foto · PDF")]
    end

    subgraph EXT["Layanan Eksternal"]
        FCM["Firebase Cloud Messaging"]
        LLM["Claude API<br/>Layanan LLM"]
    end

    W --> GW
    M --> GW
    PUB --> GW
    GW --> SVC
    SVC --> DB
    SVC --> CACHE
    SVC --> OBJ
    JOB --> DB
    JOB --> FCM
    SVC --> FCM
    GW --> AI
    AI --> SVC
    AI --> LLM
```

## 12.2 Alur Status Aset (State Diagram)

> **Penting (BR-005):** diagram ini menggambarkan **status operasional aset pada saat ini (*now*)**, bukan ketersediaannya di masa depan. Ketersediaan pada rentang tanggal dihitung dari `booking_slots` (Bab 26). Aset berstatus `Dipinjam` hari ini tetap dapat dipesan untuk minggu depan.

```mermaid
stateDiagram-v2
    [*] --> Tersedia: Aset didaftarkan / diterima dari pengadaan
    Tersedia --> Direservasi: Slot Confirmed mulai berlaku (waktu mulai tiba)
    Direservasi --> Tersedia: Reservasi dibatalkan / kedaluwarsa
    Direservasi --> Dipinjam: Serah terima dilakukan
    Dipinjam --> Tersedia: Dikembalikan kondisi Baik / Rusak Ringan
    Dipinjam --> DalamPerbaikan: Dikembalikan rusak & work order terbit
    Dipinjam --> TidakTersedia: Dikembalikan rusak, menunggu verifikasi
    Dipinjam --> TidakTersedia: Dinyatakan hilang
    Tersedia --> DalamPerbaikan: Work order dibuat
    DalamPerbaikan --> Tersedia: Perbaikan berhasil & diverifikasi
    DalamPerbaikan --> TidakTersedia: Tidak dapat diperbaiki
    Tersedia --> TidakTersedia: Kondisi Rusak Berat / Hilang
    TidakTersedia --> DalamPerbaikan: Perbaikan lanjutan diputuskan
    TidakTersedia --> [*]: Dihapuskan dari inventaris (M-21)

    note right of TidakTersedia
        Aset tidak dapat direservasi
        maupun dipinjam pada rentang
        waktu manapun
    end note
```

**Klarifikasi transisi `Dipinjam` → kondisi rusak (menyelesaikan ambiguitas FR-09.2 A1):**

| Situasi saat check-in | Status aset segera setelah check-in | Pemicu transisi berikutnya |
|---|---|---|
| Kondisi `Baik` / `Rusak Ringan` dan masih layak pakai | `Tersedia` | — |
| Kondisi `Rusak Ringan` namun perlu perbaikan, work order langsung dibuat | `Dalam Perbaikan` | Verifikasi work order (FR-12.4) |
| Kondisi `Rusak Berat` / `Tidak Lengkap`, work order belum dibuat | `Tidak Tersedia` | Pembuatan work order → `Dalam Perbaikan` |
| Dinyatakan `Hilang` | `Tidak Tersedia` | Rekonsiliasi opname atau berita acara (BR-012) |

Seluruh slot pemesanan mendatang atas aset yang berpindah ke `Dalam Perbaikan` atau `Tidak Tersedia` dibatalkan otomatis dan pemohonnya dinotifikasi (BR-048, NT-27).

## 12.3 Alur Status Pengajuan (State Diagram)

```mermaid
stateDiagram-v2
    [*] --> Draf: Pemohon menyusun pengajuan
    Draf --> MenungguPersetujuan: Diajukan
    MenungguPersetujuan --> MenungguPersetujuan: Disetujui pada level n, lanjut ke level n+1
    MenungguPersetujuan --> Disetujui: Disetujui pada level terakhir
    MenungguPersetujuan --> Ditolak: Ditolak pada level mana pun
    MenungguPersetujuan --> PerluRevisi: Approver meminta revisi
    PerluRevisi --> MenungguPersetujuan: Diajukan ulang oleh pemohon
    MenungguPersetujuan --> Dibatalkan: Dibatalkan pemohon
    Disetujui --> Dibatalkan: Dibatalkan sebelum pelaksanaan
    Disetujui --> Kedaluwarsa: Tidak diambil dalam 1x24 jam
    Disetujui --> Berlangsung: Waktu pelaksanaan tiba
    Berlangsung --> Selesai: Pelaksanaan berakhir
    Ditolak --> [*]
    Dibatalkan --> [*]
    Kedaluwarsa --> [*]
    Selesai --> [*]
```

## 12.4 Alur Kerja Harian Sistem (Scheduled Jobs)

```mermaid
flowchart LR
    subgraph SCH["Penjadwal Harian"]
        J1["00:05 — Perbarui status<br/>peminjaman terlambat"]
        J2["06:00 — Kirim pengingat<br/>H-1 jatuh tempo"]
        J3["06:15 — Terbitkan work order<br/>preventif H-7"]
        J4["06:30 — Notifikasi garansi<br/>akan berakhir H-30"]
        J5["07:00 — Ringkasan harian<br/>untuk Petugas & Pimpinan"]
        J6["23:00 — Batalkan reservasi<br/>tidak diambil 1x24 jam"]
        J7["23:30 — Arsipkan notifikasi<br/>& percakapan > 90 hari"]
        J8["01:00 — Pencadangan<br/>basis data"]
    end

    J1 --> N["Antrean Notifikasi"]
    J2 --> N
    J3 --> N
    J4 --> N
    J5 --> N
    J6 --> N
    N --> INAPP["Notifikasi In-App"]
    N --> PUSH["Push Notification via FCM"]
```

---


---

## 14.1 Use Case Keseluruhan

```mermaid
flowchart LR
    ADM(("Administrator"))
    SAR(("Petugas<br/>Sarpras"))
    PIM(("Pimpinan<br/>Sekolah"))
    TEK(("Teknisi"))
    GUR(("Guru"))
    STF(("Staf / TU"))
    SIS(("Siswa /<br/>OSIS"))

    subgraph SISTEM["Sistem SIGM4"]
        UC01["Kelola User & Role"]
        UC02["Konfigurasi Approval Rules"]
        UC03["Konfigurasi Parameter Sistem"]
        UC04["Lihat Activity Log"]
        UC05["Kelola Lokasi"]
        UC06["Kelola Inventaris Aset"]
        UC07["Cetak & Kelola QR Code"]
        UC08["Kelola Dokumen Aset"]
        UC09["Scan QR Aset"]
        UC10["Ajukan Reservasi Ruangan"]
        UC11["Ajukan Reservasi Barang"]
        UC12["Setujui / Tolak Pengajuan"]
        UC13["Proses Serah Terima"]
        UC14["Proses Pengembalian"]
        UC15["Kelola Denda"]
        UC16["Lapor Kerusakan"]
        UC17["Verifikasi Laporan Kerusakan"]
        UC18["Kelola Work Order"]
        UC19["Eksekusi Work Order"]
        UC20["Jalankan Stock Opname"]
        UC21["Setujui Hasil Opname"]
        UC22["Ajukan Usulan Pengadaan"]
        UC23["Catat Penerimaan Barang"]
        UC24["Lihat Dashboard"]
        UC25["Lihat Statistik & Analitik"]
        UC26["Gunakan Chatbot AI"]
        UC27["Kelola Notifikasi Pribadi"]
    end

    ADM --- UC01
    ADM --- UC02
    ADM --- UC03
    ADM --- UC04
    ADM --- UC24

    SAR --- UC05
    SAR --- UC06
    SAR --- UC07
    SAR --- UC08
    SAR --- UC09
    SAR --- UC12
    SAR --- UC13
    SAR --- UC14
    SAR --- UC15
    SAR --- UC17
    SAR --- UC18
    SAR --- UC20
    SAR --- UC23
    SAR --- UC24
    SAR --- UC25

    PIM --- UC12
    PIM --- UC21
    PIM --- UC24
    PIM --- UC25
    PIM --- UC04

    TEK --- UC09
    TEK --- UC16
    TEK --- UC19
    TEK --- UC24

    GUR --- UC09
    GUR --- UC10
    GUR --- UC11
    GUR --- UC16
    GUR --- UC22
    GUR --- UC24
    GUR --- UC26
    GUR --- UC27

    STF --- UC09
    STF --- UC10
    STF --- UC11
    STF --- UC16
    STF --- UC22
    STF --- UC26
    STF --- UC27

    SIS --- UC09
    SIS --- UC10
    SIS --- UC11
    SIS --- UC16
    SIS --- UC26
    SIS --- UC27
```


---

## Diagram yang Dipindahkan ke Modul

Process flow (Bab 13), sequence diagram (Bab 15), dan use case modul peminjaman (14.2) bersifat spesifik per modul, sehingga dipindahkan ke berkas modulnya (bagian 4 — Business Flow). Tidak ada salinan di sini.

| Diagram | Kini berada di |
|---|---|
| 13.1 Process Flow — Reservasi & Peminjaman Barang | [`m08-reservation-item.md`](../02-modules/m08-reservation-item.md) |
| 13.2 Process Flow — Laporan Kerusakan hingga Work Order Selesai | [`m11-damage-reports.md`](../02-modules/m11-damage-reports.md) |
| 13.3 Process Flow — Stock Opname | [`m13-audit-stocktake.md`](../02-modules/m13-audit-stocktake.md) |
| 13.4 Process Flow — Pengadaan Barang | [`m14-procurement.md`](../02-modules/m14-procurement.md) |
| 14.2 Use Case Modul Peminjaman (Detail Relasi) | [`m09-loans.md`](../02-modules/m09-loans.md) |
| 15.1 Login dengan 2FA | [`m01-auth.md`](../02-modules/m01-auth.md) |
| 15.2 Pengajuan Reservasi dengan Approval Berjenjang | [`m07-reservation-room.md`](../02-modules/m07-reservation-room.md) |
| 15.3 Serah Terima Peminjaman via Scan QR | [`m09-loans.md`](../02-modules/m09-loans.md) |
| 15.4 Pengembalian dengan Perhitungan Denda | [`m09-loans.md`](../02-modules/m09-loans.md) |
| 15.5 Laporan Kerusakan hingga Work Order | [`m11-damage-reports.md`](../02-modules/m11-damage-reports.md) |
| 15.6 Percakapan Chatbot AI dengan Tool Calling | [`m19-chatbot.md`](../02-modules/m19-chatbot.md) |
| 15.7 Stock Opname via Scan QR | [`m13-audit-stocktake.md`](../02-modules/m13-audit-stocktake.md) |
