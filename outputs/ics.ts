import type { DigestResult } from "../core/types.ts";

// CEO E1.1: write to docs/calendar.ics. GitHub Pages serves it from /docs.
// VTIMEZONE pinned to America/Los_Angeles.
// UID stability: every event keeps the same ics_uid across runs (CEO Expansion).
// Cancelled events stay in the feed with STATUS:CANCELLED.

export function renderIcs(_result: DigestResult): string {
  // TODO: implement
  // 1. VCALENDAR + VTIMEZONE(America/Los_Angeles) header
  // 2. One VEVENT per pick + per block_now
  // 3. UID from event.ics_uid (already stable from dedupe step)
  // 4. STATUS:TENTATIVE for picks (user accepts in calendar app)
  // 5. STATUS:CANCELLED for events known cancelled (E1.2 #4)
  throw new Error("ics.ts not yet implemented");
}
