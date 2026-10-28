// Satu-satunya port HTTP worker (SDD-SYS-08).
//
// `node:http` polos, bukan Express: worker tidak melayani API, dan dua probe
// tidak membutuhkan router. Path-nya tanpa awalan `/api/v1` karena Bab 17.1
// mengatur API, bukan proses worker.

import { createServer } from "node:http";
import type { Server } from "node:http";
import type {
    HealthRegistry,
    ProbeResponse,
} from "../shared/observability/index.js";
import { liveResponse, readyResponse } from "../shared/observability/index.js";

export function createHealthServer(health: HealthRegistry): Server {
    return createServer((req, res) => {
        const kirim = (r: ProbeResponse): void => {
            res.writeHead(r.statusCode, {
                "content-type": "application/json",
            }).end(JSON.stringify(r.body));
        };
        if (req.method === "GET" && req.url === "/health/live") {
            kirim(liveResponse());
        } else if (req.method === "GET" && req.url === "/health/ready") {
            void readyResponse(health).then(kirim, () =>
                res.writeHead(503).end(),
            );
        } else {
            res.writeHead(404).end();
        }
    });
}
