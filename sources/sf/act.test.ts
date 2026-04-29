import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  parseShowJsonLd,
  extractShowUrls,
  stripOffsetToNaive,
  parseShows,
} from "./act.ts";
import type { VenueAliasMap } from "./act.ts";

const SHOWS_FIXTURE: Array<Record<string, unknown>> = JSON.parse(
  readFileSync(new URL("../../test/fixtures/act-shows.json", import.meta.url), "utf-8"),
);
const SEASON_HTML = readFileSync(
  new URL("../../test/fixtures/act-season.html", import.meta.url),
  "utf-8",
);
const aliases: VenueAliasMap = JSON.parse(
  readFileSync(new URL("../../venues.json", import.meta.url), "utf-8"),
);

describe("act extractShowUrls", () => {
  test("finds show URLs on the season page, skips nav slugs", () => {
    const urls = extractShowUrls(SEASON_HTML, "/whats-on/2025-26-season");
    expect(urls.length).toBeGreaterThan(3);
    for (const u of urls) {
      expect(u).toMatch(
        /^https:\/\/www\.act-sf\.org\/whats-on\/2025-26-season\/[a-z0-9-]+$/,
      );
      // Should never include nav slugs
      expect(u).not.toMatch(/subscriber-benefits|conservatory-shows|gift-certificates/);
    }
  });

  test("includes Hamnet specifically", () => {
    const urls = extractShowUrls(SEASON_HTML, "/whats-on/2025-26-season");
    expect(urls).toContain("https://www.act-sf.org/whats-on/2025-26-season/hamnet");
  });

  test("returns empty on empty html (E1.2 #2)", () => {
    expect(extractShowUrls("", "/whats-on/2025-26-season")).toEqual([]);
  });
});

describe("act parseShowJsonLd", () => {
  test("parses Hamnet correctly", () => {
    const hamnet = SHOWS_FIXTURE.find((s) => s.name === "Hamnet")!;
    const event = parseShowJsonLd(
      JSON.stringify(hamnet),
      "https://www.act-sf.org/whats-on/2025-26-season/hamnet",
      aliases,
    );
    expect(event).not.toBeNull();
    expect(event!.title).toBe("Hamnet");
    expect(event!.start).toBe("2026-04-22T18:00:00"); // offset stripped
    expect(event!.end).toBe("2026-05-24T20:00:00");
    expect(event!.venue).toBe("TONI REMBE THEATER");
    expect(event!.source).toBe("act");
    expect(event!.start_was_estimated).toBeUndefined(); // ACT has real times
  });

  test("returns null on missing required fields", () => {
    expect(
      parseShowJsonLd("{\"@type\":\"Event\",\"name\":\"x\"}", "https://x", aliases),
    ).toBeNull();
    expect(parseShowJsonLd("not-json", "https://x", aliases)).toBeNull();
  });

  test("ignores non-Event types", () => {
    expect(
      parseShowJsonLd(
        JSON.stringify({ "@type": "Organization", name: "ACT" }),
        "https://x",
        aliases,
      ),
    ).toBeNull();
  });

  test("parseShows: all 4 fixture shows parse", () => {
    const shows = SHOWS_FIXTURE.map((s, i) => ({
      url: `https://www.act-sf.org/show/${i}`,
      jsonLd: JSON.stringify(s),
    }));
    const events = parseShows(shows, aliases);
    expect(events.length).toBe(4);
    const titles = events.map((e) => e.title).sort();
    expect(titles).toContain("Hamnet");
    expect(titles).toContain("Stereophonic");
  });

  test("uid stability", () => {
    const hamnet = SHOWS_FIXTURE.find((s) => s.name === "Hamnet")!;
    const a = parseShowJsonLd(
      JSON.stringify(hamnet),
      "https://www.act-sf.org/whats-on/2025-26-season/hamnet",
      aliases,
    );
    const b = parseShowJsonLd(
      JSON.stringify(hamnet),
      "https://www.act-sf.org/whats-on/2025-26-season/hamnet",
      aliases,
    );
    expect(a!.ics_uid).toBe(b!.ics_uid);
  });
});

describe("stripOffsetToNaive", () => {
  test("strips +/-HHMM offset", () => {
    expect(stripOffsetToNaive("2026-04-22T18:00:00-0700")).toBe("2026-04-22T18:00:00");
    expect(stripOffsetToNaive("2026-04-22T18:00:00+0530")).toBe("2026-04-22T18:00:00");
  });

  test("strips Z (UTC)", () => {
    expect(stripOffsetToNaive("2026-04-22T18:00:00Z")).toBe("2026-04-22T18:00:00");
  });

  test("returns null on garbage", () => {
    expect(stripOffsetToNaive("not-a-date")).toBeNull();
    expect(stripOffsetToNaive("")).toBeNull();
  });
});
