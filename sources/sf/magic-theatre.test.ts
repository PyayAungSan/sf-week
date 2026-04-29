import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseHtml, utcToLocal } from "./magic-theatre.ts";
import type { VenueAliasMap } from "./magic-theatre.ts";

const FIXTURE = readFileSync(
  new URL("../../test/fixtures/magic-theatre.html", import.meta.url),
  "utf-8",
);
const aliases: VenueAliasMap = JSON.parse(
  readFileSync(new URL("../../venues.json", import.meta.url), "utf-8"),
);

describe("magic-theatre parseHtml", () => {
  test("returns events from the live fixture", () => {
    const events = parseHtml(FIXTURE, aliases);
    expect(events.length).toBeGreaterThan(0);
  });

  test("each event has required fields", () => {
    const events = parseHtml(FIXTURE, aliases);
    for (const e of events) {
      expect(e.url).toMatch(/^https:\/\/magictheatre\.org\/calendar\//);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      expect(e.venue).toBe("Magic Theatre");
      expect(e.source).toBe("magic-theatre");
      expect(e.ics_uid).toMatch(/^[a-f0-9]{40}@sf-week\.local$/);
    }
  });

  test("parses Macbeth specifically", () => {
    const events = parseHtml(FIXTURE, aliases);
    const m = events.find((e) => /macbeth/i.test(e.title));
    expect(m).toBeDefined();
    // 20260319T030000Z (gcal start) = 2026-03-18 20:00 PDT
    // (UTC 03:00 the next day = 20:00 the day before in PDT)
    expect(m!.start).toMatch(/^2026-03-1[78]T/);
  });

  test("returns empty on garbage input (E1.2 #2)", () => {
    expect(parseHtml("", aliases)).toEqual([]);
    expect(parseHtml("<html></html>", aliases)).toEqual([]);
  });

  test("uid stability", () => {
    const a = parseHtml(FIXTURE, aliases);
    const b = parseHtml(FIXTURE, aliases);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.ics_uid).toBe(b[i]!.ics_uid);
    }
  });
});

describe("utcToLocal", () => {
  test("UTC midday in summer → PDT (-7h)", () => {
    // 2026-07-01 19:00 UTC = 2026-07-01 12:00 PDT
    expect(utcToLocal("2026-07-01T19:00:00")).toBe("2026-07-01T12:00:00");
  });

  test("UTC midday in winter → PST (-8h)", () => {
    // 2026-01-15 20:00 UTC = 2026-01-15 12:00 PST
    expect(utcToLocal("2026-01-15T20:00:00")).toBe("2026-01-15T12:00:00");
  });

  test("UTC midnight crosses to previous day in PT", () => {
    // 2026-05-01 03:00 UTC = 2026-04-30 20:00 PDT
    expect(utcToLocal("2026-05-01T03:00:00")).toBe("2026-04-30T20:00:00");
  });
});
