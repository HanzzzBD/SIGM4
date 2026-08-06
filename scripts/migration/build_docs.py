#!/usr/bin/env python3
"""Rakit dokumentasi engineering dari hasil pemecahan PRD.

Menghasilkan 21 modul self-contained (15 bagian) dengan aturan SATU PEMILIK per baris.
Seluruh teks requirement dipindahkan VERBATIM — tidak ada yang ditulis ulang.

Jalankan dari root proyek:  python scripts/build_docs.py
"""
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from allocation_map import (  # noqa: E402
    MODULES, SOURCE_MODULE_FILE, BR_OWNER, BR_SHARED_REF, NT_OWNER, LOG_OWNER,
    API_OWNER, ENTITY_OWNER, PERM_OWNER, DIAGRAM_OWNER, DEPENDS_ON, OPEN_ISSUES,
)

SRC = os.path.join("docs", "PRD")
OUT = "docs"
NAV_BLOCK = re.compile(
    r"^<!-- ═══ BLOK NAVIGASI ═══.*?<!-- ═══ AKHIR BLOK NAVIGASI ═══ -->\n\n", re.S)

TITLE = {slug: (num, name) for slug, num, name in MODULES}
SLUG_BY_NUM = {num: slug for slug, num, _ in MODULES}

consumed = {}   # jenis -> set kunci yang berhasil dialokasikan
report = []


def read(rel):
    with open(os.path.join(SRC, rel), encoding="utf-8", newline="") as fh:
        return fh.read()


def rows_by_key(text, pattern, group=1):
    """Kembalikan {kunci: baris_utuh} dari baris tabel."""
    out = {}
    for line in text.splitlines():
        m = re.match(pattern, line)
        if m:
            out[m.group(group)] = line
    return out


def section(text, heading, level=2):
    """Ambil satu sub-bab beserta isinya, sampai heading selevel berikutnya."""
    lines = text.splitlines(keepends=True)
    start = None
    for i, ln in enumerate(lines):
        if ln.rstrip("\n") == heading:
            start = i
            break
    if start is None:
        return None
    stop = len(lines)
    prefix = "#" * level + " "
    for j in range(start + 1, len(lines)):
        if lines[j].startswith(prefix) or lines[j].startswith("#" * (level - 1) + " "):
            stop = j
            break
    return "".join(lines[start:stop]).rstrip() + "\n"


# ── muat sumber ───────────────────────────────────────────────────────────────
SRC_BR = read("03-architecture/10-business-rules.md")
SRC_NT = read("03-architecture/20-notifikasi.md")
SRC_LOG = read("03-architecture/21-audit-log.md")
SRC_API = read("03-architecture/17-api.md")
SRC_DATA = read("03-architecture/11-data-requirements.md")
SRC_PERM = read("00-foundation/permission-catalog.md")

BR_ROWS = rows_by_key(SRC_BR, r"^\| (BR-\d+[a-z]*) \|")
NT_ROWS = rows_by_key(SRC_NT, r"^\| \*\*(NT-\d+[a-z]*)\*\* \|")
LOG_ROWS = {}
for line in SRC_LOG.splitlines():
    m = re.match(r"^\| `([A-Z_]+)`", line)
    if m:
        LOG_ROWS[m.group(1)] = line
PERM_ROWS = rows_by_key(SRC_PERM, r"^\| `([\w.]+)`")
ENTITY_ROWS = rows_by_key(SRC_DATA, r"^\| \*\*(\w+)\*\* \|")

# endpoint: kumpulkan (path, baris, sub-bagian)
API_ROWS = []
for line in SRC_API.splitlines():
    m = re.match(r"^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)`", line)
    if m:
        API_ROWS.append((m.group(2), line))


def pick_api(slug):
    prefixes = API_OWNER.get(slug, [])
    taken, rest = [], []
    for path, line in API_ROWS:
        owner = None
        best = -1
        for s, pfx_list in API_OWNER.items():
            for pfx in pfx_list:
                if path.startswith(pfx) and len(pfx) > best:
                    best, owner = len(pfx), s
        if owner == slug:
            taken.append(line)
    return taken


def block(title, rows, header, empty="_Tidak ada pada modul ini._"):
    if not rows:
        return f"### {title}\n\n{empty}\n"
    return f"### {title}\n\n{header}\n" + "\n".join(rows) + "\n"


# ── rakit tiap modul ──────────────────────────────────────────────────────────
os.makedirs(os.path.join(OUT, "02-modules"), exist_ok=True)
used = {"br": set(), "nt": set(), "log": set(), "perm": set(), "entity": set(), "api": set()}

for slug, num, name in MODULES:
    src_body = NAV_BLOCK.sub("", read(f"02-modules/{SOURCE_MODULE_FILE[slug]}"))
    # buang judul modul lama (baris "## M-xx — ...") agar tidak dobel
    src_body = re.sub(r"^## M-\d+ — .*?\n\n?", "", src_body, count=1)
    src_body = src_body.rstrip("-\n \t") + "\n"

    br_ids = BR_OWNER.get(slug, [])
    br_rows = [BR_ROWS[i] for i in br_ids if i in BR_ROWS]
    used["br"].update(i for i in br_ids if i in BR_ROWS)

    nt_ids = NT_OWNER.get(slug, [])
    nt_rows = [NT_ROWS[i] for i in nt_ids if i in NT_ROWS]
    used["nt"].update(i for i in nt_ids if i in NT_ROWS)

    log_ids = LOG_OWNER.get(slug, [])
    log_rows = [LOG_ROWS[i] for i in log_ids if i in LOG_ROWS]
    used["log"].update(i for i in log_ids if i in LOG_ROWS)

    perm_ids = PERM_OWNER.get(slug, [])
    perm_rows = [PERM_ROWS[i] for i in perm_ids if i in PERM_ROWS]
    used["perm"].update(i for i in perm_ids if i in PERM_ROWS)

    ent_ids = ENTITY_OWNER.get(slug, [])
    ent_rows = [ENTITY_ROWS[i] for i in ent_ids if i in ENTITY_ROWS]
    used["entity"].update(i for i in ent_ids if i in ENTITY_ROWS)

    api_rows = pick_api(slug)
    used["api"].update(r for r in api_rows)

    diagrams = ""
    for fname, heading in DIAGRAM_OWNER.get(slug, []):
        sec = section(read(f"03-architecture/{fname}"), heading)
        if sec:
            diagrams += "\n" + sec + "\n"

    shared = BR_SHARED_REF.get(slug, [])
    shared_txt = ""
    if shared:
        shared_txt = ("\n**Aturan bersama yang juga berlaku** (dimiliki modul lain, dirujuk "
                      "melalui ID — tidak disalin ke sini):\n\n")
        shared_txt += " · ".join(f"`{i}` ({o})" for i, o in shared) + "\n"

    deps = DEPENDS_ON.get(slug, [])
    dep_txt = "\n".join(
        f"- [`{d}.md`]({d}.md) — {TITLE[d][0]} {TITLE[d][1]}" for d in deps
    ) or "_Tidak bergantung pada modul lain._"

    related = sorted({d for d in deps} | {SLUG_BY_NUM.get(o.upper()) or o
                                          for _, o in shared if SLUG_BY_NUM.get(o.upper())})
    rel_txt = "\n".join(
        f"- [`{r}.md`]({r}.md) — {TITLE[r][0]} {TITLE[r][1]}" for r in related if r in TITLE
    ) or "_Tidak ada._"

    issues = OPEN_ISSUES.get(slug, [])
    issue_txt = "\n".join(f"- {t}" for t in issues) or "_Tidak ada isu terbuka._"

    doc = f"""# {num} — {name}

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **{num} — {name}** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

{diagrams if diagrams.strip() else "_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._"}

## 5. Functional Requirements

{src_body}
## 6. Business Rules

{block("Dimiliki modul ini", br_rows, "| Kode | Business Rule |\n|---|---|", "_Tidak ada aturan bisnis yang dimiliki modul ini._")}{shared_txt}
## 7. API Endpoints

{block("Endpoint", api_rows, "| Method | Endpoint | Permission | Deskripsi |\n|---|---|---|---|", "_Tidak ada endpoint khusus modul ini._")}
Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

{block("Entitas", ent_rows, "| Entitas | Deskripsi | Atribut Utama | Keterangan |\n|---|---|---|---|", "_Tidak memiliki entitas sendiri._")}
Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

{block("Notifikasi diterbitkan modul ini", nt_rows, "| Kode | Event Pemicu | Penerima | Kanal | Wajib | Contoh Isi |\n|---|---|---|---|:---:|---|", "_Modul ini tidak menerbitkan notifikasi._")}
Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

{block("Kode permission", perm_rows, "| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |\n|---|---|---|---|", "_Tidak ada permission khusus modul ini._")}
Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

{block("Aksi yang wajib dicatat", log_rows, "| Aksi | Keterangan |\n|---|---|", "_Tidak ada aksi khusus modul ini._")}
Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

{dep_txt}

## 14. Related Modules

{rel_txt}

## 15. Open Issues

{issue_txt}
"""
    dest = os.path.join(OUT, "02-modules", f"{slug}.md")
    with open(dest, "w", encoding="utf-8", newline="") as fh:
        fh.write(doc)
    report.append((slug, len(br_rows), len(api_rows), len(nt_rows),
                   len(log_rows), len(perm_rows), len(ent_rows)))

# ── laporan alokasi ───────────────────────────────────────────────────────────
print(f"{'modul':24s} {'BR':>4} {'API':>4} {'NT':>4} {'LOG':>4} {'PERM':>5} {'ENT':>4}")
for r in report:
    print(f"{r[0]:24s} {r[1]:4d} {r[2]:4d} {r[3]:4d} {r[4]:4d} {r[5]:5d} {r[6]:4d}")

print("\n-- Sisa yang BELUM teralokasi ke modul mana pun --")
leftovers = {
    "BR": sorted(set(BR_ROWS) - used["br"]),
    "NT": sorted(set(NT_ROWS) - used["nt"]),
    "LOG": sorted(set(LOG_ROWS) - used["log"]),
    "PERM": sorted(set(PERM_ROWS) - used["perm"]),
    "ENTITY": sorted(set(ENTITY_ROWS) - used["entity"]),
}
api_all = {line for _, line in API_ROWS}
leftovers["API"] = sorted(api_all - used["api"])
for k, v in leftovers.items():
    print(f"{k:7s} {len(v):3d}  {v if len(v) <= 12 else str(v[:12]) + ' …'}")
