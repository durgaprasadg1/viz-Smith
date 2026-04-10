import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import {
  CACHE_TTL_SECONDS,
  getDashboardCacheKey,
  getJsonCache,
  setJsonCache,
} from "@/lib/redis-cache";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const { errorResponse, supabase, user } = await getAuthorizedUserFromRequest(
      req,
      {
        missingTokenMessage: "Please sign in to access dashboard data.",
        invalidTokenMessage: "Unauthorized",
      },
    );

    if (errorResponse) {
      return errorResponse;
    }

    const refreshRequested = req.nextUrl.searchParams.get("refresh") === "1";
    const cacheKey = getDashboardCacheKey(user.id);

    let datasets = null;
    let cacheStatus = "MISS";

    if (!refreshRequested) {
      datasets = await getJsonCache(cacheKey);
      if (datasets !== null) {
        cacheStatus = "HIT";
      }
    }

    if (datasets === null) {
      const { data, error } = await supabase
        .from("datasets")
        .select("id, file_name, file_size, status, uploaded_at, created_at")
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false });

      if (error) {
        throw new Error(error.message || "Unable to load dashboard datasets.");
      }

      datasets = Array.isArray(data) ? data : [];
      await setJsonCache(cacheKey, datasets, CACHE_TTL_SECONDS.dashboard);
      cacheStatus = refreshRequested ? "BYPASS" : "MISS";
    }

    return NextResponse.json(
      {
        datasets: Array.isArray(datasets) ? datasets : [],
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Redis-Cache": cacheStatus,
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to load dashboard data." },
      { status: 500 },
    );
  }
}
