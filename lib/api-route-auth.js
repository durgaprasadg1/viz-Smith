import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getEnvVar } from "@/lib/supabase";

export function getAccessTokenFromRequest(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

export function createAuthorizedSupabaseClient(token) {
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

export async function getAuthorizedUserFromRequest(req, options = {}) {
  const {
    missingTokenMessage = "Unauthorized",
    invalidTokenMessage = "Unauthorized",
  } = options;

  const token = getAccessTokenFromRequest(req);

  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { error: missingTokenMessage },
        { status: 401 },
      ),
      token: null,
      user: null,
      supabase: null,
    };
  }

  const supabase = createAuthorizedSupabaseClient(token);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return {
      errorResponse: NextResponse.json(
        { error: invalidTokenMessage },
        { status: 401 },
      ),
      token,
      user: null,
      supabase,
    };
  }

  return {
    errorResponse: null,
    token,
    user,
    supabase,
  };
}
