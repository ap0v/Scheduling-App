import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

function requiredEnvironment(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
  return process.env[name]?.trim() ?? "";
}

export function supabaseSetupIssue(): string | null {
  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const key = requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (!url || !key) {
    return "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local.";
  }

  try {
    new URL(url);
  } catch {
    return "NEXT_PUBLIC_SUPABASE_URL must be a complete project URL.";
  }

  return null;
}

export function getSupabaseClient(): SupabaseClient {
  const issue = supabaseSetupIssue();
  if (issue) {
    throw new Error(issue);
  }

  if (!browserClient) {
    browserClient = createClient(
      requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  }

  return browserClient;
}

export async function currentAccessToken(): Promise<string | null> {
  const issue = supabaseSetupIssue();
  if (issue) {
    return null;
  }

  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.access_token ?? null;
}

export type { Session };
