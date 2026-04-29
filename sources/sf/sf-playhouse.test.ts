import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractShowUrls, parseDateRange, parseShowHtml } from "./sf-playhouse.ts";
import type { VenueAliasMap } from "./sf-playhouse.ts";

const SEASON = readFileSync(
  new URL("../../test/fixtures/sf-playhouse-season.html", import.meta.url),
  "utf-8",
);
const FLEX = readFileSync(
  new URL("../../test/fixtures/sf-playhouse-flex.html", import.meta.url),
  "utf-8",
);
const DRACULA = readFileSync(
  new URL("../../test/fixtures/sf-playhouse-dracula.html", import.meta.url),
  "utf-8",
);
const HAIRSPRAY = readFileSync(
  new URL("../../test/fixtures/sf-playhouse-hairspray.html", import.meta.url),
  "utf-8",
);
const aliases: VenueAliasMap = JSON.parse(
  readFileSync(new URL("../../venues.json", import.meta.url), "utf-8"),
);

describe("sf-playhouse extractShowUrls", () => {
  test("finds show URLs from season page", () => {
    const urls = extractShowUrls(SEASON);
    expect(urls.length).toBeGreaterThan(3);
    for (const u of urls) {
      expect(u).toMatch(
        /^https:\/\/www\.sfplayhouse\.org\/2025-2026-season\/[a-z0-9-]+\/$/,
      );
    }
  });

  test("includes Flex specifically", () => {
    const urls = extractShowUrls(SEASON);
    expect(urls).toContain("https://www.sfplayhouse.org/2025-2026-season/flex/");
  });

  test("returns empty on empty html", () => {
    expect(extractShowUrls("")).toEqual([]);
  });
});

describe("sf-playhouse parseDateRange", () => {
  test("'MARCH 26 – MAY 2, 2026' (en-dash)", () => {
    expect(parseDateRange("MARCH 26 – MAY 2, 2026")).toEqual({
      start: "2026-03-26T19:30:00",
      end: "2026-05-02T19:30:00",
    });
  });
  test("'March 26 - May 2, 2026' (ascii hyphen)", () => {
    expect(parseDateRange("March 26 - May 2, 2026")).toEqual({
      start: "2026-03-26T19:30:00",
      end: "2026-05-02T19:30:00",
    });
  });
  test("returns null on garbage", () => {
    expect(parseDateRange("no date here")).toBeNull();
    expect(parseDateRange("")).toBeNull();
  });
});

describe("sf-playhouse parseShowHtml", () => {
  test("Flex parses correctly", () => {
    const e = parseShowHtml(FLEX, "https://www.sfplayhouse.org/2025-2026-season/flex/", aliases);
    expect(e).not.toBeNull();
    expect(e!.title).toBe("Flex");
    expect(e!.venue).toBe("San Francisco Playhouse");
    expect(e!.start).toBe("2026-03-26T19:30:00");
    expect(e!.end).toBe("2026-05-02T19:30:00");
    expect(e!.start_was_estimated).toBe(true);
    expect(e!.source).toBe("sf-playhouse");
  });

  test("Dracula parses", () => {
    const e = parseShowHtml(DRACULA, "https://www.sfplayhouse.org/2025-2026-season/dracula/", aliases);
    expect(e).not.toBeNull();
    expect(e!.title.toLowerCase()).toContain("dracula");
  });

  test("Hairspray parses", () => {
    const e = parseShowHtml(HAIRSPRAY, "https://www.sfplayhouse.org/2025-2026-season/hairspray/", aliases);
    expect(e).not.toBeNull();
    expect(e!.title).toBe("Hairspray");
  });

  test("returns null on empty html (E1.2 #2)", () => {
    expect(parseShowHtml("", "https://x", aliases)).toBeNull();
    expect(parseShowHtml("<html><body><h1>No date</h1></body></html>", "https://x", aliases)).toBeNull();
  });

  test("uid stability", () => {
    const a = parseShowHtml(FLEX, "https://x", aliases);
    const b = parseShowHtml(FLEX, "https://x", aliases);
    expect(a!.ics_uid).toBe(b!.ics_uid);
  });
});
