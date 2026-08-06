# Skrip Migrasi (sekali pakai)

Skrip di folder ini dipakai untuk **migrasi satu kali** dari struktur `docs/PRD/`
(pemecahan per bab) menjadi struktur dokumentasi engineering saat ini.

Sumber masukannya (`docs/PRD/`) sudah dihapus setelah migrasi selesai dan diaudit,
karena menjadi duplikat penuh dari `docs/*` dan melanggar prinsip Zero Duplication.

**Skrip ini tidak dapat dijalankan ulang** dan disimpan hanya sebagai jejak audit
proses migrasi.

Untuk pekerjaan sehari-hari gunakan:

| Skrip | Fungsi |
|---|---|
| `../gen_indexes.py` | Regenerasi 4 indeks pusat dari berkas modul |
| `../gen_trace.py` | Regenerasi papan skor traceability |
| `../audit_docs.py` | Audit kehilangan requirement & tautan rusak |

Acuan verifikasi: `PRD.v1.1.full.md` (SHA-256 `ef24c261…4d4d57`).
