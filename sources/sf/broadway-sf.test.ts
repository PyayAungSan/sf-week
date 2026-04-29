import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseHtml, parseDateString } from "./broadway-sf.ts";
import type { VenueAliasMap } from "./broadway-sf.ts";

const FIXTURE = readFileSync(
  new URL("../../test/fixtures/broadway-sf.html", import.meta.url),
  "utf-8"
);

const aliases: VenueAliasMap = JSON.parse(
  readFileSync(new URL("../../venues.json", import.meta.url), "utf-8")
);

describe("broadway-sf parseHtml", () => {
  test("returns at least one event from the live fixture", () => {
    const events = parseHtml(FIXTURE, aliases);
    expect(events.length).toBeGreaterThan(0);
  });

  test("each event has all required fields", () => {
    const events = parseHtml(FIXTURE, aliases);
    for (const e of events) {
      expect(e.url).toMatch(/^https?:\/\//);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      expect(e.venue.length).toBeGreaterThan(0);
      expect(e.source).toBe("broadway-sf");
      expect(e.normalized_key.length).toBeGreaterThan(0);
      expect(e.ics_uid).toMatch(/^[a-f0-9]{40}@sf-week\.local$/);
      expect(e.start_was_estimated).toBe(true); // listing has no time
    }
  });

  test("Sara Bareilles Awards parses correctly", () => {
    const events = parseHtml(FIXTURE, aliases);
    const sara = events.find((e) => e.title.includes("Sara Bareilles"));
    expect(sara).toBeDefined();
    expect(sara!.venue).toBe("Orpheum Theatre");
    expect(sara!.start).toBe("2026-05-03T19:30:00"); // theatre default 7:30pm
    expect(sara!.url).toContain("/events/sara-bareilles-awards/");
  });

  test("returns empty array on empty html (E1.2 #2 — source-error edge case)", () => {
    expect(parseHtml("", aliases)).toEqual([]);
    expect(parseHtml("<html><body></body></html>", aliases)).toEqual([]);
  });

  test("ics_uid is stable across runs (same input → same uid)", () => {
    const a = parseHtml(FIXTURE, aliases);
    const b = parseHtml(FIXTURE, aliases);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.ics_uid).toBe(b[i]!.ics_uid);
    }
  });
});

describe("parseDateString", () => {
  test("single date with year", () => {
    expect(parseDateString("Sun, May 3, 2026")).toBe("2026-05-03T19:30:00");
  });

  test("date range — uses start, year from end", () => {
    expect(parseDateString("Fri, May 15 - Sun, May 17, 2026")).toBe(
      "2026-05-15T19:30:00"
    );
  });

  test("returns null on garbage input", () => {
    expect(parseDateString("")).toBe(null);
    expect(parseDateString("not a date")).toBe(null);
    expect(parseDateString("xyz")).toBe(null);
  });

  test("returns null when no year is present anywhere", () => {
    // No 4-digit year token = unparseable for our use case
    expect(parseDateString("Fri, May 15")).toBe(null);
  });
});
