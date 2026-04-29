// Asian Art Museum parser. Source: calendar.asianart.org
// Custom Drupal/WordPress theme using <article class="card" data-time="<unix>">
// for each event. data-time is Unix seconds since epoch (UTC).

import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import type { Event } from "../../core/types.ts";
import type { SourceResult } from "./_template.ts";
import { buildNormalizedKey } from "../../core/dedupe.ts";
import { icsUid } from "../../core/ics-uid.ts";
import { utcToLocal } from "./magic-theatre.ts";

const SOURCE_NAME = "asian-art";
const PAGE_URL = "https://calendar.asianart.org/";
const VENUE = "Asian Art Museum";

export interface VenueAliasMap {
  aliases: Record<string, string>;
}

// Convert Unix seconds (UTC) → naive America/Los_Angeles ISO
function unixToLocal(seconds: number): string {
  const d = new Date(seconds * 1000);
  // utcToLocal expects naive UTC ISO without Z
  const iso = d.toISOString().replace(/\.\d+Z$/, "");
  return utcToLocal(iso);
}

export function parseHtml(html: string, aliases: VenueAliasMap): Event[] {
  const $ = cheerio.load(html);
  const out: Event[] = [];
  const seen = new Set<string>();

  $("article.card[data-time]").each((_, el) => {
    const card = $(el);
    const dataTime = card.attr("data-time");
    if (!dataTime) return;
    const seconds = parseInt(dataTime, 10);
    if (isNaN(seconds) || seconds <= 0) return;

    const titleEl = card.find("a.card__title").first();
    const title = titleEl.text().replace(/\s+/g, " ").trim();
    const url = titleEl.attr("href") ?? "";
    if (!title || !url) return;

    // Skip the same event repeated across slider sections
    if (seen.has(url)) return;
    seen.add(url);

    const supertitle = card.find(".card__supertitle").first().text().trim();

    const start = unixToLocal(seconds);
    const normalized_key = buildNormalizedKey(title, start, VENUE, aliases);

    out.push({
      url,
      title,
      start,
      end: null,
      venue: VENUE,
      description: supertitle, // category (e.g. "Exhibition Tour")
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
  if (!r.ok) throw new Error(`Asian Art fetch ${r.status}`);
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
