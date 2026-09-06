"use client";

import { type SubmitEvent, useState } from "react";

import { SchedulingApi } from "@/lib/api";
import { dateKey, dateTimeLocalValue, isTimeZone, WEEKDAY_NAMES, zonedDateTimeToIso } from "@/lib/date-time";
import type { AvailabilityBlock, AvailabilityBlockKind, AvailabilityRule, Profile } from "@/types/api";

type AvailabilityPanelProps = Readonly<{
  api: SchedulingApi;
  blocks: AvailabilityBlock[];
  onChanged: () => Promise<void>;
  profile: Profile;
  rules: AvailabilityRule[];
}>;

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "That availability change could not be saved.";
}

export function AvailabilityPanel({ api, blocks, onChanged, profile, rules }: AvailabilityPanelProps) {
  const today = dateKey(new Date());
  const [editingRule, setEditingRule] = useState<AvailabilityRule | null>(null);
  const [weekday, setWeekday] = useState("1");
  const [startsLocalTime, setStartsLocalTime] = useState("09:00");
  const [endsLocalTime, setEndsLocalTime] = useState("17:00");
  const [ruleTimeZone, setRuleTimeZone] = useState(profile.time_zone);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");

  const [editingBlock, setEditingBlock] = useState<AvailabilityBlock | null>(null);
  const [blockKind, setBlockKind] = useState<AvailabilityBlockKind>("unavailable");
  const [blockStartsAt, setBlockStartsAt] = useState(`${today}T09:00`);
  const [blockEndsAt, setBlockEndsAt] = useState(`${today}T17:00`);
  const [blockTimeZone, setBlockTimeZone] = useState(profile.time_zone);
  const [blockNote, setBlockNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ruleSubmitLabel = editingRule ? "Save rule" : "Add rule";
  const blockSubmitLabel = editingBlock ? "Save block" : "Add block";

  function resetRule() {
    setEditingRule(null);
    setWeekday("1");
    setStartsLocalTime("09:00");
    setEndsLocalTime("17:00");
    setRuleTimeZone(profile.time_zone);
    setEffectiveFrom("");
    setEffectiveUntil("");
  }

  function beginRuleEdit(rule: AvailabilityRule) {
    setEditingRule(rule);
    setWeekday(String(rule.weekday));
    setStartsLocalTime(rule.starts_local_time.slice(0, 5));
    setEndsLocalTime(rule.ends_local_time.slice(0, 5));
    setRuleTimeZone(rule.time_zone);
    setEffectiveFrom(rule.effective_from ?? "");
    setEffectiveUntil(rule.effective_until ?? "");
    setMessage(null);
  }

  async function saveRule(submission: SubmitEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (!isTimeZone(ruleTimeZone)) {
      setMessage("Use a valid IANA time zone, such as America/New_York.");
      return;
    }
    if (endsLocalTime <= startsLocalTime) {
      setMessage("Working hours need an end time later than the start time.");
      return;
    }
    if (effectiveFrom && effectiveUntil && effectiveUntil <= effectiveFrom) {
      setMessage("The effective end date must be after the effective start date.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        weekday: Number(weekday),
        starts_local_time: startsLocalTime,
        ends_local_time: endsLocalTime,
        time_zone: ruleTimeZone,
        effective_from: effectiveFrom || null,
        effective_until: effectiveUntil || null,
      };
      if (editingRule) {
        await api.updateAvailabilityRule(editingRule.id, payload);
      } else {
        await api.createAvailabilityRule(payload);
      }
      await onChanged();
      resetRule();
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(rule: AvailabilityRule) {
    if (!window.confirm("Delete this working-hours rule?")) return;
    setMessage(null);
    try {
      await api.deleteAvailabilityRule(rule.id);
      await onChanged();
      if (editingRule?.id === rule.id) resetRule();
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  function resetBlock() {
    setEditingBlock(null);
    setBlockKind("unavailable");
    setBlockStartsAt(`${today}T09:00`);
    setBlockEndsAt(`${today}T17:00`);
    setBlockTimeZone(profile.time_zone);
    setBlockNote("");
  }

  function beginBlockEdit(block: AvailabilityBlock) {
    const timeZone = block.time_zone ?? profile.time_zone;
    setEditingBlock(block);
    setBlockKind(block.kind);
    setBlockStartsAt(dateTimeLocalValue(block.starts_at, timeZone));
    setBlockEndsAt(dateTimeLocalValue(block.ends_at, timeZone));
    setBlockTimeZone(timeZone);
    setBlockNote(block.note ?? "");
    setMessage(null);
  }

  async function saveBlock(submission: SubmitEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (!isTimeZone(blockTimeZone)) {
      setMessage("Use a valid IANA time zone, such as America/New_York.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const startsAt = zonedDateTimeToIso(blockStartsAt, blockTimeZone);
      const endsAt = zonedDateTimeToIso(blockEndsAt, blockTimeZone);
      if (endsAt <= startsAt) {
        setMessage("The block must end after it starts.");
        return;
      }
      const payload = {
        kind: blockKind,
        starts_at: startsAt,
        ends_at: endsAt,
        time_zone: blockTimeZone,
        note: blockNote.trim() || null,
      };
      if (editingBlock) {
        await api.updateAvailabilityBlock(editingBlock.id, payload);
      } else {
        await api.createAvailabilityBlock(payload);
      }
      await onChanged();
      resetBlock();
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock(block: AvailabilityBlock) {
    if (!window.confirm("Delete this availability block?")) return;
    setMessage(null);
    try {
      await api.deleteAvailabilityBlock(block.id);
      await onChanged();
      if (editingBlock?.id === block.id) resetBlock();
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  return (
    <section className="settings-page" aria-labelledby="availability-title">
      <header className="page-heading">
        <p className="eyebrow">Scheduling preferences</p>
        <h1 id="availability-title">Working hours &amp; exceptions</h1>
        <p>Set the hours you generally accept and add date-specific availability around them.</p>
      </header>

      {message && <p className="form-message" role="alert">{message}</p>}

      <div className="settings-columns">
        <section className="settings-card">
          <div className="settings-card__heading">
            <div><h2>Weekly working hours</h2><p>These are recurring local-time rules, not automatic bookings.</p></div>
            {editingRule && <button className="text-button" onClick={resetRule} type="button">Add new rule</button>}
          </div>
          <div className="availability-list">
            {rules.length === 0 && <p className="empty-copy">No recurring hours yet.</p>}
            {rules.map((rule) => (
              <article className="availability-item" key={rule.id}>
                <div><strong>{WEEKDAY_NAMES[rule.weekday - 1]}</strong><span>{rule.starts_local_time.slice(0, 5)}–{rule.ends_local_time.slice(0, 5)} · {rule.time_zone}</span></div>
                <div className="inline-actions"><button className="text-button" onClick={() => beginRuleEdit(rule)} type="button">Edit</button><button className="icon-button icon-button--small" onClick={() => void deleteRule(rule)} type="button">×</button></div>
              </article>
            ))}
          </div>
          <form className="settings-form" onSubmit={saveRule}>
            <h3>{editingRule ? "Edit weekly rule" : "Add weekly rule"}</h3>
            <label>
              <span>Day</span>
              <select onChange={(item) => setWeekday(item.target.value)} value={weekday}>
                {WEEKDAY_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </select>
            </label>
            <label>Starts<input onChange={(item) => setStartsLocalTime(item.target.value)} required type="time" value={startsLocalTime} /></label>
            <label>Ends<input onChange={(item) => setEndsLocalTime(item.target.value)} required type="time" value={endsLocalTime} /></label>
            <label className="settings-form__wide">Time zone<input onChange={(item) => setRuleTimeZone(item.target.value)} required value={ruleTimeZone} /></label>
            <label>Effective from <small>(optional)</small><input onChange={(item) => setEffectiveFrom(item.target.value)} type="date" value={effectiveFrom} /></label>
            <label>Effective until <small>(exclusive)</small><input onChange={(item) => setEffectiveUntil(item.target.value)} type="date" value={effectiveUntil} /></label>
            <div className="settings-form__actions">
              {editingRule && <button className="button button--quiet" onClick={resetRule} type="button">Cancel</button>}
              <button className="button button--primary" disabled={saving} type="submit">{saving ? "Saving…" : ruleSubmitLabel}</button>
            </div>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-card__heading">
            <div><h2>Date-specific blocks</h2><p>Temporarily open or close time without changing your weekly rules.</p></div>
            {editingBlock && <button className="text-button" onClick={resetBlock} type="button">Add new block</button>}
          </div>
          <div className="availability-list">
            {blocks.length === 0 && <p className="empty-copy">No one-off blocks yet.</p>}
            {blocks.map((block) => (
              <article className="availability-item" key={block.id}>
                <div><strong className={`availability-kind availability-kind--${block.kind}`}>{block.kind}</strong><span>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: block.time_zone ?? profile.time_zone }).format(new Date(block.starts_at))}</span>{block.note && <span>{block.note}</span>}</div>
                <div className="inline-actions"><button className="text-button" onClick={() => beginBlockEdit(block)} type="button">Edit</button><button className="icon-button icon-button--small" onClick={() => void deleteBlock(block)} type="button">×</button></div>
              </article>
            ))}
          </div>
          <form className="settings-form" onSubmit={saveBlock}>
            <h3>{editingBlock ? "Edit block" : "Add a block"}</h3>
            <label>
              <span>Kind</span>
              <select onChange={(item) => setBlockKind(item.target.value as AvailabilityBlockKind)} value={blockKind}><option value="unavailable">Unavailable</option><option value="available">Available</option></select>
            </label>
            <label>Starts<input onChange={(item) => setBlockStartsAt(item.target.value)} required type="datetime-local" value={blockStartsAt} /></label>
            <label>Ends<input onChange={(item) => setBlockEndsAt(item.target.value)} required type="datetime-local" value={blockEndsAt} /></label>
            <label className="settings-form__wide">Time zone<input onChange={(item) => setBlockTimeZone(item.target.value)} required value={blockTimeZone} /></label>
            <label className="settings-form__wide">Note <small>(optional)</small><textarea maxLength={500} onChange={(item) => setBlockNote(item.target.value)} rows={2} value={blockNote} /></label>
            <div className="settings-form__actions">
              {editingBlock && <button className="button button--quiet" onClick={resetBlock} type="button">Cancel</button>}
              <button className="button button--primary" disabled={saving} type="submit">{saving ? "Saving…" : blockSubmitLabel}</button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
