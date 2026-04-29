# Tomorrow you: how to test sf-week

Pipeline is fully wired. Here's a tour of what to try, in order.

## 0. Sanity (5 sec, no API key needed)

```bash
cd ~/repos/sf-week
bun install                # already done; just confirms lockfile resolves
bun test                   # 124+ tests, ~700ms, all green
bunx tsc --noEmit          # type check, exits 0
```

If any of these fail, something broke between the commit and your testing — tell me.

## 1. Offline shape test (no network, no API key)

Loads from `test/fixtures/`, mock-rates everything 7/10, prints the email HTML. Confirms the WHOLE PIPELINE works end-to-end in 1 second.

```bash
bun run digest --user pyay --from-fixtures --no-grade --dry-run > /tmp/digest.html
open /tmp/digest.html
```

Expected: a styled email with ~4 picks (Art Bash, Les Mis, Mean Girls, Sara Bareilles Awards or similar — varies by what's in window from "today").

## 2. Replay test (no network, no API key)

`snapshots/2026-04-29/events.json` is committed for testing. This is the path you'll use to iterate `taste.md` between Sundays — change taste, re-run, see different picks.

```bash
bun run digest --user pyay --replay 2026-04-29 --no-grade --dry-run
```

Expected: loads 3 events from the snapshot, prints email HTML. You can drop your own snapshot at any `snapshots/<YYYY-MM-DD>/events.json` and replay against it.

## 3. Live fetch (no API key)

Hits the real network across 8 working sources. Takes ~5-10 seconds.

```bash
bun run digest --user pyay --no-grade --dry-run > /tmp/digest-live.html
```

Watch stderr — it logs each source's event count. Last live run pulled 125 events (0 failed). Open `/tmp/digest-live.html` to see the picks.

## 4. Live fetch + REAL grading (needs ANTHROPIC_API_KEY)

This is the real thing. It will burn pennies in API tokens.

```bash
# From your shell where ANTHROPIC_API_KEY is set:
bun run digest --user pyay --dry-run > /tmp/digest-real.html
open /tmp/digest-real.html
```

Expected: ~125 events fetched, graded by Claude Haiku 4.5 against your `users/pyay/taste.md` (currently a draft you should edit), top picks at ≥6/10 returned. Email shows ratings + one-line "why this one" per pick.

**The taste profile is the entire product.** Edit `users/pyay/taste.md`, re-run, see different picks. The grader is exactly as good as that file.

## 5. The iteration loop (this is how you'll use it)

```bash
# Edit your taste profile
$EDITOR users/pyay/taste.md

# See how it would have changed last Sunday's picks
bun run digest --user pyay --replay 2026-04-29 --dry-run > /tmp/v2.html
diff /tmp/v1.html /tmp/v2.html

# Iterate until satisfied, then commit your taste.md
```

## 6. To enable the actual Sunday cron

Three things still need doing (gh OAuth scope + workflow file + secrets):

```bash
gh auth refresh -s workflow -h github.com
# (browser opens, approve)

cd ~/repos/sf-week
sed -i '' '/digest.yml/d' .git/info/exclude
git add .github/workflows/digest.yml
git commit -m "feat: add weekly Sunday cron workflow"
git push

gh secret set ANTHROPIC_API_KEY -R PyayAungSan/sf-week
gh secret set RESEND_API_KEY -R PyayAungSan/sf-week
gh secret set DIGEST_TO_EMAIL -R PyayAungSan/sf-week  # your email address

# Trigger first run manually to verify (don't wait for Sunday)
gh workflow run digest -R PyayAungSan/sf-week
gh run watch -R PyayAungSan/sf-week
```

After a successful first run, subscribe to the calendar feed:
- Apple Calendar → File → New Calendar Subscription
- URL: `https://pyayaungsan.github.io/sf-week/calendar.ics`

## Caveats

- **broadway-sf and todays-tix are fixture-backed in v1.** Live fetching them needs playwright (they're React-app pages with anti-bot). Add later or live with the fixture data refreshing only when you re-save them.
- **3 sources are still TODO:** famsf (JS-rendered), bampfa (complex date model), luma (anti-bot). See `sources.json` for status.
- **Hyperallergic was dropped** — they don't have a flat SF events listing.

## Quick fix recipes

| What broke | Try |
|---|---|
| Test fails after pulling latest | `bun install` — lockfile may have moved |
| `bun run digest --dry-run` throws Anthropic 401 | Check `ANTHROPIC_API_KEY` is exported in your shell |
| Live fetch returns 0 events for a source | The source site changed markup. Re-save fixture, update parser |
| Calendar subscription not updating | UID stability is enforced; check that DTSTAMP differs (it should — it's `now`) |
