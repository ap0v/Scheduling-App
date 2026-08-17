import type { GreetingResponse, HealthResponse } from "@/types/api";

const API_PREFIX = "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(API_PREFIX + path, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ApiError(response.status, "API request failed with status " + response.status + ".");
  }

  return (await response.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>("/health");
}

export function getGreeting(name: string): Promise<GreetingResponse> {
  return fetchJson<GreetingResponse>("/v1/greeting?name=" + encodeURIComponent(name));
}
