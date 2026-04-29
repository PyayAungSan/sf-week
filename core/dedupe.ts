import type { Event } from "./types.ts";
// CEO Expansion #1: dedupe is generic over Event[].
// Primary key: url. Secondary fuzzy key: lowercased_title + start_iso_to_hour + venue_normalized.

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

export function normalizeVenue(venue: string, aliases: VenueAliasMap): string {
  let v = venue.toLowerCase().trim();
  // strip leading "the "
  v = v.replace(/^the /, "");
  // strip punctuation
  v = v.replace(/[.,'"]/g, "").trim();
  // apply alias map
  return aliases.aliases[v] ?? v;
}

export function buildNormalizedKey(
  title: string,
  startIso: string,
  venue: string,
  aliases: VenueAliasMap,
): string {
  const t = title.toLowerCase().trim();
  // truncate start to the hour
  const startHour = startIso.slice(0, 13);  // "YYYY-MM-DDTHH"
  const v = normalizeVenue(venue, aliases);
  return `${t}|${startHour}|${v}`;
}

export function dedupe(events: Event[]): Event[] {
  // TODO: implement
  // 1. By URL: collapse exact duplicates
  // 2. By normalized_key: collapse fuzzy duplicates, prefer the entry with longer description
  // 3. Return the merged set
  return events;
}
