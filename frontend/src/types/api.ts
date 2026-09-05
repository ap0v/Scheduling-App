export type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export type ApiErrorResponse = {
  code: string;
  message: string;
};

export type Profile = {
  id: string;
  email: string | null;
  display_name: string;
  time_zone: string;
  locale: string | null;
  deletion_requested_at: string | null;
  purge_after: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Calendar = {
  id: string;
  owner_profile_id: string;
  name: string;
  description: string | null;
  color: string | null;
  time_zone: string;
  default_event_access: "private" | "invitees";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EventStatus = "confirmed" | "cancelled";
export type BusyStatus = "busy" | "free" | "out_of_office";
export type AccessScope = "private" | "invitees";

export type CalendarEvent = {
  id: string;
  calendar_id: string;
  created_by_profile_id: string;
  title: string;
  description: string | null;
  location: string | null;
  conference_url: string | null;
  status: EventStatus;
  busy_status: BusyStatus;
  access_scope: AccessScope;
  is_all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  starts_on: string | null;
  ends_on: string | null;
  event_time_zone: string | null;
  recurrence_rule: string | null;
  recurrence_revision: number;
  sequence: number;
  row_version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  conference_url?: string | null;
  status?: EventStatus;
  busy_status?: BusyStatus;
  access_scope?: AccessScope;
  is_all_day: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  event_time_zone?: string | null;
  recurrence_rule?: string | null;
  recurrence_revision?: number;
  sequence?: number;
};

export type EventUpdateInput = Partial<EventInput> & {
  row_version: number;
};

export type AttendeeRole = "organizer" | "required" | "optional" | "resource";
export type ResponseStatus = "needs_action" | "accepted" | "declined" | "tentative";

export type EventAttendee = {
  id: string;
  event_id: string;
  profile_id: string | null;
  email: string | null;
  display_name: string | null;
  role: AttendeeRole;
  response_status: ResponseStatus;
  responded_at: string | null;
  invited_at: string;
};

export type EventAttendeeInput = {
  profile_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  role?: AttendeeRole;
  response_status?: ResponseStatus;
  responded_at?: string | null;
};

export type EventLocationKind = "manual" | "google_place";

export type EventLocation = {
  id: string;
  event_id: string;
  kind: EventLocationKind;
  host_label: string | null;
  host_address: string | null;
  google_place_id: string | null;
  place_id_refreshed_at: string | null;
  host_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventLocationInput = {
  kind: EventLocationKind;
  host_label?: string | null;
  host_address?: string | null;
  google_place_id?: string | null;
  place_id_refreshed_at?: string | null;
  host_confirmed_at?: string | null;
};

export type ReminderChannel = "in_app" | "email" | "push";

export type EventReminder = {
  id: string;
  event_id: string;
  recipient_profile_id: string;
  channel: ReminderChannel;
  minutes_before: number;
  created_at: string;
};

export type EventReminderInput = {
  recipient_profile_id?: string;
  channel?: ReminderChannel;
  minutes_before?: number;
};

export type OccurrenceOverride = {
  id: string;
  event_id: string;
  original_starts_at: string | null;
  original_starts_on: string | null;
  is_cancelled: boolean;
  title: string | null;
  description: string | null;
  location: string | null;
  conference_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  starts_on: string | null;
  ends_on: string | null;
  event_time_zone: string | null;
  updated_by_profile_id: string;
  created_at: string;
  updated_at: string;
};

export type OccurrenceOverrideInput = {
  original_starts_at?: string | null;
  original_starts_on?: string | null;
  is_cancelled?: boolean;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  conference_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  event_time_zone?: string | null;
};

export type AvailabilityRule = {
  id: string;
  profile_id: string;
  weekday: number;
  starts_local_time: string;
  ends_local_time: string;
  time_zone: string;
  effective_from: string | null;
  effective_until: string | null;
  created_at: string;
  updated_at: string;
};

export type AvailabilityRuleInput = {
  weekday?: number;
  starts_local_time?: string;
  ends_local_time?: string;
  time_zone?: string;
  effective_from?: string | null;
  effective_until?: string | null;
};

export type AvailabilityBlockKind = "available" | "unavailable";

export type AvailabilityBlock = {
  id: string;
  profile_id: string;
  kind: AvailabilityBlockKind;
  starts_at: string;
  ends_at: string;
  time_zone: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type AvailabilityBlockInput = {
  kind?: AvailabilityBlockKind;
  starts_at?: string;
  ends_at?: string;
  time_zone?: string | null;
  note?: string | null;
};
