// Berkeley Rep parser. Source: berkeleyrep.org
// Two-stage flow like ACT:
//   1. Fetch the season landing page → extractShowUrls()
//   2. For each show URL, fetch and parsePerformanceLd()
//
// Berkeley Rep emits ONE schema.org Event LD entry per individual performance
// (e.g. 43 entries for "The Monsters" — one per showtime). We collapse those
// into a single logical Event per show: start = earliest performance,
// end = latest performance. Otherwise the digest would show 43 rows for one show.

import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import type { Event } from "../../core/types.ts";
import type { SourceResult } from "./_template.ts";
import { buildNormalizedKey } from "../../core/dedupe.ts";
import { icsUid } from "../../core/ics-uid.ts";
import { stripOffsetToNaive } from "./act.ts";

const SOURCE_NAME = "berkeley-rep";
const SEASON_URL = "https://www.berkeleyrep.org/season/";
const VENUE_FALLBACK = "Berkeley Repertory Theatre";

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

interface PerformanceLd {
  "@type": string;
  name: string;
  startDate?: string;
  location?: { name?: string };
  description?: string;
}

// Extract show URLs from the season page. Pattern: /shows/<slug>
export function extractShowUrls(seasonHtml: string): string[] {
  const $ = cheerio.load(seasonHtml);
  const urls = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    let url: URL;
    try {
      url = new URL(href, "https://www.berkeleyrep.org");
    } catch {
      return;
    }
    if (url.host !== "www.berkeleyrep.org") return;
    if (!/^\/shows\/[a-z0-9-]+\/?$/i.test(url.pathname)) return;
    urls.add(url.toString().replace(/\/$/, ""));
  });
  return Array.from(urls).sort();
}

// Take an array of per-performance LD entries from a single show page → one Event.
// Returns null if the array is empty or no entries have a parseable startDate.
export function collapsePerformances(
  performances: PerformanceLd[],
  url: string,
  aliases: VenueAliasMap,
): Event | null {
  const events = performances.filter(
    (p) => p["@type"] === "Event" && p.name && p.startDate,
  );
  if (events.length === 0) return null;

  // Use the first entry's metadata; min/max start across all entries.
  const first = events[0]!;
  const title = first.name.trim();
  const venue = (first.location?.name ?? VENUE_FALLBACK).trim();
  const description = (first.description ?? "").replace(/\s+/g, " ").trim();

  const naiveStarts = events
    .map((e) => stripOffsetToNaive(e.startDate!))
    .filter((s): s is string => s !== null);
  if (naiveStarts.length === 0) return null;

  naiveStarts.sort();
  const start = naiveStarts[0]!;
  const end = naiveStarts[naiveStarts.length - 1]!;

  const normalized_key = buildNormalizedKey(title, start, venue, aliases);

  return {
    url,
    title,
    start,
    end,
    venue,
    description,
    source: SOURCE_NAME,
    normalized_key,
    ics_uid: icsUid(normalized_key),
  };
}

// Pulls all <script type="application/ld+json"> blocks from raw show-page HTML,
// returns flattened array of Event entries.
export function extractPerformanceLd(html: string): PerformanceLd[] {
  const out: PerformanceLd[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]!.trim());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of arr) {
        if (item && item["@type"] === "Event") out.push(item);
      }
    } catch {
      // skip malformed blocks
    }
  }
  return out;
}

export async function fetchHtml(_url: string): Promise<string> {
  throw new Error("fetchHtml not yet implemented — use plain fetch on each show page");
}

export async function run(): Promise<SourceResult> {
  try {
    const seasonHtml = await fetchHtml(SEASON_URL);
    const showUrls = extractShowUrls(seasonHtml);
    const aliasesJson = await readFile(
      new URL("../../venues.json", import.meta.url),
      "utf-8",
    );
    const aliases: VenueAliasMap = JSON.parse(aliasesJson);

    const events: Event[] = [];
    for (const url of showUrls) {
      try {
        const showHtml = await fetchHtml(url);
        const perfs = extractPerformanceLd(showHtml);
        const e = collapsePerformances(perfs, url, aliases);
        if (e) events.push(e);
      } catch {
        // skip per-show failures
      }
    }
    return { events, failed: false };
  } catch (err) {
    return {
      events: [],
      failed: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const SOURCE_INFO = {
  name: SOURCE_NAME,
  url: SEASON_URL,
  parserType: "static-html" as const,
};
