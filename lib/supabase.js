import { createClient } from "@supabase/supabase-js";

let supabaseClient;

export function getEnvVar() {
  const supabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseURL || !supabaseAnonKey) {
    throw new Error("Missing supabase URL or ANON KEY");
  }

  return { supabaseURL, supabaseAnonKey };
}

export function createSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const { supabaseURL, supabaseAnonKey } = getEnvVar();
  supabaseClient = createClient(supabaseURL, supabaseAnonKey);
  return supabaseClient;
}

function getOAuthRedirectTo(path) {
  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

const signInWithGoogle = async () => {
  const supabase = createSupabaseClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getOAuthRedirectTo("/"),
    },
  });
};

const signInWithGitHub = async () => {
  const supabase = createSupabaseClient();
  await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: getOAuthRedirectTo("/"),
    },
  });
};

export const providers = { signInWithGoogle, signInWithGitHub };

export default createSupabaseClient;
