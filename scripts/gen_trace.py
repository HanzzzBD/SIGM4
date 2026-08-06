#!/usr/bin/env python3
"""Phase 3 — papan skor traceability.

Digenerate dari isi docs/. Status awal semua "Not Started"; nilai yang sudah
diisi manual pada berkas sebelumnya DIPERTAHANKAN saat regenerasi.

Jalankan dari root proyek:  python scripts/gen_trace.py
"""
import collections
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from allocation_map import MODULES, OPEN_ISSUES  # noqa: E402

BASE = os.path.join("docs", "PRD")
SKIP_DIRS = {"_generated"}
DEST = os.path.join(BASE, "06-quality", "traceability.md")
DEFAULT_STATUS = "Not Started"
VALID = ("Not Started", "In Progress", "Done", "Tested", "Accepted")

TITLE = {s: (n, t) for s, n, t in MODULES}

RE_FR = re.compile(r"^### (FR-\d+\.\d+[a-z]?)\s+(.+?)\s*$")
RE_BR = re.compile(r"^\| (BR-\d+[a-z]*) \| (.+?) \|\s*$")
RE_KEEP = re.compile(r"^\| `([A-Z]{2}-[\w.]+)` \|.*?\| ([A-Za-z ]+) \| ?(.*?) \|\s*$")


def load_existing():
    keep = {}
    if not os.path.exists(DEST):
        return keep
    with open(DEST, encoding="utf-8") as fh:
        for line in fh:
            m = RE_KEEP.match(line.rstrip("\n"))
            if m and m.group(2).strip() in VALID:
                keep[m.group(1)] = (m.group(2).strip(), m.group(3).strip())
    return keep


def collect():
    frs, brs = [], []
    for root, dirs, files in os.walk(BASE):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in sorted(files):
            if not fn.endswith(".md") or fn.endswith("-index.md"):
                continue
            rel = os.path.relpath(os.path.join(root, fn), BASE).replace("\\", "/")
            with open(os.path.join(root, fn), encoding="utf-8") as fh:
                for line in fh:
                    m = RE_FR.match(line)
                    if m:
                        frs.append((m.group(1), m.group(2), rel))
                    m = RE_BR.match(line)
                    if m:
                        d = re.sub(r"[*`~]", "", m.group(2))
                        brs.append((m.group(1), d[:92] + "…" if len(d) > 95 else d, rel))
    return frs, brs


def module_of(path):
    m = re.search(r"02-modules/([\w-]+)\.md", path)
    if m and m.group(1) in TITLE:
        return f"{TITLE[m.group(1)][0]} {TITLE[m.group(1)][1]}"
    return "—"


def main():
    keep = load_existing()
    frs, brs = collect()

    frs.sort(key=lambda c: (int(c[0][3:].split(".")[0]),
                            int(re.sub(r"\D", "", c[0].split(".")[1])), c[0]))
    brs.sort(key=lambda c: (int(re.match(r"BR-(\d+)", c[0]).group(1)),
                            re.match(r"BR-\d+([a-z]*)", c[0]).group(1)))
    seen = set()
    brs = [b for b in brs if not (b[0] in seen or seen.add(b[0]))]

    def cell(code):
        return keep.get(code, (DEFAULT_STATUS, ""))

    out = [
        "# Traceability & Implementation Scoreboard",
        "",
        "> Digenerate dari isi `docs/PRD/` dengan `scripts/gen_trace.py`.",
        "> **Kolom Status dan Notes diisi manual** dan dipertahankan saat regenerasi.",
        ">",
        f"> Status yang sah: {' · '.join('`' + v + '`' for v in VALID)}",
        "> Status awal seluruh baris adalah `Not Started`. **Status implementasi tidak pernah ditebak** —",
        "> hanya diubah manual oleh yang mengerjakan.",
        ">",
        "> Kolom *ID* adalah alamat sebenarnya. Path berkas boleh berubah; ID tidak.",
        "",
        "## A. Functional Requirements",
        "",
        f"Total: **{len(frs)}** requirement.",
        "",
        "| ID | Module | File | Status | Notes |",
        "|---|---|---|:---:|---|",
    ]
    for code, title, path in frs:
        st, note = cell(code)
        out.append(f"| `{code}` | {module_of(path)} | `{path}` | {st} | {note} |")

    out += [
        "",
        "## B. Business Rules",
        "",
        f"Total: **{len(brs)}** aturan. Setiap aturan wajib memiliki minimal satu test case",
        "(lihat [`test-strategy.md`](test-strategy.md)).",
        "",
        "| ID | Module | File | Status | Notes |",
        "|---|---|---|:---:|---|",
    ]
    for code, desc, path in brs:
        st, note = cell(code)
        out.append(f"| `{code}` | {module_of(path)} | `{path}` | {st} | {note} |")

    per = collections.Counter(module_of(p) for _, _, p in frs)
    out += ["", "## C. Sebaran per Modul", "", "| Module | FR | BR |", "|---|---:|---:|"]
    perbr = collections.Counter(module_of(p) for _, _, p in brs)
    for mod in sorted(set(per) | set(perbr)):
        out.append(f"| {mod} | {per.get(mod, 0)} | {perbr.get(mod, 0)} |")

    out += ["", "## D. Open Issues yang Menunggu Keputusan", "",
            "Dikumpulkan dari bagian 15 tiap berkas modul. **Tidak boleh ditebak** oleh",
            "pelaksana; perlu keputusan pemilik produk sebelum modul terkait dianggap selesai.",
            "", "| Module | Isu |", "|---|---|"]
    n_issue = 0
    for slug, num, name in MODULES:
        for issue in OPEN_ISSUES.get(slug, []):
            n_issue += 1
            out.append(f"| {num} | {issue} |")
    if not n_issue:
        out.append("| — | _Tidak ada._ |")

    out += ["", "---", "",
            f"Ringkasan: **{len(frs)} FR** · **{len(brs)} BR** · **{n_issue} open issue** · "
            f"seluruhnya berstatus awal `{DEFAULT_STATUS}`.", ""]

    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    with open(DEST, "w", encoding="utf-8", newline="") as fh:
        fh.write("\n".join(out))
    print(f"{DEST}: {len(frs)} FR, {len(brs)} BR, {n_issue} open issue.")
    print(f"Status manual dipertahankan: {sum(1 for c, _, _ in frs + brs if c in keep)}")


if __name__ == "__main__":
    main()
