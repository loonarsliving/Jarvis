import { NextResponse } from "next/server";
import { getConfig } from "../../../lib/config";
import { createServiceRoleClient } from "@aaf/core/db";

export const dynamic = "force-dynamic";

/**
 * Health endpoint (TDD §37): process up, DB connection reachable. `web`
 * doesn't run a polling loop (TDD §2) so there's no "last successful tick"
 * to report here — that field applies to the four worker services.
 * Consumed by Docker's HEALTHCHECK (infra/docker/Dockerfile.web).
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    const supabase = createServiceRoleClient(getConfig());
    const { error } = await supabase.from("system_settings").select("key").limit(1);

    if (error) {
      return NextResponse.json(
        { status: "degraded", db: "unreachable", error: error.message },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "ok",
      db: "reachable",
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "degraded", db: "unreachable", error: (error as Error).message },
      { status: 503 },
    );
  }
}
