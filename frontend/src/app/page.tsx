import { ApiStatus } from "@/components/api-status";

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Full-stack starter</p>
        <h1 id="page-title">Next.js meets Spring Boot.</h1>
        <p className="intro">
          A deliberately small foundation with a typed React client, a versioned Java API,
          and a development proxy already wired together.
        </p>
      </section>

      <ApiStatus />

      <section className="next-steps" aria-labelledby="next-steps-title">
        <h2 id="next-steps-title">Where to build next</h2>
        <ul>
          <li>Add domain routes below <code>backend/src/main/java</code>.</li>
          <li>Add pages and reusable UI below <code>frontend/src</code>.</li>
          <li>Introduce persistence only after the domain model is clear.</li>
        </ul>
      </section>
    </main>
  );
}
