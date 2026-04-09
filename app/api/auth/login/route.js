import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "@/lib/supabase";

async function signInWithEmail(email, password) {
  const { supabaseURL, supabaseAnonKey } = getEnvVar();
  const supabase = createClient(supabaseURL, supabaseAnonKey);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    const data = await signInWithEmail(email, password);

    return Response.json({ data }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error?.message ?? "Login failed" },
      { status: 400 },
    );
  }
}
