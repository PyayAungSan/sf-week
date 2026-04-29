import { describe, expect, test } from "bun:test";
import { renderEmailHtml, renderEmailSubject, sendEmail } from "./email.ts";
import type { DigestResult, Event, Rating } from "../core/types.ts";

function makePick(overrides: Partial<Event & Rating> = {}): Event & Rating {
  return {
    url: "https://x/1",
    title: "Test Pick",
    start: "2026-05-04T19:30:00",
    end: null,
    venue: "Test Venue",
    description: "",
    source: "act",
    normalized_key: "k",
    ics_uid: "u",
    event_url: "https://x/1",
    rating: 8,
    why: "matches taste profile",
    block_now: false,
    ...overrides,
  };
}

function digest(overrides: Partial<DigestResult>): DigestResult {
  return {
    picks_this_week: [],
    block_now: [],
    failed_sources: [],
    degraded: false,
    total_events_seen: 0,
    total_events_graded: 0,
    ...overrides,
  };
}

describe("renderEmailSubject", () => {
  test("normal", () => {
    expect(renderEmailSubject(digest({ picks_this_week: [makePick({}), makePick({})] }), "May 4")).toContain("2 picks");
  });
  test("singular", () => {
    expect(renderEmailSubject(digest({ picks_this_week: [makePick({})] }), "May 4")).toContain("1 pick");
  });
  test("with block_now", () => {
    expect(renderEmailSubject(digest({ picks_this_week: [makePick({})], block_now: [makePick({})] }), "May 4")).toContain("block-now");
  });
  test("quiet", () => {
    expect(renderEmailSubject(digest({}), "May 4")).toContain("quiet");
  });
  test("degraded", () => {
    expect(renderEmailSubject(digest({ degraded: true }), "May 4")).toContain("DEGRADED");
  });
});

describe("renderEmailHtml", () => {
  test("normal mode renders picks + ratings", () => {
    const html = renderEmailHtml(
      digest({
        picks_this_week: [
          makePick({ title: "AI Infra Talk", rating: 9, why: "AI infra match" }),
        ],
        total_events_seen: 50,
        total_events_graded: 50,
      }),
      "May 4",
    );
    expect(html).toContain("AI Infra Talk");
    expect(html).toContain("9/10");
    expect(html).toContain("AI infra match");
    expect(html).toContain("Saw 50 events");
  });

  test("quiet mode (1-2 picks) shows quiet banner", () => {
    const html = renderEmailHtml(
      digest({ picks_this_week: [makePick({})] }),
      "May 4",
    );
    expect(html).toContain("Quiet week");
    expect(html).toContain("only 1 pick");
  });

  test("zero picks → 'take it easy'", () => {
    const html = renderEmailHtml(digest({}), "May 4");
    expect(html).toContain("Take it easy");
  });

  test("CEO E1 degraded mode", () => {
    const html = renderEmailHtml(
      digest({
        degraded: true,
        picks_this_week: [makePick({ rating: 0, why: "(grader unavailable — ungraded)" })],
        total_events_seen: 50,
      }),
      "May 4",
    );
    expect(html).toContain("DIGEST DEGRADED");
  });

  test("failed_sources warning rendered", () => {
    const html = renderEmailHtml(
      digest({
        picks_this_week: [makePick({})],
        failed_sources: ["luma", "broadway-sf"],
      }),
      "May 4",
    );
    expect(html).toContain("Couldn't fetch:");
    expect(html).toContain("luma");
  });

  test("escapes HTML in user-controlled fields (XSS defense)", () => {
    const html = renderEmailHtml(
      digest({
        picks_this_week: [
          makePick({ title: "<script>alert(1)</script>", why: "<b>bad</b>" }),
        ],
      }),
      "May 4",
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("block_now subsection rendered when present", () => {
    const html = renderEmailHtml(
      digest({
        picks_this_week: [makePick({})],
        block_now: [makePick({ title: "Limited Run Show" })],
      }),
      "May 4",
    );
    expect(html).toContain("Block now");
    expect(html).toContain("Limited Run Show");
  });
});

describe("sendEmail", () => {
  test("calls injected client", async () => {
    let called = 0;
    const client = {
      emails: {
        send: async (args: unknown) => {
          called++;
          expect((args as { subject: string }).subject).toBe("test subject");
          return {};
        },
      },
    };
    await sendEmail("<html/>", "test subject", { to: "test@example.com", client });
    expect(called).toBe(1);
  });
});
