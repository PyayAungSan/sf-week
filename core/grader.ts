import type { Event, Rating } from "./types.ts";
// import Anthropic from "@anthropic-ai/sdk";

// CEO Expansion #1: grader is independent of any source.
// CEO E1: degraded mode wrapper — retry 2x with 30s backoff, then fall through
// to ungraded list with degraded:true flag.

export interface GraderOptions {
  maxRetries?: number;        // default 2
  backoffMs?: number;         // default 30000
}

export interface GradeResult {
  ratings: Rating[];
  degraded: boolean;
}

export async function grade(
  _taste: string,
  events: Event[],
  _options: GraderOptions = {},
): Promise<GradeResult> {
  // TODO: implement
  // 1. Build cached system prompt from taste profile (use Anthropic prompt caching)
  // 2. Per-event tool-use call → {rating: 1-10, why: string, block_now: bool}
  // 3. Wrap in retry-2x-with-30s-backoff
  // 4. On final failure: return {ratings: [], degraded: true}
  // 5. Edge case: if events is empty, return {ratings: [], degraded: false} immediately
  if (events.length === 0) return { ratings: [], degraded: false };
  throw new Error("grader.ts not yet implemented");
}
