import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseHtml, parseDateString } from "./sfmoma.ts";
import type { VenueAliasMap } from "./sfmoma.ts";

const FIXTURE = readFileSync(
  new URL("../../test/fixtures/sfmoma.html", import.meta.url),
  "utf-8",
);

const aliases: VenueAliasMap = JSON.parse(
  readFileSync(new URL("../../venues.json", import.meta.url), "utf-8"),
);

describe("sfmoma parseHtml", () => {
  test("returns events from the live fixture", () => {
    const events = parseHtml(FIXTURE, aliases);
    expect(events.length).toBeGreaterThan(0);
  });

  test("each event has required fields and 6pm fallback time", () => {
    const events = parseHtml(FIXTURE, aliases);
    for (const e of events) {
      expect(e.url).toMatch(/^https:\/\/www\.sfmoma\.org\/event/);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.start).toMatch(/T18:00:00$/); // art default
      expect(e.venue).toBe("SFMOMA");
      expect(e.source).toBe("sfmoma");
      expect(e.ics_uid).toMatch(/^[a-f0-9]{40}@sf-week\.local$/);
      expect(e.start_was_estimated).toBe(true);
    }
  });

  test("Art Bash 2026 specific case", () => {
    const events = parseHtml(FIXTURE, aliases);
    const ab = events.find((e) => /art bash/i.test(e.title));
    expect(ab).toBeDefined();
    expect(ab!.start).toBe("2026-04-29T18:00:00");
    expect(ab!.description).toContain("celebrations of art");
  });

  test("returns empty on garbage input (E1.2 #2)", () => {
    expect(parseHtml("", aliases)).toEqual([]);
    expect(parseHtml("<html><body></body></html>", aliases)).toEqual([]);
  });

  test("uid stability", () => {
    const a = parseHtml(FIXTURE, aliases);
    const b = parseHtml(FIXTURE, aliases);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.ics_uid).toBe(b[i]!.ics_uid);
    }
  });
});

describe("sfmoma parseDateString", () => {
  test("full weekday name", () => {
    expect(parseDateString("Wednesday, Apr 29, 2026")).toBe("2026-04-29T18:00:00");
  });

  test("range — uses start, year from end", () => {
    expect(parseDateString("Wednesday, Apr 29 - Friday, May 1, 2026")).toBe(
      "2026-04-29T18:00:00",
    );
  });

  test("garbage returns null", () => {
    expect(parseDateString("")).toBe(null);
    expect(parseDateString("not a date")).toBe(null);
  });
});
