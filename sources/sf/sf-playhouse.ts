// sf-playhouse source wrapper. See _template.ts for the pattern.
// TODO: run /scrape "events from sf-playhouse" then /skillify, then update this file.

import type { SourceResult } from "./_template.ts";

export async function run(): Promise<SourceResult> {
  return { events: [], failed: true, error: "sf-playhouse not yet implemented" };
}
