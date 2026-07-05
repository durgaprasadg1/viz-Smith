import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import {
  CACHE_TTL_SECONDS,
  getHistoryCacheKey,
  getJsonCache,
  setJsonCache,
} from "@/lib/redis-cache";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const { errorResponse, supabase, user } = await getAuthorizedUserFromRequest(
      req,
      {
        missingTokenMessage: "Please sign in to access history.",
        invalidTokenMessage: "Unauthorized",
      },
    );

    if (errorResponse) {
      return errorResponse;
    }

    const refreshRequested = req.nextUrl.searchParams.get("refresh") === "1";
    const cacheKey = getHistoryCacheKey(user.id);
    let items = null;
    let cacheStatus = "MISS";
    
    if (!refreshRequested) {
      items = await getJsonCache(cacheKey);
      if (items !== null) {
        cacheStatus = "HIT";
      }
    }

    if (items === null) {
      const { data, error } = await supabase
        .from("datasets")
        .select("id, file_name, status, created_at, uploaded_at")
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false });

      if (error) {
        throw new Error(error.message || "Unable to load history.");
      }

      items = Array.isArray(data) ? data : [];
      await setJsonCache(cacheKey, items, CACHE_TTL_SECONDS.history);
      cacheStatus = refreshRequested ? "BYPASS" : "MISS";
    }
  
    return NextResponse.json(
      {
        items: Array.isArray(items) ? items : [],
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
      { error: error?.message || "Unable to load history." },
      { status: 500 },
    );
  }
}
