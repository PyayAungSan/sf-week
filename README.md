# sf-week

Personal SF city-event digest. Sunday morning email + `.ics` calendar feed, LLM-graded picks against a plain-English taste profile.

## Quick start

```bash
bun install                                              # one-time
bun run digest --user pyay --no-grade --dry-run          # see the pipeline shape
bun run digest --user pyay --from-fixtures --no-grade --dry-run  # offline shape test
```

That last command works from a clean checkout with no API keys, no network. It loads from `test/fixtures/`, mock-rates everything 7/10, and prints the email HTML to stdout.

To see real LLM-graded picks:

```bash
export ANTHROPIC_API_KEY=...
bun run digest --user pyay --no-grade --dry-run          # live fetch, mock grading (free)
bun run digest --user pyay --dry-run                     # live fetch + real grading (~pennies)
```

## Status

**Working today (8/11 sources, live fetch + tests passing):**

| Source | URL | Strategy |
|---|---|---|
| sfmoma | sfmoma.org/events/ | live fetch + cheerio cards |
| act | act-sf.org/whats-on/2025-26-season | live fetch + per-show JSON-LD |
| berkeley-rep | berkeleyrep.org/season/ | live fetch + collapsed per-perf JSON-LD |
| sf-playhouse | sfplayhouse.org/2025-2026-season/ | live fetch + date-range regex |
| magic-theatre | magictheatre.org/calendar | live fetch + gcal URL params |
| asian-art | calendar.asianart.org/ | live fetch + data-time Unix |
| broadway-sf | broadwaysf.com/events | fixture-backed (needs playwright for live) |
| todays-tix | todaytix.com/sf-bay-area | fixture-backed (needs playwright for live) |

**TODO (3/11):** famsf, bampfa, luma — see `sources.json` for per-source status.

**Dropped:** hyperallergic — no flat SF-events listing exists.

## Architecture

```
sf-week/
├── core/
│   ├── types.ts            # Event, Rating, DigestResult schemas
│   ├── grader.ts           # Anthropic SDK call + degraded-mode wrapper
│   ├── prompt.ts           # cached system prompt
│   ├── dedupe.ts           # URL + fuzzy normalized_key dedupe
│   ├── ics-uid.ts          # stable UID = sha1(normalized_key)
│   └── picker.ts           # 9-cap, 3/vertical, ≥6/10 floor, block_now
├── users/pyay/
│   └── taste.md            # the entire product — edit to retune picks
├── sources/sf/
│   ├── _template.ts        # interface for new sources
│   ├── broadway-sf.ts      ├── todays-tix.ts
│   ├── sfmoma.ts           ├── act.ts
│   ├── berkeley-rep.ts     ├── sf-playhouse.ts
│   ├── magic-theatre.ts    └── asian-art.ts
├── outputs/
│   ├── email.ts            # HTML + Resend send
│   └── ics.ts              # VCALENDAR + VTIMEZONE
├── snapshots/<YYYY-MM-DD>/
│   └── events.json         # weekly snapshot for --replay
├── docs/
│   └── calendar.ics        # generated weekly, served by GitHub Pages
└── .github/workflows/
    └── digest.yml          # cron, Sunday 17:00 UTC
```

## CLI

```bash
bun run digest [flags]

  --user pyay              # which users/<handle>/taste.md to load
  --dry-run                # print email HTML to stdout, don't send or commit
  --from-fixtures          # load events from test/fixtures/ instead of network
  --no-grade               # mock 7/10 ratings (skip Anthropic call)
  --replay YYYY-MM-DD      # load snapshots/<date>/events.json + run pipeline
```

## Tests

```bash
bun test                   # all tests, ~700ms, no network/API needed
bunx tsc --noEmit          # type check
```

124+ tests across grader, picker, dedupe, email, ics, every source's parser, and a full-pipeline integration test.

## Design history

Read [`design/`](design/) for the full thinking:

- [`design/01-design-doc.md`](design/01-design-doc.md) — Problem, premises, approaches, architecture, success criteria
- [`design/02-ceo-plan.md`](design/02-ceo-plan.md) — Scope decisions and the directory-layout reasoning
- [`design/03-test-plan.md`](design/03-test-plan.md) — Test inventory and critical paths

## Production cron — what's left

The `.github/workflows/digest.yml` file is on disk but not yet pushed (gh OAuth needs `workflow` scope). Once pushed:

1. `gh auth refresh -s workflow -h github.com`
2. `git add .github/workflows/digest.yml && git commit && git push`
3. Set secrets: `gh secret set ANTHROPIC_API_KEY -R PyayAungSan/sf-week`, same for `RESEND_API_KEY` and `DIGEST_TO_EMAIL`
4. Enable GitHub Pages from `/docs` on `main` (already done via `gh api`)
5. First scheduled Sunday at 17:00 UTC is the real test

## Secrets policy

This repo is public — `users/pyay/taste.md` is intentionally committed (it's the product). But API keys and credentials are NEVER committed.

- `.env` and friends are `.gitignored`. Copy `.env.example` → `.env` and fill in.
- A pre-commit hook in `.githooks/pre-commit` scans staged content for known secret patterns (Anthropic `sk-ant-*`, Resend, GitHub tokens, AWS, OpenAI, Stripe, Slack, JWT). The hook is wired automatically by `bun install`'s postinstall script.
- Production secrets live in GitHub Actions secrets (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `DIGEST_TO_EMAIL`), set via `gh secret set`.
- Test fixtures (`test/fixtures/*.html`) are full venue-site HTML pages. They contain public Google Analytics IDs and CSS class names — those are owned by the venues, not us, and are not secrets. The audit confirmed nothing personal-to-us leaks through.

If you ever need to override the hook (false positive): `git commit --no-verify`. Use sparingly.

