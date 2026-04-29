// TodayTix SF Bay Area parser. Source: /sf-bay-area/category/all-shows
// Strategy: extract schema.org TheaterEvent entries from <script type="application/ld+json"> tags.
// JSON-LD is stable across page redesigns (it's a public schema.org spec).
//
// User correction 2026-04-29: I initially removed TodayTix because the /san-francisco
// path 404'd. Real URL pattern is /sf-bay-area/. Restored.

import { readFile } from "node:fs/promises";
import type { Event } from "../../core/types.ts";
import type { SourceResult } from "./_template.ts";
import { buildNormalizedKey } from "../../core/dedupe.ts";
import { icsUid } from "../../core/ics-uid.ts";

const SOURCE_NAME = "todays-tix";
const PAGE_URL = "https://www.todaytix.com/sf-bay-area/category/all-shows";

// Listing has start dates only, no times. Theatre canonical = 7:30pm.
const THEATRE_DEFAULT_TIME = "19:30:00";

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

interface TheaterEventLd {
  "@type": string;
  name: string;
  url: string;
  description?: string;
  startDate?: string;       // "YYYY-MM-DD" or full ISO
  endDate?: string;
  eventStatus?: string;     // "https://schema.org/EventScheduled" | "EventCancelled" | ...
  location?: { name?: string };
  organizer?: { name?: string };
  performer?: { name?: string };
}

// Decode HTML entities the LD JSON sometimes carries through (e.g. "Hell&apos;s Kitchen")
function decodeEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

export function parseJsonLd(
  jsonText: string,
  aliases: VenueAliasMap,
): Event[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const arr = Array.isArray(parsed) ? parsed : [];
  const out: Event[] = [];

  for (const raw of arr) {
    const e = raw as TheaterEventLd;
    if (e["@type"] !== "TheaterEvent" && e["@type"] !== "Event") continue;
    if (!e.name || !e.url || !e.startDate) continue;

    const title = decodeEntities(e.name);
    const venue = decodeEntities(e.location?.name ?? e.organizer?.name ?? "Unknown venue");
    const description = decodeEntities(e.description ?? "");

    // startDate is "YYYY-MM-DD" — pad with default theatre time
    const startIsoLocal = `${e.startDate.slice(0, 10)}T${THEATRE_DEFAULT_TIME}`;
    const endIsoLocal = e.endDate
      ? `${e.endDate.slice(0, 10)}T${THEATRE_DEFAULT_TIME}`
      : null;

    const normalized_key = buildNormalizedKey(title, startIsoLocal, venue, aliases);

    out.push({
      url: e.url,
      title,
      start: startIsoLocal,
      end: endIsoLocal,
      venue,
      description,
      source: SOURCE_NAME,
      normalized_key,
      ics_uid: icsUid(normalized_key),
      start_was_estimated: true, // listing has no time; we default to 7:30pm
    });
  }

  return out;
}

// Extract all <script type="application/ld+json"> contents from raw HTML, concat as
// one JSON array string, and parseJsonLd() it. This separation lets tests run against
// either pre-extracted JSON (smaller fixture) or full raw HTML.
export function extractLdFromHtml(html: string): string {
  const out: unknown[] = [];
  // Lightweight regex extractor — avoids a full HTML parser dep for one job.
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]!.trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // skip malformed JSON-LD blocks
    }
  }
  return JSON.stringify(out);
}

export async function fetchHtml(): Promise<string> {
  // TODO: wire playwright in the headed-browser batch
  throw new Error(
    "fetchHtml not yet implemented — install playwright and use page.goto + page.content()",
  );
}

export async function run(): Promise<SourceResult> {
  try {
    const html = await fetchHtml();
    const ldJson = extractLdFromHtml(html);
    const aliasesJson = await readFile(
      new URL("../../venues.json", import.meta.url),
      "utf-8",
    );
    const aliases: VenueAliasMap = JSON.parse(aliasesJson);
    return { events: parseJsonLd(ldJson, aliases), failed: false };
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
  url: PAGE_URL,
  parserType: "headed-browser" as const,
  // Note: prefer JSON-LD over HTML-card scraping. Stable across MUI redesigns.
};
