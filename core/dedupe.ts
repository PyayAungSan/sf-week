import type { Event } from "./types.ts";

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

export function normalizeVenue(venue: string, aliases: VenueAliasMap): string {
  let v = venue.toLowerCase().trim();
  v = v.replace(/^the /, "");
  v = v.replace(/[.,'"’]/g, "").trim();
  return aliases.aliases[v] ?? v;
}

export function buildNormalizedKey(
  title: string,
  startIso: string,
  venue: string,
  aliases: VenueAliasMap,
): string {
  const t = title.toLowerCase().trim();
  const startHour = startIso.slice(0, 13); // "YYYY-MM-DDTHH"
  const v = normalizeVenue(venue, aliases);
  return `${t}|${startHour}|${v}`;
}

// Dedupes events using:
// 1. Primary: exact URL match
// 2. Secondary: normalized_key (title + start hour + venue alias-normalized)
// When duplicates collapse, prefer the entry with the longer description (more context for grader).
export function dedupe(events: Event[]): Event[] {
  const byUrl = new Map<string, Event>();
  for (const e of events) {
    const existing = byUrl.get(e.url);
    if (!existing) {
      byUrl.set(e.url, e);
    } else if (e.description.length > existing.description.length) {
      byUrl.set(e.url, e);
    }
  }

  const byKey = new Map<string, Event>();
  for (const e of byUrl.values()) {
    const existing = byKey.get(e.normalized_key);
    if (!existing) {
      byKey.set(e.normalized_key, e);
    } else if (e.description.length > existing.description.length) {
      byKey.set(e.normalized_key, e);
    }
  }
  return Array.from(byKey.values());
}
