// sfmoma source wrapper. See _template.ts for the pattern.
// TODO: run /scrape "events from sfmoma" then /skillify, then update this file.

import type { SourceResult } from "./_template.ts";

export async function run(): Promise<SourceResult> {
  return { events: [], failed: true, error: "sfmoma not yet implemented" };
}
