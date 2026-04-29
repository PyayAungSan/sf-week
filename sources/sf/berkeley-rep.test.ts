import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  collapsePerformances,
  extractShowUrls,
  extractPerformanceLd,
} from "./berkeley-rep.ts";
import type { VenueAliasMap } from "./berkeley-rep.ts";

const FIXTURE: { shows: Array<{ url: string; events: Record<string, unknown>[] }> } =
  JSON.parse(
    readFileSync(
      new URL("../../test/fixtures/berkeley-rep-shows.json", import.meta.url),
      "utf-8",
    ),
  );
const SEASON_HTML = readFileSync(
  new URL("../../test/fixtures/berkeley-rep-season.html", import.meta.url),
  "utf-8",
);
const aliases: VenueAliasMap = JSON.parse(
  readFileSync(new URL("../../venues.json", import.meta.url), "utf-8"),
);

describe("berkeley-rep extractShowUrls", () => {
  test("finds /shows/<slug> urls from season page", () => {
    const urls = extractShowUrls(SEASON_HTML);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\/www\.berkeleyrep\.org\/shows\/[a-z0-9-]+$/);
    }
  });

  test("includes The Monsters and The Lunchbox", () => {
    const urls = extractShowUrls(SEASON_HTML);
    const slugs = urls.map((u) => u.split("/").pop()!);
    expect(slugs.some((s) => s.startsWith("the-monsters"))).toBe(true);
    expect(slugs.some((s) => s.startsWith("the-lunchbox"))).toBe(true);
  });

  test("returns empty on empty html (E1.2 #2)", () => {
    expect(extractShowUrls("")).toEqual([]);
  });
});

describe("berkeley-rep collapsePerformances", () => {
  test("collapses 43 Monsters performances into one Event", () => {
    const monsters = FIXTURE.shows.find((s) => s.url.includes("monsters"))!;
    const event = collapsePerformances(
      monsters.events as never,
      monsters.url,
      aliases,
    );
    expect(event).not.toBeNull();
    expect(event!.title).toBe("The Monsters");
    expect(event!.venue).toBe("Peet’s Theatre");
    expect(event!.source).toBe("berkeley-rep");
    expect(event!.start).toMatch(/^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(event!.end).toMatch(/^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(event!.start <= event!.end!).toBe(true);
  });

  test("Lunchbox parses with 47 perf entries", () => {
    const lunchbox = FIXTURE.shows.find((s) => s.url.includes("lunchbox"))!;
    expect(lunchbox.events.length).toBe(47);
    const event = collapsePerformances(
      lunchbox.events as never,
      lunchbox.url,
      aliases,
    );
    expect(event).not.toBeNull();
    expect(event!.title).toBe("The Lunchbox");
  });

  test("returns null on empty input (E1.2 #2)", () => {
    expect(collapsePerformances([], "https://x", aliases)).toBeNull();
  });

  test("returns null when no Event types present", () => {
    expect(
      collapsePerformances(
        [{ "@type": "Organization", name: "BR" } as never],
        "https://x",
        aliases,
      ),
    ).toBeNull();
  });

  test("uid stability across calls", () => {
    const monsters = FIXTURE.shows.find((s) => s.url.includes("monsters"))!;
    const a = collapsePerformances(
      monsters.events as never,
      monsters.url,
      aliases,
    );
    const b = collapsePerformances(
      monsters.events as never,
      monsters.url,
      aliases,
    );
    expect(a!.ics_uid).toBe(b!.ics_uid);
  });
});

describe("berkeley-rep extractPerformanceLd", () => {
  test("pulls Event entries from a fake show-page HTML", () => {
    const html = `<html>
<script type="application/ld+json">${JSON.stringify({
      "@type": "Event",
      name: "X",
      startDate: "2026-06-01T19:00:00-0700",
    })}</script>
<script type="application/ld+json">${JSON.stringify({
      "@type": "BreadcrumbList",
    })}</script>
</html>`;
    const events = extractPerformanceLd(html);
    expect(events.length).toBe(1);
    expect(events[0]!.name).toBe("X");
  });

  test("returns empty on empty/garbage html", () => {
    expect(extractPerformanceLd("")).toEqual([]);
    expect(extractPerformanceLd("<html></html>")).toEqual([]);
  });
});
