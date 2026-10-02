// Permukaan publik m05-qr (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul lain /
// entrypoint `api/`.
export type { QrModuleDeps } from "./routes.js";
export { printQrRoute, qrRouter, qrTerpasangRoute, regenerateQrRoute } from "./routes.js";
