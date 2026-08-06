# Daftar Periksa Penempatan (*Deployment*)

Setiap butir di bawah menegakkan sesuatu yang sudah ditetapkan `CD-01` … `CD-07` ([PRD](../../PRD/03-architecture/deployment-ops.md)) atau [`SDD-16`](../../SDD/16-infrastructure-deployment.md). Tidak ada aturan baru di sini — hanya urutan pelaksanaannya.

Butir yang tidak dicentang **menghentikan penempatan**. Tidak ada butir yang boleh dicentang berdasarkan ingatan; masing-masing punya cara verifikasi.

---

## A. Penempatan ke staging

Dijalankan pada setiap penggabungan `develop` → `staging` (`CD-03`).

### Sebelum

- [ ] Pipeline hijau pada `develop`: lint → unit → integrasi → uji otorisasi → SAST → SCA → build → image scan (`CD-01`)
- [ ] Cakupan logika bisnis inti ≥ 70% (`CD-02`, `NFR-M-03`)
- [ ] Tidak ada kerentanan High/Critical terbuka (`CD-02`, `ST-02`)
- [ ] Seluruh PR phase berjalan sudah tergabung ke `develop`
- [ ] Migration yang disertakan bersifat `expand` atau `migrate` — **bukan `contract`** (`CD-04`)
- [ ] Migration `down` teruji lokal (`CD-05`)

### Saat

- [ ] Job migration berjalan dengan akun ber-DDL, terpisah dari akun aplikasi (`CD-04`, `SEC-CFG-03`, `SDD-INF-03`)
- [ ] Job migration selesai **sebelum** instance baru menerima trafik (`SDD-INF-03`)
- [ ] Rolling deploy API dengan gerbang readiness (`SDD-INF-04`)
- [ ] Worker di-*drain* lalu diganti (`SDD-INF-05`)

### Sesudah

- [ ] `/health/ready` melaporkan seluruh dependensi (`NFR-A-07`, `OBS-06`)
- [ ] Ketiadaan `llm` atau `fcm` tidak menggagalkan `ready` (`SDD-OBS-06`)
- [ ] DAST berjalan (`ST-03`)
- [ ] Smoke test lolos: login · cari aset · ajukan reservasi · scan QR · buat tiket kerusakan (`CD-07`)
- [ ] Zona waktu container & basis data terverifikasi UTC (`INF-07`, `SDD-INF-09`)
- [ ] [`../IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

**Smoke test gagal di staging bukan alasan untuk melanjutkan.** Staging ada justru untuk ini.

---

## B. Penempatan ke produksi

Dijalankan **satu kali**, pada go-live. Rangkaian lengkapnya di [`../RELEASE-PLAN.md` §3](../RELEASE-PLAN.md).

### H-14

- [ ] Seluruh gerbang `GL-01` … `GL-12` terpenuhi ([PRD 29.3](../../PRD/01-product/delivery-plan.md))
- [ ] Satu gerbang gagal → penempatan **ditunda**, bukan dilanjutkan dengan catatan

### H-2

- [ ] Jendela penempatan diumumkan (`CD-06`, `NFR-A-03`)
- [ ] Jendela berada di luar jam operasional (`CD-06`)
- [ ] Penanggung jawab tiap langkah ditetapkan dengan nama, bukan peran

### H-1

- [ ] Backup penuh dijalankan **dan diverifikasi dengan restore**, bukan sekadar selesai (`BR-DR-03`, `PR-08-07`)
- [ ] Arsip WAL berjalan untuk PITR (`BR-DR-01`)
- [ ] Konfigurasi diekspor: parameter sistem, approval rules, matriks permission (`BR-DR-06`)
- [ ] Uji rollback terakhir lolos di staging (`GL-12`, `CD-05`)
- [ ] Image versi sebelumnya tersedia untuk rollback (`CD-05`)
- [ ] Migration `contract` **sudah dijalankan pada phase 08**, bukan malam ini (`PR-08-11`)

### Hari H

- [ ] 1 · Mode pemeliharaan aktif
- [ ] 2 · Backup terakhir sebelum perubahan (`BR-DR-01`)
- [ ] 3 · Job migration dengan akun ber-DDL (`CD-04`, `SDD-INF-03`)
- [ ] 4 · Rolling deploy API dengan gerbang readiness (`SDD-INF-04`)
- [ ] 5 · Drain + ganti worker (`SDD-INF-05`)
- [ ] 6 · Smoke test produksi lolos (`CD-07`)
- [ ] 7 · `/health` melaporkan seluruh dependensi (`NFR-A-07`)
- [ ] 8 · Mode pemeliharaan nonaktif
- [ ] 9 · Pemantauan intensif 2 jam; alarm terpasang pada penerima yang benar (`OBS-07`)

**Langkah 6 gagal → jalankan [`ROLLBACK-CHECKLIST.md`](ROLLBACK-CHECKLIST.md).** Bukan memperbaiki di tempat. Perbaikan tanpa pengujian di dalam jendela pemeliharaan adalah cara insiden kecil menjadi insiden besar.

### H+1

- [ ] Hypercare dimulai (`IMP-06`)
- [ ] Sistem manual masih berjalan paralel (`IMP-05`, maksimum 2 pekan)
- [ ] Angka baseline `IMP-04` sudah tercatat **sebelum** hari ini — bila belum, ia hilang selamanya

---

## C. Penempatan hotfix pasca go-live

- [ ] Cabang dari `main`, bukan dari `develop`
- [ ] Perubahan sekecil mungkin — hotfix bukan tempat perbaikan sekalian
- [ ] Diuji di staging lebih dulu, meski mendesak
- [ ] Backup terverifikasi bila menyentuh data
- [ ] Tag patch `vX.Y.Z+1` (`CD-03`)
- [ ] Smoke test produksi lolos (`CD-07`)
- [ ] **Di-*cherry-pick* ke `develop` pada hari yang sama**

Butir terakhir paling sering terlewat dan paling merugikan: rilis berikutnya memunculkan kembali cacat yang sudah diperbaiki.

---

## Yang membatalkan penempatan

| Pemicu | Tindakan |
|---|---|
| Pipeline merah | Batalkan; perbaiki sebabnya |
| Backup terakhir tidak terverifikasi | Batalkan sebelum langkah 3 |
| Migration `contract` tak terduga muncul di rangkaian | Batalkan; contract hanya `PR-08-11` |
| Satu gerbang `GL-xx` tidak terpenuhi | Tunda rilis (PRD 29.3) |
| Smoke test gagal | Rollback; jadwalkan ulang |
| Penanggung jawab langkah tidak tersedia | Tunda — penempatan produksi tidak dijalankan sendirian |

---

*Daftar ini menegakkan `CD-01` … `CD-07` dan [`SDD-16`](../../SDD/16-infrastructure-deployment.md). Ia tidak menetapkan aturan penempatan baru.*
