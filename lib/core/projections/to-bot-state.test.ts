import { describe, expect, it } from "vitest";
import { defaultSettings, getHuntBattleSettings } from "../settings";
import { defaultSessionView } from "./defaults";
import { toBotState } from "./to-bot-state";

describe("toBotState", () => {
  it("prefers live view character identity over stale settings", () => {
    const settings = defaultSettings();
    settings.characterId = "stale-id";
    settings.characterName = "Stale Name";

    const view = defaultSessionView();
    view.character.characterId = "live-id";
    view.character.characterName = "Live Name";

    const state = toBotState(settings, view);

    expect(state.character.characterId).toBe("live-id");
    expect(state.character.characterName).toBe("Live Name");
  });

  it("falls back to settings character identity when view is empty", () => {
    const settings = defaultSettings();
    settings.characterId = "cli-id";
    settings.characterName = "CLI Name";

    const state = toBotState(settings, defaultSessionView());

    expect(state.character.characterId).toBe("cli-id");
    expect(state.character.characterName).toBe("CLI Name");
  });

  it("uses the character battle preset when none is configured in settings", () => {
    const settings = defaultSettings();
    expect(getHuntBattleSettings(settings, settings.selectedHuntId).battlePreset).toBeNull();

    const view = defaultSessionView();
    view.battlePreset = {
      ...view.battlePreset,
      selectedHeal: "Ultimate Healing",
      selectedSkills: ["Exori", null, null, null],
    };

    const state = toBotState(settings, view);

    expect(state.battlePreset.selectedHeal).toBe("Ultimate Healing");
    expect(state.battlePreset.selectedSkills[0]).toBe("Exori");
    expect(state.characterBattlePreset.selectedHeal).toBe("Ultimate Healing");
  });

  it("prefers a configured settings battle preset over the character preset", () => {
    const settings = defaultSettings();
    settings.selectedHuntId = 1;
    settings.huntBattleByHuntId = {
      1: {
        partyPositionX: null,
        partyPositionY: null,
        selectedLureId: null,
        battlePreset: {
          ...defaultSessionView().battlePreset,
          selectedHeal: "Configured Heal",
        },
      },
    };

    const view = defaultSessionView();
    view.battlePreset = {
      ...view.battlePreset,
      selectedHeal: "Character Heal",
    };

    const state = toBotState(settings, view);

    expect(state.battlePreset.selectedHeal).toBe("Configured Heal");
    expect(state.characterBattlePreset.selectedHeal).toBe("Character Heal");
  });
});
