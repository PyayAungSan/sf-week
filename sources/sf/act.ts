// ACT (American Conservatory Theater) parser. Source: act-sf.org
// Two-stage flow:
//   1. Fetch the season landing page (e.g. /whats-on/2025-26-season)
//   2. extractShowUrls() returns each show's individual page URL
//   3. For each show URL, fetch and parseShowJsonLd() the schema.org Event
// Show pages have clean JSON-LD with startDate, endDate (full ISO with offset),
// and location. Listing page has only links + nav.

import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import type { Event } from "../../core/types.ts";
import type { SourceResult } from "./_template.ts";
import { buildNormalizedKey } from "../../core/dedupe.ts";
import { icsUid } from "../../core/ics-uid.ts";

const SOURCE_NAME = "act";
const SEASON_URL = "https://www.act-sf.org/whats-on/2025-26-season";

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

interface ShowJsonLd {
  "@type": string;
  name: string;
  startDate?: string; // full ISO with offset like "2026-04-22T18:00:00-0700"
  endDate?: string;
  location?: { name?: string; address?: string };
  description?: string;
}

// Find show URLs from the season landing page. Pattern:
//   /whats-on/<season>/<show-slug>
// Skips season-only nav, subscriber, conservatory, etc.
const NON_SHOW_SLUGS = new Set([
  "subscriber-benefits",
  "conservatory-shows",
  "limited-engagements",
  "family-friendly-productions",
  "interact-events",
  "gift-certificates",
]);

export function extractShowUrls(seasonHtml: string, seasonPath: string): string[] {
  const $ = cheerio.load(seasonHtml);
  const urls = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    // Normalize to absolute URL within act-sf.org
    let url: URL;
    try {
      url = new URL(href, "https://www.act-sf.org");
    } catch {
      return;
    }
    if (url.host !== "www.act-sf.org") return;
    if (!url.pathname.startsWith(seasonPath + "/")) return;
    const slug = url.pathname.slice(seasonPath.length + 1).replace(/\/$/, "");
    if (!slug || slug.includes("/") || NON_SHOW_SLUGS.has(slug)) return;
    urls.add(url.toString());
  });
  return Array.from(urls).sort();
}

// Parses a single show's JSON-LD Event into our Event shape, or null if invalid.
export function parseShowJsonLd(
  jsonText: string,
  url: string,
  aliases: VenueAliasMap,
): Event | null {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return null;
  }
  // Some sites array-wrap; ACT does not, but be defensive.
  const ld = (Array.isArray(raw) ? raw[0] : raw) as ShowJsonLd | undefined;
  if (!ld || ld["@type"] !== "Event" || !ld.name || !ld.startDate) return null;

  const title = ld.name.trim();
  const venue = (ld.location?.name ?? "American Conservatory Theater").trim();
  const description = (ld.description ?? "").replace(/\s+/g, " ").trim();

  // Strip TZ offset; we store local-time naive ISO (TZ pinned by VTIMEZONE downstream).
  const start = stripOffsetToNaive(ld.startDate);
  const end = ld.endDate ? stripOffsetToNaive(ld.endDate) : null;
  if (!start) return null;

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

// "2026-04-22T18:00:00-0700" → "2026-04-22T18:00:00"
// Already naive → unchanged. Returns null on garbage.
export function stripOffsetToNaive(iso: string): string | null {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  return m ? m[1]! : null;
}

// Test entrypoint: takes a pre-fetched array of {url, json} pairs, returns Event[].
// Decouples parsing from fetching for testability.
export function parseShows(
  shows: Array<{ url: string; jsonLd: string }>,
  aliases: VenueAliasMap,
): Event[] {
  const out: Event[] = [];
  for (const { url, jsonLd } of shows) {
    const e = parseShowJsonLd(jsonLd, url, aliases);
    if (e) out.push(e);
  }
  return out;
}

export async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (sf-week digest)" },
  });
  if (!r.ok) throw new Error(`ACT fetch ${url} -> ${r.status}`);
  return r.text();
}

export async function run(): Promise<SourceResult> {
  try {
    const seasonHtml = await fetchHtml(SEASON_URL);
    const seasonPath = new URL(SEASON_URL).pathname;
    const showUrls = extractShowUrls(seasonHtml, seasonPath);

    const aliasesJson = await readFile(
      new URL("../../venues.json", import.meta.url),
      "utf-8",
    );
    const aliases: VenueAliasMap = JSON.parse(aliasesJson);

    const events: Event[] = [];
    for (const url of showUrls) {
      try {
        const showHtml = await fetchHtml(url);
        const ldMatch = showHtml.match(
          /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
        );
        if (!ldMatch) continue;
        const e = parseShowJsonLd(ldMatch[1]!, url, aliases);
        if (e) events.push(e);
      } catch {
        // skip individual show fetch failures, keep going
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
