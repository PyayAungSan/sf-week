import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  parseJsonLd,
  extractLdFromHtml,
} from "./todays-tix.ts";
import type { VenueAliasMap } from "./todays-tix.ts";

const FIXTURE_JSON = readFileSync(
  new URL("../../test/fixtures/todays-tix-sf.json", import.meta.url),
  "utf-8",
);

const aliases: VenueAliasMap = JSON.parse(
  readFileSync(new URL("../../venues.json", import.meta.url), "utf-8"),
);

describe("todays-tix parseJsonLd", () => {
  test("parses ~43 events from the live fixture", () => {
    const events = parseJsonLd(FIXTURE_JSON, aliases);
    expect(events.length).toBeGreaterThan(20); // tolerant lower bound
  });

  test("each event has all required fields", () => {
    const events = parseJsonLd(FIXTURE_JSON, aliases);
    for (const e of events) {
      expect(e.url).toMatch(/^https:\/\/www\.todaytix\.com\/sf-bay-area\/shows\//);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      expect(e.venue.length).toBeGreaterThan(0);
      expect(e.source).toBe("todays-tix");
      expect(e.ics_uid).toMatch(/^[a-f0-9]{40}@sf-week\.local$/);
    }
  });

  test("decodes HTML entities in titles (Hell's Kitchen)", () => {
    const events = parseJsonLd(FIXTURE_JSON, aliases);
    const hk = events.find((e) => /hell.s kitchen/i.test(e.title));
    expect(hk).toBeDefined();
    expect(hk!.title).toBe("Hell's Kitchen"); // not "Hell&apos;s Kitchen"
  });

  test("Hell's Kitchen specific case: dates + venue parse correctly", () => {
    const events = parseJsonLd(FIXTURE_JSON, aliases);
    const hk = events.find((e) => /hell.s kitchen/i.test(e.title));
    expect(hk).toBeDefined();
    expect(hk!.venue).toBe("Orpheum Theatre");
    expect(hk!.start).toBe("2026-05-06T19:30:00");
    expect(hk!.end).toBe("2026-05-24T19:30:00");
    expect(hk!.start_was_estimated).toBe(true);
  });

  test("returns empty array on garbage input (E1.2 #2 — source-error edge case)", () => {
    expect(parseJsonLd("", aliases)).toEqual([]);
    expect(parseJsonLd("not-json", aliases)).toEqual([]);
    expect(parseJsonLd("[]", aliases)).toEqual([]);
    expect(parseJsonLd("{}", aliases)).toEqual([]);
  });

  test("skips entries missing required fields (defensive)", () => {
    const partial = JSON.stringify([
      { "@type": "TheaterEvent", name: "Has no url or startDate" },
      { "@type": "TheaterEvent", name: "Has url no start", url: "https://x" },
      {
        "@type": "TheaterEvent",
        name: "Complete",
        url: "https://x",
        startDate: "2026-06-01",
        location: { name: "Test Venue" },
      },
    ]);
    const events = parseJsonLd(partial, aliases);
    expect(events.length).toBe(1);
    expect(events[0]!.title).toBe("Complete");
  });

  test("ignores non-TheaterEvent JSON-LD types", () => {
    const mixed = JSON.stringify([
      { "@type": "BreadcrumbList", itemListElement: [] },
      { "@type": "Organization", name: "Some org" },
      {
        "@type": "TheaterEvent",
        name: "Real event",
        url: "https://x",
        startDate: "2026-06-01",
        location: { name: "Test Venue" },
      },
    ]);
    const events = parseJsonLd(mixed, aliases);
    expect(events.length).toBe(1);
  });

  test("ics_uid is stable across runs", () => {
    const a = parseJsonLd(FIXTURE_JSON, aliases);
    const b = parseJsonLd(FIXTURE_JSON, aliases);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.ics_uid).toBe(b[i]!.ics_uid);
    }
  });
});

describe("extractLdFromHtml", () => {
  test("pulls JSON-LD from a script tag", () => {
    const html = `<html>
<script type="application/ld+json">${JSON.stringify({
      "@type": "TheaterEvent",
      name: "Test",
      url: "https://x",
      startDate: "2026-06-01",
    })}</script>
</html>`;
    const result = extractLdFromHtml(html);
    const arr = JSON.parse(result);
    expect(arr.length).toBe(1);
    expect(arr[0].name).toBe("Test");
  });

  test("flattens arrays and skips malformed blocks", () => {
    const html = `
<script type="application/ld+json">[{"@type":"A"},{"@type":"B"}]</script>
<script type="application/ld+json">{this is not json}</script>
<script type="application/ld+json">{"@type":"C"}</script>
`;
    const arr = JSON.parse(extractLdFromHtml(html));
    expect(arr.length).toBe(3);
    expect(arr.map((x: { "@type": string }) => x["@type"])).toEqual(["A", "B", "C"]);
  });

  test("returns empty JSON array when no script tags", () => {
    expect(extractLdFromHtml("<html></html>")).toBe("[]");
  });
});
