"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AvailabilityPanel } from "@/components/availability-panel";
import { AuthGate } from "@/components/auth-gate";
import { CalendarGrid } from "@/components/calendar-grid";
import { EventDetails } from "@/components/event-details";
import { EventEditor } from "@/components/event-editor";
import { SettingsPanel } from "@/components/settings-panel";
import { ApiError, SchedulingApi } from "@/lib/api";
import { addMonths, dateKey, defaultTimeZone, formatMonthTitle, startOfMonth } from "@/lib/date-time";
import { currentAccessToken, getSupabaseClient, supabaseSetupIssue, type Session } from "@/lib/supabase";
import type { AvailabilityBlock, AvailabilityRule, Calendar, CalendarEvent, Profile } from "@/types/api";

type WorkspaceView = "calendar" | "availability" | "settings";

const FALLBACK_COLORS = ["#5163ff", "#e56a5d", "#1a9d7d", "#e6a11d", "#8d5ed6", "#2d87c9"];

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong while loading your schedule.";
}

export function SchedulingApplication() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(() => !supabaseSetupIssue());
  const onSignedOut = useCallback(() => setSession(null), []);

  useEffect(() => {
    if (supabaseSetupIssue()) {
      return;
    }

    let mounted = true;
    const client = getSupabaseClient();
    void client.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setCheckingSession(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setCheckingSession(false);
      });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (checkingSession) {
    return <main className="app-loading" aria-live="polite"><span className="loading-orb" />Loading your workspace…</main>;
  }

  if (!session) {
    return <AuthGate onAuthenticated={setSession} />;
  }

  return <SchedulingWorkspace session={session} onSignedOut={onSignedOut} />;
}

type SchedulingWorkspaceProps = {
  onSignedOut: () => void;
  session: Session;
};

function SchedulingWorkspace({ onSignedOut, session }: SchedulingWorkspaceProps) {
  const api = useMemo(() => new SchedulingApi(currentAccessToken), []);
  const [activeView, setActiveView] = useState<WorkspaceView>("calendar");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [selectedCalendarId, setSelectedCalendarId] = useState("all");
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [editorEvent, setEditorEvent] = useState<CalendarEvent | null | undefined>(undefined);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadWorkspace() {
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const [loadedProfile, loadedCalendars, loadedRules, loadedBlocks] = await Promise.all([
        api.getProfile(),
        api.listCalendars(),
        api.listAvailabilityRules(),
        api.listAvailabilityBlocks(),
      ]);
      setProfile(loadedProfile);
      setCalendars(loadedCalendars);
      setRules(loadedRules);
      setBlocks(loadedBlocks);
      setSelectedCalendarId((current) => current !== "all" && !loadedCalendars.some((calendar) => calendar.id === current) ? "all" : current);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await getSupabaseClient().auth.signOut();
        onSignedOut();
        return;
      }
      setWorkspaceError(messageFor(error));
    } finally {
      setWorkspaceLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrapWorkspace() {
      try {
        const [loadedProfile, loadedCalendars, loadedRules, loadedBlocks] = await Promise.all([
          api.getProfile(),
          api.listCalendars(),
          api.listAvailabilityRules(),
          api.listAvailabilityBlocks(),
        ]);
        if (cancelled) return;
        setProfile(loadedProfile);
        setCalendars(loadedCalendars);
        setRules(loadedRules);
        setBlocks(loadedBlocks);
        setSelectedCalendarId((current) => current !== "all" && !loadedCalendars.some((calendar) => calendar.id === current) ? "all" : current);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          await getSupabaseClient().auth.signOut();
          onSignedOut();
          return;
        }
        setWorkspaceError(messageFor(error));
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    }

    void bootstrapWorkspace();
    return () => {
      cancelled = true;
    };
  }, [api, onSignedOut]);

  useEffect(() => {
    if (!calendars.length) {
      return;
    }

    let cancelled = false;
    const range = { from: dateKey(startOfMonth(visibleMonth)), to: dateKey(addMonths(visibleMonth, 1)) };
    const requestedCalendars = selectedCalendarId === "all"
      ? calendars
      : calendars.filter((calendar) => calendar.id === selectedCalendarId);
    async function loadEvents() {
      try {
        const result = await Promise.all(requestedCalendars.map((calendar) => api.listEvents(calendar.id, range)));
        if (!cancelled) {
          setEvents(result.flat());
          setEventsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setEventsError(messageFor(error));
        }
      }
    }

    void loadEvents();
    return () => {
      cancelled = true;
    };
  }, [api, calendars, selectedCalendarId, visibleMonth]);

  const calendarColors = useMemo(
    () => new Map(calendars.map((calendar, index) => [calendar.id, calendar.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]])),
    [calendars],
  );
  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId) ?? null;
  const defaultCalendarId = selectedCalendar?.id ?? calendars[0]?.id ?? null;

  async function refreshCalendars() {
    const loaded = await api.listCalendars();
    setCalendars(loaded);
    setSelectedCalendarId((current) => current !== "all" && !loaded.some((calendar) => calendar.id === current) ? "all" : current);
  }

  async function refreshAvailability() {
    const [loadedRules, loadedBlocks] = await Promise.all([api.listAvailabilityRules(), api.listAvailabilityBlocks()]);
    setRules(loadedRules);
    setBlocks(loadedBlocks);
  }

  function mergeEvent(updated: CalendarEvent) {
    setEvents((current) => {
      const next = current.filter((entry) => entry.id !== updated.id);
      return [...next, updated];
    });
    setSelectedEvent(updated);
    setEditorEvent(undefined);
    setNotice("Event saved.");
  }

  async function deleteEvent(event: CalendarEvent) {
    const deleted = await api.deleteEvent(event.id, event.row_version);
    setEvents((current) => current.filter((entry) => entry.id !== deleted.id));
    setSelectedEvent((current) => current?.id === deleted.id ? null : current);
    setNotice("Event deleted.");
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    onSignedOut();
  }

  if (workspaceLoading) {
    return <main className="app-loading" aria-live="polite"><span className="loading-orb" />Loading your schedule…</main>;
  }

  if (workspaceError || !profile) {
    return (
      <main className="app-error">
        <div><p className="eyebrow">Workspace unavailable</p><h1>We couldn’t load your schedule.</h1><p>{workspaceError ?? "Your profile could not be found."}</p></div>
        <div className="inline-actions"><button className="button button--primary" onClick={() => void loadWorkspace()} type="button">Try again</button><button className="button button--quiet" onClick={() => void signOut()} type="button">Sign out</button></div>
      </main>
    );
  }

  return (
    <main className="application-shell">
      <aside className="sidebar">
        <div className="sidebar__brand"><span className="brand-mark" aria-hidden="true">S</span><span>Solstice</span></div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={activeView === "calendar" ? "nav-item nav-item--active" : "nav-item"} onClick={() => setActiveView("calendar")} type="button"><span>▦</span>Calendar</button>
          <button className={activeView === "availability" ? "nav-item nav-item--active" : "nav-item"} onClick={() => setActiveView("availability")} type="button"><span>◷</span>Availability</button>
          <button className={activeView === "settings" ? "nav-item nav-item--active" : "nav-item"} onClick={() => setActiveView("settings")} type="button"><span>⚙</span>Settings</button>
        </nav>

        <div className="calendar-nav">
          <div className="calendar-nav__heading"><span>My calendars</span><button aria-label="Create a calendar in settings" className="icon-button icon-button--small" onClick={() => setActiveView("settings")} type="button">+</button></div>
          <button className={selectedCalendarId === "all" ? "calendar-link calendar-link--active" : "calendar-link"} onClick={() => { setSelectedCalendarId("all"); setActiveView("calendar"); }} type="button"><span className="calendar-dot calendar-dot--all" />All calendars</button>
          {calendars.map((calendar) => (
            <button className={selectedCalendarId === calendar.id ? "calendar-link calendar-link--active" : "calendar-link"} key={calendar.id} onClick={() => { setSelectedCalendarId(calendar.id); setActiveView("calendar"); }} type="button"><span className="calendar-dot" style={{ background: calendarColors.get(calendar.id) }} />{calendar.name}</button>
          ))}
        </div>

        <div className="sidebar__profile"><span className="profile-avatar">{profile.display_name.slice(0, 1).toUpperCase()}</span><div><strong>{profile.display_name}</strong><span>{session.user.email ?? profile.email ?? "Signed in"}</span></div><button aria-label="Sign out" className="icon-button icon-button--small" onClick={() => void signOut()} type="button">↗</button></div>
      </aside>

      <section className="workspace">
        {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice(null)} type="button">×</button></div>}
        {activeView === "calendar" && (
          <section className="calendar-workspace" aria-labelledby="calendar-title">
            <header className="calendar-toolbar">
              <div>
                <p className="eyebrow">{selectedCalendar ? selectedCalendar.name : "All calendars"}</p>
                <h1 id="calendar-title">{formatMonthTitle(visibleMonth)}</h1>
              </div>
              <div className="calendar-toolbar__actions">
                <div className="month-controls"><button aria-label="Previous month" className="icon-button" onClick={() => setVisibleMonth((current) => addMonths(current, -1))} type="button">‹</button><button className="button button--quiet" onClick={() => setVisibleMonth(startOfMonth(new Date()))} type="button">Today</button><button aria-label="Next month" className="icon-button" onClick={() => setVisibleMonth((current) => addMonths(current, 1))} type="button">›</button></div>
                <button className="button button--primary" disabled={!calendars.length} onClick={() => setEditorEvent(null)} type="button">+ New event</button>
              </div>
            </header>
            {eventsError && <div className="inline-error" role="alert">{eventsError}<button className="text-button" onClick={() => setVisibleMonth((current) => new Date(current))} type="button">Retry</button></div>}
            {!calendars.length ? (
              <section className="empty-state"><span>◫</span><h2>Create your first calendar</h2><p>Calendars hold your events and carry their own color, time zone, and privacy default.</p><button className="button button--primary" onClick={() => setActiveView("settings")} type="button">Set up a calendar</button></section>
            ) : (
              <div className={selectedEvent ? "calendar-layout calendar-layout--details" : "calendar-layout"}>
                <div className="calendar-canvas"><CalendarGrid calendarColors={calendarColors} events={events} month={visibleMonth} onSelectEvent={setSelectedEvent} /></div>
                {selectedEvent && <EventDetails api={api} event={selectedEvent} key={selectedEvent.id} onClose={() => setSelectedEvent(null)} onEdit={() => setEditorEvent(selectedEvent)} profile={profile} />}
              </div>
            )}
          </section>
        )}

        {activeView === "availability" && <AvailabilityPanel api={api} blocks={blocks} onChanged={refreshAvailability} profile={profile} rules={rules} />}
        {activeView === "settings" && <SettingsPanel api={api} calendars={calendars} onCalendarsChanged={refreshCalendars} onProfileUpdated={setProfile} profile={profile} />}
      </section>

      {editorEvent !== undefined && (
        <EventEditor
          api={api}
          calendars={calendars}
          defaultCalendarId={defaultCalendarId}
          defaultTimeZone={profile.time_zone || defaultTimeZone()}
          event={editorEvent ?? undefined}
          key={editorEvent?.id ?? "new"}
          onClose={() => setEditorEvent(undefined)}
          onDeleted={deleteEvent}
          onSaved={mergeEvent}
        />
      )}
    </main>
  );
}
