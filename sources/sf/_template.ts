// Template for each sources/sf/<name>.ts wrapper.
// CEO Expansion #2: each wrapper imports + re-exports the skillified run() function.
// First time: run /scrape "events from <source> page" → /skillify writes the script.
// Subsequent runs: this wrapper invokes the codified script in ~200ms.

import type { Event } from "../../core/types.ts";

export interface SourceResult {
  events: Event[];
  failed: boolean;
  error?: string;
}

// Replace this body once /skillify generates the real script:
//   import { run as skillifiedRun } from "../../scrape-skills/<source>/script.ts";
//   export async function run(): Promise<SourceResult> {
//     try {
//       const events = await skillifiedRun();
//       return { events, failed: false };
//     } catch (err) {
//       return { events: [], failed: true, error: String(err) };
//     }
//   }
export async function run(): Promise<SourceResult> {
  return { events: [], failed: true, error: "_template not implemented" };
}
