# Full-stack application template

A small, runnable starting point for a React/Next.js frontend and a Java/Spring Boot API. It intentionally starts without a database or authentication so the application boundary is easy to understand before adding domain-specific features.

## Stack

- Frontend: Next.js App Router, React, TypeScript, and ESLint
- Current template API: Spring Boot 4, Java 21, Maven, and JUnit/MockMvc
- Local integration: Next.js proxies `/api/*` requests to Spring Boot

## Planned application direction

The calendar product will use Supabase as its data/authentication backend: Supabase Postgres, Auth, Row Level Security, Edge Functions, and CLI-managed SQL migrations. The existing Spring Boot service remains the starter template until a later implementation decision replaces it or uses it only for any needed server-side integration layer.

See the [calendar and scheduling schema plan](docs/calendar-scheduling-schema-plan.md) for the personal-calendar MVP, secure guest links, host-reviewed booking flow, Google Places venue-hours integration, and the remaining product decisions.

## Project layout

```text
.
├── frontend/   # Next.js application, served on http://localhost:3000
└── backend/    # Spring Boot API, served on http://localhost:8080
```

The browser only calls relative `/api/...` URLs. During development, Next.js forwards those requests to Spring Boot, avoiding a hard-coded public backend URL. The backend also permits `http://localhost:3000` for direct local calls.

## Run locally

Prerequisites: Node.js 20.9+, Java 21+, and Maven 3.9+.

Start the API in one terminal:

```powershell
Set-Location backend
mvn spring-boot:run
```

Start the frontend in a second terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open http://localhost:3000. The page checks the API. The frontend defaults to `http://localhost:8080` for its proxy target, so no environment file is needed for local development.

To point the frontend at a different backend, copy `frontend/.env.example` to `frontend/.env.local` and set `BACKEND_ORIGIN`.

## Supabase scheduling API

The backend now exposes the user-facing portion of
[`scheduling_schema.sql`](supabase/migrations/scheduling_schema.sql) through
Supabase Auth and PostgREST. Execute that SQL in your Supabase project before
calling these routes. If you use `supabase db push`, place the SQL in a
timestamp-prefixed migration file as required by the Supabase CLI.

Set these server environment variables before starting the backend:

```powershell
$env:SUPABASE_URL = "https://your-project-ref.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "your-publishable-or-anon-key"
```

For local development, copy
[`backend/.env.example`](backend/.env.example) to `backend/.env` and replace
the placeholders. The backend imports that git-ignored file when started from
the `backend` directory. Set `SUPABASE_URL` to the project base URL (for
example, `https://your-project-ref.supabase.co`), not a `/rest/v1` or
`/auth/v1` endpoint URL.

`SUPABASE_ANON_KEY` is accepted as a compatibility fallback. Do not configure a
service-role key for these APIs: each request must supply the signed Supabase
access token in `Authorization: Bearer <access-token>`. The backend verifies
that token with Supabase Auth and forwards it to PostgREST, preserving the
schema's Row Level Security policies.

The backend verifies Supabase sessions; it does not issue sessions or proxy
password/OAuth login. A client must sign the user in through Supabase Auth and
forward the resulting session `access_token` in that header.

Request and response properties use the SQL schema's `snake_case` column
names. Ownership fields (`owner_profile_id`, `created_by_profile_id`,
`updated_by_profile_id`, and `profile_id` for availability) are derived from
the authenticated token and cannot be supplied by the caller. Calendar and
event `DELETE` endpoints soft-delete rows. Event `PATCH` requires the current
`row_version` in its JSON body, and event `DELETE` requires
`?rowVersion=<current version>`; stale writes return `409 Conflict`.

| Resource | Routes |
| --- | --- |
| Profile | `GET`, `PATCH /api/v1/profile` |
| Calendars | `GET`, `POST /api/v1/calendars`; `GET`, `PATCH`, `DELETE /api/v1/calendars/{calendarId}` |
| Events | `GET`, `POST /api/v1/calendars/{calendarId}/events`; `GET`, `PATCH`, `DELETE /api/v1/events/{eventId}` |
| Occurrence overrides | `GET`, `POST /api/v1/events/{eventId}/occurrence-overrides`; `GET`, `PATCH`, `DELETE /api/v1/events/{eventId}/occurrence-overrides/{overrideId}` |
| Attendees | `GET`, `POST /api/v1/events/{eventId}/attendees`; `GET`, `PATCH`, `DELETE /api/v1/events/{eventId}/attendees/{attendeeId}` |
| Event location | `GET`, `PUT`, `DELETE /api/v1/events/{eventId}/location` |
| Reminders | `GET`, `POST /api/v1/events/{eventId}/reminders`; `GET`, `PATCH`, `DELETE /api/v1/events/{eventId}/reminders/{reminderId}` |
| Availability rules | `GET`, `POST /api/v1/availability/rules`; `GET`, `PATCH`, `DELETE /api/v1/availability/rules/{ruleId}` |
| Availability blocks | `GET`, `POST /api/v1/availability/blocks`; `GET`, `PATCH`, `DELETE /api/v1/availability/blocks/{blockId}` |

The event collection accepts optional `from` and `to` parameters for overlap
filtering. Each accepts an ISO date or offset date-time; the range is
half-open (`event end > from` and `event start < to`). Internal invitations,
notification deliveries, audit logs, and outbox rows intentionally have no
generic CRUD endpoint because the migration reserves them for trusted flows.

## Included API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Application health response used by the frontend |
| `GET`, `POST`, `PUT`, `PATCH`, `DELETE` | `/api/v1/...` | Authenticated Supabase scheduling CRUD routes above |
| `GET` | `/actuator`, `/actuator/info`, `/actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness` | Spring Boot operational endpoints |

## Verify the template

```powershell
Set-Location backend
mvn test

Set-Location ../frontend
npm run lint
npm run typecheck
npm run build
```

## Natural next steps

- Add a database migration tool and persistence layer when you have a real domain model.
- Use the [calendar and scheduling schema plan](docs/calendar-scheduling-schema-plan.md) as the proposed domain-data design before adding persistence.
- Add authenticated API routes and keep secrets server-side.
- Put both applications behind a reverse proxy in production, then set `BACKEND_ORIGIN` and `FRONTEND_ORIGIN` for that environment.
