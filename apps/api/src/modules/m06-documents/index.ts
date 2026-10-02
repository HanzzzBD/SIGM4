// Permukaan publik m06-documents (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul lain /
// entrypoint `api/`.
export type { FilesModuleDeps } from "./routes.js";
export { confirmRoute, filesRouter, presignRoute } from "./routes.js";
/** Penjaga unduh SDD-FS-03 — dipakai seluruh penerbit URL unduhan (PR-03-06 dst.). */
export type { TampilanFoto } from "./services/file.service.js";
export { buatPengelolaFotoProfil, urlUnduhBerkas } from "./services/file.service.js";
