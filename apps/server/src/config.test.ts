import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadCharacterConfig,
  setCharacterConfigDirForTests,
  syncSettingsFromExtension,
} from "./config";

describe("syncSettingsFromExtension", () => {
  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "stonegy-config-"));
    setCharacterConfigDirForTests(dir);
  });

  afterEach(() => {
    setCharacterConfigDirForTests(undefined);
  });

  it("merges settings and masters onto disk", async () => {
    await syncSettingsFromExtension({
      characterId: "hero-1",
      settings: { autoBuyBless: true, marketUndercutGold: 12 },
      featureMasters: { tools: true, market: false },
    });

    const loaded = await loadCharacterConfig("hero-1");
    expect(loaded.settings.autoBuyBless).toBe(true);
    expect(loaded.settings.marketUndercutGold).toBe(12);
    expect(loaded.featureMasters.tools).toBe(true);
    expect(loaded.featureMasters.market).toBe(false);

    await syncSettingsFromExtension({
      characterId: "hero-1",
      settings: { autoBuyBless: false },
    });
    const again = await loadCharacterConfig("hero-1");
    expect(again.settings.autoBuyBless).toBe(false);
    expect(again.settings.marketUndercutGold).toBe(12);
    expect(again.featureMasters.tools).toBe(true);
  });

  it("writes a json file for the character", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stonegy-config-file-"));
    setCharacterConfigDirForTests(dir);
    await syncSettingsFromExtension({
      characterId: "hero-2",
      settings: { loggingEnabled: false },
    });
    const raw = await readFile(join(dir, "hero-2.json"), "utf8");
    const parsed = JSON.parse(raw) as { settings: { loggingEnabled?: boolean } };
    expect(parsed.settings.loggingEnabled).toBe(false);
  });
});
