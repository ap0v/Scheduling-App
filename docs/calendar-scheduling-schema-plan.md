# Calendar and Scheduling App — Schema Plan

**Status:** Proposed design — updated for the personal-calendar MVP  
**Audience:** product, frontend, and backend contributors  
**Backend:** Supabase (Postgres, Auth, Row Level Security, Edge Functions, and Storage when attachments are added)  
**Migration workflow:** version-controlled SQL migrations with the Supabase CLI

## 1. Purpose and scope

This document describes a relational data model for evolving this starter application into a calendar and scheduling product. It is intentionally implementation-oriented without requiring a database or authentication provider to be chosen today.

The initial product should support:

- Supabase-authenticated accounts and personal calendars only;
- timed and all-day events;
- invited internal users and external guests who can view their invited event's details through a secure link;
- recurring events, including changed or cancelled individual occurrences;
- availability, reminders, and auditability;
- optional in-person venue selection and an advisory business-hours check through Google Places API (New).

Organization/shared calendars and external calendar synchronization are deferred. Scheduling links may be introduced after core events, but a booking creates an event only after the host approves it.

## 2. Design decisions

| Decision | Plan |
| --- | --- |
| Primary keys | Use generated UUIDs (`uuid`) for externally exposed entities. Do not expose sequential IDs in APIs. |
| Naming | Use plural, `snake_case` table names; `<entity>_id` foreign keys; UTC `timestamptz` timestamps. |
| Lifecycle | Include `created_at` and `updated_at` on user-owned records. Use `deleted_at` for recoverable deletion where history matters. |
| Authentication | Supabase Auth owns credentials, identity providers, account recovery, and `auth.users`. Application profile data belongs in `public.profiles`. |
| MVP boundary | Every calendar belongs to exactly one profile. Do not add organizations, shared calendars, or `calendar_members` to the first migration. |
| Authorization | Enable Row Level Security (RLS) on every `public` table. RLS is the data-access boundary; UI checks are only a convenience, and privileged Edge Functions must enforce their own caller checks. |
| Event ownership | An event belongs to one calendar. Guests receive an attendee record rather than a duplicated event row. |
| Recurrence | Store one recurring event master plus sparse exception/override rows. Generate occurrences at read time or in a bounded cache; do not pre-create an unbounded number of event rows. |
| Time zones | Store timed instants in UTC and retain an IANA zone, such as `America/New_York`, for display and recurrence expansion. |
| Venue data | Store only a Google Place ID as the durable provider reference. Fetch provider-owned name, address, and hours on demand and preserve a separately host-entered location fallback. |
| Booking approval | A scheduling request is `pending_review` until the host approves it. Only approval creates the normal event and attendee rows. |

## 3. Temporal rules (non-negotiable)

Calendar products become unreliable when their date rules are ambiguous. The following rules should be shared by the API, UI, and database migrations.

1. A **timed event** has `starts_at` and `ends_at` as `timestamptz`, with `ends_at > starts_at`. PostgreSQL stores the instant; `event_time_zone` preserves the calendar zone in which the event was authored.
2. An **all-day event** has `starts_on` and `ends_on` as `date`, where `ends_on` is exclusive. A one-day event on 2026-08-12 is `[2026-08-12, 2026-08-13)`.
3. A row is one type or the other: timed fields and all-day fields must not coexist.
4. Recurring timed events expand in the master event's `event_time_zone`, so a weekly 09:00 meeting remains at 09:00 through daylight-saving changes.
5. Use IANA time-zone identifiers, not fixed UTC offsets. Offset-only values fail across daylight-saving transitions.
6. Never infer availability from a user's current browser time zone. Convert server-side using the event/calendar zone and return an explicit display zone to clients.

## 4. Core relationship map

```text
auth.users ──1:1── public.profiles ──< calendars ──< events
                  │                               ├──< event_attendees ──< event_invitations
                  │                               ├──< event_reminders
                  ├──< availability_rules         ├──< event_occurrence_overrides
                  ├──< availability_blocks        └──0..1 event_locations ──> Google Place ID
                  └──< audit_log

scheduling_links ──< booking_requests ──(approved)──> events
```

In version one, every `calendars` row is a private, personal calendar owned by one profile. An event has one canonical row in that owner's calendar; attendees and invite links do not duplicate the event into another calendar. A guest link can reveal only its specific event, never the owner's wider calendar.

## 5. Core tables

The types below are PostgreSQL-oriented and should be created as Supabase CLI SQL migrations. `auth.users` is Supabase-managed and is not exposed through the generated data API; use `public.profiles` for application data and reference only the stable `auth.users.id` primary key.

### 5.1 Supabase Auth and profiles (V1)

#### `auth.users` (Supabase-managed)

Supabase Auth owns credentials, authentication identities, account recovery, verification state, and provider identifiers. Do not put application tables in the `auth` schema and do not create a separate `auth_identities` table. The only supported application reference is `auth.users.id`.

#### `profiles`

`public.profiles` is the application-facing user record. Create it with a signup trigger that inserts a row for each new `auth.users` row; keep the trigger small and reliable because a trigger failure can block sign-up.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK, FK → `auth.users.id` | The same stable UUID as the authenticated user. `ON DELETE CASCADE`; Auth-user deletion is server-only and occurs only at final account purge. |
| `email` | `text` nullable | Normalized contact-email snapshot for application queries. Email is nullable to support non-email sign-in; require a verified email before inviting external guests. |
| `display_name` | `varchar(120)` | Required. |
| `time_zone` | `varchar(64)` | Required IANA zone; default only, not a replacement for event zones. |
| `locale` | `varchar(16)` | Optional display preference, such as `en-US`. |
| `deletion_requested_at` | `timestamptz` nullable | Set when a user starts account deletion. |
| `purge_after` | `timestamptz` nullable | Scheduled final-purge time; policy decision is still pending. |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz` | Required timestamps; `deleted_at` immediately removes ordinary access through RLS. |

Create a partial unique index on `lower(email)` where `email IS NOT NULL AND deleted_at IS NULL`. The Supabase Auth record is the credential source of truth; sync or re-verify this application snapshot when the user changes their email.

### 5.2 Personal calendars (V1)

#### `calendars`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `owner_profile_id` | `uuid` FK → `profiles.id` | Required; there is no organization owner in V1. Cascade only in the final account-purge path, after cancellation notices. |
| `name` | `varchar(160)` | Required. A user may have multiple personal calendars. |
| `description` | `text` nullable |  |
| `color` | `varchar(9)` nullable | Validate a supported hex color format in the application. |
| `time_zone` | `varchar(64)` | Required IANA default for new events. |
| `default_event_access` | `varchar(20)` | `private` or `invitees`; default `private`. |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz` |  |

Constraint: `CHECK (default_event_access IN ('private', 'invitees'))`. V1 has no `calendar_members` table: a profile can access only its own calendar rows. Invitation links, described below, are the sole guest-access route.

### 5.2.1 Shared calendars (deferred)

When collaboration ships, add `organizations`, `organization_members`, and `calendar_members` in a separate migration and introduce organization-owned calendars deliberately. Do not leave nullable organization columns or unused membership tables in the V1 schema.

### 5.3 Events and invitations

#### `events`

This table stores standalone events and recurring **master** events. It does not store every generated occurrence.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `calendar_id` | `uuid` FK → `calendars.id` | Required owner calendar; cascade if its calendar is finally purged. |
| `created_by_profile_id` | `uuid` FK → `profiles.id` | Required; retain even if edit access later changes. |
| `title` | `varchar(500)` | Required; allow a non-empty value only. |
| `description` | `text` nullable | Store sanitized rich-text or plain text by product decision. |
| `location` | `varchar(500)` nullable | Host-authored physical or virtual fallback. Use `event_locations` for an optional Google Place reference. |
| `conference_url` | `text` nullable | Validate URL on write. |
| `status` | `varchar(20)` | `confirmed` or `cancelled`; default `confirmed`. |
| `busy_status` | `varchar(20)` | `busy`, `free`, or `out_of_office`; default `busy`. |
| `access_scope` | `varchar(20)` | `private` or `invitees`; default `private`. An invitee's signed link is required for guest access. |
| `is_all_day` | `boolean` | Required, default `false`. |
| `starts_at`, `ends_at` | `timestamptz` nullable | Timed-event interval. |
| `starts_on`, `ends_on` | `date` nullable | All-day interval, end exclusive. |
| `event_time_zone` | `varchar(64)` nullable | Required for timed events and recommended for all events. |
| `recurrence_rule` | `text` nullable | Normalized RFC 5545 `RRULE` value, without `DTSTART`. |
| `recurrence_revision` | `integer` | Default `0`; increment on recurrence edits to make cache invalidation explicit. |
| `sequence` | `integer` | Default `0`; increment for attendee-visible changes. |
| `row_version` | `integer` | Default `0`; use for optimistic concurrency checks in update requests. |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz` |  |

Recommended checks:

```sql
CHECK (
  (is_all_day = false AND starts_at IS NOT NULL AND ends_at IS NOT NULL
   AND starts_on IS NULL AND ends_on IS NULL AND ends_at > starts_at)
  OR
  (is_all_day = true AND starts_on IS NOT NULL AND ends_on IS NOT NULL
   AND starts_at IS NULL AND ends_at IS NULL AND ends_on > starts_on)
),
CHECK (status IN ('confirmed', 'cancelled')),
CHECK (busy_status IN ('busy', 'free', 'out_of_office')),
CHECK (access_scope IN ('private', 'invitees')),
CHECK (recurrence_revision >= 0),
CHECK (sequence >= 0),
CHECK (row_version >= 0)
```

The application must validate `recurrence_rule` against a supported RFC 5545 subset before saving it. Start with `FREQ`, `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `COUNT`, and `UNTIL`; reject unsupported pieces rather than storing a rule the product cannot interpret.

#### `event_occurrence_overrides`

An override changes or cancels exactly one generated occurrence of a recurring master event. A cancellation is an override with `is_cancelled = true`; it must not delete the master or other occurrences.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `event_id` | `uuid` FK → `events.id` | Must reference a recurring master; enforce in service logic. |
| `original_starts_at` | `timestamptz` nullable | Identifies a timed occurrence before changes. |
| `original_starts_on` | `date` nullable | Identifies an all-day occurrence before changes. |
| `is_cancelled` | `boolean` | Required, default `false`. |
| `title`, `description`, `location`, `conference_url` | nullable | Non-null value replaces the master value. |
| `starts_at`, `ends_at` | `timestamptz` nullable | Replacement timed interval; set together. |
| `starts_on`, `ends_on` | `date` nullable | Replacement all-day interval; set together. |
| `event_time_zone` | `varchar(64)` nullable | Replacement zone if the timing moves. |
| `updated_by_profile_id` | `uuid` FK → `profiles.id` | Required. |
| `created_at`, `updated_at` | `timestamptz` |  |

Constraints:

- exactly one original occurrence key is populated;
- `UNIQUE (event_id, original_starts_at)` and `UNIQUE (event_id, original_starts_on)`;
- replacement start/end fields are either both set or both null, and any supplied interval has a positive duration.

For “this and following” edits, split the series in the service layer: shorten the old master's rule, then create a new master beginning at the changed occurrence. This avoids ambiguous override chains.

#### `event_attendees`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `event_id` | `uuid` FK → `events.id` | Required; cascade if its event is finally purged. |
| `profile_id` | `uuid` FK → `profiles.id`, nullable | Present for an internal attendee. Use `ON DELETE SET NULL` so a future owner event can survive a former attendee's final purge. |
| `email` | `text` nullable | Normalized email for an external attendee; snapshot an internal invite email only when delivery requires it. |
| `display_name` | `varchar(160)` nullable | Guest-facing label. |
| `role` | `varchar(20)` | `organizer`, `required`, `optional`, or `resource`. |
| `response_status` | `varchar(20)` | `needs_action`, `accepted`, `declined`, or `tentative`. |
| `responded_at` | `timestamptz` nullable |  |
| `invited_at` | `timestamptz` | Required. |

Constraints: require at least one of `profile_id` or `email`; use a partial unique index to prevent the same internal profile from being invited twice, and a normalized-email unique index per event for external guests. The event creator should also have an `organizer` attendee row.

#### `event_invitations`

This table grants an external guest the ability to view the full details of exactly one event and to RSVP. Never add an `anon` RLS policy directly to `events`; resolve this token inside a narrowly scoped Edge Function or database RPC and return only the permitted event payload.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `event_attendee_id` | `uuid` FK → `event_attendees.id` | Required; cascade if the attendee/event is finally purged; one guest identity can receive multiple reissued links. |
| `token_digest` | `text` | Required, unique, and one-way hashed. Never store a raw link token. |
| `scope` | `varchar(20)` | Initially `event_details`; do not grant calendar access. |
| `expires_at`, `revoked_at`, `last_viewed_at` | `timestamptz` nullable | Link lifecycle. |
| `sent_at` | `timestamptz` nullable |  |
| `created_at` | `timestamptz` | Required. |

Constraint: `CHECK (scope = 'event_details')`. Invalidate every active token when its event is cancelled, an attendee is removed, or the owner's account is deleted.

#### `event_locations`

At most one location row is needed for V1. It permits a host to use a manually entered venue or select a Google Place without turning transient provider content into a permanent cache.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `event_id` | `uuid` FK → `events.id` | Required; cascade if its event is finally purged; unique to make this a 0..1 relationship. |
| `kind` | `varchar(20)` | `manual` or `google_place`. |
| `host_label` | `varchar(500)` nullable | Host-authored/confirmed fallback only; do not automatically copy a provider display name here. |
| `host_address` | `text` nullable | Host-authored/confirmed fallback only. |
| `google_place_id` | `text` nullable | Durable Google Places identifier; the only provider-owned place content retained by default. |
| `place_id_refreshed_at` | `timestamptz` nullable | Use to refresh a stale reference. |
| `host_confirmed_at` | `timestamptz` nullable | When the host approved the location. |
| `created_at`, `updated_at` | `timestamptz` |  |

Checks: `kind = 'manual'` requires a non-empty `host_label`; `kind = 'google_place'` requires `google_place_id`; `UNIQUE (event_id)`; and `UNIQUE (google_place_id) WHERE google_place_id IS NOT NULL` only if a place must be globally unique in your product (normally it should not be).

#### `event_reminders`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `event_id` | `uuid` FK → `events.id` | Required. |
| `recipient_profile_id` | `uuid` FK → `profiles.id` | Required for first release. |
| `channel` | `varchar(20)` | `in_app`, `email`, or `push`. |
| `minutes_before` | `integer` | Non-negative; constrain to a product maximum. |
| `created_at` | `timestamptz` |  |

Constraint: `UNIQUE (event_id, recipient_profile_id, channel, minutes_before)`.

### 5.4 Availability

Availability belongs to a person, not a particular browser session. It is combined with busy events from the calendars the person elects to expose.

#### `availability_rules`

Recurring weekly availability window, such as every Monday from 09:00 to 17:00.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `profile_id` | `uuid` FK → `profiles.id` | Required. |
| `weekday` | `smallint` | ISO weekday 1–7. |
| `starts_local_time`, `ends_local_time` | `time` | `ends_local_time > starts_local_time`. |
| `time_zone` | `varchar(64)` | Required IANA zone; preserves intended local work hours. |
| `effective_from`, `effective_until` | `date` nullable | Optional date range; end is exclusive. |
| `created_at`, `updated_at` | `timestamptz` |  |

#### `availability_blocks`

One-off intervals that add or remove availability, such as vacation, a holiday, or an exceptional open slot.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `profile_id` | `uuid` FK → `profiles.id` | Required. |
| `kind` | `varchar(20)` | `available` or `unavailable`. |
| `starts_at`, `ends_at` | `timestamptz` | Required; positive interval. |
| `time_zone` | `varchar(64)` nullable | Original display zone. |
| `note` | `varchar(500)` nullable | Private note; never expose by default in scheduling links. |
| `created_at`, `updated_at` | `timestamptz` |  |

Busy event calculation should exclude cancelled events and include only calendars owned by the profile. Do not materialize a permanent “free/busy” table until measured performance requires it.

### 5.5 Operational tables

#### `notification_deliveries`

Track asynchronous reminder/invitation attempts separately from reminder configuration.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `event_id` | `uuid` FK → `events.id`, nullable | Nullable for non-event notifications. |
| `recipient_profile_id` | `uuid` FK → `profiles.id`, nullable |  |
| `recipient_email` | `text` nullable | Normalized email for external invitations. |
| `channel`, `kind` | `varchar(20)` | Examples: `email`/`invitation`, `push`/`reminder`. |
| `scheduled_for`, `sent_at` | `timestamptz` | `sent_at` is nullable until success. |
| `status` | `varchar(20)` | `pending`, `sent`, `failed`, or `cancelled`. |
| `provider_message_id`, `last_error` | `text` nullable | Avoid storing credentials or full sensitive payloads. |
| `created_at`, `updated_at` | `timestamptz` |  |

#### `audit_log`

Use an append-only log for security-sensitive or user-visible changes: calendar sharing, event creation/update/cancellation, RSVP changes, and scheduling-link bookings.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `actor_profile_id` | `uuid` FK → `profiles.id`, nullable | Null for system jobs; use `ON DELETE SET NULL` during final account purge. |
| `action` | `varchar(80)` | Example: `event.cancelled`. |
| `entity_type`, `entity_id` | `varchar(80)`, `uuid` | Target object. |
| `occurred_at` | `timestamptz` | Required. |
| `metadata` | `jsonb` | Minimal before/after metadata; redact sensitive content. |

#### `outbox_messages`

Use a transactional outbox so event writes and downstream email, push, or sync work cannot silently diverge. Insert an outbox row in the same transaction that changes the domain record; a worker publishes and marks it processed.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK |  |
| `aggregate_type`, `aggregate_id` | `varchar(80)`, `uuid` | The changed entity, such as `event` and its ID. |
| `event_type` | `varchar(80)` | Example: `event.updated`. |
| `payload` | `jsonb` | Minimal, versioned message payload; do not include credentials. |
| `occurred_at` | `timestamptz` | Required. |
| `processed_at` | `timestamptz` nullable | Null until successfully handed off. |
| `attempt_count` | `integer` | Default `0`. |
| `last_error` | `text` nullable | Operational diagnostic only. |

## 6. Constraints, deletion, and consistency

- Use foreign keys for every relationship. Use `ON DELETE CASCADE` for the owned dependency tree (`profiles` → calendars → events → overrides/attendees/invitations/reminders/locations) during final account purge. Use `ON DELETE SET NULL` for audit actors and an attendee's profile reference when limited non-identifying history must survive.
- Soft-delete profiles, calendars, and events before final purge. Every ordinary RLS policy must require the owner profile's `deleted_at IS NULL`, so a deleted account cannot read or expose data during a recovery window.
- Deleting a recurring occurrence creates a cancellation override. Deleting a full series soft-deletes the event master, revokes invitation tokens, and cancels pending notification deliveries.
- Do not directly delete `auth.users` from a client. The final deletion workflow must first revoke guest links, cancel and notify future events, clean Storage objects, purge application data, and then use a trusted Supabase server environment to delete the Auth user.
- Database checks enforce row-local facts (valid event interval, valid role, valid access scope). Transactions or security-definer functions enforce cross-row facts (the caller owns the calendar, an override refers to an actual occurrence, and a booking approval still has capacity).
- Require an event's current `row_version` on an update and increment it atomically. Return a conflict response when a stale client attempts to overwrite a newer change.
- Keep domain values as checked `varchar` values initially. PostgreSQL enums are reasonable once values have stabilized, but are harder to change through migrations.

## 7. Supabase security and background work

Enable RLS on every application table in `public`; new tables should ship with their policies in the same migration. The browser uses the publishable key and the user's JWT. A Supabase secret key can bypass RLS, so it belongs only in a trusted Edge Function or other server environment and never in frontend code.

| Table family | Browser policy for V1 |
| --- | --- |
| `profiles` | A profile can select/update only its own active row (`id = auth.uid()`). |
| `calendars`, `events`, overrides, locations, reminders | A profile can access a row only when the owning calendar's `owner_profile_id = auth.uid()` and the profile/calendar are not deleted. |
| `event_attendees` | Event owner may manage them; no direct anonymous browser access. |
| `event_invitations`, `notification_deliveries`, `audit_log`, `outbox_messages` | No direct browser access. Trusted backend jobs only. |
| `availability_*` | A profile can access only its own active rows. |

The signed guest-detail endpoint must hash the presented token, verify expiry/revocation and attendee/event status, and return a purpose-built response. It must not issue a general Supabase session or expose table access. Use a scheduled Edge Function (for example, triggered by `pg_cron`) to process pending notifications, final-purge requests, and any bounded occurrence cache.

Relevant official documentation: [Supabase user-management pattern](https://supabase.com/docs/guides/auth/managing-user-data), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [database migrations](https://supabase.com/docs/guides/deployment/database-migrations), and [scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

## 8. Index plan

Create indexes with the first migration that introduces each table; then refine them from production query evidence.

| Query | Suggested index |
| --- | --- |
| Find a profile's calendars | `calendars (owner_profile_id) WHERE deleted_at IS NULL` |
| Load events for calendar(s) over a time window | `events (calendar_id, starts_at)` with a partial predicate for active timed events; a separate `(calendar_id, starts_on)` index for active all-day events |
| Fetch a recurring master's exceptions | `event_occurrence_overrides (event_id, original_starts_at)` and `(event_id, original_starts_on)` |
| Load an event's guests/reminders | `event_attendees (event_id)` and `event_reminders (event_id)` |
| Calculate a person's availability | `availability_rules (profile_id, weekday)` and `availability_blocks (profile_id, starts_at, ends_at)` |
| Resolve a guest-detail link | `event_invitations (token_digest) WHERE revoked_at IS NULL` |
| Process due notifications | Partial index `notification_deliveries (scheduled_for) WHERE status = 'pending'` |
| Publish domain changes reliably | Partial index `outbox_messages (occurred_at) WHERE processed_at IS NULL` |
| Review entity history | `audit_log (entity_type, entity_id, occurred_at DESC)` |

For conflict detection on non-overlapping resources (for example, a room or paid appointment slot), use a `tstzrange(starts_at, ends_at, '[)')` exclusion constraint in the future resource-booking table. Do **not** add it to ordinary events: users are allowed to have overlapping calendar events.

## 9. Venue selection and business-hours check

Use **Google Places API (New)** for a venue picker and for an advisory open-hours check. Do not scrape Google Maps pages. The web-service calls should pass through a Supabase Edge Function so the Google API key is never exposed in the browser.

1. Start a unique Autocomplete session when the host begins a venue search.
2. Send the selected Google Place ID to a Place Details request with a narrow field mask, such as `id,displayName,formattedAddress,location,timeZone,businessStatus,regularOpeningHours,currentOpeningHours,attributions,googleMapsUri`. The opening-hours fields use the Places Details Enterprise SKU, so request them only after the host selects or reviews a venue.
3. Evaluate operating hours in the returned venue `timeZone`, not the host's browser time zone. Use `currentOpeningHours` when it covers the proposed date and `regularOpeningHours` only as a normal-hours fallback for farther-out dates.
4. Show a clear warning for closed, unknown, or temporarily/permanently closed locations. The result is not a reservation or a guarantee that the venue will be open.
5. On host approval, save the Google Place ID in `event_locations`; retain only host-authored location fallback text. Fetch Google-owned place content again when it must be displayed.

Google permits indefinite retention of a Place ID but generally restricts caching or storing Places content such as provider-supplied names, addresses, coordinates, and opening hours. Refresh a saved Place ID when it is older than 12 months. Display the required Google Maps and third-party attributions whenever provider content is shown. Review the applicable Google terms before shipping, especially if the project is billed in the EEA.

**Open behavior decision:** should a venue's hours be a hard constraint (do not allow a proposed slot outside them) or an advisory warning? The recommended V1 behavior is **warning only**: hours can be incomplete or change, and the host already must approve a booking.

Relevant official documentation: [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details), [Places policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies), [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id), and [Autocomplete session tokens](https://developers.google.com/maps/documentation/places/web-service/using-session-tokens).

## 10. Scheduling-link and resource-booking extension

Add these after core events and availability are reliable:

| Table | Responsibility |
| --- | --- |
| `scheduling_links` | Public/private booking configuration: `owner_profile_id`, title, duration, lead time, buffer, visible date range, time zone, active state, and opaque public slug. |
| `scheduling_link_calendars` | The owner's personal calendars consulted for conflicts, plus one selected calendar for the event created on approval. |
| `scheduling_link_availability` | Optional link-specific availability rules that narrow a user's normal availability. |
| `booking_requests` | Idempotent booking submission, invitee details, selected interval, source link, optional temporary hold, and status: `pending_review`, `approved`, `declined`, `withdrawn`, or `expired`. Store a client/request idempotency key. |
| `booking_answers` | Answers to configured intake questions. |
| `resources` and `resource_bookings` | Rooms/equipment and their reserved intervals; apply an overlap exclusion constraint here. |

Submitting a request must **not** create an event. The host reviews it against current availability and venue information. In one transaction, an approval creates one normal `events` row plus `event_attendees` rows and persists the source `booking_request_id` on the event (or in a small `booking_event_links` table). If pending requests temporarily hold slots, give holds a short explicit expiry and re-check availability on approval.

## 11. External calendar synchronization (future)

External providers should be modeled separately from core calendars:

- `calendar_connections`: encrypted provider credentials/references, provider account identifier, sync cursor, status, and last successful sync time.
- `external_calendar_mappings`: connection, provider calendar ID, local calendar ID, selected state, and sync direction.
- `external_event_mappings`: provider event ID/version, local event ID, last synced revision, and conflict state.

Encrypt refresh tokens using Supabase Vault or a trusted Edge Function secret, restrict access tightly, and never return them from API responses or audit metadata. Start with one-way free/busy import before bidirectional event sync, which requires conflict-resolution rules.

## 12. Delivery sequence

1. **Supabase foundation:** create the project, commit Supabase CLI migrations, enable required extensions, add `profiles`, and add the Auth-to-profile signup trigger. Write RLS tests before product endpoints.
2. **Personal calendars:** add `calendars` with `owner_profile_id`; add owner-only RLS policies and create a default calendar after profile creation.
3. **Events and guest access:** add `events`, attendees, invitations, reminders, event locations, range queries, timed/all-day checks, and the secure guest-detail Edge Function.
4. **Recurrence:** implement the selected bounded recurrence subset, occurrence expansion, overrides, and daylight-saving test cases before exposing repeat-event editing in the UI.
5. **Availability and operations:** add availability, notifications, outbox/audit records, and scheduled jobs for deliveries and final purges.
6. **Venue assistance:** add a Google Places Edge Function, attribution-aware UI, and advisory operating-hours warning.
7. **Host-approved booking:** add scheduling links and pending booking requests. Create events only in the approval transaction.
8. **Deferred work:** add resource reservation, shared calendars, and external calendar sync only after the personal-calendar model is stable.

Each step should be its own reversible migration set and should include repository/API tests for authorization, time-zone boundaries, exclusive end dates, and recurrence exceptions.

## 13. Product decisions and open choices

### Confirmed

| Topic | Decision |
| --- | --- |
| First release | Personal calendars only. Shared calendars and organizations are deferred. |
| Backend and authentication | Supabase Postgres, Auth, RLS, Edge Functions, and CLI migrations. Supabase owns credentials and account recovery. |
| External guests | An invited external guest may view the complete details of their invited event through a signed, scoped, expiring link. |
| Scheduling links | Host approval is required. A request is not an event until approved. |
| In-person venues | Use Google Places API (New) for venue lookup and business-hours assistance. |

### Recurrence: what this decision actually covers

This is more than choosing between “weekly” and “monthly.” It determines which repeat patterns users can create, when a series ends, and what happens if one occurrence changes.

| Scope choice | Examples | Cost and trade-off |
| --- | --- | --- |
| Weekly only | Every Tuesday; every other Monday; Tuesday and Thursday each week | Fastest launch and easiest UI, but cannot represent monthly bills, birthdays, or many routine appointments. |
| Familiar recurring patterns | Daily, weekdays, weekly with an interval/multiple weekdays, monthly on the same date, yearly on the same date | **Recommended V1.** Covers ordinary calendar use while still allowing a simple, validated rule builder. |
| Fully custom rules | “Third business day,” “last weekday,” combined rules, holiday exclusions, raw arbitrary RFC 5545 rules | Most flexible, but difficult to explain, validate, edit, test through daylight saving time, and interoperate reliably. Defer until real demand exists. |

Recommended V1 behavior:

- Let a user select daily, weekdays, weekly, monthly on the same numbered day, or yearly on the same date; allow an interval such as every two weeks.
- Let a series end never, on a date, or after a number of occurrences.
- Let the user edit/delete the entire series and skip or alter one occurrence. Store that skip/change as an `event_occurrence_overrides` row.
- Defer “this and all future occurrences” if schedule is tight; it requires splitting a series into two masters. If added, preserve it as the documented split operation in section 5.3.
- Use the event's IANA time zone and preserve local clock time through daylight-saving transitions. A monthly event on the 29th–31st should skip a month without that date rather than silently shift days.
- Treat guest RSVPs as series-wide in V1; per-occurrence RSVPs can be added later.
- Keep `recurrence_rule` as a restricted, server-validated format generated by the UI. Do not accept arbitrary raw RRULE text from clients yet.

### Account-deletion and retention options

This is a product/privacy decision, not merely a schema choice. The applicable law, customer commitments, and backup configuration should be reviewed before publishing a privacy policy.

| Option | What happens | Advantages | Drawbacks |
| --- | --- | --- | --- |
| Immediate hard deletion | Remove the Auth user and all reachable application data immediately. | Strongest simple privacy story. | No recovery window; difficult to deliver cancellation notices; accidental deletion is irreversible. |
| Soft delete, then hard purge | Disable access and guest links immediately, allow restoration for a fixed window, then permanently purge. | **Recommended.** Balances privacy, recovery, and reliable cancellation notices. | Requires a scheduled purge workflow and a clear disclosure of the grace period. |
| Anonymize historical data | Cancel future events and remove identity/content, but retain limited event history as “Deleted user.” | Preserves operational history and aggregate reporting. | Dates, locations, and attendee patterns can still re-identify a person; more complex and a weaker privacy posture. |
| Extended retention / legal hold | Retain selected encrypted data for 90–365 days for disputes, abuse, or legal duties. | Useful only when a real legal/security need exists. | Highest compliance burden; needs a legal basis, restricted access, audit records, and explicit disclosure. Not recommended for V1. |

Recommended default policy, if you choose the second option:

1. On deletion request, revoke sessions and all invitation/scheduling links, mark the profile deleted, and hide its data through RLS.
2. Cancel future events the person hosts and notify invitees without revealing other guests.
3. Permit restoration for 30 days.
4. At the deadline, purge the Auth account, profile, personal calendars, event content, invitations, guest contact data, notification records, and Storage objects. If the deleted person is only an attendee of someone else's event, remove their attendee identity/RSVP rather than deleting the organizer's event.
5. Retain only short-lived, non-identifying security/deletion audit entries (for example, 30–90 days). Treat email hashes as personal data and purge them too. Document how long encrypted backups and point-in-time recovery can retain deleted data after production purge.

### Still to decide

- Should Google venue operating hours be a hard booking constraint or an advisory warning? The plan recommends a warning only.
- Choose the recurrence scope above; the plan recommends the familiar-patterns V1 rather than weekly-only or arbitrary custom rules.
- Choose one retention option and its exact deletion/grace/backup periods; the plan recommends a 30-day soft-delete grace period followed by hard purge.
