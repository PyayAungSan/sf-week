import { describe, expect, test } from "bun:test";
import { dedupe, normalizeVenue, buildNormalizedKey } from "./dedupe.ts";
import type { VenueAliasMap } from "./dedupe.ts";
import type { Event } from "./types.ts";

const aliases: VenueAliasMap = {
  aliases: {
    "sfmoma": "san francisco museum of modern art",
    "sf moma": "san francisco museum of modern art",
  },
};

function makeEvent(overrides: Partial<Event>): Event {
  return {
    url: "https://x/1",
    title: "Test Event",
    start: "2026-05-04T19:30:00",
    end: null,
    venue: "Test Venue",
    description: "",
    source: "test",
    normalized_key: "",
    ics_uid: "",
    ...overrides,
  };
}

describe("normalizeVenue", () => {
  test("lowercase + strip punctuation + alias map", () => {
    expect(normalizeVenue("SFMOMA", aliases)).toBe("san francisco museum of modern art");
    expect(normalizeVenue("SF MOMA", aliases)).toBe("san francisco museum of modern art");
    expect(normalizeVenue("The Orpheum Theatre", aliases)).toBe("orpheum theatre");
    expect(normalizeVenue("Peet's Theatre.", aliases)).toBe("peets theatre");
    // Curly apostrophe
    expect(normalizeVenue("Peet’s Theatre", aliases)).toBe("peets theatre");
  });
});

describe("buildNormalizedKey", () => {
  test("collapses time to hour granularity", () => {
    const k1 = buildNormalizedKey("Hamnet", "2026-04-22T18:00:00", "ACT", aliases);
    const k2 = buildNormalizedKey("Hamnet", "2026-04-22T18:30:00", "ACT", aliases);
    // Same hour → same key
    expect(k1).toBe(k2);
  });
});

describe("dedupe (E1.2 #3 — venue alias collisions)", () => {
  test("removes exact URL duplicates", () => {
    const events = [
      makeEvent({ url: "https://x/1", description: "short" }),
      makeEvent({ url: "https://x/1", description: "longer description wins" }),
    ];
    const out = dedupe(events);
    expect(out.length).toBe(1);
    expect(out[0]!.description).toBe("longer description wins");
  });

  test("collapses different URLs with same normalized_key", () => {
    const sameKey = buildNormalizedKey("Hamnet", "2026-04-22T18:00:00", "ACT", aliases);
    const events = [
      makeEvent({
        url: "https://eventbrite.com/hamnet",
        title: "Hamnet",
        start: "2026-04-22T18:00:00",
        venue: "ACT",
        description: "from eventbrite",
        normalized_key: sameKey,
      }),
      makeEvent({
        url: "https://act-sf.org/hamnet",
        title: "Hamnet",
        start: "2026-04-22T18:00:00",
        venue: "ACT",
        description: "from act site, longer description text",
        normalized_key: sameKey,
      }),
    ];
    const out = dedupe(events);
    expect(out.length).toBe(1);
    expect(out[0]!.description).toBe("from act site, longer description text");
  });

  test("E1.2 #3 — venue alias map miss vs hit", () => {
    // Without alias: SFMOMA and "san francisco museum of modern art" produce different keys
    const noAliases: VenueAliasMap = { aliases: {} };
    const k1 = buildNormalizedKey("Test", "2026-05-04T18:00:00", "SFMOMA", noAliases);
    const k2 = buildNormalizedKey(
      "Test",
      "2026-05-04T18:00:00",
      "San Francisco Museum of Modern Art",
      noAliases,
    );
    expect(k1).not.toBe(k2); // confirmed false negative without alias

    // With alias: both produce the same key
    const k3 = buildNormalizedKey("Test", "2026-05-04T18:00:00", "SFMOMA", aliases);
    const k4 = buildNormalizedKey(
      "Test",
      "2026-05-04T18:00:00",
      "San Francisco Museum of Modern Art",
      aliases,
    );
    expect(k3).toBe(k4);
  });

  test("preserves distinct events", () => {
    const events = [
      makeEvent({
        url: "https://x/1",
        normalized_key: "a|2026-05-04T19|venue1",
      }),
      makeEvent({
        url: "https://x/2",
        normalized_key: "b|2026-05-05T19|venue2",
      }),
    ];
    expect(dedupe(events).length).toBe(2);
  });

  test("empty input returns empty", () => {
    expect(dedupe([])).toEqual([]);
  });
});
