import { describe, expect, test } from "bun:test";
import { renderIcs, renderVEvent } from "./ics.ts";
import type { DigestResult, Event, Rating } from "../core/types.ts";

function makePick(overrides: Partial<Event & Rating> = {}): Event & Rating {
  return {
    url: "https://x/1",
    title: "Test",
    start: "2026-05-04T19:30:00",
    end: null,
    venue: "Test Venue",
    description: "",
    source: "act",
    normalized_key: "k",
    ics_uid: "abc123@sf-week.local",
    event_url: "https://x/1",
    rating: 8,
    why: "matches taste",
    block_now: false,
    ...overrides,
  };
}

function digest(overrides: Partial<DigestResult>): DigestResult {
  return {
    picks_this_week: [],
    block_now: [],
    failed_sources: [],
    degraded: false,
    total_events_seen: 0,
    total_events_graded: 0,
    ...overrides,
  };
}

describe("renderIcs (CEO E3c — valid VCALENDAR + VTIMEZONE)", () => {
  test("emits valid VCALENDAR header + footer", () => {
    const ics = renderIcs(digest({}));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
  });

  test("includes VTIMEZONE block pinning America/Los_Angeles", () => {
    const ics = renderIcs(digest({}));
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:America/Los_Angeles");
    expect(ics).toContain("END:VTIMEZONE");
    expect(ics).toContain("X-WR-TIMEZONE:America/Los_Angeles");
  });

  test("lines use CRLF line endings (RFC 5545)", () => {
    const ics = renderIcs(digest({ picks_this_week: [makePick({})] }));
    expect(ics).toContain("\r\n");
    // No bare LF without preceding CR
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  test("each pick produces a VEVENT with stable UID", () => {
    const ics = renderIcs(
      digest({
        picks_this_week: [
          makePick({ ics_uid: "uid-1@sf-week.local", title: "Show A" }),
          makePick({ ics_uid: "uid-2@sf-week.local", title: "Show B" }),
        ],
      }),
    );
    expect(ics).toContain("UID:uid-1@sf-week.local");
    expect(ics).toContain("UID:uid-2@sf-week.local");
    expect(ics).toContain("SUMMARY:Show A");
    expect(ics).toContain("SUMMARY:Show B");
  });

  test("DTSTART uses TZID, no Z suffix", () => {
    const ics = renderIcs(digest({ picks_this_week: [makePick({ start: "2026-05-04T19:30:00" })] }));
    expect(ics).toContain("DTSTART;TZID=America/Los_Angeles:20260504T193000");
    expect(ics).not.toContain("DTSTART:20260504T193000Z");
  });

  test("end inferred as start+2h when null", () => {
    const ics = renderIcs(digest({ picks_this_week: [makePick({ start: "2026-05-04T19:30:00", end: null })] }));
    expect(ics).toContain("DTEND;TZID=America/Los_Angeles:20260504T213000");
  });

  test("explicit end is preserved", () => {
    const ics = renderIcs(digest({ picks_this_week: [makePick({ start: "2026-05-04T19:30:00", end: "2026-05-04T22:00:00" })] }));
    expect(ics).toContain("DTEND;TZID=America/Los_Angeles:20260504T220000");
  });

  test("STATUS:TENTATIVE for picks (user accepts)", () => {
    const ics = renderIcs(digest({ picks_this_week: [makePick({})] }));
    expect(ics).toContain("STATUS:TENTATIVE");
  });

  test("E1.2 #4 — cancelled event keeps UID with STATUS:CANCELLED", () => {
    const cancelled = renderVEvent({
      uid: "uid-x@sf-week.local",
      dtStart: "2026-05-04T19:30:00",
      dtEnd: null,
      summary: "Cancelled Show",
      cancelled: true,
    });
    expect(cancelled).toContain("UID:uid-x@sf-week.local");
    expect(cancelled).toContain("STATUS:CANCELLED");
  });

  test("escapes commas, semicolons, newlines in summary/description", () => {
    const ics = renderIcs(
      digest({
        picks_this_week: [
          makePick({
            title: "Title, with comma; and semi",
            why: "line one\nline two",
          }),
        ],
      }),
    );
    expect(ics).toContain("SUMMARY:Title\\, with comma\; and semi");
    expect(ics).toContain("line one\\nline two");
  });

  test("UID stability: same input → same output (CEO E3c)", () => {
    const a = renderIcs(digest({ picks_this_week: [makePick({})] }));
    const b = renderIcs(digest({ picks_this_week: [makePick({})] }));
    // DTSTAMP differs across renders (it's "now"), so strip it
    const stripStamp = (s: string) => s.replace(/DTSTAMP:[^\r\n]+/g, "DTSTAMP:STRIPPED");
    expect(stripStamp(a)).toBe(stripStamp(b));
  });

  test("block_now picks included in same VCALENDAR", () => {
    const ics = renderIcs(
      digest({
        picks_this_week: [makePick({ ics_uid: "in-week@x", title: "Week Pick" })],
        block_now: [makePick({ ics_uid: "block@x", title: "Block Pick" })],
      }),
    );
    expect(ics).toContain("UID:in-week@x");
    expect(ics).toContain("UID:block@x");
  });

  test("estimated-time note appears in description", () => {
    const ics = renderIcs(
      digest({
        picks_this_week: [makePick({ start_was_estimated: true })],
      }),
    );
    expect(ics).toContain("(time estimated)");
  });
});
