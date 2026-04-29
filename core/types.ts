// The event schema all sources normalize to.
// This is the shared interface between sources/sf/* and core/grader.ts.
// CEO Expansion #1: keep this independent of any source-specific shape.

export interface Event {
  url: string;                // unique-ish; primary dedupe key
  title: string;
  start: string;              // ISO 8601, America/Los_Angeles
  end: string | null;         // ISO 8601 or null if unknown
  venue: string;
  description: string;        // raw-ish text the grader reads
  source: string;             // e.g. "luma", "act", "sfmoma"
  normalized_key: string;     // lowercased_title + start_hour + venue_normalized
  ics_uid: string;            // sha1(normalized_key) + "@sf-week.local"
  start_was_estimated?: boolean;  // true if grader fell back to canonical time
}

export interface Rating {
  event_url: string;
  rating: number;             // 1-10
  why: string;                // one-sentence reason
  block_now: boolean;         // capacity-risk flag
}

export interface DigestResult {
  picks_this_week: Array<Event & Rating>;
  block_now: Array<Event & Rating>;
  failed_sources: string[];
  degraded: boolean;          // CEO E1: true if grader fell back to ungraded list
  total_events_seen: number;
  total_events_graded: number;
}
