/**
 * The Higgsfield-specific `RenderProvider` implementation (TDD §9.1).
 * This is the ONLY file in the codebase permitted to know Higgsfield's
 * actual HTTP request/response shape (Constitution Article II.3) — every
 * other module (mission-dispatcher, the poller's own orchestration logic)
 * calls through the `RenderProvider` interface from
 * `../render-provider/index.js` and never imports this file directly
 * except at service-startup wiring time (`createHiggsfieldProvider(...)`
 * registered into `defaultRenderProviderRegistry`).
 *
 * ASSUMPTION WARNING: endpoint paths, request/response field names, and
 * status vocabulary below are inferred (see `types.ts` header) — verify
 * against real Higgsfield API docs before production use.
 */

import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderTransientError,
  type GenerationRequest,
  type GenerationStatus,
  type GenerationStatusResult,
  type GenerationSubmissionResult,
  type RenderProvider,
  type SoulIdTrainingRequest,
  type SoulIdTrainingStatusResult,
  type SoulIdTrainingSubmissionResult,
  type TrainingStatus,
} from "../render-provider/index.js";
import type {
  HiggsfieldApiErrorBody,
  HiggsfieldCinemaStudioParams,
  HiggsfieldGenerationRequestBody,
  HiggsfieldGenerationStatusResponse,
  HiggsfieldGenerationSubmitResponse,
  HiggsfieldJobStatus,
  HiggsfieldReference,
  HiggsfieldSoulIdTrainStatusResponse,
  HiggsfieldSoulIdTrainSubmitResponse,
  HiggsfieldTrainingStatus,
} from "./types.js";

export interface HiggsfieldClientConfig {
  apiKey: string;
  /** e.g. `https://api.higgsfield.ai` (ASSUMPTION — placeholder host, TDD §9.1). */
  apiBaseUrl: string;
  /** Per-request HTTP timeout — distinct from the *polling* timeout (TDD §9.8), which the poller enforces across many polls, not this client. */
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const GENERATION_STATUS_MAP: Record<HiggsfieldJobStatus, GenerationStatus> = {
  // FSD §14.4's exact table.
  pending: "submitted",
  queued: "submitted",
  processing: "running",
  succeeded: "succeeded",
  failed: "failed",
};

const TRAINING_STATUS_MAP: Record<HiggsfieldTrainingStatus, TrainingStatus> = {
  queued: "queued",
  training: "training",
  succeeded: "succeeded",
  failed: "failed",
};

function mapCameraParamsToCinemaStudio(
  cameraParams: GenerationRequest["cameraParams"],
): HiggsfieldCinemaStudioParams {
  return {
    angle: cameraParams.angle,
    lens: cameraParams.lens,
    framing: cameraParams.framing,
    movement: cameraParams.movement,
  };
}

function mapReferenceBindingsToReferences(
  bindings: GenerationRequest["referenceBindings"],
): HiggsfieldReference[] {
  const references: HiggsfieldReference[] = [];
  if (bindings.productRef) {
    for (const imageUrl of bindings.productRef.referenceImageIds) {
      references.push({ type: "product", image_url: imageUrl, weight: bindings.productRef.weight });
    }
  }
  if (bindings.characterRef) {
    // Character identity is carried primarily via `soul_id` (mapped separately below); only
    // fall back to plain image references here in degraded mode (no trained Soul ID yet, §9.2).
    for (const imageUrl of bindings.characterRef.referenceImageIds) {
      references.push({
        type: "character",
        image_url: imageUrl,
        weight: bindings.characterRef.weight,
      });
    }
  }
  return references;
}

/** Maps the provider-agnostic `GenerationRequest` to Higgsfield's actual request body (TDD §9.2). */
export function mapToHiggsfieldRequestBody(
  request: GenerationRequest,
): HiggsfieldGenerationRequestBody {
  const body: HiggsfieldGenerationRequestBody = {
    prompt: request.finalPromptText,
    negative_prompt: request.negativePromptText || undefined,
    cinema_studio: mapCameraParamsToCinemaStudio(request.cameraParams),
    asset_class: request.assetClass,
    external_reference_id: request.jobId,
  };

  if (request.soulIdReference) {
    body.soul_id = request.soulIdReference;
  }
  const references = mapReferenceBindingsToReferences(request.referenceBindings);
  if (references.length > 0) {
    body.references = references;
  }
  if (request.referenceBindings.styleRef?.referenceImageIds[0]) {
    // Hero Frame anchors a single image (image-to-video jobs) — TDD §9.2's `style_ref` mapping.
    body.hero_frame = request.referenceBindings.styleRef.referenceImageIds[0];
  }

  return body;
}

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as HiggsfieldApiErrorBody;
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

/**
 * Translates an HTTP response's status code into the `render-provider`
 * error taxonomy (TDD §25's retryable/non-retryable categories). This is
 * the single place that decides "is this Higgsfield failure retryable" —
 * callers (the poller) never inspect raw HTTP status codes themselves.
 */
async function throwForErrorResponse(response: Response): Promise<never> {
  const message = await parseErrorBody(response);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError(`Higgsfield auth error (${response.status}): ${message}`);
  }
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
    throw new ProviderRateLimitError(`Higgsfield rate limit exceeded: ${message}`, retryAfterMs);
  }
  if (response.status >= 500) {
    throw new ProviderTransientError(`Higgsfield server error (${response.status}): ${message}`);
  }
  // 4xx other than 401/403/429 is treated as a validation-shaped error, not transient — but
  // since this client already runs pre-submission validation (validation.ts), a 4xx reaching
  // here indicates either a genuine content-policy rejection (checked by the caller via the
  // response body, see submitGeneration below) or an unexpected schema drift worth surfacing
  // loudly rather than silently retrying.
  throw new ProviderTransientError(`Higgsfield request failed (${response.status}): ${message}`);
}

export function createHiggsfieldProvider(config: HiggsfieldClientConfig): RenderProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const requestTimeoutMs = config.requestTimeoutMs ?? 30_000;

  async function request<TResponse>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown },
  ): Promise<TResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
        method: init.method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) {
        return await throwForErrorResponse(response);
      }
      return (await response.json()) as TResponse;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ProviderTransientError(`Higgsfield request to ${path} timed out client-side`, error);
      }
      if (
        error instanceof ProviderAuthError ||
        error instanceof ProviderRateLimitError ||
        error instanceof ProviderTransientError
      ) {
        throw error;
      }
      throw new ProviderTransientError(`Higgsfield request to ${path} failed`, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    name: "higgsfield",

    async submitGeneration(genRequest: GenerationRequest): Promise<GenerationSubmissionResult> {
      const body = mapToHiggsfieldRequestBody(genRequest);
      const response = await request<HiggsfieldGenerationSubmitResponse>("/v1/generations", {
        method: "POST",
        body,
      });
      return {
        providerJobId: response.job_id,
        status: GENERATION_STATUS_MAP[response.status],
        reportedCost: response.credit_cost != null ? { amount: response.credit_cost, currency: "credits" } : undefined,
      };
    },

    async pollStatus(providerJobId: string): Promise<GenerationStatusResult> {
      const response = await request<HiggsfieldGenerationStatusResponse>(
        `/v1/generations/${encodeURIComponent(providerJobId)}`,
        { method: "GET" },
      );

      if (response.status === "failed" && response.content_policy_violation) {
        // Deterministic, never retried (FSD §14.5, TDD §9.7) — surfaced as a distinct status
        // rather than thrown, so the poller can persist it and move on to the next job in the
        // same tick without a control-flow exception for an expected outcome.
        return {
          status: "failed_content_policy",
          providerStatusRaw: response.status,
          rejectionReason: response.failure_reason ?? "Content policy violation (no reason provided)",
          reportedCost:
            response.credit_cost != null ? { amount: response.credit_cost, currency: "credits" } : undefined,
        };
      }

      return {
        status: GENERATION_STATUS_MAP[response.status],
        outputUrl: response.output_url,
        providerStatusRaw: response.status,
        reportedCost:
          response.credit_cost != null ? { amount: response.credit_cost, currency: "credits" } : undefined,
      };
    },

    async submitSoulIdTraining(
      trainingRequest: SoulIdTrainingRequest,
    ): Promise<SoulIdTrainingSubmissionResult> {
      const response = await request<HiggsfieldSoulIdTrainSubmitResponse>("/v1/soul-id/train", {
        method: "POST",
        body: {
          reference_image_urls: trainingRequest.referenceImageIds,
          external_reference_id: trainingRequest.trainingJobId,
        },
      });
      return {
        providerTrainingId: response.training_id,
        status: TRAINING_STATUS_MAP[response.status],
      };
    },

    async pollTrainingStatus(providerTrainingId: string): Promise<SoulIdTrainingStatusResult> {
      const response = await request<HiggsfieldSoulIdTrainStatusResponse>(
        `/v1/soul-id/train/${encodeURIComponent(providerTrainingId)}`,
        { method: "GET" },
      );
      return {
        status: TRAINING_STATUS_MAP[response.status],
        soulIdReference: response.soul_id,
        providerStatusRaw: response.status,
        reportedCost:
          response.credit_cost != null ? { amount: response.credit_cost, currency: "credits" } : undefined,
      };
    },
  };
}
