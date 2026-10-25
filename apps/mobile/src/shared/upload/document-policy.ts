const MIME: Readonly<Record<string, string>> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
export const DOCUMENT_TYPES = Object.values(MIME).filter((v, i, all) => all.indexOf(v) === i);
/** Kebijakan ASSET_DOCUMENT / MATERIAL_RECEIPT_DOCUMENT (M-06): PDF, JPG, PNG, DOCX, XLSX; maks 10 MB; nama ≤ 255. */
export function documentMime(name: string, size: number): { mime: string } | { error: string } {
    const mime = MIME[name.split(".").at(-1)?.toLowerCase() ?? ""];
    if (!mime) return { error: "Pilih berkas PDF, JPG, PNG, DOCX, atau XLSX." };
    if (size <= 0) return { error: "Berkas kosong. Pilih berkas yang berisi dokumen." };
    if (size > 10 * 1024 * 1024) return { error: "Ukuran dokumen maksimal 10 MB." };
    return name.length > 255 ? { error: "Nama berkas maksimal 255 karakter." } : { mime };
}
