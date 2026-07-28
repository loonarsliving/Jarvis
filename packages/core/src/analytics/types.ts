import { z } from "zod";
import { DASHBOARD_DATE_RANGE_MAX_DAYS } from "./constants.js";

/**
 * Shared date-range input, validated at every API boundary that accepts one
 * (TDD §26.4 "every Server Action and API route validates input with Zod
 * before touching business logic"; FSD §8 "Validation Rules: Date range
 * must not exceed 365 days").
 */
export const dateRangeInputSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((range) => range.to >= range.from, {
    message: "`to` must not be before `from`",
  })
  .refine(
    (range) => {
      const spanMs = range.to.getTime() - range.from.getTime();
      const maxMs = DASHBOARD_DATE_RANGE_MAX_DAYS * 24 * 60 * 60 * 1000;
      return spanMs <= maxMs;
    },
    { message: `Date range must not exceed ${DASHBOARD_DATE_RANGE_MAX_DAYS} days (FSD §8 performance guard).` },
  );
export type DateRangeInput = z.infer<typeof dateRangeInputSchema>;

export const storageUsageFilterSchema = z.object({
  company: z.string().min(1).optional(),
  project: z.string().min(1).optional(),
});
export type StorageUsageFilter = z.infer<typeof storageUsageFilterSchema>;

// --- Main Dashboard (FSD §8) -------------------------------------------------

export type MissionStatusChip = "queued" | "running" | "paused" | "completed" | "completed_with_failures" | "cancelled";

export interface MissionProgressItem {
  missionId: string;
  name: string;
  status: MissionStatusChip;
  priority: "low" | "normal" | "high" | "urgent";
  jobsTotal: number;
  jobsCompleted: number;
  approvedAssets: number;
  rejectedAssets: number;
  pendingReviewAssets: number;
  createdAt: string;
}

export interface RenderQueueSummary {
  queued: number;
  running: number;
  retrying: number;
  deadLetter: number;
  /** Age in seconds of the oldest still-queued job, null if the queue is empty. */
  oldestQueuedJobAgeSeconds: number | null;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  message: string;
  /** Where the "Selesaikan" action row navigates (FSD §8) — always a link, never a mutation from the dashboard itself. */
  href: string;
}

export interface KpiStrip {
  activeMissions: number;
  assetsGeneratedToday: number;
  pendingReview: number;
  /** 0-100, over the trailing QC_PASS_RATE_WINDOW_DAYS window. */
  qcPassRate7d: number;
  driveUsagePct: number;
}

export interface DashboardSummary {
  kpis: KpiStrip;
  missionProgress: MissionProgressItem[];
  renderQueue: RenderQueueSummary;
  alerts: AlertItem[];
  /** ISO timestamp of mission_summary_mv's last successful refresh (FSD §8 "data as of HH:MM" badge). */
  aggregatedAsOf: string;
  isStale: boolean;
}

export interface QualityTrendSeriesPoint {
  date: string; // YYYY-MM-DD
  productFidelity: number | null;
  characterFidelity: number | null;
  technicalQuality: number | null;
  brandCompliance: number | null;
  overallPassRate: number;
}

export interface StorageUsageByProject {
  company: string;
  project: string;
  totalBytes: number;
}

export interface StorageUsageSummary {
  totalBytes: number;
  quotaBytes: number;
  usagePct: number;
  capturedAt: string;
  byProject: StorageUsageByProject[];
}

// --- QC Analytics (FSD §9 nav, §07 wireframe) --------------------------------

export interface FailureCategoryBreakdown {
  category: string;
  count: number;
}

export interface TemplatePerformanceRow {
  promptTemplateVersionId: string;
  templateSlug: string;
  version: number;
  avgQcScore: number;
  sampleSize: number;
}

export interface RepeatedRejectionAlert {
  dnaType: "product" | "character";
  dnaVersionId: string;
  dnaLabel: string;
  rejectionCount: number;
  windowDays: number;
}

export interface QcAnalyticsSummary {
  trend: QualityTrendSeriesPoint[];
  failureBreakdown: FailureCategoryBreakdown[];
  topTemplates: TemplatePerformanceRow[];
  repeatedRejections: RepeatedRejectionAlert[];
}

// Notification types/queries live in `@aaf/core/notifications`, not here —
// `notifications` is its own `packages/core` module (already scaffolded as
// a stub by Agent 1, owner: Agent 7), kept separate from `analytics` per
// Constitution Article III.1 (single responsibility per module): this
// module is the Analytics Engine (TDD §22), notifications is the
// Notification Engine (FSD §21) — related but distinct concerns.
