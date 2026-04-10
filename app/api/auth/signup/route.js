import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "@/lib/supabase";
import { NextResponse } from "next/server";

async function signUpNewUser(email, password, redirectTo, fullName) {
  const { supabaseURL, supabaseAnonKey } = getEnvVar();
  const supabase = createClient(supabaseURL, supabaseAnonKey);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    throw error;
  }
  return data;
}

function createAdminClient() {
  const { supabaseURL } = getEnvVar();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing service role key");
  }

  return createClient(supabaseURL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    const redirectTo = new URL("/dashboard", request.url).toString();

    const data = await signUpNewUser(email, password, redirectTo, name);

    if (data?.user?.id) {
      const admin = createAdminClient();
      const { error: profileError } = await admin.from("profiles").upsert({
        id: data.user.id,
        full_name: name ?? null,
      });

      if (profileError) {
        return NextResponse.json(
          { error: profileError.message ?? "Failed to create profile" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      { data, requiresEmailConfirmation: !data?.session },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message ?? "Signup Failed" },
      { status: 400 },
    );
  }
}
