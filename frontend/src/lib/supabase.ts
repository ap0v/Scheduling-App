import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

// Next.js only includes NEXT_PUBLIC_* values in the browser bundle when they
// are accessed statically. Dynamic access (process.env[name]) makes these
// values appear configured on the server and missing during hydration.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export function supabaseSetupIssue(): string | null {
  if (!supabaseUrl || !supabasePublishableKey) {
    return "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local.";
  }

  try {
    new URL(supabaseUrl);
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
      supabaseUrl,
      supabasePublishableKey,
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
