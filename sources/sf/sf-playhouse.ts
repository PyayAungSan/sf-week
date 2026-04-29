// SF Playhouse parser. Source: sfplayhouse.org
// Two-stage:
//   1. Fetch /2025-2026-season/ → extractShowUrls()
//   2. For each show URL, fetch and parseShowHtml()
// No JSON-LD Event entries on show pages — date range lives in the visible
// page text (e.g. "MARCH 26 – MAY 2, 2026"). Title from h1.

import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import type { Event } from "../../core/types.ts";
import type { SourceResult } from "./_template.ts";
import { buildNormalizedKey } from "../../core/dedupe.ts";
import { icsUid } from "../../core/ics-uid.ts";

const SOURCE_NAME = "sf-playhouse";
const SEASON_URL = "https://www.sfplayhouse.org/2025-2026-season/";
const VENUE = "San Francisco Playhouse";
const THEATRE_DEFAULT_TIME = "19:30:00";

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

export function extractShowUrls(seasonHtml: string): string[] {
  const $ = cheerio.load(seasonHtml);
  const urls = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    let url: URL;
    try {
      url = new URL(href, "https://www.sfplayhouse.org");
    } catch {
      return;
    }
    if (url.host !== "www.sfplayhouse.org") return;
    if (!/^\/2025-2026-season\/[a-z0-9-]+\/?$/i.test(url.pathname)) return;
    urls.add(url.toString().replace(/\/$/, "") + "/");
  });
  return Array.from(urls).sort();
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

// Parses date ranges in either of these formats:
//   - "MAR 26, 2026 – MAY 2, 2026"  (year on both dates — current SF Playhouse format)
//   - "MARCH 26 – MAY 2, 2026"      (year only on end date)
//   - "March 26 - May 2, 2026"      (ascii hyphen, mixed case)
// Returns {start, end} as naive ISO local strings, or null on no match.
export function parseDateRange(text: string): { start: string; end: string } | null {
  // Format A: "MMM DD, YYYY – MMM DD, YYYY" (year on both dates)
  const reBoth =
    /([A-Za-z]+)\s+(\d{1,2}),\s*(20\d{2})\s*[–—\-]\s*([A-Za-z]+)\s+(\d{1,2}),\s*(20\d{2})/;
  const mB = text.match(reBoth);
  if (mB) {
    const startMonth = MONTHS[mB[1]!.toLowerCase()];
    const endMonth = MONTHS[mB[4]!.toLowerCase()];
    if (startMonth === undefined || endMonth === undefined) return null;
    const fmt = (y: number, mo: number, d: number) =>
      `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T${THEATRE_DEFAULT_TIME}`;
    return {
      start: fmt(parseInt(mB[3]!, 10), startMonth, parseInt(mB[2]!, 10)),
      end: fmt(parseInt(mB[6]!, 10), endMonth, parseInt(mB[5]!, 10)),
    };
  }

  // Format B: "MMM DD – MMM DD, YYYY" (year only on end)
  const reEnd = /([A-Za-z]+)\s+(\d{1,2})\s*[–—\-]\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(20\d{2})/;
  const m = text.match(reEnd);
  if (!m) return null;
  const startMonth = MONTHS[m[1]!.toLowerCase()];
  const endMonth = MONTHS[m[3]!.toLowerCase()];
  if (startMonth === undefined || endMonth === undefined) return null;
  const startDay = parseInt(m[2]!, 10);
  const endDay = parseInt(m[4]!, 10);
  const year = parseInt(m[5]!, 10);
  const startYear = startMonth > endMonth ? year - 1 : year;
  const fmt = (y: number, mo: number, d: number) =>
    `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T${THEATRE_DEFAULT_TIME}`;
  return { start: fmt(startYear, startMonth, startDay), end: fmt(year, endMonth, endDay) };
}

export function parseShowHtml(
  html: string,
  url: string,
  aliases: VenueAliasMap,
): Event | null {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim();
  if (!title) return null;

  // Strip script/style/noscript so their textContent does not pollute date matching
  $("script, style, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const range = parseDateRange(bodyText);
  if (!range) return null;

  // Description: first <p> after the date or a meta description as fallback
  const description =
    $('meta[name="description"]').attr("content")?.trim() ?? "";

  const normalized_key = buildNormalizedKey(title, range.start, VENUE, aliases);

  return {
    url,
    title,
    start: range.start,
    end: range.end,
    venue: VENUE,
    description,
    source: SOURCE_NAME,
    normalized_key,
    ics_uid: icsUid(normalized_key),
    start_was_estimated: true, // we default to 7:30pm; real showtimes vary
  };
}

export async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (sf-week digest)" },
  });
  if (!r.ok) throw new Error(`SF Playhouse fetch ${url} -> ${r.status}`);
  return r.text();
}

export async function run(): Promise<SourceResult> {
  try {
    const seasonHtml = await fetchHtml(SEASON_URL);
    const urls = extractShowUrls(seasonHtml);
    const aliasesJson = await readFile(
      new URL("../../venues.json", import.meta.url),
      "utf-8",
    );
    const aliases: VenueAliasMap = JSON.parse(aliasesJson);

    const events: Event[] = [];
    for (const url of urls) {
      try {
        const html = await fetchHtml(url);
        const e = parseShowHtml(html, url, aliases);
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
