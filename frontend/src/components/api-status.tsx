"use client";

import { useEffect, useState } from "react";

import { getHealth } from "@/lib/api";
import type { HealthResponse } from "@/types/api";

type ApiState =
  | { kind: "loading" }
  | { kind: "success"; health: HealthResponse }
  | { kind: "error"; message: string };

export function ApiStatus() {
  const [state, setState] = useState<ApiState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function checkApi() {
      try {
        const health = await getHealth();

        if (!cancelled) {
          setState({ kind: "success", health });
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
    <section className="api-panel api-panel--compact" aria-labelledby="api-status-title" aria-live="polite">
      <div className="api-panel__header">
        <div>
          <h2 id="api-status-title">Service connection</h2>
          <p>The browser calls the scheduling API through the local <code>/api</code> proxy.</p>
        </div>
        <span className={"status status--" + state.kind}>
          {state.kind === "loading" ? "Checking" : state.kind === "success" ? "Connected" : "Unavailable"}
        </span>
      </div>

      <div className="api-panel__content">
        {state.kind === "loading" && <p className="subtle">Waiting for the API response…</p>}

        {state.kind === "success" && (
          <p className="subtle">
            <code>{state.health.service}</code> reports <strong>{state.health.status}</strong>.
          </p>
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
