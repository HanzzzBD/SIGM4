"""Peta kepemilikan baris untuk perakitan modul self-contained.

PRINSIP: setiap baris (BR, NT, endpoint, aksi log, entitas, permission) dimiliki
oleh TEPAT SATU modul. Tidak ada duplikasi. Modul lain yang terpengaruh merujuk
lewat ID pada bagian "Related Modules", bukan menyalin.

Aturan kepemilikan bila sebuah baris berlaku untuk >1 modul:
  - Pemilik = modul yang paling awal dalam siklus hidup / yang menerbitkan aturan.
  - Modul lain mencatatnya pada "Related Modules" + "Open Issues" agar terlihat.
Keputusan kepemilikan bersama ini DILAPORKAN pada audit Phase 2, bukan disembunyikan.
"""

# slug modul -> (nomor modul, judul, judul PRD asli)
MODULES = [
    ("m01-auth",              "M-01", "Autentikasi & Manajemen Akun"),
    ("m02-users",             "M-02", "Manajemen User & Role"),
    ("m03-locations",         "M-03", "Manajemen Lokasi"),
    ("m04-assets",            "M-04", "Inventaris Aset"),
    ("m05-qr",                "M-05", "QR Code Barang"),
    ("m06-documents",         "M-06", "Dokumen Aset"),
    ("m07-reservation-room",  "M-07", "Reservasi Ruangan"),
    ("m08-reservation-item",  "M-08", "Reservasi Barang"),
    ("m09-loans",             "M-09", "Peminjaman & Pengembalian"),
    ("m10-approval",          "M-10", "Approval Workflow Engine"),
    ("m11-damage-reports",    "M-11", "Laporan Kerusakan"),
    ("m12-maintenance",       "M-12", "Maintenance Management"),
    ("m13-audit-stocktake",   "M-13", "Audit & Stock Opname"),
    ("m14-procurement",       "M-14", "Pengadaan Barang"),
    ("m15-dashboard",         "M-15", "Dashboard Monitoring"),
    ("m16-analytics",         "M-16", "Statistik & Analitik"),
    ("m17-notifications",     "M-17", "Notifikasi"),
    ("m18-activity-log",      "M-18", "Activity Log"),
    ("m19-chatbot",           "M-19", "Chatbot AI"),
    ("m20-settings",          "M-20", "Konfigurasi Sistem"),
    ("m21-disposal",          "M-21", "Penghapusan Aset"),
    ("m22-materials",         "M-22", "Manajemen Bahan"),
]

# Berkas sumber hasil pemecahan sebelumnya (docs/PRD/02-modules/...) -> slug baru
SOURCE_MODULE_FILE = {
    "m01-auth": "m01-autentikasi.md",
    "m02-users": "m02-user-role.md",
    "m03-locations": "m03-lokasi.md",
    "m04-assets": "m04-inventaris-aset.md",
    "m05-qr": "m05-qr-code.md",
    "m06-documents": "m06-dokumen-aset.md",
    "m07-reservation-room": "m07-reservasi-ruangan.md",
    "m08-reservation-item": "m08-reservasi-barang.md",
    "m09-loans": "m09-peminjaman-pengembalian.md",
    "m10-approval": "m10-approval-engine.md",
    "m11-damage-reports": "m11-laporan-kerusakan.md",
    "m12-maintenance": "m12-maintenance.md",
    "m13-audit-stocktake": "m13-audit-stock-opname.md",
    "m14-procurement": "m14-pengadaan.md",
    "m15-dashboard": "m15-dashboard.md",
    "m16-analytics": "m16-statistik-analitik.md",
    "m17-notifications": "m17-notifikasi.md",
    "m18-activity-log": "m18-activity-log.md",
    "m19-chatbot": "m19-chatbot.md",
    "m20-settings": "m20-konfigurasi-sistem.md",
    "m21-disposal": "m21-penghapusan-aset.md",
}

# ── Business Rules ────────────────────────────────────────────────────────────
BR_OWNER = {
    "m04-assets": ["BR-001", "BR-002", "BR-003", "BR-004", "BR-005", "BR-005a", "BR-005b",
                   "BR-006", "BR-007", "BR-008", "BR-009", "BR-010", "BR-011", "BR-012"],
    "m03-locations": ["BR-013", "BR-014", "BR-015", "BR-016"],
    "m07-reservation-room": ["BR-017", "BR-018", "BR-019", "BR-020", "BR-021", "BR-022",
                             "BR-023", "BR-023a", "BR-023b", "BR-023c",
                             "BR-024", "BR-024a", "BR-024b", "BR-025"],
    "m09-loans": ["BR-026", "BR-026a", "BR-027", "BR-028", "BR-028a", "BR-028b", "BR-028c",
                  "BR-028d", "BR-028e", "BR-029", "BR-030", "BR-031", "BR-032", "BR-033", "BR-034"],
    "m10-approval": ["BR-035", "BR-036", "BR-037", "BR-038", "BR-039", "BR-039a",
                     "BR-040", "BR-041", "BR-042", "BR-043"],
    "m11-damage-reports": ["BR-044", "BR-045"],
    "m12-maintenance": ["BR-046", "BR-047", "BR-048", "BR-049", "BR-050", "BR-051", "BR-052", "BR-053"],
    "m13-audit-stocktake": ["BR-054", "BR-055", "BR-056", "BR-057", "BR-058", "BR-059"],
    "m14-procurement": ["BR-060", "BR-061", "BR-062", "BR-063", "BR-064", "BR-065"],
    "m21-disposal": ["BR-065a", "BR-065b", "BR-065c", "BR-065d", "BR-065e", "BR-065f", "BR-065g"],
    "m02-users": ["BR-066", "BR-067", "BR-068", "BR-069", "BR-073", "BR-074"],
    "m01-auth": ["BR-070", "BR-070a", "BR-070b", "BR-070c"],
    "m18-activity-log": ["BR-071", "BR-072"],
    "m19-chatbot": ["BR-075", "BR-076", "BR-077", "BR-078", "BR-079"],
}

# Aturan bersama: modul -> daftar (ID, pemilik). Dirujuk, TIDAK disalin.
BR_SHARED_REF = {
    "m08-reservation-item": [("BR-017", "m07"), ("BR-018", "m07"), ("BR-020", "m07"),
                             ("BR-021", "m07"), ("BR-022", "m07"), ("BR-023", "m07"),
                             ("BR-023a", "m07"), ("BR-023b", "m07"), ("BR-023c", "m07"),
                             ("BR-024", "m07"), ("BR-024a", "m07"), ("BR-024b", "m07"),
                             ("BR-025", "m07"), ("BR-030", "m09")],
    "m05-qr": [("BR-001", "m04"), ("BR-002", "m04")],
    "m06-documents": [("BR-073", "m02")],
    "m11-damage-reports": [("BR-032", "m09"), ("BR-052", "m12")],
    "m13-audit-stocktake": [("BR-012", "m04")],
    "m21-disposal": [("BR-008", "m04"), ("BR-012", "m04"), ("BR-035", "m10")],
    "m15-dashboard": [("BR-073", "m02"), ("BR-074", "m02")],
    "m16-analytics": [("BR-073", "m02"), ("BR-074", "m02")],
    "m12-maintenance": [("BR-005b", "m04")],
    "m09-loans": [("BR-005", "m04"), ("BR-017", "m07")],
}

# ── Notifikasi ────────────────────────────────────────────────────────────────
NT_OWNER = {
    "m10-approval": ["NT-01", "NT-02", "NT-03", "NT-04", "NT-05", "NT-06", "NT-07", "NT-47"],
    "m07-reservation-room": ["NT-08", "NT-09", "NT-46"],
    "m09-loans": ["NT-10", "NT-11", "NT-12", "NT-13", "NT-14", "NT-15", "NT-16", "NT-17", "NT-18"],
    "m11-damage-reports": ["NT-19", "NT-20", "NT-21"],
    "m12-maintenance": ["NT-22", "NT-23", "NT-24", "NT-25", "NT-26", "NT-27", "NT-28", "NT-29"],
    "m13-audit-stocktake": ["NT-30", "NT-31", "NT-32", "NT-33"],
    "m14-procurement": ["NT-34", "NT-35", "NT-36"],
    "m01-auth": ["NT-37", "NT-38", "NT-38a", "NT-39"],
    "m02-users": ["NT-40", "NT-48"],
    "m16-analytics": ["NT-42"],
    "m21-disposal": ["NT-43", "NT-44", "NT-45"],
    "m15-dashboard": ["NT-41"],
}

# ── Aksi Activity Log (kunci = teks kode aksi pada kolom pertama) ─────────────
LOG_OWNER = {
    "m01-auth": ["LOGIN_SUCCESS", "LOGOUT", "ACCOUNT_LOCKED", "PASSWORD_CHANGED",
                 "PASSWORD_RESET_REQUESTED", "TWO_FA_ENABLED", "TWO_FA_BACKUP_CODE_USED",
                 "ADMIN_BREAK_GLASS_RECOVERY"],
    "m02-users": ["USER_CREATED", "USER_IMPORTED", "ROLE_PERMISSION_UPDATED"],
    "m04-assets": ["ASSET_CREATED", "ASSET_CONDITION_CHANGED", "ASSET_STATUS_CHANGED",
                   "ASSET_MOVED", "ASSET_IMPORTED", "CATEGORY_CREATED"],
    "m05-qr": ["ASSET_QR_REGENERATED", "ASSET_QR_PRINTED"],
    "m03-locations": ["LOCATION_CREATED"],
    "m06-documents": ["DOCUMENT_UPLOADED"],
    "m07-reservation-room": ["RESERVATION_CREATED"],
    "m09-loans": ["LOAN_CHECKOUT", "LOAN_UNIT_SUBSTITUTED", "LOAN_CHECKIN", "LOAN_EXTENDED",
                  "LOAN_MARKED_LOST", "FINE_ISSUED", "BORROWER_BLOCKED"],
    "m10-approval": ["APPROVAL_RULE_CREATED", "APPROVAL_INSTANCE_CREATED", "APPROVAL_DECIDED",
                     "APPROVAL_STEP_SKIPPED", "APPROVAL_ESCALATED", "APPROVAL_DELEGATED"],
    "m11-damage-reports": ["DAMAGE_REPORTED"],
    "m12-maintenance": ["WORKORDER_CREATED", "WORKORDER_PROGRESS_UPDATED", "WORKORDER_COMPLETED",
                        "MAINTENANCE_SCHEDULE_CREATED"],
    "m13-audit-stocktake": ["AUDIT_SESSION_CREATED", "AUDIT_ITEM_SCANNED", "AUDIT_ADJUSTMENT_APPLIED"],
    "m14-procurement": ["PROCUREMENT_CREATED", "PROCUREMENT_RECEIVED", "PROCUREMENT_ASSETS_GENERATED"],
    "m21-disposal": ["ASSET_DISPOSAL_PROPOSED", "ASSET_REINSTATED"],
    "m20-settings": ["SETTING_UPDATED"],
    "m16-analytics": ["REPORT_EXPORTED"],
    "m18-activity-log": ["ACTIVITY_LOG_VIEWED"],
    "m19-chatbot": ["CHAT_MESSAGE_SENT"],
}

# ── Endpoint (dicocokkan dengan awalan path pada kolom Endpoint) ──────────────
API_OWNER = {
    "m01-auth": ["/auth/", "/me"],
    "m02-users": ["/users", "/roles"],
    "m03-locations": ["/locations/tree", "/buildings", "/areas", "/rooms/{id}"],
    "m04-assets": ["/assets", "/assets/{id}", "/asset-categories", "/rooms/{id}/assets"],
    "m05-qr": ["/assets/by-uuid/", "/public/assets/", "/assets/qr/print"],
    "m06-documents": ["/assets/{id}/documents", "/files/presign", "/files/confirm"],
    "m07-reservation-room": ["/rooms/availability", "/reservations"],
    "m08-reservation-item": ["/assets/availability"],
    "m09-loans": ["/loans", "/fines"],
    "m10-approval": ["/approval-rules", "/approvals"],
    "m11-damage-reports": ["/damage-reports"],
    "m12-maintenance": ["/work-orders", "/maintenance-schedules", "/assets/{id}/service-history"],
    "m13-audit-stocktake": ["/audit-sessions"],
    "m14-procurement": ["/procurements"],
    "m21-disposal": ["/asset-disposals", "/assets/{id}/reinstate"],
    "m15-dashboard": ["/dashboard"],
    "m16-analytics": ["/analytics"],
    "m17-notifications": ["/notifications", "/device-tokens"],
    "m18-activity-log": ["/activity-logs"],
    "m19-chatbot": ["/chat"],
    "m20-settings": ["/settings"],
}

# ── Entitas basis data ────────────────────────────────────────────────────────
ENTITY_OWNER = {
    "m01-auth": ["password_reset_requests"],
    "m02-users": ["users", "roles", "permissions", "role_permissions"],
    "m03-locations": ["buildings", "areas", "rooms"],
    "m04-assets": ["assets", "asset_categories", "asset_movements",
                   "asset_condition_history", "asset_photos"],
    "m06-documents": ["asset_documents", "stored_files"],
    "m07-reservation-room": ["reservations", "reservation_items", "room_fixed_schedules"],
    "m09-loans": ["loans", "loan_items", "fines"],
    "m10-approval": ["approval_rules", "approval_rule_steps", "approval_instances", "approval_steps"],
    "m11-damage-reports": ["damage_reports", "damage_report_photos"],
    "m12-maintenance": ["work_orders", "work_order_costs", "maintenance_schedules"],
    "m13-audit-stocktake": ["audit_sessions", "audit_items", "audit_new_findings"],
    "m14-procurement": ["procurements", "procurement_items", "procurement_receipts"],
    "m17-notifications": ["notifications", "device_tokens"],
    "m18-activity-log": ["activity_logs"],
    "m19-chatbot": ["chat_sessions", "chat_messages"],
    "m20-settings": ["system_settings"],
    "m21-disposal": ["asset_disposals", "asset_disposal_items"],
}

# ── Permission (kode dari Lampiran C) ─────────────────────────────────────────
PERM_OWNER = {
    "m02-users": ["user.view", "user.create", "user.update", "user.reset_password",
                  "user.reset_2fa", "role.view", "role.update"],
    "m03-locations": ["location.view", "location.manage"],
    "m04-assets": ["category.manage", "asset.view", "asset.view_financial", "asset.create",
                   "asset.update", "asset.update_condition", "asset.deactivate", "asset.export"],
    "m05-qr": ["asset.qr_print", "asset.qr_regenerate"],
    "m06-documents": ["asset_document.view", "asset_document.manage"],
    "m07-reservation-room": ["reservation.view", "reservation.create", "reservation.cancel_own",
                             "reservation.cancel_any", "reservation.urgent",
                             "reservation.fixed_schedule"],
    "m09-loans": ["loan.view", "loan.manage", "loan.direct", "loan.extend",
                  "fine.view", "fine.manage", "fine.waive"],
    "m10-approval": ["approval_rule.view", "approval_rule.manage", "approval.view",
                     "approval.decide", "approval.delegate"],
    "m11-damage-reports": ["damage.create", "damage.view", "damage.verify"],
    "m12-maintenance": ["workorder.view", "workorder.create", "workorder.execute",
                        "workorder.verify", "maintenance.manage", "maintenance.view_cost"],
    "m13-audit-stocktake": ["audit.view", "audit.manage", "audit.execute", "audit.approve"],
    "m14-procurement": ["procurement.view", "procurement.create", "procurement.approve",
                        "procurement.receive"],
    "m21-disposal": ["disposal.view", "disposal.create", "disposal.approve",
                     "disposal.execute", "disposal.reinstate"],
    "m15-dashboard": ["dashboard.view"],
    "m16-analytics": ["report.view", "report.export"],
    "m17-notifications": ["notification.manage_own"],
    "m18-activity-log": ["activity_log.view", "activity_log.export"],
    "m19-chatbot": ["chat.use", "chat.monitor"],
    "m20-settings": ["setting.view", "setting.manage"],
}

# ── Diagram per-modul (judul sub-bab pada berkas sumber) ──────────────────────
DIAGRAM_OWNER = {
    "m01-auth": [("15-sequence-diagram.md", "## 15.1 Login dengan 2FA")],
    "m07-reservation-room": [("15-sequence-diagram.md", "## 15.2 Pengajuan Reservasi dengan Approval Berjenjang")],
    "m08-reservation-item": [("13-process-flow.md", "## 13.1 Process Flow — Reservasi & Peminjaman Barang")],
    "m09-loans": [("15-sequence-diagram.md", "## 15.3 Serah Terima Peminjaman via Scan QR"),
                  ("15-sequence-diagram.md", "## 15.4 Pengembalian dengan Perhitungan Denda"),
                  ("14-use-case-diagram.md", "## 14.2 Use Case Modul Peminjaman (Detail Relasi)")],
    "m11-damage-reports": [("15-sequence-diagram.md", "## 15.5 Laporan Kerusakan hingga Work Order"),
                           ("13-process-flow.md", "## 13.2 Process Flow — Laporan Kerusakan hingga Work Order Selesai")],
    "m13-audit-stocktake": [("15-sequence-diagram.md", "## 15.7 Stock Opname via Scan QR"),
                            ("13-process-flow.md", "## 13.3 Process Flow — Stock Opname")],
    "m14-procurement": [("13-process-flow.md", "## 13.4 Process Flow — Pengadaan Barang")],
    "m19-chatbot": [("15-sequence-diagram.md", "## 15.6 Percakapan Chatbot AI dengan Tool Calling")],
}

# ── Dependensi antar modul (untuk bagian "Dependencies" & "Related Modules") ──
DEPENDS_ON = {
    "m01-auth": ["m02-users"],
    "m02-users": [],
    "m03-locations": [],
    "m04-assets": ["m03-locations", "m14-procurement"],
    "m05-qr": ["m04-assets"],
    "m06-documents": ["m04-assets"],
    "m07-reservation-room": ["m03-locations", "m10-approval"],
    "m08-reservation-item": ["m04-assets", "m10-approval", "m07-reservation-room"],
    "m09-loans": ["m08-reservation-item", "m10-approval", "m11-damage-reports"],
    "m10-approval": ["m02-users"],
    "m11-damage-reports": ["m04-assets", "m03-locations"],
    "m12-maintenance": ["m11-damage-reports", "m04-assets"],
    "m13-audit-stocktake": ["m04-assets", "m05-qr", "m10-approval"],
    "m14-procurement": ["m10-approval", "m04-assets"],
    "m15-dashboard": ["m02-users"],
    "m16-analytics": ["m04-assets", "m09-loans", "m12-maintenance"],
    "m17-notifications": ["m02-users"],
    "m18-activity-log": [],
    "m19-chatbot": ["m02-users", "m04-assets"],
    "m20-settings": [],
    "m21-disposal": ["m04-assets", "m10-approval", "m13-audit-stocktake"],
}

# ── Catatan kepemilikan bersama yang WAJIB muncul di "Open Issues" ────────────
OPEN_ISSUES = {
    "m07-reservation-room": [
        "Endpoint `/reservations`, `/reservations/{id}`, dan `/reservations/{id}/cancel` melayani "
        "reservasi ruangan **dan** barang. Untuk menjaga aturan satu-pemilik, seluruh baris tersebut "
        "ditempatkan di modul ini dan dirujuk oleh M-08. Perlu keputusan apakah pemisahan endpoint "
        "per jenis reservasi diinginkan pada tahap desain teknis (SDD).",
        "BR-017 … BR-025 berlaku untuk reservasi ruangan maupun barang; dimiliki modul ini dan "
        "dirujuk oleh M-08.",
    ],
    "m08-reservation-item": [
        "Modul ini memakai endpoint dan Business Rules yang dimiliki M-07 (lihat Related Modules). "
        "Tidak ada salinan di berkas ini — perubahan aturan dilakukan di M-07.",
    ],
    "m09-loans": [
        "BR-030 (pemblokiran pemohon) ditegakkan saat pengajuan reservasi di M-07/M-08, "
        "namun aturannya dimiliki modul ini karena bersumber dari kewajiban peminjaman.",
    ],
    "m11-damage-reports": [
        "BR-032 (barang kembali rusak menghasilkan tiket otomatis) dimiliki M-09; "
        "modul ini adalah konsumennya.",
    ],
    "m15-dashboard": [
        "Rincian isi tiap kartu dashboard berada di `04-frontend/dashboards.md` karena bersifat "
        "spesifikasi antarmuka, bukan aturan bisnis.",
    ],
    "m17-notifications": [
        "Katalog notifikasi NT-01…NT-51 tidak berada di modul ini; setiap baris dimiliki modul "
        "yang menerbitkan event-nya. Indeks lengkap digenerate di "
        "`03-architecture/notifications-index.md`.",
    ],
    "m18-activity-log": [
        "Daftar aksi yang wajib dicatat tersebar ke modul penerbitnya. Indeks lengkap digenerate "
        "di `03-architecture/activity-log-index.md`.",
    ],
}
