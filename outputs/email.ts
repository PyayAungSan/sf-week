import type { DigestResult } from "../core/types.ts";

// Slot allocation: up to 9 picks (max 3 per vertical), >=6/10 floor.
// Quiet-week mode: <3 picks at >=6/10 → "quiet week" header + ranked next-5.
// Degraded mode (CEO E1): when result.degraded is true, render ungraded list.

export function renderEmailHtml(_result: DigestResult): string {
  // TODO: implement
  // 1. If result.degraded → render "DIGEST DEGRADED" template with raw events list
  // 2. If result.picks_this_week.length < 3 → render quiet-week template
  // 3. Otherwise → render normal digest with picks + block_now subsection
  // 4. Footer: failed sources warning if result.failed_sources.length > 0
  throw new Error("email.ts not yet implemented");
}

export async function sendEmail(_html: string, _to: string): Promise<void> {
  // TODO: implement via Resend
  // CEO E1: this can fail silently — caller doesn't retry, just logs.
  throw new Error("sendEmail not yet implemented");
}
