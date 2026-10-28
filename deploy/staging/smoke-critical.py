#!/usr/bin/env python3
"""CD-07: alur publik dengan fixture [SMOKE]. Rahasia hanya dari environment."""
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import ssl
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


class SmokeFailure(Exception):
    pass


CONTRACT_ERRORS = (SmokeFailure, KeyError, TypeError, IndexError, ValueError, OSError, AttributeError)


def report_error(error):
    print("  GAGAL " + (str(error) if isinstance(error, SmokeFailure) else "Kontrak smoke test tidak sesuai."), file=sys.stderr)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SmokeFailure("Redirect ditolak; periksa origin dan proxy.")


def trusted_url(value):
    u = urllib.parse.urlsplit(value)
    local = u.hostname in ("127.0.0.1", "localhost", "::1")
    if u.username or u.password or not u.hostname or (u.scheme != "https" and not (
            u.scheme == "http" and local and os.environ.get("SMOKE_ALLOW_HTTP_LOOPBACK") == "1")):
        raise SmokeFailure("URL harus HTTPS tanpa kredensial; HTTP hanya untuk fixture loopback eksplisit.")
    return value


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SmokeFailure("Konfigurasi wajib belum diisi: " + name)
    return value


class Smoke:
    def __init__(self, base):
        self.base = trusted_url(base.rstrip("/"))
        parsed = urllib.parse.urlsplit(self.base)
        if parsed.path or parsed.query or parsed.fragment:
            raise SmokeFailure("Gunakan origin tanpa path/query sebagai base URL.")
        self.email, self.password = required("SMOKE_EMAIL"), required("SMOKE_PASSWORD")
        try:
            self.room = int(required("SMOKE_ROOM_ID"))
            self.asset_uuid = str(uuid.UUID(required("SMOKE_ASSET_UUID")))
        except (ValueError, AttributeError):
            raise SmokeFailure("SMOKE_ROOM_ID/SMOKE_ASSET_UUID tidak sah.") from None
        if self.room < 1:
            raise SmokeFailure("SMOKE_ROOM_ID harus positif.")
        self.opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(
            context=ssl.create_default_context(cafile=os.environ.get("SMOKE_CA_FILE") or None)))
        self.token = None
        self.reservation = self.ticket = None
        self.marker = "[SMOKE] " + str(uuid.uuid4())
        self.asset = None
        self.submitted = False
        self.damage_submitted = False

    def request(self, stage, path, body=None, method=None, expected=(200,), key=None):
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        if key:
            headers["Idempotency-Key"] = key
        payload = None if body is None else json.dumps(body).encode("utf-8")
        if payload is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + "/api/v1" + path, data=payload, headers=headers,
                                     method=method or ("POST" if payload is not None else "GET"))
        try:
            with self.opener.open(req, timeout=20) as response:
                if response.status not in expected:
                    raise SmokeFailure(stage + ": status respons tidak sesuai.")
                raw = response.read(2_000_001)
                if response.status == 204:
                    return None
                if len(raw) > 2_000_000:
                    raise SmokeFailure(stage + ": respons terlalu besar.")
                data = json.loads(raw)
                if not isinstance(data, dict) or data.get("success") is not True or "data" not in data:
                    raise SmokeFailure(stage + ": kontrak respons tidak sesuai.")
                return data["data"]
        except urllib.error.HTTPError as error:
            raise SmokeFailure(stage + ": HTTP " + str(error.code)) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise SmokeFailure(stage + ": koneksi gagal.") from None
        except (ValueError, UnicodeError):
            raise SmokeFailure(stage + ": JSON tidak sah.") from None

    def login(self):
        data = self.request("login", "/auth/login", {"email": self.email, "password": self.password, "platform": "ANDROID"})
        if data.get("requires_2fa"):
            secret = required("SMOKE_TOTP_SECRET")
            try:
                decoded = base64.b32decode(secret.upper().replace(" ", ""), casefold=True)
            except (ValueError, base64.binascii.Error):
                raise SmokeFailure("SMOKE_TOTP_SECRET tidak sah.") from None
            counter = int(dt.datetime.now(dt.timezone.utc).timestamp()) // 30
            digest = hmac.new(decoded, struct.pack(">Q", counter), hashlib.sha1).digest()
            offset = digest[-1] & 15
            code = str((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1_000_000).zfill(6)
            data = self.request("OTP", "/auth/2fa/verify", {"challenge_token": data["challenge_token"], "kode": code})
        tokens = data.get("tokens")
        if not isinstance(tokens, dict) or not isinstance(tokens.get("access_token"), str):
            raise SmokeFailure("Login tidak menerbitkan sesi; periksa password awal/2FA.")
        self.token = tokens["access_token"]
        me = self.request("sesi", "/me")
        needed = ("asset.view", "location.view", "reservation.view", "reservation.create", "reservation.cancel_own", "damage.view", "damage.create", "damage.verify")
        if not me["user"]["nama"].startswith("[SMOKE]") or me["user"].get("must_change_password"):
            raise SmokeFailure("Akun harus fixture khusus bernama [SMOKE], dengan password awal sudah diganti.")
        if any(p not in me.get("permissions", {}) for p in needed):
            raise SmokeFailure("Izin akun fixture belum lengkap; periksa runbook smoke test.")
        print("  ok    login dan sesi nyata")

    def read_fixtures(self):
        self.asset = self.request("scan QR", "/assets/by-uuid/" + self.asset_uuid)
        if not self.asset.get("nama", "").startswith("[SMOKE]") or self.asset.get("dihapuskan"):
            raise SmokeFailure("UUID harus menunjuk aset [SMOKE] aktif.")
        rows = self.request("cari aset", "/assets?" + urllib.parse.urlencode({"q": self.asset["kode_barang"], "per_page": 100}))
        if not isinstance(rows, list) or not any(r.get("id") == self.asset["id"] for r in rows):
            raise SmokeFailure("Hasil pencarian tidak memuat aset fixture yang dipindai.")
        room = self.request("ruangan fixture", "/rooms/" + str(self.room))
        if not room.get("nama", "").startswith("[SMOKE]") or room.get("status") != "AKTIF" or not room.get("dapat_direservasi"):
            raise SmokeFailure("Ruangan harus [SMOKE], aktif dan dapat direservasi.")
        opened = self.request("prasyarat tiket", "/damage-reports/open?asset_id=" + self.asset["id"])
        if opened is not None:
            raise SmokeFailure("Fixture masih memiliki tiket terbuka; operator harus menuntaskan run sebelumnya.")
        print("  ok    pencarian dan scan QR cocok dengan fixture khusus")

    def reserve(self):
        start_hour = os.environ.get("SMOKE_START_HOUR_WIB", "09:00")
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", start_hour):
            raise SmokeFailure("SMOKE_START_HOUR_WIB harus HH:MM.")
        wib = dt.timezone(dt.timedelta(hours=7))
        today = dt.datetime.now(wib).date()
        chosen = None
        for offset in range(7, 21):
            day = today + dt.timedelta(days=offset)
            if day.weekday() >= 5:
                continue
            start = dt.datetime.combine(day, dt.time.fromisoformat(start_hour), tzinfo=wib)
            body = {"room_id": self.room, "waktu_mulai": start.isoformat(), "waktu_selesai": (start + dt.timedelta(minutes=30)).isoformat(),
                    "nama_kegiatan": self.marker, "jenis_kegiatan": "Uji staging", "jumlah_peserta": 1, "keperluan": self.marker}
            preview = self.request("pratinjau reservasi", "/reservations/preview", body)
            if preview.get("tanggal") and all(t.get("keadaan") == "TERSEDIA" for t in preview["tanggal"]):
                chosen = body
                break
        if chosen is None:
            raise SmokeFailure("Tidak ada slot fixture tersedia dalam 7–20 hari; periksa kalender/jam/approval.")
        self.submitted = True
        data = self.request("ajukan reservasi", "/reservations", chosen, expected=(201,), key=str(uuid.uuid4()))
        self.reservation = str(data["id"])
        if data.get("status") != "MENUNGGU_PERSETUJUAN":
            raise SmokeFailure("Status reservasi baru tidak sesuai.")
        print("  ok    reservasi [SMOKE] dibuat #" + self.reservation)

    def damage(self):
        # PNG 1×1 adalah bukti fixture sintetis, bukan foto aset operasional.
        photo = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=")
        file = self.request("pesan foto", "/files/presign", {"jenis": "DAMAGE_PHOTO", "mime": "image/png", "ukuran": len(photo)}, expected=(201,))
        upload = urllib.request.Request(trusted_url(file["upload_url"]), data=photo, headers={"Content-Type": "image/png"}, method="PUT")
        try:
            with self.opener.open(upload, timeout=20) as response:
                if response.status not in (200, 201, 204):
                    raise SmokeFailure("Unggah foto fixture gagal.")
        except (urllib.error.URLError, OSError):
            raise SmokeFailure("Unggah foto fixture gagal.") from None
        self.request("konfirmasi foto", "/files/confirm", {"file_id": int(file["file_id"]), "checksum": hashlib.sha256(photo).hexdigest()})
        self.damage_submitted = True
        data = self.request("buat tiket", "/damage-reports", {"asset_id": int(self.asset["id"]), "deskripsi": self.marker + " Bukti sintetis uji otomatis; bukan kerusakan operasional.", "urgensi": "RENDAH", "foto_file_ids": [int(file["file_id"])]}, expected=(201,))
        self.ticket = str(data["id"])
        if data.get("status") != "DILAPORKAN":
            raise SmokeFailure("Status tiket baru tidak sesuai.")
        print("  ok    tiket [SMOKE] dibuat #" + self.ticket)

    def cleanup(self):
        failed = False
        if self.damage_submitted and self.ticket is None:
            try:
                opened = self.request("pulihkan identitas tiket", "/damage-reports/open?asset_id=" + str(self.asset["id"]))
                if opened is not None:
                    detail = self.request("periksa marker tiket", "/damage-reports/" + str(opened["id"]))
                    if detail.get("deskripsi", "").startswith(self.marker + " ") and str(detail.get("objek", {}).get("id")) == str(self.asset["id"]):
                        self.ticket = str(opened["id"])
                    else:
                        raise SmokeFailure("Tiket terbuka bukan milik run ini; penutupan otomatis ditolak.")
            except CONTRACT_ERRORS as error:
                report_error(error)
                failed = True
        if self.submitted and self.reservation is None:
            # Bila balasan POST hilang, cari hanya marker unik run ini pada akun sendiri.
            try:
                rows = self.request("pulihkan identitas reservasi", "/reservations?" + urllib.parse.urlencode({"q": self.marker, "pemohon": "saya"}))
                matches = [r for r in rows if r.get("nama_kegiatan") == self.marker and str((r.get("ruangan") or {}).get("id")) == str(self.room)]
                if len(matches) == 1:
                    self.reservation = str(matches[0]["id"])
            except CONTRACT_ERRORS as error:
                report_error(error)
                failed = True
        if self.ticket:
            try:
                data = self.request("tutup tiket fixture", "/damage-reports/" + self.ticket + "/verify", {"keputusan": "PERBAIKAN_RINGAN", "catatan": self.marker + " Penutupan fixture sintetis setelah smoke test."})
                if data.get("status") != "SELESAI":
                    raise SmokeFailure("Penutupan tiket fixture belum terkonfirmasi.")
                print("  ok    tiket ditutup, audit tetap tersimpan #" + self.ticket)
            except CONTRACT_ERRORS as error:
                report_error(error)
                failed = True
        if self.reservation:
            try:
                data = self.request("batalkan reservasi fixture", "/reservations/" + self.reservation + "/cancel", {"alasan": self.marker + " Pembersihan smoke test."})
                if data.get("status") != "DIBATALKAN":
                    raise SmokeFailure("Pembatalan fixture belum terkonfirmasi.")
                print("  ok    reservasi dibatalkan #" + self.reservation)
            except CONTRACT_ERRORS as error:
                report_error(error)
                failed = True
        if self.token:
            try:
                self.request("logout", "/auth/logout", {}, expected=(204,))
            except CONTRACT_ERRORS as error:
                report_error(error)
                failed = True
        if failed:
            raise SmokeFailure("Pembersihan fixture/sesi gagal; periksa run [SMOKE] sebelum deployment berikutnya.")


def main():
    smoke = None
    result = 0
    try:
        smoke = Smoke(sys.argv[1])
        smoke.login()
        smoke.read_fixtures()
        smoke.reserve()
        smoke.damage()
    except CONTRACT_ERRORS as error:
        report_error(error)
        result = 1
    finally:
        if smoke:
            try:
                smoke.cleanup()
            except CONTRACT_ERRORS as error:
                report_error(error)
                result = 1
    return result


if __name__ == "__main__":
    sys.exit(main())
