#!/usr/bin/env python3
"""Audit Phase 2: pastikan tidak ada requirement yang hilang saat restrukturisasi.

Membandingkan arsip PRD.v1.1.full.md (sumber kebenaran) terhadap pohon docs/ baru.
Memeriksa: FR, BR, RE, CI, AV, ID, SEQ, JOB, DP, NT, NFR, aksi log, endpoint,
Acceptance Criteria, dan rujukan silang antar berkas.

Jalankan dari root proyek:  python scripts/audit_docs.py
Keluar dengan kode 1 bila ditemukan kehilangan.
"""
import os
import re
import sys
from collections import Counter

ARCHIVE = "PRD.v1.1.full.md"
NEW = "docs"
SKIP_DIRS = set()            # seluruh isi docs/ dihitung (PRD/ dan SDD/)
SKIP_FILES = {"README.md"}   # indeks buatan, boleh menyebut ID tanpa memilikinya
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


archive = read(ARCHIVE)
new_files = list(walk_docs())
new_all = {p: read(p) for p in new_files}
new_text = "\n".join(new_all.values())

print("=" * 78)
print("LAPORAN AUDIT — Phase 2")
print("=" * 78)
print(f"Sumber acuan : {ARCHIVE}")
print(f"Diperiksa    : {len(new_files)} berkas di {NEW}/ (PRD/ + SDD/)")
print()

# ── 1. Kelengkapan ID ─────────────────────────────────────────────────────────
print("-" * 78)
print("1. KELENGKAPAN ID")
print("-" * 78)
print(f"{'Jenis':6s} {'di arsip':>9s} {'di docs/':>9s} {'hilang':>7s}  keterangan")
total_missing = 0
for kind, pat in ID_PATTERNS.items():
    a = set(re.findall(pat, archive))
    b = set(re.findall(pat, new_text))
    missing = sorted(a - b)
    total_missing += len(missing)
    note = "OK" if not missing else "HILANG: " + ", ".join(missing[:8])
    print(f"{kind:6s} {len(a):9d} {len(b):9d} {len(missing):7d}  {note}")
    if missing:
        FAILED.append(f"{kind} hilang: {missing}")
print()

# ── 2. Definisi FR (heading) ──────────────────────────────────────────────────
print("-" * 78)
print("2. DEFINISI FUNCTIONAL REQUIREMENT (heading ### FR-xx.y)")
print("-" * 78)
fr_arc = set(re.findall(r"^### (FR-\d+\.\d+[a-z]?)", archive, re.M))
fr_new = Counter(re.findall(r"^### (FR-\d+\.\d+[a-z]?)", "\n".join(
    v for k, v in new_all.items() if "02-modules" in k), re.M))
missing = sorted(fr_arc - set(fr_new))
dupes = sorted(k for k, v in fr_new.items() if v > 1)
print(f"Di arsip           : {len(fr_arc)}")
print(f"Di docs/02-modules : {len(fr_new)}")
print(f"Hilang             : {len(missing)} {missing or ''}")
print(f"Terdefinisi ganda  : {len(dupes)} {dupes or ''}")
if missing:
    FAILED.append(f"FR tidak terdefinisi di modul: {missing}")
if dupes:
    FAILED.append(f"FR terdefinisi ganda: {dupes}")
print()

# ── 3. Acceptance Criteria ────────────────────────────────────────────────────
print("-" * 78)
print("3. ACCEPTANCE CRITERIA (baris '- [ ] ...')")
print("-" * 78)
ac_arc = Counter(re.findall(r"^- \[ \] (.+)$", archive, re.M))
ac_new = Counter(re.findall(r"^- \[ \] (.+)$", new_text, re.M))
lost = [t for t, n in ac_arc.items() if ac_new[t] < n]
print(f"Di arsip : {sum(ac_arc.values())} baris ({len(ac_arc)} unik)")
print(f"Di docs/ : {sum(ac_new.values())} baris ({len(ac_new)} unik)")
print(f"Hilang   : {len(lost)}")
for t in lost[:5]:
    print(f"   - {t[:90]}")
if lost:
    FAILED.append(f"Acceptance Criteria hilang: {len(lost)} baris")
print()

# ── 4. Baris tabel bernilai kunci: satu pemilik, tanpa duplikasi ─────────────
print("-" * 78)
print("4. ATURAN SATU PEMILIK (Zero Duplication)")
print("-" * 78)
mod_text = {k: v for k, v in new_all.items() if os.sep + "02-modules" + os.sep in k}


def owner_check(label, pattern, expected):
    loc = {}
    for path, txt in mod_text.items():
        for m in re.finditer(pattern, txt, re.M):
            loc.setdefault(m.group(1), []).append(os.path.basename(path))
    dup = {k: v for k, v in loc.items() if len(v) > 1}
    print(f"{label:16s} pemilik unik: {len(loc):4d} / target {expected:4d}   duplikat: {len(dup)}")
    if dup:
        for k, v in list(dup.items())[:5]:
            print(f"   ! {k} ada di {v}")
        FAILED.append(f"{label} duplikat di beberapa modul: {list(dup)[:5]}")
    if len(loc) != expected:
        FAILED.append(f"{label}: {len(loc)} pemilik, seharusnya {expected}")
    return loc


n_br_arc = len(set(re.findall(r"^\| (BR-\d+[a-z]*) \|", archive, re.M)))
n_nt_arc = len(set(re.findall(r"^\| \*\*(NT-\d+[a-z]*)\*\* \|", archive, re.M)))
owner_check("Business Rule", r"^\| (BR-\d+[a-z]*) \|", n_br_arc)
owner_check("Notifikasi", r"^\| \*\*(NT-\d+[a-z]*)\*\* \|", n_nt_arc)

ep_arc = set(re.findall(r"^\| (?:GET|POST|PUT|PATCH|DELETE) \| `([^`]+)`", archive, re.M))
ep_new = set(re.findall(r"^\| (?:GET|POST|PUT|PATCH|DELETE) \| `([^`]+)`",
                        "\n".join(mod_text.values()), re.M))
print(f"{'Endpoint':16s} di arsip: {len(ep_arc):4d}   di modul: {len(ep_new):4d}   "
      f"hilang: {len(ep_arc - ep_new)}")
if ep_arc - ep_new:
    print(f"   ! {sorted(ep_arc - ep_new)[:8]}")
    FAILED.append(f"Endpoint hilang: {sorted(ep_arc - ep_new)[:8]}")

log_arc = set(re.findall(r"^\| `([A-Z_]+)`", archive, re.M))
log_new = set(re.findall(r"^\| `([A-Z_]+)`", "\n".join(mod_text.values()), re.M))
print(f"{'Aksi log':16s} di arsip: {len(log_arc):4d}   di modul: {len(log_new):4d}   "
      f"hilang: {len(log_arc - log_new)}")
if log_arc - log_new:
    print(f"   ! {sorted(log_arc - log_new)}")
    FAILED.append(f"Aksi log hilang: {sorted(log_arc - log_new)}")
print()

# ── 5. Rujukan silang berkas ─────────────────────────────────────────────────
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

# ── 6. Struktur modul ────────────────────────────────────────────────────────
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

# ── Kesimpulan ────────────────────────────────────────────────────────────────
print("=" * 78)
if FAILED:
    print(f"HASIL: GAGAL — {len(FAILED)} temuan")
    for f in FAILED:
        print(f"  - {f}")
    sys.exit(1)
print("HASIL: LULUS — tidak ada requirement yang hilang, tidak ada duplikasi,")
print("       tidak ada rujukan silang rusak, struktur modul lengkap.")
print("=" * 78)
