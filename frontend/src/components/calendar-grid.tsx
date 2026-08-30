import { dateKey, eventAppearsOnDay, eventStartsOnDay, formatEventTime, monthGrid, todayKey, WEEKDAY_NAMES } from "@/lib/date-time";
import type { CalendarEvent } from "@/types/api";

type CalendarGridProps = {
  events: CalendarEvent[];
  month: Date;
  calendarColors: Map<string, string>;
  onSelectEvent: (event: CalendarEvent) => void;
};

export function CalendarGrid({ events, month, calendarColors, onSelectEvent }: CalendarGridProps) {
  const days = monthGrid(month);
  const today = todayKey();

  return (
    <section className="calendar-grid" aria-label="Month calendar">
      <div className="calendar-grid__weekdays" aria-hidden="true">
        {WEEKDAY_NAMES.map((weekday) => <span key={weekday}>{weekday.slice(0, 3)}</span>)}
      </div>
      <div className="calendar-grid__days">
        {days.map((day) => {
          const key = dateKey(day);
          const dayEvents = events
            .filter((event) => eventAppearsOnDay(event, key))
            .sort((left, right) => {
              if (left.is_all_day !== right.is_all_day) return left.is_all_day ? -1 : 1;
              return (left.starts_at ?? left.starts_on ?? "").localeCompare(right.starts_at ?? right.starts_on ?? "");
            });
          const isOutsideMonth = day.getMonth() !== month.getMonth();

          return (
            <article
              className={`calendar-day${isOutsideMonth ? " calendar-day--outside" : ""}`}
              key={key}
              aria-label={day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            >
              <span className={`calendar-day__number${key === today ? " calendar-day__number--today" : ""}`}>
                {day.getDate()}
              </span>
              <div className="calendar-day__events">
                {dayEvents.slice(0, 4).map((event) => {
                  const startsToday = eventStartsOnDay(event, key);
                  const color = calendarColors.get(event.calendar_id) ?? "#5163ff";
                  return (
                    <button
                      className={`calendar-event${event.status === "cancelled" ? " calendar-event--cancelled" : ""}`}
                      key={event.id}
                      onClick={() => onSelectEvent(event)}
                      style={{ "--event-color": color } as React.CSSProperties}
                      type="button"
                    >
                      <span>{startsToday ? formatEventTime(event) : "Continues"}</span>
                      <strong>{event.title}</strong>
                    </button>
                  );
                })}
                {dayEvents.length > 4 && <span className="calendar-day__more">+{dayEvents.length - 4} more</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
