import type { DigestResult, Event, Rating } from "../core/types.ts";

// Generate an iCalendar (.ics) feed.
// CEO E1.1: served from docs/calendar.ics on GitHub Pages.
// VTIMEZONE pinned to America/Los_Angeles. UID stability ensures calendar
// subscribers see updates rather than duplicates.

const PRODID = "-//sf-week//sf-week 0.1//EN";

// Static VTIMEZONE block for America/Los_Angeles. Includes the standard
// daylight/standard time rules for the rolling years used in v1 (2025-2030).
// Generated from RFC 5545 reference. Calendar apps tolerate a single static
// VTIMEZONE for many years.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Los_Angeles",
  "BEGIN:DAYLIGHT",
  "DTSTART:20070311T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "DTSTART:20071104T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

// Convert "2026-05-04T19:30:00" → "20260504T193000"
function naiveIsoToIcs(iso: string): string {
  return iso.replace(/-/g, "").replace(/:/g, "").slice(0, 15);
}

// RFC 5545: Lines must be folded at 75 octets, with continuation lines
// starting with a space. Also: comma, semicolon, backslash, newline must escape.
function escape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\;");
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  out.push(rest);
  return out.join("\r\n");
}

interface VEventInput {
  uid: string;
  dtStart: string;        // naive local ISO
  dtEnd: string | null;   // naive local ISO; if null, default to start + 2h for theatre/tech, or all-day
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  cancelled?: boolean;
}

function defaultEnd(startIso: string): string {
  // +2h default duration when end is unknown
  const d = new Date(startIso);
  d.setHours(d.getHours() + 2);
  // Format as naive local YYYY-MM-DDTHH:MM:SS
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00`;
}

export function renderVEvent(input: VEventInput): string {
  const dtStartLocal = naiveIsoToIcs(input.dtStart);
  const dtEndLocal = naiveIsoToIcs(input.dtEnd ?? defaultEnd(input.dtStart));
  const status = input.cancelled ? "CANCELLED" : "TENTATIVE";

  const lines = [
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${naiveIsoToIcs(new Date().toISOString().replace("Z", ""))}`,
    `DTSTART;TZID=America/Los_Angeles:${dtStartLocal}`,
    `DTEND;TZID=America/Los_Angeles:${dtEndLocal}`,
    fold(`SUMMARY:${escape(input.summary)}`),
    input.description
      ? fold(`DESCRIPTION:${escape(input.description)}`)
      : null,
    input.location ? fold(`LOCATION:${escape(input.location)}`) : null,
    input.url ? fold(`URL:${input.url}`) : null,
    `STATUS:${status}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
  ].filter((l): l is string => l !== null);

  return lines.join("\r\n");
}

// Renders the full VCALENDAR for a digest.
// Includes both this-week picks and block_now in one calendar feed.
export function renderIcs(result: DigestResult): string {
  const all: Array<Event & Rating> = [
    ...result.picks_this_week,
    ...result.block_now,
  ];

  const events = all.map((p) =>
    renderVEvent({
      uid: p.ics_uid,
      dtStart: p.start,
      dtEnd: p.end,
      summary: p.title,
      description: [p.why, p.url, p.start_was_estimated ? "(time estimated)" : ""]
        .filter(Boolean)
        .join("\n"),
      location: p.venue,
      url: p.url,
    }),
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:sf-week",
    "X-WR-TIMEZONE:America/Los_Angeles",
    VTIMEZONE,
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
