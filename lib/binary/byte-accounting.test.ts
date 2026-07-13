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

describe("binary byte accounting", () => {
  for (const source of fixtureSources) {
    describe(source.name, () => {
      for (const [key, base64] of Object.entries(source.fixtures)) {
        if (key === "huntLootAnalyzerTick") {
          continue;
        }

        it(`consumes the full payload for ${key}`, () => {
          const bytes = decodeBase64ToBytes(base64);
          const envelope = parseEnvelope(bytes);
          const reader = new BinaryReader(bytes);
          reader.seek(envelope.payloadOffset);
          const payloadLength = bytes.length - envelope.payloadOffset;

          const body = decodeBodyOrThrow(envelope.type, reader, payloadLength);
          expect(body.kind).not.toBe("unknown");
          expect(reader.remaining).toBe(0);
        });
      }
    });
  }
});
