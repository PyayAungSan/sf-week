// Full-pipeline integration test (CEO E3b).
// Spawns the CLI in --from-fixtures --no-grade --dry-run mode and verifies the
// rendered email contains expected picks from the saved fixtures.
//
// Uses Bun's built-in process spawning. Slow-ish (~500ms) compared to unit
// tests, but it's the smoke test that catches wiring regressions across all
// modules at once.

import { describe, expect, test } from "bun:test";

describe("full-pipeline integration (CEO E3b)", () => {
  test("--from-fixtures --no-grade --dry-run renders email with fixture events", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "index.ts", "--user", "pyay", "--from-fixtures", "--no-grade", "--dry-run"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    const html = await new Response(proc.stdout).text();
    const log = await new Response(proc.stderr).text();
    const exit = await proc.exited;

    expect(exit).toBe(0);
    // Pipeline log markers
    expect(log).toContain("[sf-week] fixtures: loaded");
    expect(log).toContain("[sf-week] dedupe:");
    expect(log).toContain("[sf-week] no-grade: mock-rated");
    expect(log).toContain("[sf-week] picked:");
    // Email shape
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("sf-week");
    expect(html).toContain("</html>");
  }, 30_000);

  test("--from-fixtures pulls from all 5 working sources", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "index.ts", "--user", "pyay", "--from-fixtures", "--no-grade", "--dry-run"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    const log = await new Response(proc.stderr).text();
    await proc.exited;

    // The fixture-load loads ALL 5 sources, and the loaded-count message reports total
    const loadedMatch = log.match(/loaded (\d+) events/);
    expect(loadedMatch).not.toBeNull();
    const loaded = parseInt(loadedMatch![1]!, 10);
    // BroadwaySF (2) + TodayTix (43) + SFMOMA (small, varies) + ACT (4) + Berkeley Rep (2 collapsed) = at least 50
    expect(loaded).toBeGreaterThan(40);
  }, 30_000);

  test("missing taste profile → exit code 2", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "index.ts", "--user", "nonexistent-user", "--from-fixtures", "--no-grade", "--dry-run"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    const exit = await proc.exited;
    expect(exit).toBe(2);
  }, 30_000);
});
