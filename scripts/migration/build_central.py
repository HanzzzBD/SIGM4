#!/usr/bin/env python3
"""Rakit berkas pusat + indeks generated. Jalankan setelah build_docs.py.

Baris yang sudah dipindahkan ke modul TIDAK ditulis ulang di sini — berkas pusat
untuk BR/API/Notifikasi/Activity Log berubah menjadi INDEKS yang digenerate dari
modul, sehingga tidak ada duplikasi.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from allocation_map import MODULES, DIAGRAM_OWNER  # noqa: E402

SRC = os.path.join("docs", "PRD")
OUT = "docs"
TITLE = {s: (n, t) for s, n, t in MODULES}


def read(rel):
    with open(os.path.join(SRC, rel), encoding="utf-8", newline="") as fh:
        return fh.read()


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(text.rstrip() + "\n")
    print(f"  {rel}")


def drop_section(text, heading, level=2):
    """Buang satu sub-bab (yang sudah dipindah ke modul) agar tidak duplikat."""
    lines = text.splitlines(keepends=True)
    try:
        start = next(i for i, ln in enumerate(lines) if ln.rstrip("\n") == heading)
    except StopIteration:
        return text
    stop = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("#" * level + " ") or lines[j].startswith("#" * (level - 1) + " "):
            stop = j
            break
    return "".join(lines[:start] + lines[stop:])


def keep_only(text, headings, level=2):
    """Sisakan hanya sub-bab tertentu (plus preamble sebelum sub-bab pertama)."""
    lines = text.splitlines(keepends=True)
    out, keep, first = [], False, True
    for ln in lines:
        if ln.startswith("#" * level + " "):
            keep = ln.rstrip("\n") in headings
            first = False
        elif ln.startswith("# "):
            keep, first = True, True
        if first or keep:
            out.append(ln)
    return "".join(out)


def take_sections(text, headings, level=2):
    """Ambil hanya sub-bab tertentu, tanpa preamble."""
    lines = text.splitlines(keepends=True)
    out, keep = [], False
    for ln in lines:
        if ln.startswith("#" * level + " "):
            keep = ln.rstrip("\n") in headings
        elif ln.startswith("# "):
            keep = False
        if keep:
            out.append(ln)
    return "".join(out)


BANNER = ("<!-- DIGENERATE OTOMATIS oleh scripts/build_central.py — JANGAN SUNTING BERKAS INI.\n"
          "     Sumber kebenaran setiap baris ada di berkas modul terkait (docs/02-modules/).\n"
          "     Menyunting di sini akan hilang saat regenerasi berikutnya. -->\n\n")

print("Berkas pusat:")

# ── 00-foundation ─────────────────────────────────────────────────────────────
write("00-foundation/decisions.md", read("00-foundation/keputusan-kunci.md"))
write("00-foundation/glossary.md", read("00-foundation/glosarium.md"))
write("00-foundation/conventions.md",
      "# Konvensi Proyek\n\n"
      "> Memuat Lampiran E PRD: definisi kalender & satuan waktu, master data tambahan, "
      "siklus hidup akun siswa, dan template impor.\n>\n"
      "> Konvensi lain yang berlaku dan berada di berkas terpisah:\n"
      "> - Kode enum vs label tampilan -> [`../03-architecture/data-model.md`](../03-architecture/data-model.md)\n"
      "> - Format nomor dokumen (SEQ-01..04) -> [`../03-architecture/availability-concurrency.md`](../03-architecture/availability-concurrency.md)\n"
      "> - Format respons, paginasi, kode galat -> [`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md)\n"
      "> - Penamaan ID requirement -> [`../README.md`](../README.md)\n\n---\n\n"
      + read("00-foundation/master-data-kalender.md"))
write("00-foundation/roles-permissions.md",
      "# Role & Permission\n\n"
      "> Gabungan Bab 5 (User Roles), Bab 18 (Permission Matrix), dan Lampiran C "
      "(Katalog Permission Kanonik).\n>\n"
      "> Bila terjadi perbedaan antara matriks Bab 18 dan Lampiran C, **Lampiran C yang mengikat** "
      "(lihat PM-06).\n\n---\n\n"
      + read("00-foundation/roles.md") + "\n---\n\n"
      + read("00-foundation/permission-matrix.md") + "\n---\n\n"
      + read("00-foundation/permission-catalog.md"))

# ── 01-product ────────────────────────────────────────────────────────────────
write("01-product/overview.md",
      read("01-product/01-executive-summary.md") + "\n---\n\n"
      + read("01-product/02-background.md") + "\n---\n\n"
      + read("01-product/03-objectives.md") + "\n---\n\n"
      + read("01-product/04-stakeholders.md"))
write("01-product/personas-journeys.md",
      read("01-product/06-personas.md") + "\n---\n\n" + read("01-product/07-user-journey.md"))
write("01-product/delivery-plan.md", read("01-product/29-delivery-plan.md"))
write("01-product/assumptions-risks.md",
      read("01-product/23-assumptions.md") + "\n---\n\n" + read("01-product/24-risks.md"))
write("01-product/future-enhancements.md", read("01-product/25-future-enhancements.md"))

# ── 03-architecture ───────────────────────────────────────────────────────────
nfr = read("03-architecture/09-nfr.md")
write("03-architecture/security.md",
      "# Keamanan\n\n> Gabungan Bab 9.2 (Security NFR) dan Bab 28.5 "
      "(Pengujian Keamanan & Manajemen Kerentanan).\n\n---\n\n"
      + take_sections(nfr, {"## 9.2 Security"}) + "\n---\n\n"
      + take_sections(read("03-architecture/28-privacy-compliance.md"),
                      {"## 28.5 Pengujian Keamanan & Manajemen Kerentanan"}))
write("03-architecture/nfr.md",
      drop_section(nfr, "## 9.2 Security")
      + "\n> Persyaratan keamanan (Bab 9.2) berada di [`security.md`](security.md).\n")
write("03-architecture/privacy-compliance.md",
      drop_section(read("03-architecture/28-privacy-compliance.md"),
                   "## 28.5 Pengujian Keamanan & Manajemen Kerentanan")
      + "\n> Pengujian keamanan & manajemen kerentanan (Bab 28.5) berada di "
        "[`security.md`](security.md).\n")
write("03-architecture/deployment-ops.md", read("03-architecture/27-deployment-ops.md"))
write("03-architecture/availability-concurrency.md",
      read("03-architecture/26-availability-concurrency.md"))
write("03-architecture/approval-rule-dsl.md", read("03-architecture/approval-rule-dsl.md"))
write("03-architecture/ai-features.md", read("03-architecture/22-ai-features.md"))
write("03-architecture/data-model.md",
      read("03-architecture/11-data-requirements.md") + "\n---\n\n"
      + read("03-architecture/16-erd.md"))

api = read("03-architecture/17-api.md")
api_conv = re.split(r"^## 17\.4 Daftar Endpoint Utama\s*$", api, flags=re.M)[0]
api_tail = take_sections(api, {"## 17.5 Ketentuan Keamanan API"})
write("03-architecture/api-conventions.md",
      api_conv.rstrip() + "\n\n## 17.4 Daftar Endpoint Utama\n\n"
      "> **Dipindahkan.** Seluruh baris endpoint kini dimiliki modulnya masing-masing "
      "(bagian 7 pada tiap berkas di [`../02-modules/`](../02-modules/)). "
      "Daftar menyeluruh digenerate di [`api-index.md`](api-index.md).\n\n---\n\n" + api_tail)

# activity log: 21.3 sudah pindah ke modul
alog = read("03-architecture/21-audit-log.md")
alog = re.split(r"^## 21\.3 Daftar Aktivitas yang Wajib Dicatat\s*$", alog, flags=re.M)[0]
write("03-architecture/activity-log.md",
      alog.rstrip() + "\n\n## 21.3 Daftar Aktivitas yang Wajib Dicatat\n\n"
      "> **Dipindahkan.** Setiap aksi kini dimiliki modul penerbitnya (bagian 11 pada tiap "
      "berkas modul). Daftar menyeluruh digenerate di "
      "[`activity-log-index.md`](activity-log-index.md).\n")

# system overview: Bab 12 + 14.1; 13 & 15 seluruhnya pindah ke modul
moved = []
for slug, items in DIAGRAM_OWNER.items():
    for fname, heading in items:
        moved.append((heading.replace("## ", ""), slug))
moved_tbl = "\n".join(f"| {h} | [`{s}.md`](../02-modules/{s}.md) |" for h, s in sorted(moved))
write("03-architecture/system-overview.md",
      read("03-architecture/12-system-workflow.md") + "\n---\n\n"
      + take_sections(read("03-architecture/14-use-case-diagram.md"),
                      {"## 14.1 Use Case Keseluruhan"})
      + "\n---\n\n## Diagram yang Dipindahkan ke Modul\n\n"
        "Process flow (Bab 13), sequence diagram (Bab 15), dan use case modul peminjaman (14.2) "
        "bersifat spesifik per modul, sehingga dipindahkan ke berkas modulnya "
        "(bagian 4 — Business Flow). Tidak ada salinan di sini.\n\n"
        "| Diagram | Kini berada di |\n|---|---|\n" + moved_tbl + "\n")

# ── 04-frontend / 05-mobile / 06-quality ─────────────────────────────────────
write("04-frontend/ui-foundation.md", read("04-frontend/31-ui-foundation.md"))
write("04-frontend/dashboards.md", read("04-frontend/19-dashboard.md"))
write("05-mobile/mobile-requirements.md", read("05-mobile/32-mobile-requirements.md"))
write("06-quality/test-strategy.md", read("06-quality/30-test-strategy.md"))
write("CHANGELOG.md",
      read("CHANGELOG.md") + "\n---\n\n"
      + read("06-quality/lampiran-b-traceability-sumber.md"))

# ── indeks generated dari modul ──────────────────────────────────────────────
print("\nIndeks generated:")
MODDIR = os.path.join(OUT, "02-modules")


def harvest(pattern, group=1):
    rows = []
    for slug, num, name in MODULES:
        p = os.path.join(MODDIR, f"{slug}.md")
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8"):
            m = re.match(pattern, line)
            if m:
                rows.append((m.group(group), line.rstrip("\n"), slug, num))
    return rows


def emit(rel, title, note, header, pattern, sortkey, group=1):
    rows = harvest(pattern, group)
    rows.sort(key=sortkey)
    body = [BANNER, f"# {title}\n", f"> {note}\n",
            f"> Total: **{len(rows)}** baris, dikumpulkan dari 21 berkas modul.\n",
            header]
    for key, line, slug, num in rows:
        body.append(line.rstrip() + f" [{num}](../02-modules/{slug}.md) |")
    write(rel, "\n".join(body))
    return len(rows)


def nkey(prefix):
    def f(r):
        m = re.match(rf"{prefix}-(\d+)([a-z]*)", r[0])
        return (int(m.group(1)), m.group(2)) if m else (9999, "")
    return f


n_br = emit("03-architecture/business-rules-index.md", "Indeks Business Rules",
            "Setiap aturan dimiliki satu modul. Sunting di berkas modulnya, bukan di sini.",
            "| Kode | Business Rule | Pemilik |\n|---|---|---|",
            r"^\| (BR-\d+[a-z]*) \|", nkey("BR"))
n_nt = emit("03-architecture/notifications-index.md", "Indeks Notifikasi",
            "Setiap notifikasi dimiliki modul yang menerbitkan event-nya.",
            "| Kode | Event | Penerima | Kanal | Wajib | Contoh | Pemilik |\n|---|---|---|---|:---:|---|---|",
            r"^\| \*\*(NT-\d+[a-z]*)\*\* \|", nkey("NT"))
n_api = emit("03-architecture/api-index.md", "Indeks Endpoint API",
             "Setiap endpoint dimiliki satu modul. Konvensi umum di `api-conventions.md`.",
             "| Method | Endpoint | Permission | Deskripsi | Pemilik |\n|---|---|---|---|---|",
             r"^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)`", lambda r: r[1], 2)
n_log = emit("03-architecture/activity-log-index.md", "Indeks Aksi Activity Log",
             "Setiap aksi dimiliki modul penerbitnya. Prinsip pencatatan di `activity-log.md`.",
             "| Aksi | Keterangan | Pemilik |\n|---|---|---|",
             r"^\| `([A-Z_]+)", lambda r: r[0])

print(f"\nBR={n_br}  NT={n_nt}  API={n_api}  LOG={n_log}")
