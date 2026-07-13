import type { GameSession } from "../session";
import type { Settings } from "../settings";
import type { KeyedLocks } from "./locks";

export type SettingsPatch = Partial<Settings>;

export class SettingsStore {
  constructor(
    private readonly locks: KeyedLocks,
    private readonly session: GameSession
  ) {}

  get(): Settings {
    return this.session.settings;
  }

  transaction(fn: (s: Settings) => SettingsPatch | Promise<SettingsPatch>): Promise<void> {
    return this.locks.runExclusive("settings", async () => {
      this.session.updateSettings(await fn(this.session.settings));
    });
  }
}
