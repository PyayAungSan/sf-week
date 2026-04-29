// magic-theatre source wrapper. See _template.ts for the pattern.
// TODO: run /scrape "events from magic-theatre" then /skillify, then update this file.

import type { SourceResult } from "./_template.ts";

export async function run(): Promise<SourceResult> {
  return { events: [], failed: true, error: "magic-theatre not yet implemented" };
}
