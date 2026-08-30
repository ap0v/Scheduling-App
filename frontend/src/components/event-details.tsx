"use client";

import { type FormEvent, useEffect, useState } from "react";

import { ApiError, SchedulingApi } from "@/lib/api";
import { dateTimeLocalValue, formatRange, trimToNull, zonedDateTimeToIso } from "@/lib/date-time";
import type {
  AttendeeRole,
  CalendarEvent,
  EventAttendee,
  EventLocation,
  EventLocationKind,
  EventReminder,
  OccurrenceOverride,
  Profile,
  ReminderChannel,
} from "@/types/api";

type DetailTab = "people" | "reminders" | "location" | "exceptions";

type EventDetailsProps = {
  api: SchedulingApi;
  event: CalendarEvent;
  profile: Profile;
  onClose: () => void;
  onEdit: () => void;
};

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "That change could not be saved.";
}

function eventDateLabel(event: CalendarEvent) {
  if (event.is_all_day) {
    return event.starts_on && event.ends_on ? `${event.starts_on} through ${event.ends_on} (exclusive)` : "All day";
  }
  if (!event.starts_at || !event.ends_at) return "Time unavailable";
  return formatRange(event.starts_at, event.ends_at, event.event_time_zone ?? "Etc/UTC");
}

export function EventDetails({ api, event, profile, onClose, onEdit }: EventDetailsProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("people");
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [reminders, setReminders] = useState<EventReminder[]>([]);
  const [location, setLocation] = useState<EventLocation | null>(null);
  const [overrides, setOverrides] = useState<OccurrenceOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<AttendeeRole>("required");
  const [addingAttendee, setAddingAttendee] = useState(false);

  const [reminderMinutes, setReminderMinutes] = useState("15");
  const [reminderChannel, setReminderChannel] = useState<ReminderChannel>("in_app");
  const [editingReminder, setEditingReminder] = useState<EventReminder | null>(null);
  const [savingReminder, setSavingReminder] = useState(false);

  const [locationKind, setLocationKind] = useState<EventLocationKind>("manual");
  const [locationLabel, setLocationLabel] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  const [editingOverride, setEditingOverride] = useState<OccurrenceOverride | null>(null);
  const [occurrenceWhen, setOccurrenceWhen] = useState("");
  const [overrideTitle, setOverrideTitle] = useState("");
  const [overrideCancelled, setOverrideCancelled] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      try {
        const [loadedAttendees, loadedReminders, loadedOverrides, loadedLocation] = await Promise.all([
          api.listAttendees(event.id),
          api.listReminders(event.id),
          api.listOccurrenceOverrides(event.id),
          api.getLocation(event.id).catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
          }),
        ]);
        if (cancelled) return;
        setAttendees(loadedAttendees);
        setReminders(loadedReminders);
        setOverrides(loadedOverrides);
        setLocation(loadedLocation);
        if (loadedLocation) {
          setLocationKind(loadedLocation.kind);
          setLocationLabel(loadedLocation.host_label ?? "");
          setLocationAddress(loadedLocation.host_address ?? "");
          setGooglePlaceId(loadedLocation.google_place_id ?? "");
        }
      } catch (error) {
        if (!cancelled) setMessage(readableError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [api, event.id]);

  async function addAttendee(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (!inviteEmail.trim()) {
      setMessage("Enter an email address for the attendee.");
      return;
    }
    setAddingAttendee(true);
    setMessage(null);
    try {
      const created = await api.createAttendee(event.id, {
        email: inviteEmail.trim().toLowerCase(),
        display_name: trimToNull(inviteName),
        role: inviteRole,
      });
      setAttendees((current) => [...current, created]);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("required");
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setAddingAttendee(false);
    }
  }

  async function updateAttendee(attendee: EventAttendee, field: "role" | "response_status", value: string) {
    setMessage(null);
    try {
      const updated = await api.updateAttendee(event.id, attendee.id, { [field]: value });
      setAttendees((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  async function removeAttendee(attendee: EventAttendee) {
    if (attendee.role === "organizer" || !window.confirm("Remove this attendee?")) return;
    setMessage(null);
    try {
      await api.deleteAttendee(event.id, attendee.id);
      setAttendees((current) => current.filter((entry) => entry.id !== attendee.id));
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  function startReminderEdit(reminder?: EventReminder) {
    setEditingReminder(reminder ?? null);
    setReminderMinutes(String(reminder?.minutes_before ?? 15));
    setReminderChannel(reminder?.channel ?? "in_app");
  }

  async function saveReminder(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    const minutes = Number(reminderMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 525_600) {
      setMessage("Reminder timing must be between 0 and 525600 minutes.");
      return;
    }
    setSavingReminder(true);
    setMessage(null);
    try {
      const saved = editingReminder
        ? await api.updateReminder(event.id, editingReminder.id, { minutes_before: minutes, channel: reminderChannel })
        : await api.createReminder(event.id, {
            recipient_profile_id: profile.id,
            minutes_before: minutes,
            channel: reminderChannel,
          });
      setReminders((current) => editingReminder
        ? current.map((entry) => entry.id === saved.id ? saved : entry)
        : [...current, saved]);
      setEditingReminder(null);
      setReminderMinutes("15");
      setReminderChannel("in_app");
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setSavingReminder(false);
    }
  }

  async function removeReminder(reminder: EventReminder) {
    if (!window.confirm("Remove this reminder?")) return;
    setMessage(null);
    try {
      await api.deleteReminder(event.id, reminder.id);
      setReminders((current) => current.filter((entry) => entry.id !== reminder.id));
      if (editingReminder?.id === reminder.id) setEditingReminder(null);
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  async function saveLocation(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (locationKind === "manual" && !locationLabel.trim()) {
      setMessage("A manual location needs a label.");
      return;
    }
    if (locationKind === "google_place" && !googlePlaceId.trim()) {
      setMessage("A Google Place location needs its place ID.");
      return;
    }
    setSavingLocation(true);
    setMessage(null);
    try {
      const saved = await api.putLocation(event.id, {
        kind: locationKind,
        host_label: trimToNull(locationLabel),
        host_address: trimToNull(locationAddress),
        google_place_id: trimToNull(googlePlaceId),
      });
      setLocation(saved);
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setSavingLocation(false);
    }
  }

  async function removeLocation() {
    if (!location || !window.confirm("Remove the structured location?")) return;
    setMessage(null);
    try {
      await api.deleteLocation(event.id);
      setLocation(null);
      setLocationLabel("");
      setLocationAddress("");
      setGooglePlaceId("");
      setLocationKind("manual");
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  function beginOverrideEdit(override?: OccurrenceOverride) {
    setEditingOverride(override ?? null);
    setOverrideTitle(override?.title ?? "");
    setOverrideCancelled(override?.is_cancelled ?? false);
    if (event.is_all_day) {
      setOccurrenceWhen(override?.original_starts_on ?? event.starts_on ?? "");
    } else {
      setOccurrenceWhen(
        dateTimeLocalValue(override?.original_starts_at ?? event.starts_at ?? null, event.event_time_zone ?? profile.time_zone),
      );
    }
  }

  async function saveOverride(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (!occurrenceWhen) {
      setMessage("Choose the occurrence to change.");
      return;
    }
    setSavingOverride(true);
    setMessage(null);
    try {
      const identity = event.is_all_day
        ? { original_starts_on: occurrenceWhen }
        : { original_starts_at: zonedDateTimeToIso(occurrenceWhen, event.event_time_zone ?? profile.time_zone) };
      const payload = {
        ...identity,
        is_cancelled: overrideCancelled,
        title: trimToNull(overrideTitle),
      };
      const saved = editingOverride
        ? await api.updateOccurrenceOverride(event.id, editingOverride.id, payload)
        : await api.createOccurrenceOverride(event.id, payload);
      setOverrides((current) => editingOverride
        ? current.map((entry) => entry.id === saved.id ? saved : entry)
        : [...current, saved]);
      setEditingOverride(null);
      setOccurrenceWhen("");
      setOverrideTitle("");
      setOverrideCancelled(false);
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setSavingOverride(false);
    }
  }

  async function removeOverride(override: OccurrenceOverride) {
    if (!window.confirm("Remove this exception?")) return;
    setMessage(null);
    try {
      await api.deleteOccurrenceOverride(event.id, override.id);
      setOverrides((current) => current.filter((entry) => entry.id !== override.id));
      if (editingOverride?.id === override.id) setEditingOverride(null);
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  return (
    <aside className="event-details" aria-label={`Details for ${event.title}`}>
      <div className="event-details__header">
        <div>
          <p className="eyebrow">Event details</p>
          <h2>{event.title}</h2>
          <p>{eventDateLabel(event)}</p>
        </div>
        <div className="inline-actions">
          <button className="button button--quiet" onClick={onEdit} type="button">Edit</button>
          <button aria-label="Close event details" className="icon-button" onClick={onClose} type="button">×</button>
        </div>
      </div>

      <div className="event-summary">
        {event.description && <p>{event.description}</p>}
        {event.location && <p><strong>Location:</strong> {event.location}</p>}
        {event.conference_url && <a href={event.conference_url} rel="noreferrer" target="_blank">Join conference ↗</a>}
        <div className="event-summary__tags">
          <span>{event.busy_status.replaceAll("_", " ")}</span>
          <span>{event.access_scope}</span>
          {event.recurrence_rule && <span>Recurring master</span>}
        </div>
      </div>

      <div className="details-tabs" role="tablist">
        {([
          ["people", "People"],
          ["reminders", "Reminders"],
          ["location", "Location"],
          ["exceptions", "Exceptions"],
        ] as const).map(([tab, label]) => (
          <button
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "details-tab details-tab--active" : "details-tab"}
            key={tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {message && <p className="form-message" role="alert">{message}</p>}
      {loading ? <p className="details-loading">Loading event details…</p> : (
        <div className="details-panel">
          {activeTab === "people" && (
            <>
              <div className="detail-list">
                {attendees.map((attendee) => (
                  <article className="detail-row detail-row--attendee" key={attendee.id}>
                    <div>
                      <strong>{attendee.display_name || attendee.email || "Unknown attendee"}</strong>
                      {attendee.display_name && attendee.email && <span>{attendee.email}</span>}
                    </div>
                    <select
                      aria-label={`Role for ${attendee.email ?? attendee.display_name ?? "attendee"}`}
                      disabled={attendee.role === "organizer"}
                      onChange={(item) => void updateAttendee(attendee, "role", item.target.value)}
                      value={attendee.role}
                    >
                      <option value="organizer">Organizer</option>
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                      <option value="resource">Resource</option>
                    </select>
                    <select
                      aria-label={`Response for ${attendee.email ?? attendee.display_name ?? "attendee"}`}
                      onChange={(item) => void updateAttendee(attendee, "response_status", item.target.value)}
                      value={attendee.response_status}
                    >
                      <option value="needs_action">Needs action</option>
                      <option value="accepted">Accepted</option>
                      <option value="declined">Declined</option>
                      <option value="tentative">Tentative</option>
                    </select>
                    <button
                      aria-label={`Remove ${attendee.email ?? attendee.display_name ?? "attendee"}`}
                      className="icon-button icon-button--small"
                      disabled={attendee.role === "organizer"}
                      onClick={() => void removeAttendee(attendee)}
                      type="button"
                    >
                      ×
                    </button>
                  </article>
                ))}
              </div>
              <form className="compact-form" onSubmit={addAttendee}>
                <h3>Add attendee</h3>
                <input onChange={(item) => setInviteEmail(item.target.value)} placeholder="email@example.com" required type="email" value={inviteEmail} />
                <input onChange={(item) => setInviteName(item.target.value)} placeholder="Display name (optional)" value={inviteName} />
                <select onChange={(item) => setInviteRole(item.target.value as AttendeeRole)} value={inviteRole}>
                  <option value="required">Required</option>
                  <option value="optional">Optional</option>
                  <option value="resource">Resource</option>
                </select>
                <button className="button button--primary" disabled={addingAttendee} type="submit">
                  {addingAttendee ? "Adding…" : "Add"}
                </button>
              </form>
            </>
          )}

          {activeTab === "reminders" && (
            <>
              <div className="detail-list">
                {reminders.length === 0 && <p className="empty-copy">No reminders are scheduled yet.</p>}
                {reminders.map((reminder) => (
                  <article className="detail-row" key={reminder.id}>
                    <div><strong>{reminder.minutes_before} minutes before</strong><span>{reminder.channel.replaceAll("_", " ")}</span></div>
                    <button className="text-button" onClick={() => startReminderEdit(reminder)} type="button">Edit</button>
                    <button className="icon-button icon-button--small" onClick={() => void removeReminder(reminder)} type="button">×</button>
                  </article>
                ))}
              </div>
              <form className="compact-form compact-form--two" onSubmit={saveReminder}>
                <h3>{editingReminder ? "Edit reminder" : "Add a reminder"}</h3>
                <label>Minutes before<input min="0" max="525600" onChange={(item) => setReminderMinutes(item.target.value)} required type="number" value={reminderMinutes} /></label>
                <label>Channel
                  <select onChange={(item) => setReminderChannel(item.target.value as ReminderChannel)} value={reminderChannel}>
                    <option value="in_app">In app</option><option value="email">Email</option><option value="push">Push</option>
                  </select>
                </label>
                <div className="compact-form__actions">
                  {editingReminder && <button className="button button--quiet" onClick={() => startReminderEdit()} type="button">Cancel</button>}
                  <button className="button button--primary" disabled={savingReminder} type="submit">{savingReminder ? "Saving…" : editingReminder ? "Save" : "Add reminder"}</button>
                </div>
              </form>
            </>
          )}

          {activeTab === "location" && (
            <form className="compact-form compact-form--two" onSubmit={saveLocation}>
              <h3>{location ? "Structured location" : "Add structured location"}</h3>
              <label>Source
                <select onChange={(item) => setLocationKind(item.target.value as EventLocationKind)} value={locationKind}>
                  <option value="manual">Manual</option><option value="google_place">Google Place ID</option>
                </select>
              </label>
              {locationKind === "manual" ? (
                <>
                  <label>Label<input maxLength={500} onChange={(item) => setLocationLabel(item.target.value)} required value={locationLabel} /></label>
                  <label className="compact-form__wide">Address<textarea onChange={(item) => setLocationAddress(item.target.value)} rows={3} value={locationAddress} /></label>
                </>
              ) : (
                <label className="compact-form__wide">Google Place ID<input onChange={(item) => setGooglePlaceId(item.target.value)} required value={googlePlaceId} /></label>
              )}
              <div className="compact-form__actions">
                {location && <button className="button button--danger" onClick={() => void removeLocation()} type="button">Remove</button>}
                <button className="button button--primary" disabled={savingLocation} type="submit">{savingLocation ? "Saving…" : "Save location"}</button>
              </div>
              <p className="field-hint compact-form__wide">Place search is not part of this API. Enter a verified Google Place ID when using that source.</p>
            </form>
          )}

          {activeTab === "exceptions" && (
            !event.recurrence_rule ? <p className="empty-copy">Exceptions are available after adding a recurrence rule to this event.</p> : <>
              <div className="detail-list">
                {overrides.length === 0 && <p className="empty-copy">No exceptions are stored for this series.</p>}
                {overrides.map((override) => (
                  <article className="detail-row" key={override.id}>
                    <div>
                      <strong>{override.title || (override.is_cancelled ? "Cancelled occurrence" : "Changed occurrence")}</strong>
                      <span>{override.original_starts_on || (override.original_starts_at ? eventDateLabel({ ...event, starts_at: override.original_starts_at, ends_at: override.original_starts_at }) : "")}</span>
                    </div>
                    <button className="text-button" onClick={() => beginOverrideEdit(override)} type="button">Edit</button>
                    <button className="icon-button icon-button--small" onClick={() => void removeOverride(override)} type="button">×</button>
                  </article>
                ))}
              </div>
              <form className="compact-form compact-form--two" onSubmit={saveOverride}>
                <h3>{editingOverride ? "Edit exception" : "Add exception"}</h3>
                <label className="compact-form__wide">Occurrence
                  <input
                    onChange={(item) => setOccurrenceWhen(item.target.value)}
                    required
                    type={event.is_all_day ? "date" : "datetime-local"}
                    value={occurrenceWhen}
                  />
                </label>
                <label className="compact-form__wide">Replacement title <small>(optional)</small><input maxLength={500} onChange={(item) => setOverrideTitle(item.target.value)} value={overrideTitle} /></label>
                <label className="switch-control compact-form__wide"><input checked={overrideCancelled} onChange={(item) => setOverrideCancelled(item.target.checked)} type="checkbox" /><span>Cancel this occurrence</span></label>
                <div className="compact-form__actions">
                  {editingOverride && <button className="button button--quiet" onClick={() => beginOverrideEdit()} type="button">Cancel</button>}
                  <button className="button button--primary" disabled={savingOverride} type="submit">{savingOverride ? "Saving…" : editingOverride ? "Save" : "Add exception"}</button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
