# sf-week

Personal SF city-event digest. Sunday morning email + `.ics` calendar feed, LLM-graded picks against a plain-English taste profile.

## Quick reference

- **Design doc:** `~/.gstack/projects/garrytan-gstack/pyayaungsan-city-event-planner-design-20260428-230645.md`
- **CEO plan:** `~/.gstack/projects/garrytan-gstack/ceo-plans/2026-04-28-city-event-planner.md`
- **Test plan:** `~/.gstack/projects/garrytan-gstack/pyayaungsan-city-event-planner-eng-review-test-plan-*.md`

## Architecture

```
sf-week/
├── core/                # the durable asset: taste model + grader
├── users/pyay/          # taste.md (the entire product)
├── sources/sf/          # 11 source parsers, codified via /skillify
├── outputs/             # email.ts (Resend), ics.ts (calendar feed)
├── snapshots/           # weekly events.json snapshots for --replay
├── docs/                # GitHub Pages serves calendar.ics from here
└── .github/workflows/   # cron runs Sunday 17:00 UTC
```

## Commands

```bash
bun install
bun run digest --user pyay --dry-run   # print email HTML to stdout, no send
bun run digest --user pyay --replay 2026-05-04   # re-run against past snapshot
bun test                                # run all tests (free, <5s)
```

## Config

- `users/pyay/taste.md` — the taste profile (the product)
- `sources.json` — source URLs grouped by parser type (api/static-html/headed-browser)
- `venues.json` — venue alias map for fuzzy dedupe

## Secrets (GitHub Actions)

- `ANTHROPIC_API_KEY` — for the LLM grader
- `RESEND_API_KEY` — for sending the weekly email
