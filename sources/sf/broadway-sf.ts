// BroadwaySF parser. Source: https://www.broadwaysf.com/events
// Page is JS-rendered (React app, redirects to ATG Tickets).
// In production: fetch with playwright or call the ATG endpoint.
// In tests: feed parseHtml() the saved fixture from test/fixtures/broadway-sf.html.

import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import type { Event } from "../../core/types.ts";
import type { SourceResult } from "./_template.ts";
import { buildNormalizedKey } from "../../core/dedupe.ts";
import { icsUid } from "../../core/ics-uid.ts";

const SOURCE_NAME = "broadway-sf";
const PAGE_URL = "https://www.broadwaysf.com/events";
const ATG_BASE = "https://us.atgtickets.com";

// Fallback start time when the listing only gives a date.
// Theatre canonical = 7:30pm (per design doc: ambiguous-time policy).
const THEATRE_DEFAULT_TIME = "19:30:00";

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

export function parseHtml(html: string, aliases: VenueAliasMap): Event[] {
  const $ = cheerio.load(html);
  const out: Event[] = [];

  $("[data-testid=\"showCard\"]").each((_, el) => {
    const card = $(el);

    // URL: first /events/<slug>/<venue>/ link, drop the /calendar/ variants
    const href = card
      .find("a[href*=\"/events/\"]")
      .map((_, a) => $(a).attr("href"))
      .get()
      .find((h) => h && !h.endsWith("/calendar/"));
    if (!href) return;
    const url = href.startsWith("http") ? href : ATG_BASE + href;

    // Title: visible h2 (skip the SR-only first h2)
    const title = card.find("h2.MuiTypography-root").first().text().trim();
    if (!title) return;

    // <p> texts in order: ["Events" label, subtitle, venue, date]
    const ps = card
      .find("p.MuiTypography-root")
      .map((_, p) => $(p).text().trim())
      .get()
      .filter((t) => t.length > 0 && t !== "Events");
    if (ps.length < 3) return;

    const subtitle = ps[0]!;
    const venue = ps[1]!;
    const dateStr = ps[2]!;

    const start = parseDateString(dateStr);
    if (!start) return;

    const normalized_key = buildNormalizedKey(title, start, venue, aliases);

    out.push({
      url,
      title,
      start,
      end: null,
      venue,
      description: subtitle,
      source: SOURCE_NAME,
      normalized_key,
      ics_uid: icsUid(normalized_key),
      start_was_estimated: true, // listing has no time; we fall back to 7:30pm
    });
  });

  return out;
}

// Handles "Sun, May 3, 2026" and "Fri, May 15 - Sun, May 17, 2026"
// Returns ISO 8601 local-time string (America/Los_Angeles convention).
export function parseDateString(s: string): string | null {
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, " ").trim();

  // Year may live only at the end of a range like "Fri, May 15 - Sun, May 17, 2026"
  const yearMatch = cleaned.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const year = yearMatch[1]!;

  // Take the first date piece
  const firstPart = cleaned.split(" - ")[0]!.trim();

  // Ensure year is present in the part we parse
  const partWithYear = /\b20\d{2}\b/.test(firstPart)
    ? firstPart
    : `${firstPart}, ${year}`;

  const parsed = new Date(`${partWithYear} ${THEATRE_DEFAULT_TIME}`);
  if (isNaN(parsed.getTime())) return null;

  // Format as ISO 8601 local (no Z, no offset — TZ implied by VTIMEZONE in .ics)
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${THEATRE_DEFAULT_TIME}`;
}

export async function fetchHtml(): Promise<string> {
  // TODO: wire playwright when the rest of the pipeline is built.
  // For now this throws — production runs come later. Tests use parseHtml directly.
  throw new Error(
    "fetchHtml not yet implemented — install playwright and use page.goto + page.content()"
  );
}

export async function run(): Promise<SourceResult> {
  try {
    const html = await fetchHtml();
    const aliasesJson = await readFile(
      new URL("../../venues.json", import.meta.url),
      "utf-8"
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

// Re-exported for the production source registry
export const SOURCE_INFO = {
  name: SOURCE_NAME,
  url: PAGE_URL,
  parserType: "headed-browser" as const,
};
