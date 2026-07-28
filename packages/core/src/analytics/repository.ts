import type { TypedSupabaseClient } from "../db/client.js";
import {
  DRIVE_QUOTA_WARNING_PCT,
  QC_PASS_RATE_WINDOW_DAYS,
  MISSION_SUMMARY_MV_STALE_THRESHOLD_MS,
} from "./constants.js";
import type {
  AlertItem,
  DashboardSummary,
  DateRangeInput,
  FailureCategoryBreakdown,
  KpiStrip,
  MissionProgressItem,
  QcAnalyticsSummary,
  QualityTrendSeriesPoint,
  RenderQueueSummary,
  StorageUsageFilter,
  StorageUsageSummary,
} from "./types.js";

/**
 * Analytics Engine repository functions (TDD §22). Every function here is a
 * READ against pre-aggregated data or a single-table/simple GROUP BY query
 * (NFR-6 "never live joins at request time") — this module never issues an
 * INSERT/UPDATE/DELETE against a table another agent owns (Constitution
 * Article VIII: "this agent is read-only by design"). The only write in
 * this file is `markNotificationRead`, against `notifications`, which is
 * Agent 7's own table (see DECISIONS-agent7.md item 4) and
 * `refreshMissionSummaryMv`, which calls a Postgres function this agent
 * also owns (infra/supabase/migrations/0700_mission_summary_mv.sql).
 *
 * TODO(integration): every query below that reads `missions`,
 * `generation_jobs`, `assets`, `qc_reports`, `product_dna_versions`,
 * `character_dna_versions`, or `storage_usage_snapshots` is written against
 * the shapes documented in docs/ai-asset-factory/fsd/07-database-erd-dashboards.md
 * (binding ERD) and TDD §7.3 — none of those tables exist yet in this
 * isolated worktree (owned by Agents 2/3/5/6, running in parallel). Verify
 * column names/types against each owning agent's actual migration once
 * merged; `Database` is `any` (packages/core/src/db/client.ts) until
 * `supabase gen types` runs against a live merged schema, per Agent 1's
 * own documented limitation (DECISIONS.md item 8).
 */

// --- Main Dashboard (FSD §8) -------------------------------------------------

export async function getMissionProgress(
  client: TypedSupabaseClient,
  limit = 10,
): Promise<MissionProgressItem[]> {
  // Reads mission_summary_mv only (Agent 7-owned view) — no cross-table
  // join at request time, per NFR-6.
  const { data, error } = await client
    .from("mission_summary_mv")
    .select(
      "mission_id, mission_name, mission_status, priority, jobs_total, jobs_completed, approved_assets, rejected_assets, pending_review_assets, created_at",
    )
    .in("mission_status", ["queued", "running", "paused"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    missionId: row.mission_id as string,
    name: row.mission_name as string,
    status: row.mission_status as MissionProgressItem["status"],
    priority: row.priority as MissionProgressItem["priority"],
    jobsTotal: Number(row.jobs_total ?? 0),
    jobsCompleted: Number(row.jobs_completed ?? 0),
    approvedAssets: Number(row.approved_assets ?? 0),
    rejectedAssets: Number(row.rejected_assets ?? 0),
    pendingReviewAssets: Number(row.pending_review_assets ?? 0),
    createdAt: row.created_at as string,
  }));
}

export async function getRenderQueueSummary(client: TypedSupabaseClient): Promise<RenderQueueSummary> {
  // TODO(integration): generation_jobs is owned by Agent 2. This mirrors
  // the dispatcher's own partial index shape (TDD §7.3:
  // "(status, priority DESC, enqueued_at ASC) partial index WHERE status =
  // 'queued'") so the "queued" count/oldest-age lookups are index-backed,
  // not a full scan.
  const [{ count: queued }, { count: running }, { count: retrying }, { count: deadLetter }, oldest] =
    await Promise.all([
      client.from("generation_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
      client
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "running", "retrieving", "ingested"]),
      client
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "dead_letter")
        .lt("attempt_count", 4),
      client
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "dead_letter")
        .gte("attempt_count", 4),
      client
        .from("generation_jobs")
        .select("enqueued_at")
        .eq("status", "queued")
        .order("enqueued_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const oldestQueuedAt = (oldest.data as { enqueued_at?: string } | null)?.enqueued_at ?? null;

  return {
    queued: queued ?? 0,
    running: running ?? 0,
    retrying: retrying ?? 0,
    deadLetter: deadLetter ?? 0,
    oldestQueuedJobAgeSeconds: oldestQueuedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestQueuedAt).getTime()) / 1000))
      : null,
  };
}

export async function getKpiStrip(client: TypedSupabaseClient): Promise<KpiStrip> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(Date.now() - QC_PASS_RATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [activeMissionsRes, assetsTodayRes, pendingReviewRes, qcReportsRes, storageRes] = await Promise.all([
    client
      .from("mission_summary_mv")
      .select("mission_id", { count: "exact", head: true })
      .eq("mission_status", "running"),
    // TODO(integration): assets owned by Agent 5.
    client
      .from("assets")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    // Sourced from the MV (pre-aggregated), not a live `assets` query, per NFR-6.
    client.from("mission_summary_mv").select("pending_review_assets"),
    // TODO(integration): qc_reports owned by Agent 6.
    client
      .from("qc_reports")
      .select("decision")
      .gte("evaluated_at", sevenDaysAgo.toISOString()),
    // TODO(integration): storage_usage_snapshots owned by Agent 5.
    client
      .from("storage_usage_snapshots")
      .select("total_bytes, quota_bytes, captured_at")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (activeMissionsRes.error) throw activeMissionsRes.error;

  const pendingReview = ((pendingReviewRes.data ?? []) as Array<{ pending_review_assets: number }>).reduce(
    (sum, row) => sum + Number(row.pending_review_assets ?? 0),
    0,
  );

  const qcRows = (qcReportsRes.data ?? []) as Array<{ decision: string }>;
  const qcPassRate7d =
    qcRows.length === 0
      ? 100
      : Math.round((qcRows.filter((r) => r.decision === "auto_approve").length / qcRows.length) * 1000) / 10;

  const storage = storageRes.data as { total_bytes: number; quota_bytes: number } | null;
  const driveUsagePct = storage && storage.quota_bytes > 0 ? Math.round((storage.total_bytes / storage.quota_bytes) * 1000) / 10 : 0;

  return {
    activeMissions: activeMissionsRes.count ?? 0,
    assetsGeneratedToday: assetsTodayRes.count ?? 0,
    pendingReview,
    qcPassRate7d,
    driveUsagePct,
  };
}

export async function getAlerts(client: TypedSupabaseClient): Promise<AlertItem[]> {
  const alerts: AlertItem[] = [];

  const [{ count: deadLetterCount }, storageRes, dnaPendingRes] = await Promise.all([
    client
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "dead_letter")
      .gte("attempt_count", 4),
    client
      .from("storage_usage_snapshots")
      .select("total_bytes, quota_bytes")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // TODO(integration): product_dna_versions/character_dna_versions owned
    // by Agent 3. `pending_approval` status per FSD §07 ERD's product_dna_versions
    // status enum.
    Promise.all([
      client.from("product_dna_versions").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
      client.from("character_dna_versions").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    ]),
  ]);

  if ((deadLetterCount ?? 0) > 0) {
    alerts.push({
      id: "dead-letter",
      severity: "critical",
      message: `${deadLetterCount} job(s) in dead_letter awaiting attention`,
      href: "/queue?status=dead_letter",
    });
  }

  const storage = storageRes.data as { total_bytes: number; quota_bytes: number } | null;
  if (storage && storage.quota_bytes > 0) {
    const pct = (storage.total_bytes / storage.quota_bytes) * 100;
    if (pct >= DRIVE_QUOTA_WARNING_PCT) {
      alerts.push({
        id: "drive-quota",
        severity: "warning",
        message: `Google Drive usage at ${pct.toFixed(1)}% (warning threshold ${DRIVE_QUOTA_WARNING_PCT}%)`,
        href: "/drive",
      });
    }
  }

  const [productPending, characterPending] = dnaPendingRes as unknown as [
    { count: number | null },
    { count: number | null },
  ];
  const dnaPendingTotal = (productPending.count ?? 0) + (characterPending.count ?? 0);
  if (dnaPendingTotal > 0) {
    alerts.push({
      id: "dna-pending",
      severity: "info",
      message: `${dnaPendingTotal} DNA version(s) awaiting approval`,
      href: "/identity",
    });
  }

  // NOTE: "Higgsfield API degraded" (FSD §8 Alerts panel example) has no
  // documented source table in the binding ERD (Agent 4 owns the
  // higgsfield module but no health/status table is specified) — not
  // implemented here rather than inventing one, per Constitution Article
  // VI.1 ("no agent may invent a requirement not traceable to tiers 1-3").
  // Escalate to Agent 4 if a real source is added later.

  return alerts;
}

export async function getMissionSummaryMvFreshness(client: TypedSupabaseClient): Promise<{
  aggregatedAsOf: string;
  isStale: boolean;
}> {
  const { data, error } = await client
    .from("mission_summary_mv")
    .select("refreshed_at")
    .order("refreshed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const refreshedAt = (data as { refreshed_at?: string } | null)?.refreshed_at ?? new Date(0).toISOString();
  const isStale = Date.now() - new Date(refreshedAt).getTime() > MISSION_SUMMARY_MV_STALE_THRESHOLD_MS;

  return { aggregatedAsOf: refreshedAt, isStale };
}

export async function getDashboardSummary(client: TypedSupabaseClient): Promise<DashboardSummary> {
  const [kpis, missionProgress, renderQueue, alerts, freshness] = await Promise.all([
    getKpiStrip(client),
    getMissionProgress(client),
    getRenderQueueSummary(client),
    getAlerts(client),
    getMissionSummaryMvFreshness(client),
  ]);

  return {
    kpis,
    missionProgress,
    renderQueue,
    alerts,
    aggregatedAsOf: freshness.aggregatedAsOf,
    isStale: freshness.isStale,
  };
}

/**
 * Triggers `refresh_mission_summary_mv()` (defined in
 * infra/supabase/migrations/0700_mission_summary_mv.sql). Called by
 * `apps/web`'s internal 5-minute timer (TDD §7.4) — never by a user-facing
 * request path, and always with the service-role client since the
 * underlying Postgres function's EXECUTE grant is restricted to
 * `service_role`.
 */
export async function refreshMissionSummaryMv(client: TypedSupabaseClient): Promise<void> {
  const { error } = await client.rpc("refresh_mission_summary_mv");
  if (error) throw error;
}

// --- Storage Usage (FSD §8, §07 Google Drive wireframe) --------------------

export async function getStorageUsageSummary(
  client: TypedSupabaseClient,
  filter: StorageUsageFilter = {},
): Promise<StorageUsageSummary> {
  // TODO(integration): storage_usage_snapshots owned by Agent 5
  // (drive-sync-worker), append-only per TDD §7.4.
  let query = client
    .from("storage_usage_snapshots")
    .select("company, total_bytes, quota_bytes, captured_at")
    .order("captured_at", { ascending: false });

  if (filter.company) {
    query = query.eq("company", filter.company);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Array<{ company: string; total_bytes: number; quota_bytes: number; captured_at: string }>;

  // Keep only the most recent snapshot per company (append-only table —
  // multiple historical rows accumulate over time).
  const latestByCompany = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByCompany.has(row.company)) latestByCompany.set(row.company, row);
  }
  const latest = [...latestByCompany.values()];

  const totalBytes = latest.reduce((sum, r) => sum + Number(r.total_bytes), 0);
  const quotaBytes = latest.reduce((sum, r) => sum + Number(r.quota_bytes), 0);

  return {
    totalBytes,
    quotaBytes,
    usagePct: quotaBytes > 0 ? Math.round((totalBytes / quotaBytes) * 1000) / 10 : 0,
    capturedAt: latest[0]?.captured_at ?? new Date(0).toISOString(),
    // FSD §07 wireframe: "USAGE BY PROJECT (bar chart)" — storage_usage_snapshots
    // is captured per-company per the ERD, not per-project; project-level
    // breakdown would require a join against `assets.project` (Agent
    // 5-owned), which NFR-6 forbids at request time. Left as a
    // TODO(integration) for Agent 5 to either add a `project` column to
    // `storage_usage_snapshots` or expose a project-level snapshot table.
    byProject: latest.map((r) => ({ company: r.company, project: "(all projects)", totalBytes: Number(r.total_bytes) })),
  };
}

// --- QC Analytics (FSD §9 nav, §07 wireframe) --------------------------------

export async function getQualityTrend(client: TypedSupabaseClient, range: DateRangeInput): Promise<QualityTrendSeriesPoint[]> {
  // TODO(integration): qc_reports owned by Agent 6. A single-table
  // GROUP BY on qc_reports.evaluated_at::date is used here (allowed under
  // NFR-6 — no join, mirrors TDD §22 "GROUP BY queries with the indexes
  // from §7.3 backing them"); the (asset_id, evaluated_at DESC) index
  // (TDD §7.3) supports the range scan.
  const { data, error } = await client
    .from("qc_reports")
    .select("evaluated_at, product_fidelity_score, character_fidelity_score, technical_quality_score, brand_compliance_score, decision")
    .gte("evaluated_at", range.from.toISOString())
    .lte("evaluated_at", range.to.toISOString());

  if (error) throw error;

  type Row = {
    evaluated_at: string;
    product_fidelity_score: number | null;
    character_fidelity_score: number | null;
    technical_quality_score: number;
    brand_compliance_score: number;
    decision: string;
  };

  const byDate = new Map<string, Row[]>();
  for (const row of (data ?? []) as Row[]) {
    const day = row.evaluated_at.slice(0, 10);
    const bucket = byDate.get(day) ?? [];
    bucket.push(row);
    byDate.set(day, bucket);
  }

  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({
      date,
      productFidelity: avg(rows.map((r) => r.product_fidelity_score).filter((v): v is number => v !== null)),
      characterFidelity: avg(rows.map((r) => r.character_fidelity_score).filter((v): v is number => v !== null)),
      technicalQuality: avg(rows.map((r) => r.technical_quality_score)),
      brandCompliance: avg(rows.map((r) => r.brand_compliance_score)),
      overallPassRate: Math.round((rows.filter((r) => r.decision === "auto_approve").length / rows.length) * 1000) / 10,
    }));
}

export async function getFailureCategoryBreakdown(client: TypedSupabaseClient, range: DateRangeInput): Promise<FailureCategoryBreakdown[]> {
  // TODO(integration): qc_reports.failure_categories (text[]) owned by Agent 6.
  const { data, error } = await client
    .from("qc_reports")
    .select("failure_categories")
    .gte("evaluated_at", range.from.toISOString())
    .lte("evaluated_at", range.to.toISOString())
    .not("failure_categories", "is", null);

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ failure_categories: string[] | null }>) {
    for (const category of row.failure_categories ?? []) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getQcAnalyticsSummary(client: TypedSupabaseClient, range: DateRangeInput): Promise<QcAnalyticsSummary> {
  const [trend, failureBreakdown] = await Promise.all([
    getQualityTrend(client, range),
    getFailureCategoryBreakdown(client, range),
  ]);

  // "TOP TEMPLATES BY SCORE" and "DNA VERSIONS WITH REPEATED REJECTIONS"
  // (FSD §07 QC Analytics wireframe) each require a join across
  // asset_metadata/prompt_template_versions (Agent 3) and
  // reviews/product_dna_versions/character_dna_versions (Agents 2/3/6) —
  // real cross-agent joins that don't exist as tables in this worktree yet.
  // Left as an explicit empty result + TODO(integration) rather than a
  // fabricated join against undocumented column shapes; the owning
  // agents' actual schemas should be reviewed before implementing this
  // query for real (Constitution Article VI.2: "a needed interface from
  // another agent's module that doesn't exist yet" — escalate, don't
  // silently work around).
  return {
    trend,
    failureBreakdown,
    topTemplates: [],
    repeatedRejections: [],
  };
}
