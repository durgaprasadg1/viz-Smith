import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getEnvVar } from "@/lib/supabase";
import {
  CACHE_TTL_SECONDS,
  getDashboardCacheKey,
  getOrSetCachedJson,
} from "@/lib/redis-cache";

export const runtime = "nodejs";

function getAccessTokenFromRequest(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

function createAuthorizedSupabaseClient(token) {
  const { supabaseURL, supabaseAnonKey } = getEnvVar();

  return createClient(supabaseURL, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(req) {
  try {
    const token = getAccessTokenFromRequest(req);

    if (!token) {
      return NextResponse.json(
        { error: "Please sign in to access dashboard data." },
        { status: 401 },
      );
    }

    const supabase = createAuthorizedSupabaseClient(token);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const refreshRequested = req.nextUrl.searchParams.get("refresh") === "1";
    const cacheKey = getDashboardCacheKey(user.id);

    const { value: datasets, cacheStatus } = await getOrSetCachedJson({
      key: cacheKey,
      ttlSeconds: CACHE_TTL_SECONDS.dashboard,
      forceRefresh: refreshRequested,
      loader: async () => {
        const { data, error } = await supabase
          .from("datasets")
          .select("id, file_name, file_size, status, uploaded_at, created_at")
          .eq("user_id", user.id)
          .order("uploaded_at", { ascending: false });

        if (error) {
          throw new Error(
            error.message || "Unable to load dashboard datasets.",
          );
        }

        return Array.isArray(data) ? data : [];
      },
    });

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
