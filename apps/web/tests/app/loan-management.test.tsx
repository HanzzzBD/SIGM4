import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { FineDetail, LoanDetail } from "@sigm4/schemas";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";

const ME = { ...ME_ADMIN, permissions: { "loan.view": "all", "loan.extend": "all", "fine.view": "all", "fine.manage": "all", "fine.waive": "all", "fine.waive_compensation": "all", "approval.decide": "all", "approval.view": "all" } };
const LOAN: LoanDetail = { id: "101", nomor: "PJM-2027-0101", reservation_id: "100", nomor_reservasi: "RSV-BR-2027-0100", peminjam: { id: "2", nama: "Guru Uji" }, petugas: { id: "1", nama: "Petugas Uji" }, nama_penerima: "Guru Uji", diwakilkan: false, bypass_approval: false, alasan_bypass: null, tanggal_pinjam: "2027-07-05T01:00:00Z", tanggal_jatuh_tempo: "2027-07-06T10:00:00Z", tanggal_kembali: null, status: "DIPINJAM", signature: null, aksi: { checkin: false, perpanjang: true }, perpanjangan: [], unit: [] };
const FINE: FineDetail = { id: "9", loan_id: "101", loan_item_id: "11", nomor_peminjaman: LOAN.nomor, kode_barang: "PRJ-01", nama_aset: "Proyektor", peminjam: LOAN.peminjam, jenis: "KETERLAMBATAN", status: "BELUM_DIBAYAR", jumlah: "2000.00", jumlah_dibebaskan: "0.00", sisa: "2000.00", menunggu_penetapan: false, hari_terlambat: 2, tarif_per_hari: "1000.00", jumlah_sebelum_cap: "2000.00", created_at: "2027-07-05T00:00:00Z", tanggal_bayar: null, nomor_bukti: null, aksi: { bayar: true, bebaskan: true, bebaskan_ganti_rugi: false, usulkan_nilai: false, putuskan_nilai: false, buka_kembali: false }, riwayat: [], usulan: [], blokir: { aktif: true, alasan: ["Sisa kewajiban melebihi ambang."], konfigurasi_lengkap: true } };
beforeAll(() => { vi.stubGlobal("crypto", { randomUUID }); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }); });
afterAll(() => { vi.unstubAllGlobals(); });
function server(initial: FineDetail = FINE, own = false, fail = false) {
 let fine = initial, extended = false;
 return pasangServer((p) => {
  if (p.url === "/me") return sukses(own ? { ...ME, user: { ...ME.user, id: "2" }, permissions: { "loan.view": "own", "fine.view": "own" } } : ME);
  if (p.url?.endsWith("/filter-options")) return sukses({ peminjam: [LOAN.peminjam], kategori: [{ id: "1", nama: "Elektronik" }] });
  if (p.url === "/loans") return { status: 200, data: { success: true, data: [{ ...LOAN, unit_aktif: 1, hari_terlambat: 2, estimasi_denda: "2000.00" }], meta: { page: 1, per_page: 25, total: 1, total_pages: 1 } } };
  if (p.url === "/fines") return { status: 200, data: { success: true, data: [fine], meta: { page: 1, per_page: 25, total: 1, total_pages: 1 } } };
  if (p.url === "/fines/9") return sukses(own ? { ...fine, aksi: { bayar: false, bebaskan: false, bebaskan_ganti_rugi: false, usulkan_nilai: false, putuskan_nilai: false, buka_kembali: false } } : fine);
  if (p.url === "/fines/9/pay") { if (fail) return gagal(503, "SERVICE_UNAVAILABLE", "Hasil pembayaran belum tersedia."); fine = { ...fine, status: "LUNAS", sisa: "0.00", aksi: { ...fine.aksi, bayar: false, bebaskan: false }, blokir: { ...fine.blokir, aktif: false, alasan: [] } }; return sukses({ id: "9", status: "LUNAS" }); }
  if (p.url === "/fines/9/waive-compensation") { fine = { ...fine, status: "DIBEBASKAN_SEBAGIAN", jumlah_dibebaskan: "1000.00", sisa: "9000.00" }; return sukses({ id: "9", status: fine.status }); }
  if (p.url === "/fines/9/replacement-proposals") return sukses({ id: "7", status: "MENUNGGU" });
  if (p.url === "/loans/101") return sukses({ ...LOAN, aksi: { ...LOAN.aksi, perpanjang: !extended }, perpanjangan: extended ? [{ id: "8", status: "MENUNGGU_PERSETUJUAN", jatuh_tempo_lama: LOAN.tanggal_jatuh_tempo, jatuh_tempo_baru: "2027-07-07T10:00:00Z", alasan: "Mengajar lanjutan", approval_instance_id: "55", diputuskan_pada: null }] : [] });
  if (p.url === "/loans/101/extend") { extended = true; return sukses({ id: "8", status: "MENUNGGU_PERSETUJUAN", jatuh_tempo_lama: LOAN.tanggal_jatuh_tempo, jatuh_tempo_baru: "2027-07-07T10:00:00Z", alasan: "Mengajar lanjutan", approval_instance_id: "55", diputuskan_pada: null }); }
  return { status: 404 };
 });
}
describe("PR-05-05..08 — web pemantauan, kewajiban dan perpanjangan", () => {
 it("empat tab dan saringan peminjaman berada di URL, estimasi jelas dan axe lulus", async () => {
  const calls = server(), { container } = await renderAplikasi("/peminjaman"); await screen.findByRole("link", { name: LOAN.nomor });
  fireEvent.click(screen.getByRole("button", { name: "Terlambat" })); await waitFor(() => expect(calls.some((p) => p.url === "/loans" && p.params?.["tab"] === "terlambat")).toBe(true));
  // UXD-24: penjelasan estimasi pindah ke Popover Info C-39; kolom tabel tetap menamai nilainya estimasi.
  expect(await screen.findByRole("columnheader", { name: "Estimasi denda" })).toBeTruthy(); expect(await pelanggaranAxe(container)).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Tentang halaman ini" })); expect((await screen.findByText(/Denda berjalan adalah estimasi/)).textContent).toContain("sampai pengembalian tercatat");
 });
 it("PR-07-39: P-32 Tabel ⇄ Kartu membaca tab & saringan URL yang sama (UXD-26)", async () => {
  const calls = server(), { router } = await renderAplikasi("/peminjaman?tab=terlambat"); await screen.findByRole("table", { name: "Daftar peminjaman" });
  const sebelum = router.state.location.href, params = calls.filter((p) => p.url === "/loans").map((p) => JSON.stringify(p.params));
  fireEvent.click(screen.getByRole("radio", { name: "Kartu" })); expect(screen.queryByRole("table")).toBeNull();
  expect(within(screen.getByRole("list", { name: "Daftar peminjaman" })).getByRole("link", { name: new RegExp(LOAN.nomor) }).getAttribute("href")).toBe("/peminjaman/101");
  expect(router.state.location.href).toBe(sebelum); expect(new Set(calls.filter((p) => p.url === "/loans").map((p) => JSON.stringify(p.params)))).toEqual(new Set(params)); expect(params.every((p) => JSON.parse(p).tab === "terlambat")).toBe(true);
 });
 it("PR-07-39: P-34 saran jatuh tempo ≤ 3 hari membuka form perpanjangan di tempat (FR-09.3, BR-034, keputusan 46)", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2027-07-05T12:00:00Z"));
  try {
   server(); await renderAplikasi("/peminjaman/101"); const saran = await screen.findByRole("note", { name: "Peminjaman jatuh tempo dalam 1 hari" });
   fireEvent.click(within(saran).getByRole("button", { name: "Ajukan perpanjangan" })); expect(await screen.findByLabelText(/Jatuh tempo baru/)).toBeTruthy(); expect(screen.queryByRole("note")).toBeNull();
  } finally { vi.useRealTimers(); }
 });
 it("PR-07-39: P-34 tanpa saran bila jatuh tempo masih > 3 hari", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2027-07-01T12:00:00Z"));
  try { server(); await renderAplikasi("/peminjaman/101"); await screen.findByRole("heading", { name: LOAN.nomor }); expect(screen.queryByRole("note")).toBeNull(); } finally { vi.useRealTimers(); }
 });
 it("daftar kewajiban memilih jenis/status dan menautkan detail", async () => {
  const calls = server(); await renderAplikasi("/denda"); await screen.findByRole("link", { name: /Keterlambatan.*PRJ-01/ });
  fireEvent.change(screen.getByRole("combobox", { name: "Jenis kewajiban" }), { target: { value: "GANTI_RUGI" } }); await waitFor(() => expect(calls.some((p) => p.url === "/fines" && p.params?.["jenis"] === "GANTI_RUGI")).toBe(true));
 });
 it("lunas mewajibkan bukti; drawer menampilkan konsekuensi dan memperbarui receipt", async () => {
  const calls = server(), { container } = await renderAplikasi("/denda/9"); fireEvent.click(await screen.findByRole("button", { name: "Tandai Lunas" })); const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Tandai Lunas" })); await screen.findByText("Nomor bukti wajib diisi."); expect(calls.filter((p) => p.url === "/fines/9/pay")).toHaveLength(0);
  fireEvent.change(screen.getByRole("textbox", { name: /Nomor bukti pembayaran/ }), { target: { value: "BUKTI-01" } }); expect(await pelanggaranAxe(container)).toEqual([]); fireEvent.click(within(dialog).getByRole("button", { name: "Tandai Lunas" }));
  await screen.findByText("Perubahan kewajiban tercatat."); await screen.findByText("Lunas"); expect(calls.find((p) => p.url === "/fines/9/pay")!.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
 });
 it("retry pembayaran dengan body sama mempertahankan key idempoten", async () => {
  const calls = server(FINE, false, true); await renderAplikasi("/denda/9"); fireEvent.click(await screen.findByRole("button", { name: "Tandai Lunas" })); const dialog = await screen.findByRole("dialog"); fireEvent.change(screen.getByRole("textbox", { name: /Nomor bukti pembayaran/ }), { target: { value: "BUKTI-02" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Tandai Lunas" })); await screen.findByText("Terjadi gangguan pada sistem. Coba lagi beberapa saat lagi."); fireEvent.click(within(dialog).getByRole("button", { name: "Tandai Lunas" })); await waitFor(() => expect(calls.filter((p) => p.url === "/fines/9/pay")).toHaveLength(2)); const sends = calls.filter((p) => p.url === "/fines/9/pay"); expect(sends[0]!.headers["Idempotency-Key"]).toBe(sends[1]!.headers["Idempotency-Key"]);
 });
 it("pembebasan ganti rugi meminta nominal dan alasan, sisa tetap terlihat", async () => {
  const fine: FineDetail = { ...FINE, jenis: "GANTI_RUGI", jumlah: "10000.00", sisa: "10000.00", aksi: { ...FINE.aksi, bebaskan: false, bebaskan_ganti_rugi: true } }, calls = server(fine); await renderAplikasi("/denda/9"); fireEvent.click(await screen.findByRole("button", { name: "Bebaskan Ganti Rugi" })); const dialog = await screen.findByRole("dialog");
  expect((within(dialog).getByRole("button", { name: "Bebaskan Ganti Rugi" }) as HTMLButtonElement).disabled).toBe(true); fireEvent.change(screen.getByRole("textbox", { name: /Nilai yang dibebaskan/ }), { target: { value: "1000" } }); fireEvent.change(screen.getByRole("textbox", { name: /Alasan atau catatan/ }), { target: { value: "Keputusan Pimpinan" } }); fireEvent.click(within(dialog).getByRole("button", { name: "Bebaskan Ganti Rugi" })); await screen.findByText("Dibebaskan Sebagian"); expect(calls.find((p) => p.url?.endsWith("waive-compensation"))!.data).toMatchObject({ jumlah: "1000", alasan: "Keputusan Pimpinan" });
 });
 it("peminjam melihat kewajiban dan blokir tanpa tombol pengelola", async () => {
  server(FINE, true); await renderAplikasi("/denda/9"); await screen.findByText("Pengajuan peminjam diblokir"); expect(screen.queryByRole("button", { name: "Tandai Lunas" })).toBeNull(); expect(screen.queryByRole("button", { name: "Bebaskan Denda" })).toBeNull();
 });
 it("perpanjangan ditinjau sebelum POST dan jadwal belum berubah selama approval", async () => {
  const calls = server(); await renderAplikasi("/peminjaman/101"); fireEvent.click(await screen.findByRole("button", { name: "Ajukan Perpanjangan" })); fireEvent.change(screen.getByLabelText(/Jatuh tempo baru/), { target: { value: "2027-07-07T17:00" } }); fireEvent.change(screen.getByRole("textbox", { name: /Alasan perpanjangan/ }), { target: { value: "Mengajar lanjutan" } }); fireEvent.click(screen.getByRole("button", { name: "Tinjau perpanjangan" })); const dialog = await screen.findByRole("dialog"); expect(calls.filter((p) => p.url === "/loans/101/extend")).toHaveLength(0); fireEvent.click(within(dialog).getByRole("button", { name: "Ajukan Perpanjangan" })); await screen.findByText("Riwayat perpanjangan"); await screen.findByText(/Menunggu Persetujuan.*Mengajar lanjutan/); expect(calls.find((p) => p.url === "/loans/101/extend")!.data).toMatchObject({ tanggal_jatuh_tempo: "2027-07-07T17:00:00+07:00" });
 });
});
