import type { DigestResult, Event, Rating } from "../core/types.ts";
import { Resend } from "resend";

// Renders the weekly digest as HTML.
// Three modes:
//   - normal: 1+ picks at >=6/10
//   - quiet: <3 picks at >=6/10 (still renders what we have, plus a "almost made it" tail)
//   - degraded (CEO E1): grader unavailable, raw event list

const STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; color: #222; max-width: 32rem; margin: 0 auto; padding: 1.5rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  h2 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; color: #555; border-top: 1px solid #ddd; padding-top: 1rem; }
  .pick { margin: 1rem 0; padding-bottom: 1rem; border-bottom: 1px solid #eee; }
  .pick:last-child { border-bottom: none; }
  .title { font-weight: 600; font-size: 1rem; }
  .title a { color: #0050b3; text-decoration: none; }
  .meta { color: #666; font-size: 0.9rem; margin: 0.2rem 0; }
  .why { color: #444; margin: 0.4rem 0; font-style: italic; }
  .rating { display: inline-block; padding: 0 0.4rem; background: #eef; border-radius: 3px; font-size: 0.8rem; color: #335; margin-right: 0.4rem; }
  .footer { font-size: 0.8rem; color: #888; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee; }
  .warn { background: #fff5e6; padding: 0.6rem 0.8rem; border-radius: 4px; margin: 1rem 0; font-size: 0.9rem; }
  .quiet { background: #f4f4f4; padding: 0.6rem 0.8rem; border-radius: 4px; margin: 1rem 0; }
`;

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

function renderPick(pick: Event & Rating, opts: { showRating?: boolean } = {}): string {
  const showRating = opts.showRating !== false;
  return `
    <div class="pick">
      <div class="title"><a href="${escape(pick.url)}">${escape(pick.title)}</a></div>
      <div class="meta">${escape(formatDate(pick.start))} · ${escape(pick.venue)}</div>
      ${pick.why ? `<div class="why">${showRating ? `<span class="rating">${pick.rating}/10</span>` : ""}${escape(pick.why)}</div>` : ""}
    </div>`;
}

function renderFooter(failedSources: string[], totalSeen: number, totalGraded: number): string {
  const warn =
    failedSources.length > 0
      ? `<div class="warn">⚠️ Couldn't fetch: ${escape(failedSources.join(", "))}</div>`
      : "";
  const counts = `<div class="footer">Saw ${totalSeen} events · graded ${totalGraded}.</div>`;
  return warn + counts;
}

export function renderEmailHtml(result: DigestResult, dateLabel: string): string {
  const subject = renderEmailSubject(result, dateLabel);
  let body: string;

  if (result.degraded) {
    body = `
      <h1>${escape(subject)}</h1>
      <div class="warn">⚠️ DIGEST DEGRADED — the grader couldn't run. Here's the raw list of events for this week, sorted by source. Pick what you want manually.</div>
      ${result.picks_this_week.map((p) => renderPick(p, { showRating: false })).join("")}
      ${renderFooter(result.failed_sources, result.total_events_seen, result.total_events_graded)}
    `;
  } else if (result.picks_this_week.length === 0) {
    body = `
      <h1>${escape(subject)}</h1>
      <div class="quiet">Quiet week — nothing scored ≥ 6/10. Take it easy.</div>
      ${renderFooter(result.failed_sources, result.total_events_seen, result.total_events_graded)}
    `;
  } else {
    const isQuiet = result.picks_this_week.length < 3;
    const intro = isQuiet
      ? `<div class="quiet">Quiet week — only ${result.picks_this_week.length} pick${result.picks_this_week.length === 1 ? "" : "s"} cleared the floor. Otherwise skip.</div>`
      : "";
    const blockNow =
      result.block_now.length > 0
        ? `<h2>Block now (sells out fast)</h2>${result.block_now.map((p) => renderPick(p)).join("")}`
        : "";
    body = `
      <h1>${escape(subject)}</h1>
      ${intro}
      <h2>This week (${result.picks_this_week.length})</h2>
      ${result.picks_this_week.map((p) => renderPick(p)).join("")}
      ${blockNow}
      ${renderFooter(result.failed_sources, result.total_events_seen, result.total_events_graded)}
    `;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escape(subject)}</title>
    <style>${STYLE}</style>
  </head>
  <body>${body}</body>
</html>`;
}

export function renderEmailSubject(result: DigestResult, dateLabel: string): string {
  if (result.degraded) return `sf-week ${dateLabel} — DEGRADED`;
  const n = result.picks_this_week.length;
  if (n === 0) return `sf-week ${dateLabel} — quiet week`;
  return `sf-week ${dateLabel} — ${n} pick${n === 1 ? "" : "s"}${result.block_now.length ? ` + ${result.block_now.length} block-now` : ""}`;
}

export interface SendOptions {
  to: string;
  from?: string;
  apiKey?: string;
  client?: { emails: { send: (args: unknown) => Promise<unknown> } }; // injectable for tests
}

export async function sendEmail(
  html: string,
  subject: string,
  options: SendOptions,
): Promise<void> {
  const apiKey = options.apiKey ?? process.env["RESEND_API_KEY"];
  if (!apiKey && !options.client) {
    throw new Error("RESEND_API_KEY env var or client must be provided");
  }
  const from = options.from ?? "sf-week <onboarding@resend.dev>";
  const client = options.client ?? new Resend(apiKey!);
  await client.emails.send({ from, to: options.to, subject, html });
}
