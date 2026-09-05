import type { CalendarEvent } from "@/types/api";

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function monthGrid(month: Date) {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

export function todayKey() {
  return dateKey(new Date());
}

export function defaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
}

export function isTimeZone(value: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function partsFor(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const result = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: result.year,
    month: result.month,
    day: result.day,
    hour: result.hour,
    minute: result.minute,
  };
}

export function isoDateInTimeZone(value: string, timeZone: string) {
  const parts = partsFor(new Date(value), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dateTimeLocalValue(value: string | null, timeZone: string) {
  if (!value) return "";
  const parts = partsFor(new Date(value), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function offsetMinutesAt(instant: number, timeZone: string) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(instant))
    .find((entry) => entry.type === "timeZoneName")?.value;

  const match = part?.match(/^GMT(?:([+-])(\d{2}):(\d{2}))?$/);
  if (!match?.[1]) return 0;

  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

export function zonedDateTimeToIso(value: string, timeZone: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!match?.[1] || !match[2]) {
    throw new Error("Enter a complete date and time.");
  }

  const [year, month, day] = match[1].split("-").map(Number);
  const [hour, minute] = match[2].split(":").map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = asUtc - offsetMinutesAt(asUtc, timeZone) * 60_000;
  instant = asUtc - offsetMinutesAt(instant, timeZone) * 60_000;
  return new Date(instant).toISOString();
}

export function formatMonthTitle(month: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month);
}

export function formatEventTime(event: CalendarEvent) {
  if (event.is_all_day) return "All day";
  if (!event.starts_at) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.event_time_zone ?? defaultTimeZone(),
  }).format(new Date(event.starts_at));
}

export function formatRange(start: string, end: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}

export function eventAppearsOnDay(event: CalendarEvent, key: string) {
  if (event.is_all_day) {
    return Boolean(event.starts_on && event.ends_on && key >= event.starts_on && key < event.ends_on);
  }

  if (!event.starts_at || !event.ends_at) return false;
  const timeZone = event.event_time_zone ?? defaultTimeZone();
  const start = isoDateInTimeZone(event.starts_at, timeZone);
  const end = isoDateInTimeZone(event.ends_at, timeZone);
  return key >= start && key <= end;
}

export function eventStartsOnDay(event: CalendarEvent, key: string) {
  if (event.is_all_day) return event.starts_on === key;
  return Boolean(event.starts_at && isoDateInTimeZone(event.starts_at, event.event_time_zone ?? defaultTimeZone()) === key);
}

export function trimToNull(value: string) {
  const result = value.trim();
  return result ? result : null;
}
