import { describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { grade } from "./grader.ts";
import type { Event } from "./types.ts";

function makeEvent(overrides: Partial<Event>): Event {
  return {
    url: "https://x/1",
    title: "AI Infra Talk",
    start: "2026-05-04T18:30:00",
    end: null,
    venue: "Test Venue",
    description: "A talk about AI infrastructure.",
    source: "test",
    normalized_key: "ai-infra|2026-05-04T18|test-venue",
    ics_uid: "abc@sf-week.local",
    ...overrides,
  };
}

// Mock Anthropic client returning canned tool_use responses.
function mockClient(responses: Array<{ rating: number; why: string; block_now: boolean }>) {
  let i = 0;
  return {
    messages: {
      create: async () => {
        const r = responses[i++];
        if (!r) throw new Error("no more mock responses");
        return {
          content: [{ type: "tool_use", name: "rate_event", input: r }],
        };
      },
    },
  } as unknown as Anthropic;
}

function failingClient(): Anthropic {
  return {
    messages: {
      create: async () => {
        throw new Error("API down");
      },
    },
  } as unknown as Anthropic;
}

const TASTE = "I like AI infra talks. Skip web3.";

describe("grader.grade", () => {
  test("E1.2 #1 — returns empty for empty events array, no API call", async () => {
    const result = await grade(TASTE, [], { client: failingClient() });
    expect(result.ratings).toEqual([]);
    expect(result.degraded).toBe(false);
  });

  test("rates each event via tool_use", async () => {
    const events = [
      makeEvent({ url: "https://x/1", title: "AI Infra Talk" }),
      makeEvent({ url: "https://x/2", title: "Web3 Networking" }),
    ];
    const client = mockClient([
      { rating: 9, why: "AI infra match", block_now: false },
      { rating: 2, why: "web3 explicitly skipped", block_now: false },
    ]);
    const result = await grade(TASTE, events, { client });
    expect(result.degraded).toBe(false);
    expect(result.ratings.length).toBe(2);
    expect(result.ratings[0]!.rating).toBe(9);
    expect(result.ratings[0]!.event_url).toBe("https://x/1");
    expect(result.ratings[1]!.rating).toBe(2);
  });

  test("clamps ratings to 1-10 range", async () => {
    const events = [makeEvent({})];
    const client = mockClient([{ rating: 99, why: "x", block_now: false }]);
    const result = await grade(TASTE, events, { client });
    expect(result.ratings[0]!.rating).toBe(10);
  });

  test("CEO E1 — degraded mode after retries fail", async () => {
    const events = [makeEvent({})];
    const result = await grade(TASTE, events, {
      client: failingClient(),
      maxRetries: 1,
      backoffMs: 1, // fast for test
    });
    expect(result.degraded).toBe(true);
    expect(result.ratings).toEqual([]);
  });

  test("retry succeeds after one transient failure", async () => {
    let calls = 0;
    const client: Anthropic = {
      messages: {
        create: async () => {
          calls++;
          if (calls === 1) throw new Error("transient");
          return {
            content: [
              {
                type: "tool_use",
                name: "rate_event",
                input: { rating: 7, why: "ok", block_now: false },
              },
            ],
          };
        },
      },
    } as unknown as Anthropic;
    const events = [makeEvent({})];
    const result = await grade(TASTE, events, {
      client,
      maxRetries: 2,
      backoffMs: 1,
    });
    expect(result.degraded).toBe(false);
    expect(result.ratings.length).toBe(1);
    expect(result.ratings[0]!.rating).toBe(7);
  });
});
