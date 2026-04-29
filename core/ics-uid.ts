// CEO E1.1: stable .ics UIDs across runs for calendar subscriber consistency.
// UID = sha1(normalized_key) + "@sf-week.local"
// Same event scraped from multiple sources gets the same UID (because dedupe
// computes the same normalized_key). Calendar apps use UID to detect updates.

import { createHash } from "node:crypto";

export function icsUid(normalizedKey: string): string {
  const hash = createHash("sha1").update(normalizedKey).digest("hex");
  return `${hash}@sf-week.local`;
}
