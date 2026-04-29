// CLI entry: bun run digest --user pyay [--replay YYYY-MM-DD] [--dry-run]

import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    user: { type: "string", default: "pyay" },
    replay: { type: "string" },              // YYYY-MM-DD; loads snapshots/<date>/events.json
    "dry-run": { type: "boolean", default: false },
  },
});

const user = values.user!;
const replay = values.replay;
const dryRun = values["dry-run"] ?? false;

console.log(`sf-week digest for user=${user} replay=${replay ?? "none"} dry-run=${dryRun}`);

// TODO: full pipeline
// 1. Load users/${user}/taste.md
// 2. If replay: load snapshots/${replay}/events.json
//    Else: run all sources/sf/*, dedupe, write events.json
// 3. core/grader.ts grade(taste, events) → ratings
// 4. Pick slots (3-per-vertical cap, >=6/10 floor, 9 max + 1-3 block_now)
// 5. Render email HTML + .ics (writes docs/calendar.ics)
// 6. If dryRun: print HTML to stdout, exit
//    Else: send email via Resend, write snapshots/<today>/events.json
// 7. Cron commits docs/calendar.ics + events.json + snapshots/ back to main

throw new Error("pipeline not yet implemented — see README.md and design doc");
