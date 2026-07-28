/**
 * Upload Queue producer (TDD §9.6, §10.2: "Producer: `higgsfield-poller`
 * (on generation success)"). This poller only enqueues — it never
 * downloads the asset or writes to Drive (that's Agent 5's
 * `drive-sync-worker`, consuming `@aaf/core/drive`).
 *
 * TODO(integration): depends on Agent 2's `@aaf/core/queue` primitive
 * (`enqueue`/`claim`/`complete`/`fail`, Constitution Article VIII's
 * "Note on `queue`") — a stub in this Sprint. `QueueEnqueuer` below is the
 * narrow slice of that primitive's public interface this file needs;
 * `notYetImplementedEnqueuer` is a placeholder that throws until the real
 * module lands. Swap for
 * `import { enqueue } from "@aaf/core/queue"` once available and delete
 * this file's placeholder + TODO.
 */

export interface UploadJobPayload {
  generationJobId: string;
  /** Higgsfield's signed output URL (TDD §9.6) — `drive-sync-worker` downloads from here, not this poller. */
  outputUrl: string;
  assetClass: "image" | "video";
}

export type QueuePriority = "low" | "normal" | "high" | "urgent";

export type QueueEnqueuer = (
  table: "upload_jobs",
  payload: UploadJobPayload,
  priority: QueuePriority,
) => Promise<{ id: string }>;

const notYetImplementedEnqueuer: QueueEnqueuer = () => {
  throw new Error(
    "@aaf/core/queue does not yet export an enqueue() function (Agent 2's module is a stub in this Sprint). " +
      "See apps/worker-higgsfield-poller/src/upload-queue.ts TODO(integration).",
  );
};

export interface EnqueueUploadJobOptions {
  /** Injectable for tests and for swapping in the real `@aaf/core/queue` export once available. */
  enqueuer?: QueueEnqueuer;
  priority: QueuePriority;
}

export async function enqueueUploadJob(
  payload: UploadJobPayload,
  options: EnqueueUploadJobOptions,
): Promise<{ id: string }> {
  const enqueuer = options.enqueuer ?? notYetImplementedEnqueuer;
  return enqueuer("upload_jobs", payload, options.priority);
}
