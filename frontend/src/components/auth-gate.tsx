"use client";

import { type FormEvent, useState } from "react";

import { ApiStatus } from "@/components/api-status";
import { getSupabaseClient, supabaseSetupIssue, type Session } from "@/lib/supabase";

type AuthMode = "sign-in" | "sign-up";

type AuthGateProps = {
  onAuthenticated: (session: Session) => void;
};

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const setupIssue = supabaseSetupIssue();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (setupIssue) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const client = getSupabaseClient();
      if (mode === "sign-in") {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error("Supabase did not return an active session.");
        onAuthenticated(data.session);
        return;
      }

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
        },
      });
      if (error) throw error;

      if (data.session) {
        onAuthenticated(data.session);
      } else {
        setMessage("Account created. Check your email to confirm it, then sign in.");
        setMode("sign-in");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not complete that request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true">S</div>
        <div className="auth-feature-list" aria-label="Application features">
        </div>
      </section>

      <section className="auth-card" aria-labelledby="auth-form-title">
        <div className="auth-card__heading">
          <h2 id="auth-form-title">{mode === "sign-in" ? "Welcome back" : "Create your account"}</h2>
          <p>{mode === "sign-in" ? "Sign in to reach your calendars." : "Start with an account backed by Supabase Auth."}</p>
        </div>

        {setupIssue ? (
          <div className="setup-notice" role="alert">
            <strong>Authentication needs configuration.</strong>
            <p>{setupIssue}</p>
            <p>Copy <code>.env.example</code> to <code>.env.local</code>, add your project values, then restart Next.js.</p>
          </div>
        ) : (
          <form className="stack-form" onSubmit={submit}>
            {mode === "sign-up" && (
              <label>
                Display name
                <input
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={120}
                  placeholder="How should we call you?"
                />
              </label>
            )}
            <label>
              Email address
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              Password
              <input
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </label>

            {message && <p className="form-message" role="status">{message}</p>}

            <button className="button button--primary button--full" disabled={submitting} type="submit">
              {submitting ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        <p className="auth-switch">
          {mode === "sign-in" ? "New here?" : "Already have an account?"}{" "}
          <button
            className="text-button"
            disabled={submitting}
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setMessage(null);
            }}
            type="button"
          >
            {mode === "sign-in" ? "Create one" : "Sign in"}
          </button>
        </p>

        <ApiStatus />
      </section>
    </main>
  );
}
