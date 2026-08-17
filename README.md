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

Open http://localhost:3000. The page checks the API and displays its greeting. The frontend defaults to `http://localhost:8080` for its proxy target, so no environment file is needed for local development.

To point the frontend at a different backend, copy `frontend/.env.example` to `frontend/.env.local` and set `BACKEND_ORIGIN`.

## Included API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Application health response used by the frontend |
| `GET` | `/api/v1/greeting?name=Ada` | Example versioned API endpoint |
| `GET` | `/actuator/health` | Spring Boot operational health endpoint |

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
