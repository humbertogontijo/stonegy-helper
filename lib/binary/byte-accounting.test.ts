import { describe, expect, it } from "vitest";
import { BinaryReader, decodeBase64ToBytes } from "./reader.ts";
import { decodeBodyOrThrow } from "./decode.ts";
import { parseEnvelope } from "./envelope.ts";
import { huntTrafficFixtures } from "./fixtures/hunt-traffic.ts";
import { binaryFixtures } from "./fixtures/session-traffic.ts";
import { binaryMarketSnapshotBrowse } from "./fixtures/market-traffic.ts";
import { huntWorldSnapshotFixture } from "./fixtures/world-traffic.ts";
import { winterCourtTrafficFixtures } from "./fixtures/winter-court-traffic.ts";

type FixtureSource = {
  name: string;
  fixtures: Record<string, string>;
};

const fixtureSources: FixtureSource[] = [
  { name: "hunt-traffic", fixtures: huntTrafficFixtures },
  { name: "session-traffic", fixtures: binaryFixtures },
  { name: "market-traffic", fixtures: { binaryMarketSnapshotBrowse } },
  { name: "world-traffic", fixtures: { huntWorldSnapshotFixture } },
  { name: "winter-court-traffic", fixtures: winterCourtTrafficFixtures },
];

/**
 * Fixtures that record unmapped leftovers on the body (`trailingBytes` / `rawTail`).
 * The reader is exhausted, but debug telemetry treats them as unknown.
 */
const recordedTrailerFixtures = new Set([
  "binaryMarketSnapshotBrowse",
  "marketSnapshot",
]);

function namedTrailerLength(body: { kind: string; data?: unknown }): number {
  if (!body.data || typeof body.data !== "object") {
    return 0;
  }
  const data = body.data as Record<string, unknown>;
  let total = 0;
  if (data.trailingBytes instanceof Uint8Array) {
    total += data.trailingBytes.length;
  }
  if (data.rawTail instanceof Uint8Array) {
    total += data.rawTail.length;
  }
  return total;
}

describe("binary byte accounting", () => {
  for (const source of fixtureSources) {
    describe(source.name, () => {
      for (const [key, base64] of Object.entries(source.fixtures)) {
        it(`consumes the full payload for ${key}`, () => {
          const bytes = decodeBase64ToBytes(base64);
          const envelope = parseEnvelope(bytes);
          const reader = new BinaryReader(bytes);
          reader.seek(envelope.payloadOffset);

          const body = decodeBodyOrThrow(envelope.type, reader);
          expect(body.kind).not.toBe("unknown");
          expect(reader.remaining).toBe(0);

          if (recordedTrailerFixtures.has(key)) {
            expect(namedTrailerLength(body)).toBeGreaterThan(0);
          } else {
            expect(namedTrailerLength(body)).toBe(0);
          }
        });
      }
    });
  }
});
