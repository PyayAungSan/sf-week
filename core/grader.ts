import Anthropic from "@anthropic-ai/sdk";
import type { Event, Rating } from "./types.ts";
import { buildSystemPrompt } from "./prompt.ts";

// CEO Expansion #1: grader is independent of any source.
// CEO E1: degraded mode wrapper — retry 2x with 30s backoff, then fall through
// to ungraded list with degraded:true flag.

const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap; grading doesn't need Sonnet/Opus
const MAX_TOKENS = 256;

export interface GraderOptions {
  maxRetries?: number;        // default 2
  backoffMs?: number;         // default 30000
  model?: string;
  client?: Anthropic;         // injectable for tests
}

export interface GradeResult {
  ratings: Rating[];
  degraded: boolean;
}

const RATE_TOOL = {
  name: "rate_event",
  description: "Return a 1-10 rating, one-sentence why, and block_now flag for an event against the user's taste profile.",
  input_schema: {
    type: "object" as const,
    properties: {
      rating: {
        type: "integer",
        description: "1 = clear skip; 5-6 = on the bubble; 8+ = should attend.",
      },
      why: {
        type: "string",
        description: "One concrete sentence referencing the taste profile.",
      },
      block_now: {
        type: "boolean",
        description: "True if the event has a capacity-risk reason to commit early (limited engagement, tickets dropping this week, touring, named speaker user clearly cares about).",
      },
    },
    required: ["rating", "why", "block_now"],
  },
};

async function gradeOne(
  client: Anthropic,
  systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>,
  event: Event,
  model: string,
): Promise<Rating | null> {
  const userText = [
    `Title: ${event.title}`,
    `Venue: ${event.venue}`,
    `Date: ${event.start}${event.end ? ` (through ${event.end})` : ""}`,
    `Source: ${event.source}`,
    `URL: ${event.url}`,
    event.description ? `Description: ${event.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: systemBlocks,
    tools: [RATE_TOOL],
    tool_choice: { type: "tool", name: "rate_event" },
    messages: [{ role: "user", content: userText }],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;
  const input = toolUse.input as { rating: number; why: string; block_now: boolean };
  return {
    event_url: event.url,
    rating: Math.max(1, Math.min(10, Math.round(input.rating))),
    why: input.why,
    block_now: !!input.block_now,
  };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  backoffMs: number,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastErr;
}

export async function grade(
  taste: string,
  events: Event[],
  options: GraderOptions = {},
): Promise<GradeResult> {
  if (events.length === 0) return { ratings: [], degraded: false };

  const maxRetries = options.maxRetries ?? 2;
  const backoffMs = options.backoffMs ?? 30000;
  const model = options.model ?? MODEL;
  const client =
    options.client ??
    new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

  // Cached system prompt: taste profile + grading instructions, ephemeral 5-min TTL.
  const systemBlocks = [
    {
      type: "text" as const,
      text: buildSystemPrompt(taste),
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const ratings: Rating[] = [];
  try {
    // Sequential keeps cache warm across the run (cache is per-prefix per request,
    // but the prompt-cache mechanism extends TTL on each hit).
    for (const event of events) {
      const r = await withRetry(
        () => gradeOne(client, systemBlocks, event, model),
        maxRetries,
        backoffMs,
      );
      if (r) ratings.push(r);
    }
    return { ratings, degraded: false };
  } catch {
    // Final retry failed — degraded mode (CEO E1)
    return { ratings: [], degraded: true };
  }
}
