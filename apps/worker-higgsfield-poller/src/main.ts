import { createServer } from "node:http";
import { loadConfig } from "@aaf/core/config";

/**
 * worker-higgsfield-poller entrypoint (TDD §5 "an entrypoint (main.ts) that starts a polling
 * loop calling into the relevant @aaf/core module functions, plus its own
 * Dockerfile — no UI code, no Next.js dependency").
 *
 * Owner: Agent 4 (Render Provider Framework) — this file is a scaffold only (Engineering Constitution
 * Article VIII: Agent 1 must not implement business logic). Per TDD §2,
 * this service polls in-flight Higgsfield jobs for status, hands off completed jobs to the Upload Worker. The owning agent replaces `tick()` below with real
 * polling logic against its @aaf/core module(s), keeping this file's
 * structure (config load once at startup, health server, graceful
 * shutdown, "scheduler is a lightweight internal timer inside each worker"
 * per TDD §2) intact.
 */

const config = loadConfig();
const instanceId = config.worker.instanceId ?? "higgsfield-poller-dev";

let lastTickAt = Date.now();
let tickCount = 0;

function tick(): void {
  tickCount += 1;
  lastTickAt = Date.now();
  console.log(
    `[worker-higgsfield-poller] instance=${instanceId} tick=${tickCount} — not yet implemented (owner: Agent 4 (Render Provider Framework))`,
  );
}

const POLL_INTERVAL_MS = 10_000;
const intervalHandle = setInterval(tick, POLL_INTERVAL_MS);
tick();

// Health endpoint (TDD §37): process up, DB connection reachable (stubbed
// true here since this Sprint has no query to run yet), time since last
// successful tick — distinguishes "up but stopped ticking" from dead.
const server = createServer((req, res) => {
  if (req.url === "/health") {
    const msSinceLastTick = Date.now() - lastTickAt;
    const healthy = msSinceLastTick < POLL_INTERVAL_MS * 3;
    res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: healthy ? "ok" : "degraded",
        instanceId,
        tickCount,
        msSinceLastTick,
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const HEALTH_PORT = 8080;
server.listen(HEALTH_PORT, () => {
  console.log(`[worker-higgsfield-poller] health endpoint listening on :${HEALTH_PORT}`);
});

function shutdown(): void {
  clearInterval(intervalHandle);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
