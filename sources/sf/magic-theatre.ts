// Magic Theatre parser. Source: magictheatre.org/calendar
// Squarespace site. Each event card embeds a Google Calendar export link with
// title + UTC start/end in the URL params — cleanest data source on the page.
//
// We parse those gcal links (one per card), pair each with the card's primary
// /calendar/<slug> URL, convert UTC → America/Los_Angeles naive ISO.

import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import type { Event } from "../../core/types.ts";
import type { SourceResult } from "./_template.ts";
import { buildNormalizedKey } from "../../core/dedupe.ts";
import { icsUid } from "../../core/ics-uid.ts";

const SOURCE_NAME = "magic-theatre";
const PAGE_URL = "https://magictheatre.org/calendar";
const VENUE = "Magic Theatre";

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

// Parse "20260501T030000Z" → "2026-05-01T03:00:00" (naive UTC, no Z)
function gcalToUtcIso(s: string): string | null {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

// Convert naive UTC ISO → naive America/Los_Angeles ISO (handles DST automatically).
export function utcToLocal(utcIso: string): string {
  const d = new Date(utcIso + "Z");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  // Intl returns "24" for midnight in some Node versions
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

export function parseHtml(html: string, aliases: VenueAliasMap): Event[] {
  const $ = cheerio.load(html);
  const out: Event[] = [];

  $("article.eventlist-event, .eventlist-event").each((_, el) => {
    const card = $(el);

    const detail = card
      .find('a[href^="/calendar/"]:not([href*="?format=ical"])')
      .first()
      .attr("href");
    if (!detail) return;
    const url = detail.startsWith("http")
      ? detail
      : `https://magictheatre.org${detail}`;

    const gcal = card
      .find('a[href*="google.com/calendar/event"]')
      .first()
      .attr("href");
    if (!gcal) return;
    let parsed: URL;
    try {
      parsed = new URL(gcal);
    } catch {
      return;
    }
    const text = (parsed.searchParams.get("text") ?? "").trim();
    const dates = parsed.searchParams.get("dates") ?? "";
    if (!text || !dates) return;

    const [startUtcRaw, endUtcRaw] = dates.split("/");
    if (!startUtcRaw) return;
    const startUtc = gcalToUtcIso(startUtcRaw);
    const endUtc = endUtcRaw ? gcalToUtcIso(endUtcRaw) : null;
    if (!startUtc) return;

    const start = utcToLocal(startUtc);
    const end = endUtc ? utcToLocal(endUtc) : null;
    const title = text.replace(/\s+/g, " ").trim();

    const normalized_key = buildNormalizedKey(title, start, VENUE, aliases);

    out.push({
      url,
      title,
      start,
      end,
      venue: VENUE,
      description: "",
      source: SOURCE_NAME,
      normalized_key,
      ics_uid: icsUid(normalized_key),
    });
  });

  return out;
}

export async function fetchHtml(): Promise<string> {
  const r = await fetch(PAGE_URL, {
    headers: { "user-agent": "Mozilla/5.0 (sf-week digest)" },
  });
  if (!r.ok) throw new Error(`Magic Theatre fetch ${r.status}`);
  return r.text();
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
