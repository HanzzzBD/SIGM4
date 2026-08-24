#!/usr/bin/env python3
"""Audit invarian docs/: satu pemilik per baris, tautan hidup, struktur modul utuh.

Sampai commit a00993f skrip ini membandingkan pohon docs/ terhadap arsip
PRD.v1.1.full.md untuk membuktikan tidak ada requirement yang hilang saat
restrukturisasi Phase 2. Arsip itu sudah dihapus dan perbandingannya kini justru
menyesatkan: M-22 menambah requirement yang memang tidak pernah ada di arsip,
sehingga setiap ID baru akan terbaca sebagai selisih. Restrukturisasi sudah
selesai; yang perlu dijaga sekarang adalah invarian yang berlaku terus-menerus.

Yang diperiksa (bagian 2 dan 4-6 menentukan lulus/gagal):
  1. Sensus ID per jenis                          -- informatif
  2. Definisi FR di berkas modul
  3. Sensus Acceptance Criteria                   -- informatif
  4. Aturan satu pemilik: BR, NT, endpoint, aksi log
  5. Rujukan silang berkas
  6. Kelengkapan struktur 15 bagian per modul

Cakupan ID pada lapisan IMPLEMENTATION diperiksa scripts/validate_impl.py.

Jalankan dari root proyek:  python scripts/audit_docs.py
Keluar dengan kode 1 bila ada temuan.
"""
import os
import re
import sys
from collections import Counter

NEW = "docs"
SKIP_DIRS = set()            # seluruh isi docs/ dihitung
MODULE_DIR = "02-modules"    # penanda folder modul, di mana pun ia bersarang

ID_PATTERNS = {
    "FR":  r"\bFR-\d+\.\d+[a-z]?\b",
    "BR":  r"\bBR-\d+[a-z]*\b",
    "NT":  r"\bNT-\d+[a-z]*\b",
    "NFR": r"\bNFR-[A-Z]{1,2}-\d+[a-z]*\b",
    "RE":  r"\bRE-\d+\b",
    "CI":  r"\bCI-\d+\b",
    "AV":  r"\bAV-\d+\b",
    "ID":  r"\bID-\d+\b",
    "SEQ": r"\bSEQ-\d+\b",
    "JOB": r"\bJOB-\d+\b",
    "DP":  r"\bDP-(?:AI-)?\d+\b",
    "SC":  r"\bSC-\d+\b",
    "AS":  r"\bAS-\d+[a-z]*\b",
    "RS":  r"\bRS-\d+\b",
    "FE":  r"\bFE-\d+\b",
    "PM":  r"\bPM-\d+\b",
    "GL":  r"\bGL-\d+\b",
    "DL":  r"\bDL-\d+\b",
    "MOB": r"\bMOB-[A-Z]{3,4}-\d+\b",
    "AI":  r"\bAI-(?:CTL|EV|SEC|L|UC)-\d+\b",
    "ST":  r"\bST-\d+\b",
    "CC":  r"\bCC-\d+\b",
}

FAILED = []


def walk_docs():
    for root, dirs, files in os.walk(NEW):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in sorted(files):
            if fn.endswith(".md"):
                yield os.path.join(root, fn)


def read(p):
    with open(p, encoding="utf-8") as fh:
        return fh.read()


new_files = list(walk_docs())
new_all = {p: read(p) for p in new_files}
new_text = "\n".join(new_all.values())
mod_text = {k: v for k, v in new_all.items() if os.sep + MODULE_DIR + os.sep in k}

print("=" * 78)
print("LAPORAN AUDIT — invarian docs/")
print("=" * 78)
print(f"Diperiksa : {len(new_files)} berkas di {NEW}/ "
      f"({len(mod_text)} di antaranya berkas modul)")
print()

# -- 1. Sensus ID -------------------------------------------------------------
print("-" * 78)
print("1. SENSUS ID (informatif)")
print("-" * 78)
print(f"{'Jenis':6s} {'di docs/':>9s}  contoh")
for kind, pat in ID_PATTERNS.items():
    found = sorted(set(re.findall(pat, new_text)))
    sample = ", ".join(found[:4]) + (" ..." if len(found) > 4 else "")
    print(f"{kind:6s} {len(found):9d}  {sample}")
print()

# -- 2. Definisi FR (heading) -------------------------------------------------
print("-" * 78)
print("2. DEFINISI FUNCTIONAL REQUIREMENT (heading ### FR-xx.y)")
print("-" * 78)
fr_def = Counter(re.findall(r"^### (FR-\d+\.\d+[a-z]?)",
                            "\n".join(mod_text.values()), re.M))
fr_ref = set(re.findall(r"\bFR-\d+\.\d+[a-z]?\b", new_text))
dupes = sorted(k for k, v in fr_def.items() if v > 1)
undef = sorted(fr_ref - set(fr_def))
print(f"Terdefinisi di modul   : {len(fr_def)}")
print(f"Dirujuk di docs/       : {len(fr_ref)}")
print(f"Terdefinisi ganda      : {len(dupes)} {dupes or ''}")
print(f"Dirujuk tanpa definisi : {len(undef)} {undef or ''}")
if dupes:
    FAILED.append(f"FR terdefinisi ganda: {dupes}")
if undef:
    FAILED.append(f"FR dirujuk tanpa definisi di modul: {undef}")
print()

# -- 3. Acceptance Criteria ---------------------------------------------------
print("-" * 78)
print("3. ACCEPTANCE CRITERIA (baris '- [ ] ...') — informatif")
print("-" * 78)
ac = Counter(re.findall(r"^- \[ \] (.+)$", new_text, re.M))
print(f"Di docs/ : {sum(ac.values())} baris ({len(ac)} unik)")
print()

# -- 4. Baris tabel bernilai kunci: satu pemilik, tanpa duplikasi -------------
print("-" * 78)
print("4. ATURAN SATU PEMILIK (Zero Duplication)")
print("-" * 78)


def owner_check(label, pattern, key=lambda m: m.group(1)):
    """Setiap baris bernilai kunci dimiliki tepat satu berkas modul.

    Aturan "Satu baris, satu pemilik" (CLAUDE.md, Aturan dokumentasi): modul
    lain merujuk lewat ID, tidak menyalin barisnya.
    """
    loc = {}
    for path, txt in mod_text.items():
        for m in re.finditer(pattern, txt, re.M):
            loc.setdefault(key(m), set()).add(os.path.basename(path))
    dup = {k: sorted(v) for k, v in loc.items() if len(v) > 1}
    print(f"{label:16s} pemilik unik: {len(loc):4d}   duplikat: {len(dup)}")
    if dup:
        for k, v in list(dup.items())[:8]:
            print(f"   ! {k} ada di {v}")
        FAILED.append(f"{label} duplikat di beberapa modul: {sorted(dup)[:5]}")
    return loc


owner_check("Business Rule", r"^\| (BR-\d+[a-z]*) \|")
owner_check("Notifikasi", r"^\| \*\*(NT-\d+[a-z]*)\*\* \|")
owner_check("Endpoint", r"^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)`",
            key=lambda m: f"{m.group(1)} {m.group(2)}")
owner_check("Aksi log", r"^\| `([A-Z_]+)`")
print()

# -- 5. Rujukan silang berkas -------------------------------------------------
print("-" * 78)
print("5. RUJUKAN SILANG BERKAS")
print("-" * 78)
LINK = re.compile(r"\]\((?!https?:|#|mailto:)([^)#]+)\)")
FENCE = re.compile(r"^```.*?^```", re.S | re.M)
INLINE_CODE = re.compile(r"`[^`\n]+`")
broken, checked = [], 0
for path, txt in new_all.items():
    base = os.path.dirname(path)
    # Blok kode & kode inline bukan tautan Markdown. Contoh yang tertangkap keliru:
    # repository[tool.method](userCtx, args) di dalam ```ts ... ```
    scan = INLINE_CODE.sub("", FENCE.sub("", txt))
    for m in LINK.finditer(scan):
        href = m.group(1)
        # Diawali "/" = route aplikasi (contoh deep link di dalam teks PRD),
        # bukan tautan berkas. Bukan urusan audit dokumen.
        if href.startswith("/"):
            continue
        # Placeholder di dalam berkas template (phase-NN.md, m??-*.md) memang
        # tidak menunjuk berkas nyata -- ia diisi saat template dipakai.
        if "NN" in href or "?" in href or "*" in href:
            continue
        checked += 1
        if not os.path.exists(os.path.normpath(os.path.join(base, href))):
            broken.append((os.path.relpath(path), href))
print(f"Total tautan berkas diperiksa : {checked}")
print(f"Tautan rusak                 : {len(broken)}")
for p, t in broken[:10]:
    print(f"   ! {p} -> {t}")
if broken:
    FAILED.append(f"Tautan rusak: {len(broken)}")
print()

# -- 6. Struktur modul --------------------------------------------------------
print("-" * 78)
print("6. KELENGKAPAN STRUKTUR 15 BAGIAN PER MODUL")
print("-" * 78)
SECTIONS = ["1. Overview", "2. Scope", "3. Actors", "4. Business Flow",
            "5. Functional Requirements", "6. Business Rules", "7. API Endpoints",
            "8. Database Entity", "9. Notification", "10. Permission",
            "11. Activity Log", "12. Acceptance Criteria", "13. Dependencies",
            "14. Related Modules", "15. Open Issues"]
bad = []
for path, txt in sorted(mod_text.items()):
    miss = [s for s in SECTIONS if f"## {s}" not in txt]
    if miss:
        bad.append((os.path.basename(path), miss))
print(f"Modul diperiksa : {len(mod_text)}")
print(f"Struktur lengkap: {len(mod_text) - len(bad)}")
for f, m in bad:
    print(f"   ! {f} kurang: {m}")
if bad:
    FAILED.append(f"Modul struktur tidak lengkap: {[b[0] for b in bad]}")
print()

# -- Kesimpulan ---------------------------------------------------------------
print("=" * 78)
if FAILED:
    print(f"HASIL: GAGAL — {len(FAILED)} temuan")
    for f in FAILED:
        print(f"  - {f}")
    sys.exit(1)
print("HASIL: LULUS — tidak ada duplikasi kepemilikan, tidak ada rujukan silang")
print("       rusak, struktur modul lengkap.")
print("=" * 78)
