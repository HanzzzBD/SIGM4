// Pemeriksaan `object_storage` (OBS-06, SDD-15 §4.5; PR-03-04). MENENTUKAN `ready`: tanpa object
// storage, unggah/unduh dokumen & foto gagal — ditetapkan per nama di `MENENTUKAN_KESIAPAN`.

import type { HealthCheck } from "../observability/index.js";
import { pingCheck } from "../observability/index.js";
import type { PenyimpananObjek } from "./storage.js";

export function objectStorageCheck(penyimpanan: PenyimpananObjek): HealthCheck {
    return pingCheck("object_storage", () => penyimpanan.periksa());
}
