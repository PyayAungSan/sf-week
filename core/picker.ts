import type { Event, Rating, DigestResult } from "./types.ts";

// Slot allocation per design doc + CEO scope:
// - This week: up to 9 picks, max 3 per vertical, all must score >= 6/10
// - Block-now: 1-3 picks beyond this week (>7 days out, up to 4 weeks)
//              flagged by grader as block_now=true, also >=6/10
// - Quiet-week: if fewer than 3 picks clear >=6, the email leads with a
//               quiet-week note + the next 5 ranked events that almost cleared

export interface PickerInput {
  events: Event[];
  ratings: Rating[];
  windowStart: Date;          // inclusive, typically today (Sunday)
  windowEndThisWeek: Date;    // exclusive, typically Sunday + 7 days
  windowEndBlockNow: Date;    // exclusive, typically Sunday + 28 days
  failedSources: string[];
  degraded: boolean;
  maxThisWeek?: number;       // default 9
  perVerticalCap?: number;    // default 3
  scoreFloor?: number;        // default 6
  blockNowMax?: number;       // default 3
  quietWeekFloor?: number;    // default 3 (if fewer picks, show quiet-week mode)
}

const VERTICAL_HINTS: Record<string, RegExp> = {
  theatre: /todays-tix|broadway-sf|act|berkeley-rep|sf-playhouse|magic-theatre/,
  tech: /luma|eventbrite|meetup/,
  art: /sfmoma|de-young|famsf|bampfa|asian-art|hyperallergic/,
};

export function inferVertical(source: string): "theatre" | "tech" | "art" | "other" {
  for (const [v, rx] of Object.entries(VERTICAL_HINTS)) {
    if (rx.test(source)) return v as "theatre" | "tech" | "art";
  }
  return "other";
}

export function pickDigest(input: PickerInput): DigestResult {
  const {
    events,
    ratings,
    windowStart,
    windowEndThisWeek,
    windowEndBlockNow,
    failedSources,
    degraded,
    maxThisWeek = 9,
    perVerticalCap = 3,
    scoreFloor = 6,
    blockNowMax = 3,
    quietWeekFloor: _quietWeekFloor = 3,
  } = input;

  // CEO E1 degraded mode: skip ranking, return all in-window events sorted by source.
  if (degraded) {
    const inWindow = events
      .filter((e) => {
        const d = new Date(e.start);
        return d >= windowStart && d < windowEndThisWeek;
      })
      .sort((a, b) => a.source.localeCompare(b.source) || a.start.localeCompare(b.start));
    return {
      picks_this_week: inWindow.map((e) => ({
        ...e,
        event_url: e.url,
        rating: 0,
        why: "(grader unavailable — ungraded)",
        block_now: false,
      })),
      block_now: [],
      failed_sources: failedSources,
      degraded: true,
      total_events_seen: events.length,
      total_events_graded: 0,
    };
  }

  // Index ratings by url for quick lookup
  const ratingByUrl = new Map<string, Rating>();
  for (const r of ratings) ratingByUrl.set(r.event_url, r);

  // Combined event+rating, drop events that didn't get graded.
  const merged = events
    .map((e) => {
      const r = ratingByUrl.get(e.url);
      return r ? { ...e, ...r } : null;
    })
    .filter((x): x is Event & Rating => x !== null);

  // Partition by window
  const thisWeek: Array<Event & Rating> = [];
  const blockNowCandidates: Array<Event & Rating> = [];
  for (const e of merged) {
    const d = new Date(e.start);
    if (d >= windowStart && d < windowEndThisWeek) {
      thisWeek.push(e);
    } else if (d >= windowEndThisWeek && d < windowEndBlockNow) {
      blockNowCandidates.push(e);
    }
  }

  // This-week selection: rank by rating desc, then enforce per-vertical cap
  thisWeek.sort((a, b) => b.rating - a.rating || a.start.localeCompare(b.start));
  const verticalCount: Record<string, number> = {};
  const picks: Array<Event & Rating> = [];
  for (const e of thisWeek) {
    if (e.rating < scoreFloor) break; // sorted; once we hit floor, done
    if (picks.length >= maxThisWeek) break;
    const v = inferVertical(e.source);
    verticalCount[v] = verticalCount[v] ?? 0;
    if (verticalCount[v] >= perVerticalCap) continue;
    picks.push(e);
    verticalCount[v]++;
  }

  // Block-now: filter to block_now=true AND >= floor, take top by rating
  const blockNow = blockNowCandidates
    .filter((e) => e.block_now && e.rating >= scoreFloor)
    .sort((a, b) => b.rating - a.rating || a.start.localeCompare(b.start))
    .slice(0, blockNowMax);

  return {
    picks_this_week: picks,
    block_now: blockNow,
    failed_sources: failedSources,
    degraded: false,
    total_events_seen: events.length,
    total_events_graded: ratings.length,
  };
}

// Convenience: derive standard windows from a "today" Date (assumed Sunday morning).
export function defaultWindows(today: Date): {
  start: Date;
  endThisWeek: Date;
  endBlockNow: Date;
} {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const endThisWeek = new Date(start);
  endThisWeek.setDate(endThisWeek.getDate() + 7);
  const endBlockNow = new Date(start);
  endBlockNow.setDate(endBlockNow.getDate() + 28);
  return { start, endThisWeek, endBlockNow };
}
