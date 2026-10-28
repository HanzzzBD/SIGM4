// Validasi koreografi shell tanpa mengklaim deploy VPS; jalur HTTP aplikasi diuji terpisah.
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const document = JSON.parse(await readFile(new URL("../../build/qa/openapi.json", import.meta.url), "utf8"));
const server = createServer((req, res) => {
    res.setHeader("X-Request-Id", "qa-openapi"); res.setHeader("Content-Security-Policy", "default-src 'none'"); res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/docs") res.end(JSON.stringify(document));
    else if (req.url.startsWith("/api/v1/health/")) res.end('{"status":"up"}');
    else { res.statusCode = 404; res.end('{"error":{"code":"NOT_FOUND"}}'); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const smoke = (revision) => new Promise((resolve) => execFile(bash, ["deploy/staging/smoke-test.sh", base], { windowsHide: true, env: { ...process.env, SMOKE_EXPECTED_REVISION: revision } }, (error) => resolve(error?.code ?? 0)));
try {
    assert.equal(await smoke(document.info.version), 0);
    assert.equal(await smoke("wrong-commit"), 1);
    process.stdout.write("Smoke shell lulus untuk commit sesuai dan menolak commit berbeda.\n");
} finally { await new Promise((resolve) => server.close(resolve)); }
