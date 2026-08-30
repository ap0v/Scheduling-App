"use client";

import { type FormEvent, useState } from "react";

import { SchedulingApi } from "@/lib/api";
import { isTimeZone, trimToNull } from "@/lib/date-time";
import type { Calendar, Profile } from "@/types/api";

type SettingsPanelProps = {
  api: SchedulingApi;
  calendars: Calendar[];
  onCalendarsChanged: () => Promise<void>;
  onProfileUpdated: (profile: Profile) => void;
  profile: Profile;
};

const COLORS = ["#5163ff", "#e56a5d", "#1a9d7d", "#e6a11d", "#8d5ed6", "#2d87c9"];

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "That setting could not be saved.";
}

export function SettingsPanel({ api, calendars, onCalendarsChanged, onProfileUpdated, profile }: SettingsPanelProps) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [timeZone, setTimeZone] = useState(profile.time_zone);
  const [locale, setLocale] = useState(profile.locale ?? "");
  const [profileSaving, setProfileSaving] = useState(false);

  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [calendarName, setCalendarName] = useState("");
  const [calendarDescription, setCalendarDescription] = useState("");
  const [calendarColor, setCalendarColor] = useState(COLORS[0]);
  const [calendarTimeZone, setCalendarTimeZone] = useState(profile.time_zone);
  const [calendarAccess, setCalendarAccess] = useState<Calendar["default_event_access"]>("private");
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveProfile(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (!displayName.trim()) {
      setMessage("A display name is required.");
      return;
    }
    if (!isTimeZone(timeZone)) {
      setMessage("Use a valid IANA time zone, such as America/New_York.");
      return;
    }
    setProfileSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateProfile({
        display_name: displayName.trim(),
        time_zone: timeZone,
        locale: trimToNull(locale),
      });
      onProfileUpdated(updated);
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setProfileSaving(false);
    }
  }

  function resetCalendar() {
    setEditingCalendar(null);
    setCalendarName("");
    setCalendarDescription("");
    setCalendarColor(COLORS[calendars.length % COLORS.length]);
    setCalendarTimeZone(profile.time_zone);
    setCalendarAccess("private");
  }

  function beginCalendarEdit(calendar: Calendar) {
    setEditingCalendar(calendar);
    setCalendarName(calendar.name);
    setCalendarDescription(calendar.description ?? "");
    setCalendarColor(calendar.color ?? COLORS[0]);
    setCalendarTimeZone(calendar.time_zone);
    setCalendarAccess(calendar.default_event_access);
    setMessage(null);
  }

  async function saveCalendar(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (!calendarName.trim()) {
      setMessage("A calendar name is required.");
      return;
    }
    if (!isTimeZone(calendarTimeZone)) {
      setMessage("Use a valid IANA time zone, such as America/New_York.");
      return;
    }
    setCalendarSaving(true);
    setMessage(null);
    try {
      const payload = {
        name: calendarName.trim(),
        description: trimToNull(calendarDescription),
        color: calendarColor || null,
        time_zone: calendarTimeZone,
        default_event_access: calendarAccess,
      };
      if (editingCalendar) {
        await api.updateCalendar(editingCalendar.id, payload);
      } else {
        await api.createCalendar(payload);
      }
      await onCalendarsChanged();
      resetCalendar();
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setCalendarSaving(false);
    }
  }

  async function deleteCalendar(calendar: Calendar) {
    if (!window.confirm(`Delete “${calendar.name}”? Its existing events will no longer appear in this app.`)) return;
    setMessage(null);
    try {
      await api.deleteCalendar(calendar.id);
      await onCalendarsChanged();
      if (editingCalendar?.id === calendar.id) resetCalendar();
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <header className="page-heading">
        <p className="eyebrow">Account &amp; calendar setup</p>
        <h1 id="settings-title">Settings</h1>
        <p>Keep your profile defaults and individual calendars aligned with how you plan your time.</p>
      </header>

      {message && <p className="form-message" role="alert">{message}</p>}

      <div className="settings-columns">
        <section className="settings-card">
          <div className="settings-card__heading"><div><h2>Profile</h2><p>Your signed-in identity and local planning defaults.</p></div></div>
          <form className="settings-form" onSubmit={saveProfile}>
            <label className="settings-form__wide">Display name<input maxLength={120} onChange={(item) => setDisplayName(item.target.value)} required value={displayName} /></label>
            <label className="settings-form__wide">Email<input disabled value={profile.email ?? "No email available"} /></label>
            <label className="settings-form__wide">Time zone<input onChange={(item) => setTimeZone(item.target.value)} required value={timeZone} /></label>
            <label className="settings-form__wide">Locale <small>(optional)</small><input onChange={(item) => setLocale(item.target.value)} placeholder="en-US" value={locale} /></label>
            <div className="settings-form__actions"><button className="button button--primary" disabled={profileSaving} type="submit">{profileSaving ? "Saving…" : "Save profile"}</button></div>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-card__heading">
            <div><h2>Calendars</h2><p>Create distinct color-coded spaces for work, personal life, or projects.</p></div>
            {editingCalendar && <button className="text-button" onClick={resetCalendar} type="button">Add calendar</button>}
          </div>
          <div className="calendar-management-list">
            {calendars.length === 0 && <p className="empty-copy">Create your first calendar to start planning.</p>}
            {calendars.map((calendar) => (
              <article className="calendar-management-item" key={calendar.id}>
                <span aria-hidden="true" className="calendar-dot" style={{ background: calendar.color ?? COLORS[0] }} />
                <div><strong>{calendar.name}</strong><span>{calendar.time_zone} · {calendar.default_event_access}</span></div>
                <div className="inline-actions"><button className="text-button" onClick={() => beginCalendarEdit(calendar)} type="button">Edit</button><button className="icon-button icon-button--small" onClick={() => void deleteCalendar(calendar)} type="button">×</button></div>
              </article>
            ))}
          </div>
          <form className="settings-form" onSubmit={saveCalendar}>
            <h3>{editingCalendar ? "Edit calendar" : "Create calendar"}</h3>
            <label className="settings-form__wide">Name<input maxLength={160} onChange={(item) => setCalendarName(item.target.value)} required value={calendarName} /></label>
            <label className="settings-form__wide">Description <small>(optional)</small><textarea onChange={(item) => setCalendarDescription(item.target.value)} rows={2} value={calendarDescription} /></label>
            <label>Color<input onChange={(item) => setCalendarColor(item.target.value)} type="color" value={calendarColor} /></label>
            <label>Default access
              <select onChange={(item) => setCalendarAccess(item.target.value as Calendar["default_event_access"])} value={calendarAccess}><option value="private">Private</option><option value="invitees">Invitees</option></select>
            </label>
            <label className="settings-form__wide">Time zone<input onChange={(item) => setCalendarTimeZone(item.target.value)} required value={calendarTimeZone} /></label>
            <div className="settings-form__actions">
              {editingCalendar && <button className="button button--quiet" onClick={resetCalendar} type="button">Cancel</button>}
              <button className="button button--primary" disabled={calendarSaving} type="submit">{calendarSaving ? "Saving…" : editingCalendar ? "Save calendar" : "Create calendar"}</button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
