import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseHtml } from "./asian-art.ts";
import type { VenueAliasMap } from "./asian-art.ts";

const FIXTURE = readFileSync(
  new URL("../../test/fixtures/asian-art.html", import.meta.url),
  "utf-8",
);
const aliases: VenueAliasMap = JSON.parse(
  readFileSync(new URL("../../venues.json", import.meta.url), "utf-8"),
);

describe("asian-art parseHtml", () => {
  test("returns events from the live fixture", () => {
    const events = parseHtml(FIXTURE, aliases);
    expect(events.length).toBeGreaterThan(0);
  });

  test("each event has required fields", () => {
    const events = parseHtml(FIXTURE, aliases);
    for (const e of events) {
      expect(e.url).toMatch(/^https:\/\/calendar\.asianart\.org\//);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      expect(e.venue).toBe("Asian Art Museum");
      expect(e.source).toBe("asian-art");
    }
  });

  test("dedupes events repeated in multiple slider sections", () => {
    const events = parseHtml(FIXTURE, aliases);
    const urls = events.map((e) => e.url);
    expect(urls.length).toBe(new Set(urls).size);
  });

  test("includes Mahjong and Mocktails (sample event)", () => {
    const events = parseHtml(FIXTURE, aliases);
    const m = events.find((e) => /mahjong/i.test(e.title));
    expect(m).toBeDefined();
    expect(m!.url).toContain("mahjong-and-mocktails");
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
