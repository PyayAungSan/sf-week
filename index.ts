// CLI entry: bun run digest --user pyay [--replay YYYY-MM-DD] [--dry-run] [--from-fixtures] [--no-grade]

import { parseArgs } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Event, Rating, DigestResult } from "./core/types.ts";
import type { VenueAliasMap } from "./core/dedupe.ts";
import { dedupe } from "./core/dedupe.ts";
import { grade } from "./core/grader.ts";
import { pickDigest, defaultWindows } from "./core/picker.ts";
import { renderEmailHtml, renderEmailSubject, sendEmail } from "./outputs/email.ts";
import { renderIcs } from "./outputs/ics.ts";

import * as broadwaySf from "./sources/sf/broadway-sf.ts";
import * as todaysTix from "./sources/sf/todays-tix.ts";
import * as sfmoma from "./sources/sf/sfmoma.ts";
import * as act from "./sources/sf/act.ts";
import * as berkeleyRep from "./sources/sf/berkeley-rep.ts";

const ROOT = new URL(".", import.meta.url).pathname;

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    user: { type: "string", default: "pyay" },
    replay: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "from-fixtures": { type: "boolean", default: false },
    "no-grade": { type: "boolean", default: false },
  },
});

const user = values.user!;
const replay = values.replay;
const dryRun = values["dry-run"] ?? false;
const fromFixtures = values["from-fixtures"] ?? false;
const noGrade = values["no-grade"] ?? false;

console.error(
  `[sf-week] user=${user} replay=${replay ?? "none"} dry-run=${dryRun} from-fixtures=${fromFixtures} no-grade=${noGrade}`,
);

// ---------------------------------------------------------------------------
// 1. Load taste profile + venue aliases
// ---------------------------------------------------------------------------
const tasteFile = resolve(ROOT, "users", user, "taste.md");
if (!existsSync(tasteFile)) {
  console.error(`[sf-week] taste profile not found: ${tasteFile}`);
  process.exit(2);
}
const taste = await readFile(tasteFile, "utf-8");
const aliases: VenueAliasMap = JSON.parse(
  await readFile(resolve(ROOT, "venues.json"), "utf-8"),
);

// ---------------------------------------------------------------------------
// 2. Gather events
//    Sources:
//      - replay mode: load snapshots/<date>/events.json
//      - fixtures mode: load test/fixtures/* and parse via each source's parser
//      - default: live fetch via each source's fetchHtml()
// ---------------------------------------------------------------------------
let events: Event[];
let failedSources: string[] = [];

if (replay) {
  const snapPath = resolve(ROOT, "snapshots", replay, "events.json");
  if (!existsSync(snapPath)) {
    console.error(`[sf-week] snapshot not found: ${snapPath}`);
    process.exit(3);
  }
  events = JSON.parse(await readFile(snapPath, "utf-8"));
  console.error(`[sf-week] replay: loaded ${events.length} events from ${snapPath}`);
} else if (fromFixtures) {
  events = await loadFromFixtures(aliases, failedSources);
  console.error(`[sf-week] fixtures: loaded ${events.length} events`);
} else {
  events = await fetchLive(aliases, failedSources);
  console.error(`[sf-week] live: fetched ${events.length} events (${failedSources.length} sources failed)`);
}

// Dedupe across sources
const beforeDedupe = events.length;
events = dedupe(events);
if (beforeDedupe !== events.length) {
  console.error(`[sf-week] dedupe: ${beforeDedupe} → ${events.length}`);
}

// Persist to events.json (rolling 30-day store) unless dry-run
if (!dryRun && !replay) {
  await writeJson(resolve(ROOT, "events.json"), events);
}

// ---------------------------------------------------------------------------
// 3. Grade
// ---------------------------------------------------------------------------
let ratings: Rating[] = [];
let degraded = false;
if (noGrade) {
  // Mock: rate everything 7 with a placeholder why; useful for shape testing
  ratings = events.map((e) => ({
    event_url: e.url,
    rating: 7,
    why: "(no-grade mode — mock rating)",
    block_now: false,
  }));
  console.error(`[sf-week] no-grade: mock-rated ${ratings.length} events at 7/10`);
} else {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("[sf-week] ANTHROPIC_API_KEY not set — pass --no-grade to skip grading");
    process.exit(4);
  }
  console.error(`[sf-week] grading ${events.length} events via Claude...`);
  const start = Date.now();
  const result = await grade(taste, events);
  ratings = result.ratings;
  degraded = result.degraded;
  console.error(`[sf-week] grader: ${ratings.length} ratings, degraded=${degraded}, ${Date.now() - start}ms`);
}

// ---------------------------------------------------------------------------
// 4. Pick
// ---------------------------------------------------------------------------
const today = new Date();
const windows = defaultWindows(today);
const digest: DigestResult = pickDigest({
  events,
  ratings,
  windowStart: windows.start,
  windowEndThisWeek: windows.endThisWeek,
  windowEndBlockNow: windows.endBlockNow,
  failedSources,
  degraded,
});
console.error(`[sf-week] picked: ${digest.picks_this_week.length} this week + ${digest.block_now.length} block-now`);

// ---------------------------------------------------------------------------
// 5. Render email + .ics
// ---------------------------------------------------------------------------
const dateLabel = today.toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Los_Angeles",
});
const subject = renderEmailSubject(digest, dateLabel);
const html = renderEmailHtml(digest, dateLabel);
const ics = renderIcs(digest);

if (dryRun) {
  console.error(`[sf-week] dry-run — printing email HTML to stdout`);
  process.stdout.write(html);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 6. Production: write .ics, snapshot, send email
// ---------------------------------------------------------------------------
const icsPath = resolve(ROOT, "docs", "calendar.ics");
await mkdir(dirname(icsPath), { recursive: true });
await writeFile(icsPath, ics);
console.error(`[sf-week] wrote ${icsPath}`);

// Snapshot for --replay
const snapDate = today.toISOString().slice(0, 10);
const snapDir = resolve(ROOT, "snapshots", snapDate);
await mkdir(snapDir, { recursive: true });
await writeFile(resolve(snapDir, "events.json"), JSON.stringify(events, null, 2));
console.error(`[sf-week] wrote snapshot ${snapDir}/events.json`);

// Send email
const to = process.env["DIGEST_TO_EMAIL"];
if (!to) {
  console.error("[sf-week] DIGEST_TO_EMAIL not set — skipping send");
  process.exit(0);
}
console.error(`[sf-week] sending to ${to}...`);
await sendEmail(html, subject, { to });
console.error(`[sf-week] sent. subject="${subject}"`);

// ===========================================================================
// helpers
// ===========================================================================
async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function fetchLive(
  aliases: VenueAliasMap,
  failedSources: string[],
): Promise<Event[]> {
  const all: Event[] = [];

  // Static-HTML sources have working fetch
  for (const [name, mod] of [
    ["sfmoma", sfmoma],
    ["act", act],
    ["berkeley-rep", berkeleyRep],
  ] as const) {
    try {
      const result = await mod.run();
      if (result.failed) {
        failedSources.push(name);
        console.error(`[sf-week] ${name} failed: ${result.error}`);
      } else {
        all.push(...result.events);
        console.error(`[sf-week] ${name}: ${result.events.length} events`);
      }
    } catch (err) {
      failedSources.push(name);
      console.error(`[sf-week] ${name} threw: ${err}`);
    }
  }

  // JS-rendered sources need playwright; for now fall back to fixtures
  for (const [name, mod, fixtureFile] of [
    ["broadway-sf", broadwaySf, "broadway-sf.html"],
    ["todays-tix", todaysTix, "todays-tix-sf.json"],
  ] as const) {
    void mod; // type usage
    try {
      const fx = await loadFixture(fixtureFile);
      const events =
        name === "todays-tix"
          ? todaysTix.parseJsonLd(fx, aliases)
          : broadwaySf.parseHtml(fx, aliases);
      all.push(...events);
      console.error(`[sf-week] ${name}: ${events.length} events (from fixture; install playwright for live)`);
    } catch (err) {
      failedSources.push(name);
      console.error(`[sf-week] ${name} fixture-load threw: ${err}`);
    }
  }

  return all;
}

async function loadFromFixtures(
  aliases: VenueAliasMap,
  failedSources: string[],
): Promise<Event[]> {
  const all: Event[] = [];
  // BroadwaySF
  try {
    const html = await loadFixture("broadway-sf.html");
    all.push(...broadwaySf.parseHtml(html, aliases));
  } catch (err) {
    failedSources.push("broadway-sf");
    console.error(`[sf-week] broadway-sf fixture: ${err}`);
  }
  // TodayTix
  try {
    const json = await loadFixture("todays-tix-sf.json");
    all.push(...todaysTix.parseJsonLd(json, aliases));
  } catch (err) {
    failedSources.push("todays-tix");
    console.error(`[sf-week] todays-tix fixture: ${err}`);
  }
  // SFMOMA
  try {
    const html = await loadFixture("sfmoma.html");
    all.push(...sfmoma.parseHtml(html, aliases));
  } catch (err) {
    failedSources.push("sfmoma");
    console.error(`[sf-week] sfmoma fixture: ${err}`);
  }
  // ACT — fixture is an array of show JSON-LDs
  try {
    const showsJson = await loadFixture("act-shows.json");
    const shows = JSON.parse(showsJson) as Array<{ name: string }>;
    const pairs = shows.map((s, i) => ({
      url: `https://www.act-sf.org/whats-on/2025-26-season/show-${i}`,
      jsonLd: JSON.stringify(s),
    }));
    all.push(...act.parseShows(pairs, aliases));
  } catch (err) {
    failedSources.push("act");
    console.error(`[sf-week] act fixture: ${err}`);
  }
  // Berkeley Rep — fixture is {shows: [{url, events: [...]}]}
  try {
    const json = await loadFixture("berkeley-rep-shows.json");
    const fx = JSON.parse(json) as { shows: Array<{ url: string; events: unknown[] }> };
    for (const show of fx.shows) {
      const e = berkeleyRep.collapsePerformances(
        show.events as never,
        show.url,
        aliases,
      );
      if (e) all.push(e);
    }
  } catch (err) {
    failedSources.push("berkeley-rep");
    console.error(`[sf-week] berkeley-rep fixture: ${err}`);
  }
  return all;
}

async function loadFixture(name: string): Promise<string> {
  return readFile(resolve(ROOT, "test", "fixtures", name), "utf-8");
}
