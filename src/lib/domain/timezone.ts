/**
 * Timezone helpers built on Intl, with no dependencies.
 *
 * Every grouping, streak and goal in DayFlow AI is defined over a Local Day in
 * the user's own timezone rather than a UTC day (DF-MOM-042). Getting this
 * wrong is not a cosmetic bug: it silently mis-attributes time twice a year at
 * daylight saving transitions, and a user cannot tell by looking.
 */

/**
 * Milliseconds by which the given timezone is ahead of UTC at this instant.
 * Computed from the instant rather than assumed, so daylight saving is handled.
 */
function offsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const asIfUtc = Date.UTC(
    Number(parts.year ?? "1970"),
    Number(parts.month ?? "1") - 1,
    Number(parts.day ?? "1"),
    Number(parts.hour ?? "0") % 24,
    Number(parts.minute ?? "0"),
    Number(parts.second ?? "0"),
  );

  return asIfUtc - instant.getTime();
}

/** The Local Day an instant falls on, as `YYYY-MM-DD`. */
export function localDateString(instant: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA yields ISO-ordered parts, which is exactly the shape we want.
  return formatter.format(instant);
}

/**
 * The instant at which a Local Day begins.
 *
 * Two passes are needed because the offset itself depends on the instant: the
 * first guess may land on the wrong side of a daylight saving boundary, and the
 * second pass corrects it.
 */
export function startOfLocalDay(dateString: string, timeZone: string): Date {
  const naive = Date.parse(`${dateString}T00:00:00Z`);
  const firstPass = naive - offsetMs(new Date(naive), timeZone);
  const secondPass = naive - offsetMs(new Date(firstPass), timeZone);
  return new Date(secondPass);
}

/** The instant at which a Local Day ends, exclusive. */
export function endOfLocalDay(dateString: string, timeZone: string): Date {
  return startOfLocalDay(addDays(dateString, 1), timeZone);
}

/**
 * Converts a wall-clock string (`2026-08-04T14:30`, as produced by a
 * `datetime-local` input) into the instant it names in the given timezone.
 *
 * A `datetime-local` value carries no offset, so the browser's own timezone
 * would otherwise be assumed. That is wrong for anyone whose configured
 * timezone differs from the device they are currently holding - exactly the
 * situation this product creates by syncing across devices.
 */
export function wallTimeToInstant(value: string, timeZone: string): Date {
  const normalised = value.length === 16 ? `${value}:00` : value;
  const naive = Date.parse(`${normalised}Z`);
  if (Number.isNaN(naive)) return new Date(Number.NaN);

  const firstPass = naive - offsetMs(new Date(naive), timeZone);
  const secondPass = naive - offsetMs(new Date(firstPass), timeZone);
  return new Date(secondPass);
}

/** Adds whole days to a `YYYY-MM-DD` string, staying in calendar terms. */
export function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive list of `YYYY-MM-DD` strings between two dates. */
export function eachDay(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let cursor = startDate;
  // Guard against an inverted range producing an unbounded loop.
  let guard = 0;
  while (cursor <= endDate && guard < 4000) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}

/** Whole days between two `YYYY-MM-DD` strings. */
export function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** Minutes since local midnight for an instant. */
export function minutesIntoLocalDay(instant: Date, timeZone: string): number {
  const dayStart = startOfLocalDay(localDateString(instant, timeZone), timeZone);
  return Math.floor((instant.getTime() - dayStart.getTime()) / 60_000);
}

/** Parses `HH:MM` or `HH:MM:SS` into minutes from midnight. */
export function parseClockTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** The user's own current Local Day, as `YYYY-MM-DD`. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return localDateString(now, timeZone);
}
