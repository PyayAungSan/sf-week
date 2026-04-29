// SFMOMA events parser. Source: https://www.sfmoma.org/events/
// Strategy: parse HTML cards. JSON-LD on this page lacks event entries.
// Cards use stable archive--grid-wrapper-* classes (museum CMS pattern).
//
// Note: SFMOMA's /calendar/ URL is "What's On View" (exhibitions), NOT events.
// Use /events/ for the event listing.

import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import type { Event } from "../../core/types.ts";
import type { SourceResult } from "./_template.ts";
import { buildNormalizedKey } from "../../core/dedupe.ts";
import { icsUid } from "../../core/ics-uid.ts";

const SOURCE_NAME = "sfmoma";
const PAGE_URL = "https://www.sfmoma.org/events/";
const VENUE = "SFMOMA";
// Art opening canonical = 6pm (per design doc ambiguous-time policy).
const ART_DEFAULT_TIME = "18:00:00";

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

export function parseHtml(html: string, aliases: VenueAliasMap): Event[] {
  const $ = cheerio.load(html);
  const out: Event[] = [];

  $(".archive--type-event").each((_, el) => {
    const card = $(el);

    const link = card.find("a.archive--grid-wrapper-grid-item-link").first();
    const url = link.attr("href");
    if (!url) return;

    const title = card
      .find(".archive--grid-wrapper-grid-item-text-title")
      .first()
      .text()
      .trim();
    if (!title) return;

    const dateStr = card
      .find(".archive--grid-wrapper-grid-item-text-subtitle")
      .first()
      .text()
      .trim();
    const start = parseDateString(dateStr);
    if (!start) return;

    const description = card
      .find(".archive--grid-wrapper-grid-item-text-description")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const normalized_key = buildNormalizedKey(title, start, VENUE, aliases);

    out.push({
      url,
      title,
      start,
      end: null,
      venue: VENUE,
      description,
      source: SOURCE_NAME,
      normalized_key,
      ics_uid: icsUid(normalized_key),
      start_was_estimated: true, // listing has no time; we default to 6pm
    });
  });

  return out;
}

// Handles "Wednesday, Apr 29, 2026" and ranges like "Wednesday, Apr 29 - Friday, May 1, 2026"
export function parseDateString(s: string): string | null {
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, " ").trim();
  const yearMatch = cleaned.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const year = yearMatch[1]!;

  const firstPart = cleaned.split(" - ")[0]!.trim();
  const partWithYear = /\b20\d{2}\b/.test(firstPart)
    ? firstPart
    : `${firstPart}, ${year}`;

  const parsed = new Date(`${partWithYear} ${ART_DEFAULT_TIME}`);
  if (isNaN(parsed.getTime())) return null;

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${ART_DEFAULT_TIME}`;
}

export async function fetchHtml(): Promise<string> {
  // Static-HTML site — could use plain fetch + cheerio (no JS render needed).
  // Wire in the next implementation pass.
  throw new Error("fetchHtml not yet implemented — use plain fetch on this static page");
}

export async function run(): Promise<SourceResult> {
  try {
    const html = await fetchHtml();
    const aliasesJson = await readFile(
      new URL("../../venues.json", import.meta.url),
      "utf-8",
    );
    const aliases: VenueAliasMap = JSON.parse(aliasesJson);
    return { events: parseHtml(html, aliases), failed: false };
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
  parserType: "static-html" as const,
};
