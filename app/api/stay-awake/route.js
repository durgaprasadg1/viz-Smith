import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getJsonCache, setJsonCache } from "@/lib/redis-cache";

export const runtime = "nodejs";

const CACHE_KEY = "stay-awake:profiles:all";
const CACHE_TTL_SECONDS = 60;
const PAGE_SIZE = 1000;

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.log("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return NextResponse({
      error : "Something Went Wrong",
      
    })
    
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchAllProfiles(supabase) {
  const profiles = [];
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .range(start, end);

    if (error) {
      throw new Error(error.message || "Failed to fetch profiles");
    }

    const rows = Array.isArray(data) ? data : [];
    profiles.push(...rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }

    start += PAGE_SIZE;
  }

  return profiles;
}

export async function GET() {
  try {
    const cached = await getJsonCache(CACHE_KEY);

    if (cached) {
      return NextResponse.json({
        success: true,
        source: "cache",
        count: Array.isArray(cached.profiles) ? cached.profiles.length : 0,
        profiles: cached.profiles ?? [],
        cachedAt: cached.cachedAt ?? null,
      });
    }

    const supabase = createSupabaseAdminClient();
    const profiles = await fetchAllProfiles(supabase);

    const payload = {
      profiles,
      cachedAt: new Date().toISOString(),
    };

    await setJsonCache(CACHE_KEY, payload, CACHE_TTL_SECONDS);

    return NextResponse.json({
      success: true,
      source: "supabase",
      count: profiles.length,
      profiles,
      cachedAt: payload.cachedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to load profiles",
      },
      { status: 500 },
    );
  }
}
