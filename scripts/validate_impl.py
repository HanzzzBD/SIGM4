# -*- coding: utf-8 -*-
"""Validasi Tahap 8 untuk docs/IMPLEMENTATION."""
import pathlib
import re
import sys

DOCS = pathlib.Path(r"C:\laragon\www\SIGM4\docs")
IMPL = DOCS / "IMPLEMENTATION"
PRD = DOCS / "PRD"
SDD = DOCS / "SDD"

problems = []
notes = []


def check(label, ok, detail=""):
    mark = "OK  " if ok else "FAIL"
    print(f"[{mark}] {label}" + (f" -- {detail}" if detail else ""))
    if not ok:
        problems.append(label + (f": {detail}" if detail else ""))


md_files = sorted(IMPL.rglob("*.md"))
texts = {p: p.read_text(encoding="utf-8") for p in md_files}

# ---------------------------------------------------------------- 1. tautan
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
broken = []
for p, t in texts.items():
    # buang blok kode berpagar
    body = re.sub(r"```.*?```", "", t, flags=re.S)
    for target in LINK.findall(body):
        if target.startswith(("http://", "https://", "#", "mailto:")):
            continue
        clean = target.split("#")[0]
        if not clean:
            continue
        # placeholder di dalam template, bukan tautan sungguhan
        if any(ch in clean for ch in "?*") or "NN" in clean:
            continue
        if not (p.parent / clean).resolve().exists():
            broken.append(f"{p.relative_to(IMPL)} -> {target}")
check("Tidak ada tautan relatif yang putus", not broken,
      f"{len(broken)} putus" if broken else "")
for b in broken:
    print("        " + b)

# ------------------------------------------------------- 2. cakupan modul
phase_files = sorted((IMPL / "phases").glob("phase-*.md"))
check("Sembilan berkas phase ada", len(phase_files) == 9, f"{len(phase_files)} ditemukan")

# Status phase/PR hanya dimiliki IMPLEMENTATION-STATUS.md. Header phase dan log
# sengaja hanya menunjuk ke sana supaya satu perubahan status tidak meninggalkan
# salinan yang basi di banyak berkas.
STATUS_REF = "| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |"
log_files = sorted((IMPL / "logs").glob("phase-*.md"))
wrong_status_ref = []
for p in phase_files + log_files:
    status_line = next((line for line in texts[p].splitlines()
                        if line.startswith("| **Status** |")), "")
    if status_line != STATUS_REF:
        wrong_status_ref.append(str(p.relative_to(IMPL)))
template_status_line = next((line for line in texts[IMPL / "templates" / "PHASE-TEMPLATE.md"].splitlines()
                             if line.startswith("| **Status** |")), "")
if template_status_line != STATUS_REF:
    wrong_status_ref.append("templates/PHASE-TEMPLATE.md")
check("Header phase dan log hanya merujuk status kanonik", not wrong_status_ref,
      ", ".join(wrong_status_ref))

phase_modules = {}
for p in phase_files:
    header = texts[p].split("## 1.")[0]
    mods = set(re.findall(r"\bM-(\d{2})\b", header))
    phase_modules[p.stem] = mods

all_mods = set()
dupes = []
for ph, mods in phase_modules.items():
    for m in mods:
        if m in all_mods:
            dupes.append(f"M-{m} muncul di lebih dari satu phase")
        all_mods.add(m)

expected = {f"{i:02d}" for i in range(1, 23)}
missing = sorted(expected - all_mods)
extra = sorted(all_mods - expected)
check("22 modul PRD tercakup tepat satu kali", not missing and not extra and not dupes,
      f"hilang={missing} asing={extra} ganda={dupes}" if (missing or extra or dupes) else "22/22")

# --------------------------------------------------- 3. cakupan berkas SDD
sdd_files = sorted(f.name for f in SDD.glob("*.md")
                   if re.match(r"^\d{2}-", f.name))
impl_text = "\n".join(texts.values())
uncovered = [f for f in sdd_files if f not in impl_text]
check(f"{len(sdd_files)} berkas SDD punya phase yang menerapkannya",
      not uncovered, f"tidak dirujuk: {uncovered}" if uncovered else f"{len(sdd_files)}/{len(sdd_files)}")

# ---------------------------------------------------------- 4. bagian phase
REQUIRED = ["## 1. Objective", "## 2. Scope", "## 3. Dependencies",
            "## 4. Referensi PRD", "## 5. Referensi SDD", "## 6. Deliverables",
            "## 7. Pull Request Plan", "## 8. Task Breakdown",
            "## 9. Acceptance Checklist", "## 10. Risks",
            "## 11. Rollback Strategy", "## 12. Definition of Done"]
bad = []
for p in phase_files:
    for sec in REQUIRED:
        if sec not in texts[p]:
            bad.append(f"{p.stem} kehilangan '{sec}'")
check("Setiap phase memuat 12 bagian baku", not bad, "; ".join(bad))

# --------------------------------------- 5. rujukan PRD/SDD tidak kosong
empty_ref = []
for p in phase_files:
    t = texts[p]
    for a, b in [("## 4. Referensi PRD", "## 5."), ("## 5. Referensi SDD", "## 6.")]:
        seg = t.split(a)[1].split(b)[0]
        if len(re.findall(r"\|", seg)) < 6:
            empty_ref.append(f"{p.stem} {a}")
check("Setiap phase punya rujukan PRD dan SDD yang terisi", not empty_ref, "; ".join(empty_ref))

# -------------------------------------------------------------- 6. PR unik
pr_ids = re.findall(r"`(PR-\d{2}-\d{2})`", impl_text)
per_phase = {}
for p in phase_files:
    ids = sorted(set(re.findall(r"^\| `(PR-\d{2}-\d{2})`", texts[p], re.M)))
    per_phase[p.stem] = ids
total = sum(len(v) for v in per_phase.values())
check("Total PR = 163", total == 163, f"{total} ditemukan")

gaps = []
for ph, ids in per_phase.items():
    nums = sorted(int(i[-2:]) for i in ids)
    if nums != list(range(1, len(nums) + 1)):
        gaps.append(f"{ph}: {nums}")
check("Nomor PR berurutan tanpa lompatan di setiap phase", not gaps, "; ".join(gaps))

# ------------------------------------------- 7. setiap PR punya acceptance
no_acc = []
for p in phase_files:
    for line in texts[p].splitlines():
        m = re.match(r"^\| `(PR-\d{2}-\d{2})` \|", line)
        if m:
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 6 or not cells[-1] or not cells[-2]:
                no_acc.append(m.group(1))
check("Setiap PR punya rujukan FR/SDD dan acceptance", not no_acc, ", ".join(no_acc))

# --------------------------------------------------- 8. rantai phase utuh
chain = []
for p in phase_files:
    header = texts[p].split("## 1.")[0]
    dep = re.search(r"\*\*Bergantung pada\*\* \| ([^|]+)\|", header)
    blk = re.search(r"\*\*Memblokir\*\* \| ([^|]+)\|", header)
    chain.append((p.stem, dep.group(1).strip() if dep else "?",
                  blk.group(1).strip() if blk else "?"))
orphans = [c[0] for c in chain if c[1] == "—" and c[2] == "—"]
check("Tidak ada phase yatim", not orphans, ", ".join(orphans))

# ------------------------------------------------------- 9. berkas wajib
required_files = [
    "README.md", "ROADMAP.md", "DELIVERY-PLAN.md", "IMPLEMENTATION-STATUS.md",
    "BRANCHING-STRATEGY.md", "RELEASE-PLAN.md", "CHANGELOG.md",
    "templates/PHASE-TEMPLATE.md", "templates/PULL-REQUEST.md",
    "templates/ADR-REFERENCE.md", "templates/RISK-LOG.md",
    "templates/DEPLOYMENT-CHECKLIST.md", "templates/ROLLBACK-CHECKLIST.md",
]
required_files += [f"phases/phase-{i:02d}.md" for i in range(9)]
required_files += [f"logs/phase-{i:02d}.md" for i in range(9)]
absent = [f for f in required_files if not (IMPL / f).exists()]
check(f"{len(required_files)} berkas wajib ada", not absent, ", ".join(absent))

# ------------------------------- 10. tidak ada requirement/BR baru diciptakan
# ID yang disebut IMPLEMENTATION harus ada di PRD atau SDD.
corpus = "\n".join(f.read_text(encoding="utf-8", errors="ignore")
                   for f in list(PRD.rglob("*.md")) + list(SDD.rglob("*.md")))
cited = set(re.findall(r"`((?:FR|BR|NFR|AC|RE|RS|SC|GL|IMP|AL|CD|CI|PM|SDD)-[A-Za-z0-9.]+)`",
                       impl_text))
# "FR-08.x" = seluruh FR modul 08 (notasi ringkas); "xx"/"NN" = placeholder template
unknown = sorted(i for i in cited
                 if i not in corpus
                 and not i.endswith(".x")
                 and "xx" not in i and "NN" not in i)
check("Setiap ID yang dirujuk ada di PRD atau SDD", not unknown,
      f"{len(unknown)} tidak ditemukan: {unknown[:12]}" if unknown else f"{len(cited)} ID diperiksa")

# ----------------------------------------------------- 11. penutup baku
missing_closing = [p.stem for p in phase_files
                   if "tidak memuat requirement" not in texts[p]]
check("Setiap phase ditutup dengan pernyataan batas", not missing_closing,
      ", ".join(missing_closing))

print()
print("=" * 60)
if problems:
    print(f"{len(problems)} masalah:")
    for p in problems:
        print("  - " + p)
    sys.exit(1)
print("Seluruh pemeriksaan lolos.")
