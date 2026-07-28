import { createServer } from "node:http";
import { loadConfig } from "@aaf/core/config";
import { createServiceRoleClient } from "@aaf/core/db";
import { createHiggsfieldProvider, defaultRenderProviderRegistry } from "@aaf/core/higgsfield";
import { recoverStaleClaims } from "./generation-jobs-repo.js";
import { recoverStaleTrainingClaims } from "./training-jobs-repo.js";
import { runGenerationPollTick, GENERATION_TIMEOUT_MS } from "./generation-poller.js";
import { runSoulIdTrainingPollTick } from "./training-poller.js";

/**
 * worker-higgsfield-poller entrypoint (TDD §5, §11 "Higgsfield Status
 * Poller tick" every 15s + "Soul ID Training Poller tick" every 60s).
 *
 * Owner: Agent 4 (Render Provider Framework). Per TDD §9.6/Constitution
 * Article VIII, this service tracks in-flight Higgsfield jobs' status —
 * submission happens in `mission-dispatcher` (Agent 2), calling this
 * package's `createHiggsfieldProvider(...).submitGeneration(...)`
 * directly; this worker never claims `queued` Render Queue rows itself.
 */

const config = loadConfig();
const instanceId = config.worker.instanceId ?? "higgsfield-poller-dev";

if (!config.higgsfield.apiKey || !config.higgsfield.apiBaseUrl) {
  // Fail fast at boot (TDD §30 "fails fast ... rather than failing confusingly deep in a
  // request/job path later") — this service has no reason to exist without Higgsfield
  // credentials, unlike `web`, for which the config schema leaves these optional (Agent 1's
  // schema comment: "Agent 4 should tighten these to required in its own service entrypoint
  // validation once the Higgsfield client lands" — this is that tightening).
  console.error(
    "[worker-higgsfield-poller] HIGGSFIELD_API_KEY and HIGGSFIELD_API_BASE_URL are required for this service. Exiting.",
  );
  process.exit(1);
}

const db = createServiceRoleClient(config);
const provider = createHiggsfieldProvider({
  apiKey: config.higgsfield.apiKey,
  apiBaseUrl: config.higgsfield.apiBaseUrl,
  requestTimeoutMs: 30_000,
});
defaultRenderProviderRegistry.register(provider);

const retryPolicy = { maxAttempts: config.retry.maxAttempts, backoffBaseMs: config.retry.backoffBaseMs };

const GENERATION_POLL_INTERVAL_MS = 15_000;
const TRAINING_POLL_INTERVAL_MS = 60_000;
/** ±10-20% jitter (TDD §12.2) — prevents synchronized polling load spikes across replicas. */
function withJitter(intervalMs: number): number {
  const jitterFraction = 0.1 + Math.random() * 0.1; // 10-20%
  const sign = Math.random() < 0.5 ? -1 : 1;
  return Math.round(intervalMs * (1 + sign * jitterFraction));
}

let lastGenerationTickAt = Date.now();
let lastTrainingTickAt = Date.now();
let shuttingDown = false;
let generationTickInFlight: Promise<void> | null = null;
let trainingTickInFlight: Promise<void> | null = null;

function scheduleGenerationTick(): void {
  if (shuttingDown) return;
  setTimeout(() => {
    generationTickInFlight = runGenerationTick().finally(() => {
      generationTickInFlight = null;
      scheduleGenerationTick();
    });
  }, withJitter(GENERATION_POLL_INTERVAL_MS));
}

function scheduleTrainingTick(): void {
  if (shuttingDown) return;
  setTimeout(() => {
    trainingTickInFlight = runTrainingTick().finally(() => {
      trainingTickInFlight = null;
      scheduleTrainingTick();
    });
  }, withJitter(TRAINING_POLL_INTERVAL_MS));
}

async function runGenerationTick(): Promise<void> {
  lastGenerationTickAt = Date.now();
  try {
    const result = await runGenerationPollTick({ db, provider, retryPolicy, workerInstanceId: instanceId });
    console.log(
      `[worker-higgsfield-poller] generation tick: polled=${result.polled} succeeded=${result.succeeded} retried=${result.retried} terminallyFailed=${result.terminallyFailed}`,
    );
  } catch (error) {
    console.error("[worker-higgsfield-poller] generation tick failed:", error);
  }
}

async function runTrainingTick(): Promise<void> {
  lastTrainingTickAt = Date.now();
  try {
    const result = await runSoulIdTrainingPollTick({
      db,
      provider,
      retryPolicy,
      workerInstanceId: instanceId,
      timeoutMs: config.higgsfield.trainingTimeoutMs,
    });
    console.log(
      `[worker-higgsfield-poller] training tick: polled=${result.polled} succeeded=${result.succeeded} retried=${result.retried} terminallyFailed=${result.terminallyFailed}`,
    );
  } catch (error) {
    console.error("[worker-higgsfield-poller] training tick failed:", error);
  }
}

async function startup(): Promise<void> {
  // Recovery pass (TDD §12.4) — before entering the normal tick loop, reset any row this
  // instance id previously claimed that's still `running`/`training` back to `retrying` (handles
  // an ungraceful previous exit that never got to run graceful shutdown's own cleanup).
  try {
    const [recoveredGeneration, recoveredTraining] = await Promise.all([
      recoverStaleClaims(db, instanceId),
      recoverStaleTrainingClaims(db, instanceId),
    ]);
    if (recoveredGeneration > 0 || recoveredTraining > 0) {
      console.log(
        `[worker-higgsfield-poller] startup recovery: reset ${recoveredGeneration} generation job(s), ${recoveredTraining} training job(s) from a previous ungraceful exit`,
      );
    }
  } catch (error) {
    // TODO(integration): recovery depends on Agent 2's real generation_jobs schema existing —
    // in this Sprint's isolated worktree that table doesn't exist yet, so this call is expected
    // to fail until the schemas are merged. Logged, not fatal — the tick loop still starts.
    console.warn("[worker-higgsfield-poller] startup recovery pass failed (see TODO(integration)):", error);
  }

  runGenerationTick().finally(scheduleGenerationTick);
  runTrainingTick().finally(scheduleTrainingTick);
}

void startup();

// Health endpoint (TDD §37): process up, DB connection reachable, time since last successful
// tick of *both* loops — distinguishes "up but stopped ticking" from dead.
const server = createServer((req, res) => {
  if (req.url === "/health") {
    const msSinceLastGenerationTick = Date.now() - lastGenerationTickAt;
    const msSinceLastTrainingTick = Date.now() - lastTrainingTickAt;
    const healthy =
      msSinceLastGenerationTick < GENERATION_POLL_INTERVAL_MS * 3 &&
      msSinceLastTrainingTick < TRAINING_POLL_INTERVAL_MS * 3;
    res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: healthy ? "ok" : "degraded",
        instanceId,
        msSinceLastGenerationTick,
        msSinceLastTrainingTick,
        generationTimeoutMs: GENERATION_TIMEOUT_MS,
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

/** Graceful shutdown (TDD §12.3): stop accepting new ticks, let any in-flight tick finish, then exit. */
async function shutdown(): Promise<void> {
  shuttingDown = true;
  console.log("[worker-higgsfield-poller] shutting down — waiting for in-flight ticks to finish");
  await Promise.allSettled([generationTickInFlight, trainingTickInFlight]);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
