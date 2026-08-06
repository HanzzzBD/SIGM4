#!/usr/bin/env python3
"""Regenerasi 4 indeks pusat dari berkas modul.

Ini satu-satunya skrip yang perlu dijalankan ulang saat isi modul berubah.
Tidak bergantung pada pohon lama docs/PRD (yang sudah dihapus setelah migrasi).

Jalankan dari root proyek:  python scripts/gen_indexes.py
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from allocation_map import MODULES  # noqa: E402

MODDIR = os.path.join("docs", "PRD", "02-modules")
OUTDIR = os.path.join("docs", "PRD", "_generated")

BANNER = ("<!-- DIGENERATE OTOMATIS oleh scripts/gen_indexes.py — JANGAN SUNTING BERKAS INI.\n"
          "     Sumber kebenaran setiap baris ada di berkas modul terkait (docs/02-modules/).\n"
          "     Menyunting di sini akan hilang saat regenerasi berikutnya. -->\n")


def harvest(pattern, group=1):
    rows = []
    for slug, num, _ in MODULES:
        p = os.path.join(MODDIR, f"{slug}.md")
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as fh:
            for line in fh:
                m = re.match(pattern, line)
                if m:
                    rows.append((m.group(group), line.rstrip("\n"), slug, num))
    return rows


def emit(name, title, note, header, pattern, sortkey, group=1):
    rows = sorted(harvest(pattern, group), key=sortkey)
    body = [BANNER, f"# {title}", "", f"> {note}",
            f"> Total: **{len(rows)}** baris, dikumpulkan dari {len(MODULES)} berkas modul.", "",
            header]
    for _, line, slug, num in rows:
        body.append(line.rstrip() + f" [{num}](../02-modules/{slug}.md) |")
    body.append("")
    dest = os.path.join(OUTDIR, name)
    with open(dest, "w", encoding="utf-8", newline="") as fh:
        fh.write("\n".join(body))
    print(f"  {dest}  ({len(rows)} baris)")
    return len(rows)


def nkey(prefix):
    def f(r):
        m = re.match(rf"{prefix}-(\d+)([a-z]*)", r[0])
        return (int(m.group(1)), m.group(2)) if m else (9999, "")
    return f


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    print("Regenerasi indeks:")
    n = {}
    n["BR"] = emit("business-rules-index.md", "Indeks Business Rules",
                   "Setiap aturan dimiliki satu modul. Sunting di berkas modulnya, bukan di sini.",
                   "| Kode | Business Rule | Pemilik |\n|---|---|---|",
                   r"^\| (BR-\d+[a-z]*) \|", nkey("BR"))
    n["NT"] = emit("notifications-index.md", "Indeks Notifikasi",
                   "Setiap notifikasi dimiliki modul yang menerbitkan event-nya.",
                   "| Kode | Event | Penerima | Kanal | Wajib | Contoh | Pemilik |\n"
                   "|---|---|---|---|:---:|---|---|",
                   r"^\| \*\*(NT-\d+[a-z]*)\*\* \|", nkey("NT"))
    n["API"] = emit("api-index.md", "Indeks Endpoint API",
                    "Setiap endpoint dimiliki satu modul. Konvensi umum di `../03-architecture/api-conventions.md`.",
                    "| Method | Endpoint | Permission | Deskripsi | Pemilik |\n|---|---|---|---|---|",
                    r"^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)`", lambda r: r[1], 2)
    n["LOG"] = emit("activity-log-index.md", "Indeks Aksi Activity Log",
                    "Setiap aksi dimiliki modul penerbitnya. Prinsip pencatatan di `../03-architecture/activity-log.md`.",
                    "| Aksi | Keterangan | Pemilik |\n|---|---|---|",
                    r"^\| `([A-Z_]+)", lambda r: r[0])
    print("\n" + "  ".join(f"{k}={v}" for k, v in n.items()))


if __name__ == "__main__":
    main()
