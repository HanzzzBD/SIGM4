<!-- DIGENERATE OTOMATIS oleh scripts/gen_indexes.py — JANGAN SUNTING BERKAS INI.
     Sumber kebenaran setiap baris ada di berkas modul terkait (docs/02-modules/).
     Menyunting di sini akan hilang saat regenerasi berikutnya. -->

# Indeks Aksi Activity Log

> Setiap aksi dimiliki modul penerbitnya. Prinsip pencatatan di `../03-architecture/activity-log.md`.
> Total: **52** baris, dikumpulkan dari 21 berkas modul.

| Aksi | Keterangan | Pemilik |
|---|---|---|
| `ACCOUNT_LOCKED` / `ACCOUNT_UNLOCKED` | Penguncian akibat percobaan gagal | [M-01](../02-modules/m01-auth.md) |
| `ACTIVITY_LOG_VIEWED` / `ACTIVITY_LOG_EXPORTED` | Akses terhadap log itu sendiri | [M-18](../02-modules/m18-activity-log.md) |
| `ADMIN_BREAK_GLASS_RECOVERY` | Pemulihan darurat Administrator via CLI (FR-01.6); pelaku `SYSTEM:CLI` | [M-01](../02-modules/m01-auth.md) |
| `APPROVAL_DECIDED` | Keputusan beserta approver, catatan, dan level | [M-10](../02-modules/m10-approval.md) |
| `APPROVAL_DELEGATED` | Penetapan approver pengganti | [M-10](../02-modules/m10-approval.md) |
| `APPROVAL_ESCALATED` | Eskalasi akibat SLA terlampaui | [M-10](../02-modules/m10-approval.md) |
| `APPROVAL_INSTANCE_CREATED` | Termasuk aturan yang dipakai | [M-10](../02-modules/m10-approval.md) |
| `APPROVAL_RULE_CREATED` / `APPROVAL_RULE_UPDATED` / `APPROVAL_RULE_DEACTIVATED` | Perubahan konfigurasi | [M-10](../02-modules/m10-approval.md) |
| `APPROVAL_STEP_SKIPPED` | Termasuk alasan (mis. konflik kepentingan) | [M-10](../02-modules/m10-approval.md) |
| `ASSET_CONDITION_CHANGED` | Wajib menyertakan alasan | [M-04](../02-modules/m04-assets.md) |
| `ASSET_CREATED` / `ASSET_UPDATED` / `ASSET_DEACTIVATED` | Termasuk pembuatan massal N unit | [M-04](../02-modules/m04-assets.md) |
| `ASSET_DISPOSAL_PROPOSED` / `DECIDED` / `EXECUTED` / `CANCELLED` | Siklus penghapusan aset (M-21) | [M-21](../02-modules/m21-disposal.md) |
| `ASSET_IMPORTED` | Impor massal | [M-04](../02-modules/m04-assets.md) |
| `ASSET_MOVED` | Mutasi lokasi beserta asal dan tujuan | [M-04](../02-modules/m04-assets.md) |
| `ASSET_QR_PRINTED` | Pencetakan label beserta jumlah | [M-05](../02-modules/m05-qr.md) |
| `ASSET_QR_REGENERATED` | Regenerasi UUID QR | [M-05](../02-modules/m05-qr.md) |
| `ASSET_REINSTATED` | Pemulihan aset yang telah dihapuskan, beserta alasan | [M-21](../02-modules/m21-disposal.md) |
| `ASSET_STATUS_CHANGED` | Perubahan status termasuk yang otomatis oleh sistem | [M-04](../02-modules/m04-assets.md) |
| `AUDIT_ADJUSTMENT_APPLIED` | Penyesuaian data aset hasil opname | [M-13](../02-modules/m13-audit-stocktake.md) |
| `AUDIT_ITEM_SCANNED` | Hasil pemeriksaan per aset | [M-13](../02-modules/m13-audit-stocktake.md) |
| `AUDIT_SESSION_CREATED` / `SUBMITTED` / `APPROVED` / `REJECTED` / `CANCELLED` | Siklus opname | [M-13](../02-modules/m13-audit-stocktake.md) |
| `BORROWER_BLOCKED` / `BORROWER_UNBLOCKED` | Pemblokiran akibat kewajiban tertunggak | [M-09](../02-modules/m09-loans.md) |
| `CATEGORY_CREATED` / `CATEGORY_UPDATED` / `CATEGORY_DELETED` | Perubahan kategori | [M-04](../02-modules/m04-assets.md) |
| `CHAT_MESSAGE_SENT` | Metadata percakapan (tanpa merekam ulang isi di log audit) | [M-19](../02-modules/m19-chatbot.md) |
| `DAMAGE_REPORTED` / `DAMAGE_VERIFIED` / `DAMAGE_REJECTED` / `DAMAGE_CLOSED` | Siklus tiket | [M-11](../02-modules/m11-damage-reports.md) |
| `DOCUMENT_UPLOADED` / `DOCUMENT_DOWNLOADED` / `DOCUMENT_DELETED` | Termasuk pencatatan siapa mengunduh | [M-06](../02-modules/m06-documents.md) |
| `FINE_ISSUED` / `FINE_PAID` / `FINE_WAIVED` | Termasuk alasan pembebasan | [M-09](../02-modules/m09-loans.md) |
| `LOAN_CHECKIN` | Pengembalian beserta kondisi akhir | [M-09](../02-modules/m09-loans.md) |
| `LOAN_CHECKOUT` | Serah terima beserta unit dan kondisi awal | [M-09](../02-modules/m09-loans.md) |
| `LOAN_EXTENDED` | Perpanjangan yang disetujui | [M-09](../02-modules/m09-loans.md) |
| `LOAN_MARKED_LOST` | Penetapan barang hilang | [M-09](../02-modules/m09-loans.md) |
| `LOAN_UNIT_SUBSTITUTED` | Penggantian unit saat serah terima beserta alasan | [M-09](../02-modules/m09-loans.md) |
| `LOCATION_CREATED` / `LOCATION_UPDATED` / `LOCATION_DEACTIVATED` | Perubahan struktur lokasi | [M-03](../02-modules/m03-locations.md) |
| `LOGIN_SUCCESS` / `LOGIN_FAILED` | Termasuk IP dan perangkat | [M-01](../02-modules/m01-auth.md) |
| `LOGOUT` / `LOGOUT_ALL_DEVICES` | Pencabutan sesi | [M-01](../02-modules/m01-auth.md) |
| `MAINTENANCE_SCHEDULE_CREATED` / `UPDATED` / `DEACTIVATED` / `SKIPPED` | Jadwal preventif | [M-12](../02-modules/m12-maintenance.md) |
| `PASSWORD_CHANGED` | Tanpa merekam nilai password | [M-01](../02-modules/m01-auth.md) |
| `PASSWORD_RESET_REQUESTED` / `PASSWORD_RESET_ISSUED` / `PASSWORD_RESET_REJECTED` | Alur reset administratif | [M-01](../02-modules/m01-auth.md) |
| `PROCUREMENT_ASSETS_GENERATED` | Pembentukan aset dari penerimaan | [M-14](../02-modules/m14-procurement.md) |
| `PROCUREMENT_CREATED` / `SUBMITTED` / `DECIDED` | Siklus usulan | [M-14](../02-modules/m14-procurement.md) |
| `PROCUREMENT_RECEIVED` | Penerimaan barang beserta jumlah | [M-14](../02-modules/m14-procurement.md) |
| `REPORT_EXPORTED` | Ekspor laporan beserta jenis dan filter | [M-16](../02-modules/m16-analytics.md) |
| `RESERVATION_CREATED` / `RESERVATION_UPDATED` / `RESERVATION_CANCELLED` / `RESERVATION_EXPIRED` | Termasuk alasan pembatalan | [M-07](../02-modules/m07-reservation-room.md) |
| `ROLE_PERMISSION_UPDATED` | Perubahan matriks permission | [M-02](../02-modules/m02-users.md) |
| `SETTING_UPDATED` | Perubahan parameter sistem beserta nilai lama/baru | [M-20](../02-modules/m20-settings.md) |
| `TWO_FA_BACKUP_CODE_USED` | Pemakaian kode cadangan, termasuk sisa kode | [M-01](../02-modules/m01-auth.md) |
| `TWO_FA_ENABLED` / `TWO_FA_DISABLED` / `TWO_FA_RESET` | Perubahan 2FA | [M-01](../02-modules/m01-auth.md) |
| `USER_CREATED` / `USER_UPDATED` / `USER_DEACTIVATED` / `USER_REACTIVATED` | Manajemen akun | [M-02](../02-modules/m02-users.md) |
| `USER_IMPORTED` | Impor massal beserta ringkasan hasil | [M-02](../02-modules/m02-users.md) |
| `WORKORDER_COMPLETED` / `WORKORDER_VERIFIED` / `WORKORDER_RETURNED` / `WORKORDER_CANCELLED` | Penyelesaian | [M-12](../02-modules/m12-maintenance.md) |
| `WORKORDER_CREATED` / `WORKORDER_ASSIGNED` / `WORKORDER_STARTED` | Penugasan dan pelaksanaan | [M-12](../02-modules/m12-maintenance.md) |
| `WORKORDER_PROGRESS_UPDATED` | Termasuk perubahan biaya | [M-12](../02-modules/m12-maintenance.md) |
