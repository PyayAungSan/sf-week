# sf-week

Personal SF city-event digest. See README.md for architecture overview.

## Commands

```bash
bun install
bun run digest --user pyay [--dry-run] [--replay YYYY-MM-DD]
bun test
```

## Build origin

This project was designed via:
- `/office-hours` (design doc, Approach B chosen)
- `/plan-ceo-review` (SELECTIVE EXPANSION mode, 4 expansions accepted)
- `/plan-eng-review` (test plan + scaffold)

All three artifacts live in `~/.gstack/projects/garrytan-gstack/`.

## Per-source parser workflow

For each source in `sources/sf/`:
1. `/scrape "events from <source> page"` — discovers and prototypes the flow
2. `/skillify` — codifies the working flow as a permanent browser-skill with tests
3. The wrapper `sources/sf/<name>.ts` re-exports the skillified `run()` function

Subsequent runs route to the codified script in ~200ms instead of re-driving the page.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool.

- Bugs/errors → invoke /investigate
- Code review/diff check → invoke /review
- Ship/deploy → invoke /ship or /land-and-deploy
- New scraper → invoke /scrape then /skillify
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
