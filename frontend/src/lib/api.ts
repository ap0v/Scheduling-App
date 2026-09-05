import type {
  ApiErrorResponse,
  AvailabilityBlock,
  AvailabilityBlockInput,
  AvailabilityRule,
  AvailabilityRuleInput,
  Calendar,
  CalendarEvent,
  EventAttendee,
  EventAttendeeInput,
  EventInput,
  EventLocation,
  EventLocationInput,
  EventReminder,
  EventReminderInput,
  EventUpdateInput,
  HealthResponse,
  OccurrenceOverride,
  OccurrenceOverrideInput,
  Profile,
} from "@/types/api";

const API_PREFIX = "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type AccessTokenProvider = () => Promise<string | null>;

type RequestOptions = {
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  body?: object;
};

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

async function errorFrom(response: Response): Promise<ApiError> {
  try {
    const data: unknown = await response.json();
    if (isApiErrorResponse(data)) {
      return new ApiError(response.status, data.code, data.message);
    }
  } catch {
    // The backend normally sends JSON errors, but a useful fallback is safer for proxy failures.
  }

  return new ApiError(response.status, "request_failed", `API request failed with status ${response.status}.`);
}

export class SchedulingApi {
  constructor(private readonly accessToken: AccessTokenProvider) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = await this.accessToken();
    if (!token) {
      throw new ApiError(401, "missing_access_token", "Your session has expired. Please sign in again.");
    }

    const headers = new Headers({ Accept: "application/json", Authorization: `Bearer ${token}` });
    if (options.body) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(API_PREFIX + path, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      throw await errorFrom(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  getProfile() {
    return this.request<Profile>("/v1/profile");
  }

  updateProfile(payload: Pick<Profile, "display_name"> & Partial<Pick<Profile, "time_zone" | "locale">>) {
    return this.request<Profile>("/v1/profile", { method: "PATCH", body: payload });
  }

  listCalendars() {
    return this.request<Calendar[]>("/v1/calendars");
  }

  createCalendar(payload: Pick<Calendar, "name"> & Partial<Pick<Calendar, "description" | "color" | "time_zone" | "default_event_access">>) {
    return this.request<Calendar>("/v1/calendars", { method: "POST", body: payload });
  }

  updateCalendar(
    calendarId: string,
    payload: Partial<Pick<Calendar, "name" | "description" | "color" | "time_zone" | "default_event_access">>,
  ) {
    return this.request<Calendar>(`/v1/calendars/${encodeURIComponent(calendarId)}`, {
      method: "PATCH",
      body: payload,
    });
  }

  deleteCalendar(calendarId: string) {
    return this.request<Calendar>(`/v1/calendars/${encodeURIComponent(calendarId)}`, { method: "DELETE" });
  }

  listEvents(calendarId: string, range?: { from?: string; to?: string }) {
    const query = new URLSearchParams();
    if (range?.from) query.set("from", range.from);
    if (range?.to) query.set("to", range.to);
    const suffix = query.size ? `?${query.toString()}` : "";
    return this.request<CalendarEvent[]>(`/v1/calendars/${encodeURIComponent(calendarId)}/events${suffix}`);
  }

  createEvent(calendarId: string, payload: EventInput) {
    return this.request<CalendarEvent>(`/v1/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      body: payload,
    });
  }

  getEvent(eventId: string) {
    return this.request<CalendarEvent>(`/v1/events/${encodeURIComponent(eventId)}`);
  }

  updateEvent(eventId: string, payload: EventUpdateInput) {
    return this.request<CalendarEvent>(`/v1/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      body: payload,
    });
  }

  deleteEvent(eventId: string, rowVersion: number) {
    return this.request<CalendarEvent>(
      `/v1/events/${encodeURIComponent(eventId)}?rowVersion=${encodeURIComponent(String(rowVersion))}`,
      { method: "DELETE" },
    );
  }

  listAttendees(eventId: string) {
    return this.request<EventAttendee[]>(`/v1/events/${encodeURIComponent(eventId)}/attendees`);
  }

  createAttendee(eventId: string, payload: EventAttendeeInput) {
    return this.request<EventAttendee>(`/v1/events/${encodeURIComponent(eventId)}/attendees`, {
      method: "POST",
      body: payload,
    });
  }

  updateAttendee(eventId: string, attendeeId: string, payload: EventAttendeeInput) {
    return this.request<EventAttendee>(
      `/v1/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(attendeeId)}`,
      { method: "PATCH", body: payload },
    );
  }

  deleteAttendee(eventId: string, attendeeId: string) {
    return this.request<void>(`/v1/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(attendeeId)}`, {
      method: "DELETE",
    });
  }

  getLocation(eventId: string) {
    return this.request<EventLocation>(`/v1/events/${encodeURIComponent(eventId)}/location`);
  }

  putLocation(eventId: string, payload: EventLocationInput) {
    return this.request<EventLocation>(`/v1/events/${encodeURIComponent(eventId)}/location`, {
      method: "PUT",
      body: payload,
    });
  }

  deleteLocation(eventId: string) {
    return this.request<void>(`/v1/events/${encodeURIComponent(eventId)}/location`, { method: "DELETE" });
  }

  listReminders(eventId: string) {
    return this.request<EventReminder[]>(`/v1/events/${encodeURIComponent(eventId)}/reminders`);
  }

  createReminder(eventId: string, payload: EventReminderInput) {
    return this.request<EventReminder>(`/v1/events/${encodeURIComponent(eventId)}/reminders`, {
      method: "POST",
      body: payload,
    });
  }

  updateReminder(eventId: string, reminderId: string, payload: EventReminderInput) {
    return this.request<EventReminder>(
      `/v1/events/${encodeURIComponent(eventId)}/reminders/${encodeURIComponent(reminderId)}`,
      { method: "PATCH", body: payload },
    );
  }

  deleteReminder(eventId: string, reminderId: string) {
    return this.request<void>(`/v1/events/${encodeURIComponent(eventId)}/reminders/${encodeURIComponent(reminderId)}`, {
      method: "DELETE",
    });
  }

  listOccurrenceOverrides(eventId: string) {
    return this.request<OccurrenceOverride[]>(`/v1/events/${encodeURIComponent(eventId)}/occurrence-overrides`);
  }

  createOccurrenceOverride(eventId: string, payload: OccurrenceOverrideInput) {
    return this.request<OccurrenceOverride>(`/v1/events/${encodeURIComponent(eventId)}/occurrence-overrides`, {
      method: "POST",
      body: payload,
    });
  }

  updateOccurrenceOverride(eventId: string, overrideId: string, payload: OccurrenceOverrideInput) {
    return this.request<OccurrenceOverride>(
      `/v1/events/${encodeURIComponent(eventId)}/occurrence-overrides/${encodeURIComponent(overrideId)}`,
      { method: "PATCH", body: payload },
    );
  }

  deleteOccurrenceOverride(eventId: string, overrideId: string) {
    return this.request<void>(
      `/v1/events/${encodeURIComponent(eventId)}/occurrence-overrides/${encodeURIComponent(overrideId)}`,
      { method: "DELETE" },
    );
  }

  listAvailabilityRules() {
    return this.request<AvailabilityRule[]>("/v1/availability/rules");
  }

  createAvailabilityRule(payload: AvailabilityRuleInput) {
    return this.request<AvailabilityRule>("/v1/availability/rules", { method: "POST", body: payload });
  }

  updateAvailabilityRule(ruleId: string, payload: AvailabilityRuleInput) {
    return this.request<AvailabilityRule>(`/v1/availability/rules/${encodeURIComponent(ruleId)}`, {
      method: "PATCH",
      body: payload,
    });
  }

  deleteAvailabilityRule(ruleId: string) {
    return this.request<void>(`/v1/availability/rules/${encodeURIComponent(ruleId)}`, { method: "DELETE" });
  }

  listAvailabilityBlocks() {
    return this.request<AvailabilityBlock[]>("/v1/availability/blocks");
  }

  createAvailabilityBlock(payload: AvailabilityBlockInput) {
    return this.request<AvailabilityBlock>("/v1/availability/blocks", { method: "POST", body: payload });
  }

  updateAvailabilityBlock(blockId: string, payload: AvailabilityBlockInput) {
    return this.request<AvailabilityBlock>(`/v1/availability/blocks/${encodeURIComponent(blockId)}`, {
      method: "PATCH",
      body: payload,
    });
  }

  deleteAvailabilityBlock(blockId: string) {
    return this.request<void>(`/v1/availability/blocks/${encodeURIComponent(blockId)}`, { method: "DELETE" });
  }
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(API_PREFIX + "/health", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw await errorFrom(response);
  }

  return (await response.json()) as HealthResponse;
}
