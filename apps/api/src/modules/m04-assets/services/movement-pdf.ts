import type { AssetMovementSnapshot } from "@sigm4/schemas";

/** Seluruh nilai snapshot tetap teks; renderer menolak jaringan dan JavaScript. */
export function movementDocumentHtml(id: string, snapshot: AssetMovementSnapshot): string {
    const escape = (text: string) => text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
    const location = (value: AssetMovementSnapshot["tujuan"]) => escape(`${value.gedung} / ${value.area} / ${value.nama} (${value.kode})`);
    const rows = snapshot.aset.map((asset, index) => `<tr><td>${String(index + 1)}</td><td><b>${escape(asset.kode_barang)}</b><br>${escape(asset.nama)}<br>Nomor seri: ${escape(asset.nomor_seri ?? "—")}</td><td>${location(asset.asal)}</td><td>${escape(asset.penanggung_jawab_lama?.nama ?? "—")} → ${escape(asset.penanggung_jawab_baru?.nama ?? "—")}</td></tr>`).join("");
    return `<!doctype html><html lang="id"><meta charset="utf-8"><title>Berita acara mutasi ${escape(id)}</title>
<style>@page{size:A4;margin:18mm}body{font:11pt Arial,sans-serif;color:#111}h1{font-size:18pt}dl{display:grid;grid-template-columns:120px 1fr;gap:8px}dd{margin:0}table{table-layout:fixed;border-collapse:collapse;width:100%;margin-top:20px;font-size:9pt}th,td{border:1px solid #555;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:6%}thead{display:table-header-group}tr{break-inside:avoid}.reason{white-space:pre-wrap;overflow-wrap:anywhere}footer{margin-top:24px;font-size:9pt}</style>
<h1>Berita Acara Mutasi Aset</h1><dl><dt>ID operasi</dt><dd>${escape(id)}</dd><dt>Tanggal mutasi</dt><dd>${escape(snapshot.tanggal_mutasi)}</dd><dt>Dicatat (UTC)</dt><dd>${escape(snapshot.dicatat_pada)}</dd><dt>Pelaku</dt><dd>${escape(snapshot.pelaku.nama)} (ID ${escape(snapshot.pelaku.id)})</dd><dt>Tujuan</dt><dd>${location(snapshot.tujuan)}</dd><dt>Jumlah aset</dt><dd>${String(snapshot.aset.length)} unit</dd></dl>
<h2>Alasan mutasi</h2><p class="reason">${escape(snapshot.alasan)}</p><table><thead><tr><th>No.</th><th>Identitas aset</th><th>Lokasi asal</th><th>Penanggung jawab lama → baru</th></tr></thead><tbody>${rows}</tbody></table>
<footer>Dokumen dibuat dari data transaksi yang tersimpan. ID operasi ${escape(id)}.</footer></html>`;
}
