// Artefak dihasilkan dari dist commit yang baru dibangun, tanpa koneksi database/Redis.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { registry } from "../apps/api/dist/api/index.js";
import { buildOpenApiDocument } from "../apps/api/dist/api/openapi.js";

const [version, output] = process.argv.slice(2);
if (!version || !output || process.argv.length !== 4) throw new Error("Pemakaian: node scripts/generate-openapi.mjs <versi/commit> <output.json>");
const target = resolve(output);
const document = buildOpenApiDocument(registry, { version });
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(document, null, 2) + "\n", "utf8");
process.stdout.write(`OpenAPI ${version}: ${Object.keys(document.paths).length} path → ${target}\n`);
