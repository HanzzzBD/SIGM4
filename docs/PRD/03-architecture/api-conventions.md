# 17. API Requirements

## 17.1 Ketentuan Umum

| Aspek | Ketentuan |
|---|---|
| **Gaya API** | RESTful, JSON atas HTTPS |
| **Base URL** | `https://{host}/api/v1` |
| **Versioning** | Melalui path (`/api/v1`); versi lama didukung minimal 6 bulan setelah rilis versi baru |
| **Autentikasi** | Bearer JWT pada header `Authorization: Bearer {access_token}` |
| **Otorisasi** | Middleware RBAC memeriksa permission pada setiap endpoint |
| **Format Tanggal** | ISO 8601 UTC (`2026-08-05T07:30:00Z`) |
| **Paginasi** | Query `?page=1&per_page=25`; maksimum `per_page` = 100 |
| **Pengurutan & Filter** | Query `?sort=-created_at&filter[status]=Tersedia` |
| **Rate Limit** | 100 permintaan/menit per pengguna; header `X-RateLimit-*` disertakan |
| **Idempotensi** | Endpoint transaksional kritis **mewajibkan** header `Idempotency-Key` (UUIDv4), disimpan 24 jam. Kunci sama + body sama → respons tersimpan; kunci sama + body berbeda → `409 IDEMPOTENCY_KEY_REUSED` (Bab 26.5) |
| **Correlation ID** | Setiap respons menyertakan `X-Request-Id` untuk penelusuran log |
| **Dokumentasi** | OpenAPI 3.0, tersedia di `/api/docs` (dibatasi lingkungan non-produksi) |

## 17.2 Format Respons Baku

**Sukses — objek tunggal**
```json
{
  "success": true,
  "data": { "id": 101, "kode_barang": "LAB-KOM-0001", "nama": "Komputer Lab 1" },
  "meta": null
}
```

**Sukses — daftar terpaginasi**
```json
{
  "success": true,
  "data": [ { "id": 101 }, { "id": 102 } ],
  "meta": {
    "page": 1,
    "per_page": 25,
    "total": 4820,
    "total_pages": 193
  }
}
```

**Galat**
```json
{
  "success": false,
  "error": {
    "code": "RESERVATION_CONFLICT",
    "message": "Slot waktu yang dipilih sudah dipesan pengguna lain.",
    "details": [
      { "field": "waktu_mulai", "message": "Bentrok dengan reservasi RSV-RG-2026-0087" }
    ]
  },
  "request_id": "req_01J8XK2..."
}
```

## 17.3 Kode Status & Kode Galat

| HTTP | Kondisi | Contoh `error.code` |
|---|---|---|
| 200 | Berhasil (baca/ubah) | — |
| 201 | Berhasil dibuat | — |
| 204 | Berhasil tanpa konten | — |
| 400 | Permintaan tidak valid | `INVALID_REQUEST` |
| 401 | Belum terautentikasi / token kedaluwarsa | `UNAUTHENTICATED`, `TOKEN_EXPIRED` |
| 403 | Tidak memiliki hak akses | `FORBIDDEN`, `INSUFFICIENT_PERMISSION` |
| 404 | Sumber daya tidak ditemukan | `NOT_FOUND` |
| 409 | Konflik status data | `RESERVATION_CONFLICT`, `ASSET_NOT_AVAILABLE`, `DUPLICATE_CODE`, `APPROVAL_ALREADY_DECIDED`, `IDEMPOTENCY_KEY_REUSED`, `REQUEST_IN_PROGRESS` |
| 422 | Validasi bisnis gagal | `VALIDATION_ERROR`, `BORROWER_BLOCKED`, `DURATION_EXCEEDED` |
| 422 | Validasi aturan approval gagal | `INVALID_RULE_DEFINITION` |
| 423 | Akun terkunci | `ACCOUNT_LOCKED` |
| 426 | Versi aplikasi mobile tidak lagi didukung | `UPGRADE_REQUIRED` |
| 429 | Melebihi rate limit | `RATE_LIMIT_EXCEEDED` |
| 500 | Kesalahan internal | `INTERNAL_ERROR` |
| 503 | Layanan eksternal tidak tersedia | `LLM_UNAVAILABLE`, `STORAGE_UNAVAILABLE` |

## 17.4 Daftar Endpoint Utama

> **Dipindahkan.** Seluruh baris endpoint kini dimiliki modulnya masing-masing (bagian 7 pada tiap berkas di [`../02-modules/`](../02-modules/)). Daftar menyeluruh digenerate di [`api-index.md`](../_generated/api-index.md).

---

## 17.5 Ketentuan Keamanan API

1. Seluruh endpoint kecuali `/auth/login`, `/auth/password/forgot`, dan `/public/assets/{uuid}` memerlukan autentikasi.
2. Endpoint `/public/assets/{uuid}` hanya mengembalikan atribut non-sensitif dan memiliki rate limit lebih ketat (20 permintaan/menit per IP). Pengenal berupa **UUIDv4** sehingga tidak dapat dienumerasi berurutan; halaman ini menyertakan header `X-Robots-Tag: noindex, nofollow` agar tidak terindeks mesin pencari, dan **tidak pernah** menampilkan nilai perolehan, biaya, dokumen, foto berisi wajah, maupun identitas peminjam (DP-05).
3. Setiap endpoint memvalidasi permission di sisi server; kegagalan menghasilkan 403 tanpa membocorkan keberadaan data.
4. Endpoint daftar selalu menerapkan penyaringan berdasarkan cakupan data role pengguna (mis. Guru hanya melihat transaksi miliknya).
5. Seluruh input divalidasi skema (tipe, panjang, rentang, enum) sebelum mencapai lapisan layanan.
6. **Alur unggah berkas (ditetapkan pada audit):** klien meminta *presigned upload URL* melalui `POST /files/presign`, mengunggah langsung ke object storage, lalu mendaftarkan berkas melalui `POST /files/confirm`. Server memvalidasi MIME dan ukuran pada tahap presign, dan berkas berstatus `pending` sampai pemindaian anti-malware selesai. Berkas berstatus `pending` atau `infected` **tidak pernah** dapat diunduh (NFR-S-08). Pendekatan ini mencegah berkas besar melewati proses API dan memenuhi NFR-SC-04.
7. Endpoint transaksional kritis (`/reservations`, `/loans/checkout`, `/loans/{id}/checkin`, `/approvals/{id}/decide`) bersifat idempoten dan memakai penguncian tingkat baris.

---
