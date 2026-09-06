import type { SupabaseClient } from "@supabase/supabase-js";

type SignupDetails = Readonly<{
  email: string;
  password: string;
  displayName: string;
}>;

const existingAccountMessage = "An account with this email already exists. Please sign in with your existing password.";

export async function registerAccount(client: SupabaseClient, details: SignupDetails) {
  const signupRequestId = crypto.randomUUID();
  const displayName = details.displayName.trim();
  const { data, error } = await client.auth.signUp({
    email: details.email,
    password: details.password,
    options: {
      data: {
        ...(displayName ? { display_name: displayName } : {}),
        signup_request_id: signupRequestId,
      },
    },
  });

  if (error?.code === "user_already_exists" || error?.code === "email_exists") {
    throw new Error(existingAccountMessage);
  }
  if (error) throw error;

  const user = data.user;
  if (!user || !Array.isArray(user.identities)) {
    throw new Error("We could not confirm that your account was created. Please try again.");
  }

  // Confirmed duplicates have no identities. Unconfirmed duplicates keep their
  // original metadata, so they will not contain this request's creation marker.
  // This marker is only for signup feedback; it must never authorize access.
  if (user.identities.length === 0 || user.user_metadata.signup_request_id !== signupRequestId) {
    throw new Error(existingAccountMessage);
  }

  return data.session;
}
