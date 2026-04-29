import { describe, expect, test } from "bun:test";
import { pickDigest, inferVertical, defaultWindows } from "./picker.ts";
import type { Event, Rating } from "./types.ts";

function makeEvent(overrides: Partial<Event>): Event {
  return {
    url: "https://x/1",
    title: "Test",
    start: "2026-05-04T19:30:00",
    end: null,
    venue: "v",
    description: "",
    source: "test",
    normalized_key: "k",
    ics_uid: "u",
    ...overrides,
  };
}
function makeRating(url: string, rating: number, block_now = false): Rating {
  return { event_url: url, rating, why: `score ${rating}`, block_now };
}

const WINDOWS = {
  windowStart: new Date("2026-05-03T00:00:00"),         // Sunday
  windowEndThisWeek: new Date("2026-05-10T00:00:00"),   // next Sunday
  windowEndBlockNow: new Date("2026-05-31T00:00:00"),
};

describe("inferVertical", () => {
  test("maps source names to verticals", () => {
    expect(inferVertical("act")).toBe("theatre");
    expect(inferVertical("luma")).toBe("tech");
    expect(inferVertical("sfmoma")).toBe("art");
    expect(inferVertical("unknown")).toBe("other");
  });
});

describe("pickDigest", () => {
  test("respects 9-cap and 3-per-vertical", () => {
    // 5 theatre events all rating 10
    const events: Event[] = [];
    const ratings: Rating[] = [];
    for (let i = 0; i < 5; i++) {
      const url = `https://act/${i}`;
      events.push(makeEvent({ url, source: "act", start: `2026-05-04T19:00:0${i}` }));
      ratings.push(makeRating(url, 10));
    }
    const result = pickDigest({
      events,
      ratings,
      ...WINDOWS,
      failedSources: [],
      degraded: false,
    });
    // Only 3 should make it past per-vertical cap
    expect(result.picks_this_week.length).toBe(3);
  });

  test("respects ≥6 score floor", () => {
    const events = [
      makeEvent({ url: "https://x/1", source: "act" }),
      makeEvent({ url: "https://x/2", source: "luma" }),
    ];
    const ratings = [makeRating("https://x/1", 5), makeRating("https://x/2", 9)];
    const result = pickDigest({
      events,
      ratings,
      ...WINDOWS,
      failedSources: [],
      degraded: false,
    });
    expect(result.picks_this_week.length).toBe(1);
    expect(result.picks_this_week[0]!.event_url).toBe("https://x/2");
  });

  test("sorts within window by rating desc", () => {
    const events = [
      makeEvent({ url: "https://x/1", source: "act", start: "2026-05-04T19:00:00" }),
      makeEvent({ url: "https://x/2", source: "luma", start: "2026-05-05T18:00:00" }),
      makeEvent({ url: "https://x/3", source: "sfmoma", start: "2026-05-06T18:00:00" }),
    ];
    const ratings = [
      makeRating("https://x/1", 7),
      makeRating("https://x/2", 10),
      makeRating("https://x/3", 8),
    ];
    const result = pickDigest({
      events,
      ratings,
      ...WINDOWS,
      failedSources: [],
      degraded: false,
    });
    expect(result.picks_this_week.map((p) => p.rating)).toEqual([10, 8, 7]);
  });

  test("excludes events outside the week window", () => {
    const events = [
      makeEvent({ url: "https://x/1", source: "act", start: "2026-04-30T19:00:00" }), // before
      makeEvent({ url: "https://x/2", source: "act", start: "2026-05-04T19:00:00" }), // in
      makeEvent({ url: "https://x/3", source: "act", start: "2026-05-15T19:00:00" }), // after
    ];
    const ratings = events.map((e) => makeRating(e.url, 9));
    const result = pickDigest({
      events,
      ratings,
      ...WINDOWS,
      failedSources: [],
      degraded: false,
    });
    expect(result.picks_this_week.length).toBe(1);
    expect(result.picks_this_week[0]!.event_url).toBe("https://x/2");
  });

  test("block_now: only includes >7d out + flagged + >=6", () => {
    const events = [
      // In-week, flagged but not block-now-eligible (in main picks)
      makeEvent({ url: "https://x/1", source: "act", start: "2026-05-04T19:00:00" }),
      // Out-of-week, flagged, high rating — should be in block_now
      makeEvent({ url: "https://x/2", source: "act", start: "2026-05-15T19:00:00" }),
      // Out-of-week, NOT flagged
      makeEvent({ url: "https://x/3", source: "act", start: "2026-05-16T19:00:00" }),
      // Out-of-week, flagged but low rating
      makeEvent({ url: "https://x/4", source: "act", start: "2026-05-17T19:00:00" }),
    ];
    const ratings = [
      makeRating("https://x/1", 9, true),
      makeRating("https://x/2", 9, true),
      makeRating("https://x/3", 9, false),
      makeRating("https://x/4", 4, true),
    ];
    const result = pickDigest({
      events,
      ratings,
      ...WINDOWS,
      failedSources: [],
      degraded: false,
    });
    expect(result.block_now.length).toBe(1);
    expect(result.block_now[0]!.event_url).toBe("https://x/2");
  });

  test("CEO E1 degraded mode: returns ungraded in-window events", () => {
    const events = [
      makeEvent({ url: "https://x/1", source: "act", start: "2026-05-04T19:00:00" }),
      makeEvent({ url: "https://x/2", source: "luma", start: "2026-05-05T18:00:00" }),
      makeEvent({ url: "https://x/3", source: "act", start: "2026-04-30T19:00:00" }), // out
    ];
    const result = pickDigest({
      events,
      ratings: [],
      ...WINDOWS,
      failedSources: [],
      degraded: true,
    });
    expect(result.degraded).toBe(true);
    expect(result.picks_this_week.length).toBe(2);
    expect(result.picks_this_week.every((p) => p.rating === 0)).toBe(true);
    expect(result.block_now.length).toBe(0);
  });

  test("propagates failed_sources + counts", () => {
    const result = pickDigest({
      events: [],
      ratings: [],
      ...WINDOWS,
      failedSources: ["luma", "broadway-sf"],
      degraded: false,
    });
    expect(result.failed_sources).toEqual(["luma", "broadway-sf"]);
    expect(result.total_events_seen).toBe(0);
    expect(result.total_events_graded).toBe(0);
  });
});

describe("defaultWindows", () => {
  test("produces 7-day this-week and 28-day block-now windows", () => {
    const today = new Date("2026-05-03T08:00:00"); // Sunday morning
    const w = defaultWindows(today);
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-05-03");
    expect(w.endThisWeek.toISOString().slice(0, 10)).toBe("2026-05-10");
    expect(w.endBlockNow.toISOString().slice(0, 10)).toBe("2026-05-31");
  });
});
