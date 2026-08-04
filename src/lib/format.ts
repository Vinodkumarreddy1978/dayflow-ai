/**
 * Display formatting.
 *
 * Durations are shown as `2h 15m` rather than `2.25 hours` or `135 minutes`
 * throughout (DF-DS-901). People think about their day in hours and minutes,
 * and a decimal forces a conversion in the reader's head every single time.
 */

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 1) return "0m";

  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Long form for prose and screen readers, where `2h 15m` reads poorly. */
export function formatDurationLong(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "no time";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (rest > 0) parts.push(`${rest} minute${rest === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" ") : "0 minutes";
}

export function formatTime(
  value: Date | string,
  timeZone: string,
  use24Hour: boolean,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24Hour,
  }).format(date);
}

export function formatDate(
  value: Date | string,
  timeZone: string,
  style: "short" | "medium" | "long" = "medium",
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: style,
  }).format(date);
}

/** `Today` and `Yesterday` rather than a date, which is how people refer to them. */
export function formatRelativeDay(
  dateString: string,
  todayString: string,
): string | null {
  if (dateString === todayString) return "Today";

  const diff = Math.round(
    (Date.parse(`${dateString}T00:00:00Z`) - Date.parse(`${todayString}T00:00:00Z`)) /
      86_400_000,
  );

  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return null;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** The `HH:MM` value a datetime-local input expects, in the user's timezone. */
export function toLocalInputValue(date: Date, timeZone: string): string {
  const parts: Record<string, string> = {};
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const hour = (parts.hour ?? "00") === "24" ? "00" : (parts.hour ?? "00");
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}
