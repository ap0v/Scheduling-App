"use client";

import { type FormEvent, useState } from "react";

import { ApiError, SchedulingApi } from "@/lib/api";
import { dateKey, dateTimeLocalValue, isTimeZone, trimToNull, zonedDateTimeToIso } from "@/lib/date-time";
import type { Calendar, CalendarEvent, EventInput } from "@/types/api";

type EventEditorProps = {
  api: SchedulingApi;
  calendars: Calendar[];
  defaultCalendarId: string | null;
  defaultTimeZone: string;
  event?: CalendarEvent;
  onClose: () => void;
  onDeleted: (event: CalendarEvent) => Promise<void>;
  onSaved: (event: CalendarEvent) => void;
};

function nextDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return dateKey(date);
}

export function EventEditor({
  api,
  calendars,
  defaultCalendarId,
  defaultTimeZone,
  event,
  onClose,
  onDeleted,
  onSaved,
}: EventEditorProps) {
  const existing = event;
  const eventTimeZone = existing?.event_time_zone ?? defaultTimeZone;
  const isAllDayAtStart = existing?.is_all_day ?? false;
  const today = dateKey(new Date());
  const [calendarId, setCalendarId] = useState(existing?.calendar_id ?? defaultCalendarId ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [conferenceUrl, setConferenceUrl] = useState(existing?.conference_url ?? "");
  const [status, setStatus] = useState(existing?.status ?? "confirmed");
  const [busyStatus, setBusyStatus] = useState(existing?.busy_status ?? "busy");
  const [accessScope, setAccessScope] = useState(existing?.access_scope ?? "private");
  const [isAllDay, setIsAllDay] = useState(isAllDayAtStart);
  const [timeZone, setTimeZone] = useState(eventTimeZone);
  const [startsAt, setStartsAt] = useState(
    dateTimeLocalValue(existing?.starts_at ?? null, eventTimeZone) || `${today}T09:00`,
  );
  const [endsAt, setEndsAt] = useState(
    dateTimeLocalValue(existing?.ends_at ?? null, eventTimeZone) || `${today}T10:00`,
  );
  const [startsOn, setStartsOn] = useState(existing?.starts_on ?? today);
  const [endsOn, setEndsOn] = useState(existing?.ends_on ?? nextDay(today));
  const [recurrenceRule, setRecurrenceRule] = useState(existing?.recurrence_rule ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save(eventToSave: FormEvent<HTMLFormElement>) {
    eventToSave.preventDefault();
    if (!title.trim()) {
      setMessage("An event title is required.");
      return;
    }
    if (!existing && !calendarId) {
      setMessage("Choose a calendar before saving this event.");
      return;
    }
    if (!isAllDay && !isTimeZone(timeZone)) {
      setMessage("Use a valid IANA time zone, such as America/New_York.");
      return;
    }

    let payload: EventInput;
    try {
      if (isAllDay) {
        if (!startsOn || !endsOn || endsOn <= startsOn) {
          setMessage("An all-day event needs an end date after its start date.");
          return;
        }
        payload = {
          title: title.trim(),
          description: trimToNull(description),
          location: trimToNull(location),
          conference_url: trimToNull(conferenceUrl),
          status,
          busy_status: busyStatus,
          access_scope: accessScope,
          is_all_day: true,
          starts_at: null,
          ends_at: null,
          starts_on: startsOn,
          ends_on: endsOn,
          event_time_zone: null,
          recurrence_rule: trimToNull(recurrenceRule),
        };
      } else {
        const start = zonedDateTimeToIso(startsAt, timeZone);
        const end = zonedDateTimeToIso(endsAt, timeZone);
        if (end <= start) {
          setMessage("The end time must be later than the start time.");
          return;
        }
        payload = {
          title: title.trim(),
          description: trimToNull(description),
          location: trimToNull(location),
          conference_url: trimToNull(conferenceUrl),
          status,
          busy_status: busyStatus,
          access_scope: accessScope,
          is_all_day: false,
          starts_at: start,
          ends_at: end,
          starts_on: null,
          ends_on: null,
          event_time_zone: timeZone,
          recurrence_rule: trimToNull(recurrenceRule),
        };
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enter complete event times.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const saved = existing
        ? await api.updateEvent(existing.id, { ...payload, row_version: existing.row_version })
        : await api.createEvent(calendarId, payload);
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setMessage("This event changed elsewhere. Reload the event to review the latest version before saving again.");
      } else {
        setMessage(error instanceof Error ? error.message : "The event could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent() {
    if (!existing || !window.confirm(`Delete “${existing.title}”?`)) return;
    setDeleting(true);
    setMessage(null);
    try {
      await onDeleted(existing);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The event could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal event-editor" aria-modal="true" aria-labelledby="event-editor-title" role="dialog">
        <div className="modal__header">
          <div>
            <p className="eyebrow">{existing ? "Edit event" : "New event"}</p>
            <h2 id="event-editor-title">{existing ? existing.title : "Create time"}</h2>
          </div>
          <button aria-label="Close event editor" className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="event-form" onSubmit={save}>
          <label className="field field--wide">
            Title
            <input autoFocus maxLength={500} onChange={(item) => setTitle(item.target.value)} required value={title} />
          </label>

          {!existing && (
            <label className="field field--wide">
              Calendar
              <select onChange={(item) => setCalendarId(item.target.value)} required value={calendarId}>
                <option value="" disabled>Select a calendar</option>
                {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
              </select>
            </label>
          )}

          <label className="field field--wide">
            Description
            <textarea onChange={(item) => setDescription(item.target.value)} rows={3} value={description} />
          </label>

          <label className="field">
            Location
            <input maxLength={500} onChange={(item) => setLocation(item.target.value)} value={location} />
          </label>
          <label className="field">
            Conference link
            <input inputMode="url" onChange={(item) => setConferenceUrl(item.target.value)} placeholder="https://" type="url" value={conferenceUrl} />
          </label>

          <div className="toggle-field field--wide">
            <span>Timing</span>
            <label className="switch-control">
              <input checked={isAllDay} onChange={(item) => setIsAllDay(item.target.checked)} type="checkbox" />
              <span>All-day event</span>
            </label>
          </div>

          {isAllDay ? (
            <>
              <label className="field">
                Starts on
                <input onChange={(item) => setStartsOn(item.target.value)} required type="date" value={startsOn} />
              </label>
              <label className="field">
                Ends on <small>(exclusive)</small>
                <input onChange={(item) => setEndsOn(item.target.value)} required type="date" value={endsOn} />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                Starts
                <input onChange={(item) => setStartsAt(item.target.value)} required type="datetime-local" value={startsAt} />
              </label>
              <label className="field">
                Ends
                <input onChange={(item) => setEndsAt(item.target.value)} required type="datetime-local" value={endsAt} />
              </label>
              <label className="field field--wide">
                Event time zone
                <input onChange={(item) => setTimeZone(item.target.value)} placeholder="America/New_York" required value={timeZone} />
              </label>
            </>
          )}

          <label className="field">
            Show as
            <select onChange={(item) => setBusyStatus(item.target.value as typeof busyStatus)} value={busyStatus}>
              <option value="busy">Busy</option>
              <option value="free">Free</option>
              <option value="out_of_office">Out of office</option>
            </select>
          </label>
          <label className="field">
            Privacy
            <select onChange={(item) => setAccessScope(item.target.value as typeof accessScope)} value={accessScope}>
              <option value="private">Private</option>
              <option value="invitees">Invitees</option>
            </select>
          </label>
          <label className="field">
            Status
            <select onChange={(item) => setStatus(item.target.value as typeof status)} value={status}>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="field field--wide">
            Repeat rule <small>(optional RRULE)</small>
            <input
              onChange={(item) => setRecurrenceRule(item.target.value)}
              placeholder="FREQ=WEEKLY;BYDAY=MO,WE"
              value={recurrenceRule}
            />
            <span className="field-hint">Recurring masters are stored by the API; occurrences are not expanded in this calendar view.</span>
          </label>

          {message && <p className="form-message field--wide" role="alert">{message}</p>}

          <div className="modal__actions field--wide">
            {existing && (
              <button className="button button--danger" disabled={deleting || saving} onClick={removeEvent} type="button">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
            <span />
            <button className="button button--quiet" disabled={saving || deleting} onClick={onClose} type="button">Cancel</button>
            <button className="button button--primary" disabled={saving || deleting} type="submit">
              {saving ? "Saving…" : existing ? "Save changes" : "Create event"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
