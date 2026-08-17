"use client";

import { useEffect, useState } from "react";

import { getGreeting, getHealth } from "@/lib/api";
import type { GreetingResponse, HealthResponse } from "@/types/api";

type ApiState =
  | { kind: "loading" }
  | { kind: "success"; health: HealthResponse; greeting: GreetingResponse }
  | { kind: "error"; message: string };

export function ApiStatus() {
  const [state, setState] = useState<ApiState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function checkApi() {
      try {
        const [health, greeting] = await Promise.all([getHealth(), getGreeting("Developer")]);

        if (!cancelled) {
          setState({ kind: "success", health, greeting });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to reach the API.";

        if (!cancelled) {
          setState({ kind: "error", message });
        }
      }
    }

    void checkApi();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="api-panel" aria-labelledby="api-status-title" aria-live="polite">
      <div className="api-panel__header">
        <div>
          <h2 id="api-status-title">API connection</h2>
          <p>The browser calls <code>/api</code>; Next.js forwards it to Spring Boot.</p>
        </div>
        <span className={"status status--" + state.kind}>
          {state.kind === "loading" ? "Checking" : state.kind === "success" ? "Connected" : "Unavailable"}
        </span>
      </div>

      <div className="api-panel__content">
        {state.kind === "loading" && <p className="subtle">Waiting for the API response…</p>}

        {state.kind === "success" && (
          <>
            <p className="greeting">{state.greeting.message}</p>
            <p className="subtle">
              <code>{state.health.service}</code> reports <strong>{state.health.status}</strong>.
            </p>
          </>
        )}

        {state.kind === "error" && (
          <p className="error-copy">
            Start the Spring Boot application on port 8080, then refresh this page. {state.message}
          </p>
        )}
      </div>
    </section>
  );
}
