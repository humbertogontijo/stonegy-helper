import { useMemo } from "react";
import {
  getAmmoOptions,
  getAttackSpellOptions,
  getHealOptions,
  getManaPotionOptions,
  getSupportSpellOptions,
  resolveBattleOptionFilter,
} from "../../../../lib/battle-options";
import {
  DEFAULT_PARTY_POSITION,
  getHuntLureOptions,
  listHunts,
  resolveLureId,
  resolvePartyPosition,
} from "../../../../lib/hunts";
import {
  getHuntBattleSettings,
  patchHuntBattleByHuntId,
  type HuntBattleSettings,
} from "../../../../lib/core/settings";
import {
  listInventoryEquipOptions,
  type EquipmentSlot,
} from "../../../../lib/items";
import { sendBot } from "../../api/bot";
import type { AutoEquipSlot, BattlePreset, BotState } from "../../types/bot";
import { isHuntControlledByParent } from "../../features";
import { useFeatureMasterWithStop } from "../../hooks/useFeatureMasterWithStop";
import { jsonEqual, usePersistedField } from "../../hooks/usePersistedField";
import { FeaturePanelLayout } from "../layout/FeaturePanelLayout";
import { FeatureInputs } from "../ui/FeatureInputs";
import { SubFeatureSection } from "../ui/SubFeatureSection";
import type { SubFeatureBadge } from "../ui/FeatureHubNavigator";
import { SplitSubFeatureDetail } from "../ui/FeatureHubNavigator";
import { StonegySelect } from "../ui/StonegySelect";
import { BattlePresetEditor } from "./BattlePresetEditor";
import { PartyPositionGrid } from "./PartyPositionGrid";

interface BattlePanelProps {
  state: BotState | null;
  runAction: (action: () => Promise<{ ok?: boolean; error?: string }>) => Promise<void>;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}

const hunts = listHunts();

const defaultPreset: BattlePreset = {
  selectedHeal: "",
  selectedHealPercent: 45,
  selectedHealSecondary: "",
  selectedHealPercentSecondary: 90,
  selectedHealTertiary: "",
  selectedHealPercentTertiary: 60,
  selectedHealQuaternary: "",
  selectedHealPercentQuaternary: 80,
  selectedManaPotion: "",
  selectedManaPotionPercent: 20,
  selectedArrow: "",
  selectedSkills: ["", "", "", ""],
  selectedSkillsMinCreatures: {},
  selectedSupportSkills: ["", ""],
  autoEquip: {
    ring: { enabled: false, emergencyItemId: null, defaultItemId: null, equipLifePercentLte: 50, restoreLifePercentGte: 80 },
    neck: { enabled: false, emergencyItemId: null, defaultItemId: null, equipLifePercentLte: 50, restoreLifePercentGte: 80 },
  },
};

function deriveSpellMins(p: BattlePreset): string[] {
  return (p.selectedSkills ?? ["", "", "", ""]).map((skill, i) => {
    if (!skill || p.selectedSkillsMinCreatures?.[skill] == null) {
      return i < 2 ? (i === 0 ? "2" : "-1") : i === 2 ? "2" : "-1";
    }
    return String(p.selectedSkillsMinCreatures[skill]);
  });
}

function isSoloPaladin(state: BotState | null | undefined): boolean {
  if (state?.character.characterVocation !== "PALADIN") {
    return false;
  }
  const members = state.party.partyMemberCount;
  return members == null || members <= 1;
}

export function BattlePanel({ state, runAction, saveSettings, showFeedback }: BattlePanelProps) {
  const controlledByTasks = isHuntControlledByParent(state);
  const taskerHuntId = state?.settings.taskerTargetHuntId;

  const remoteHuntId =
    controlledByTasks && taskerHuntId != null
      ? String(taskerHuntId)
      : state?.settings.selectedHuntId != null
        ? String(state.settings.selectedHuntId)
        : "";

  const [selectedHuntId, setSelectedHuntId] = usePersistedField(
    remoteHuntId || undefined,
    ""
  );
  const [autoApplyPresets, setAutoApplyPresets] = usePersistedField(state?.settings.autoApplyPresets, false);
  const [autoPlacePosition, setAutoPlacePosition] = usePersistedField(
    state?.settings.autoPlacePartyPosition,
    false
  );
  const [autoLockLure, setAutoLockLure] = usePersistedField(state?.settings.autoLockLure, false);

  const huntIdNum = selectedHuntId ? Number(selectedHuntId) : null;
  const huntIdForPosition =
    huntIdNum ?? state?.hunt.activeHuntId ?? state?.settings.selectedHuntId ?? state?.party.currentHuntId ?? null;

  const huntBattleMap = state?.settings.huntBattleByHuntId ?? {};
  const huntBattle = getHuntBattleSettings(
    { huntBattleByHuntId: huntBattleMap },
    huntIdNum
  );

  const battleOptionFilter = useMemo(
    () => resolveBattleOptionFilter(state ?? {}),
    [state?.character.characterVocation, state?.character.level, state?.hunt.activeHuntId, state?.settings.selectedHuntId, state?.party.currentHuntId]
  );
  const healOptions = useMemo(() => getHealOptions(battleOptionFilter), [battleOptionFilter]);
  const manaPotionOptions = useMemo(
    () => getManaPotionOptions(battleOptionFilter),
    [battleOptionFilter]
  );
  const ammoOptions = useMemo(() => getAmmoOptions(battleOptionFilter), [battleOptionFilter]);
  const attackSpellOptions = useMemo(
    () => getAttackSpellOptions(battleOptionFilter),
    [battleOptionFilter]
  );
  const supportSpellOptions = useMemo(
    () => getSupportSpellOptions(battleOptionFilter),
    [battleOptionFilter]
  );
  const showAmmo = isSoloPaladin(state);

  const remotePartyPosition = resolvePartyPosition(
    huntIdForPosition,
    huntBattle.partyPositionX != null && huntBattle.partyPositionY != null
      ? { x: huntBattle.partyPositionX, y: huntBattle.partyPositionY }
      : DEFAULT_PARTY_POSITION
  );
  const [partyPosition, setPartyPosition] = usePersistedField(
    remotePartyPosition ?? DEFAULT_PARTY_POSITION,
    DEFAULT_PARTY_POSITION,
    jsonEqual
  );

  const remoteLureId =
    huntIdNum && state?.hunt.currentLureId != null
      ? state.hunt.currentLureId
      : huntIdNum
        ? resolveLureId(huntIdNum, huntBattle.selectedLureId)
        : null;
  const [selectedLureId, setSelectedLureId] = usePersistedField(
    remoteLureId != null ? String(remoteLureId) : undefined,
    ""
  );

  const remotePreset = huntBattle.battlePreset ?? (huntIdNum != null ? state?.battlePreset : null);
  const [preset, setPreset] = usePersistedField(remotePreset ?? undefined, defaultPreset, jsonEqual);

  const remoteSpellMins = useMemo(
    () => (remotePreset ? deriveSpellMins(remotePreset) : undefined),
    [remotePreset]
  );
  const [spellMins, setSpellMins] = usePersistedField(
    remoteSpellMins,
    ["2", "-1", "2", "-1"],
    jsonEqual
  );

  const ringOptions = useMemo(
    () =>
      listInventoryEquipOptions(state?.inventory.items, "RING" satisfies EquipmentSlot, [
        preset.autoEquip.ring.emergencyItemId,
        preset.autoEquip.ring.defaultItemId,
      ]),
    [
      state?.inventory.items,
      preset.autoEquip.ring.emergencyItemId,
      preset.autoEquip.ring.defaultItemId,
    ]
  );
  const neckOptions = useMemo(
    () =>
      listInventoryEquipOptions(state?.inventory.items, "NECK" satisfies EquipmentSlot, [
        preset.autoEquip.neck.emergencyItemId,
        preset.autoEquip.neck.defaultItemId,
      ]),
    [
      state?.inventory.items,
      preset.autoEquip.neck.emergencyItemId,
      preset.autoEquip.neck.defaultItemId,
    ]
  );

  const huntOptions = useMemo(
    () => [
      { value: "", label: controlledByTasks ? "Set by Tasks…" : "Select a hunt…" },
      ...hunts.map((hunt) => {
        const level = hunt.recommendedLevel ?? hunt.levelMin ?? "?";
        return { value: String(hunt.id), label: `#${hunt.id} · ${hunt.title} (lvl ${level})` };
      }),
    ],
    [controlledByTasks]
  );

  const lureOptions = useMemo(() => {
    if (!huntIdNum) return [{ value: "", label: "Select a hunt first…" }];
    const options = getHuntLureOptions(huntIdNum);
    if (!options.length) return [{ value: "", label: "No lure options" }];
    return options.map((id) => ({ value: String(id), label: String(id + 1) }));
  }, [huntIdNum]);

  const readBattlePreset = (): BattlePreset => {
    const selectedSkillsMinCreatures: Record<string, number> = {};
    preset.selectedSkills.forEach((skill, index) => {
      if (!skill) return;
      const minValue = Number(spellMins[index]);
      selectedSkillsMinCreatures[skill] = Number.isFinite(minValue) ? minValue : -1;
    });
    return { ...preset, selectedSkillsMinCreatures };
  };

  const buildHuntBattlePatch = (patch: Partial<HuntBattleSettings> = {}): Record<number, HuntBattleSettings> => {
    if (huntIdNum == null) {
      return huntBattleMap;
    }
    return patchHuntBattleByHuntId(huntBattleMap, huntIdNum, {
      partyPositionX: partyPosition?.x ?? null,
      partyPositionY: partyPosition?.y ?? null,
      selectedLureId: selectedLureId ? Number(selectedLureId) : null,
      battlePreset: readBattlePreset(),
      ...patch,
    });
  };

  const readPresetSettings = (overrides: Record<string, unknown> = {}) => {
    const huntBattleOverride = overrides.huntBattleByHuntId as
      | Record<number, HuntBattleSettings>
      | undefined;
    const { huntBattleByHuntId: _ignored, ...rest } = overrides;
    return {
      autoApplyPresets,
      autoPlacePartyPosition: autoPlacePosition,
      autoLockLure,
      selectedHuntId: controlledByTasks ? taskerHuntId ?? huntIdNum : huntIdNum,
      huntBattleByHuntId: huntBattleOverride ?? buildHuntBattlePatch(),
      ...rest,
    };
  };

  const savePreset = (overrides?: Record<string, unknown>) =>
    saveSettings(readPresetSettings(overrides));

  const saveHuntBattle = (patch: Partial<HuntBattleSettings>, extra: Record<string, unknown> = {}) => {
    if (huntIdNum == null) {
      void savePreset(extra);
      return;
    }
    void savePreset({
      ...extra,
      huntBattleByHuntId: buildHuntBattlePatch(patch),
    });
  };

  const { masterOn, subsDisabled, handleMasterChange } = useFeatureMasterWithStop("battle", {
    state,
    saveSettings: savePreset,
    onLocalStateReset: (updates) => {
      if (updates.autoPlacePartyPosition === false) {
        setAutoPlacePosition(false);
      }
      if (updates.autoLockLure === false) {
        setAutoLockLure(false);
      }
      if (updates.autoApplyPresets === false) {
        setAutoApplyPresets(false);
      }
    },
    showFeedback,
  });

  const updatePreset = (patch: Partial<BattlePreset>) => {
    const nextPreset = { ...readBattlePreset(), ...patch };
    setPreset((prev) => ({ ...prev, ...patch }));
    saveHuntBattle({ battlePreset: nextPreset }, { autoApplyPresets });
  };

  const updateSkill = (index: number, value: string) => {
    const skills = [...preset.selectedSkills];
    skills[index] = value || null;
    const nextPreset = { ...readBattlePreset(), selectedSkills: skills };
    setPreset((prev) => ({ ...prev, selectedSkills: skills }));
    saveHuntBattle({ battlePreset: nextPreset }, { autoApplyPresets });
  };

  const updateSpellMin = (index: number, value: string) => {
    const mins = [...spellMins];
    mins[index] = value;
    setSpellMins(mins);
    const selectedSkillsMinCreatures: Record<string, number> = {};
    preset.selectedSkills.forEach((skill, skillIndex) => {
      if (!skill) return;
      const minValue = Number(skillIndex === index ? value : mins[skillIndex]);
      selectedSkillsMinCreatures[skill] = Number.isFinite(minValue) ? minValue : -1;
    });
    const nextPreset = { ...preset, selectedSkillsMinCreatures };
    saveHuntBattle({ battlePreset: nextPreset }, { autoApplyPresets });
  };

  const updateAutoEquip = (prefix: "ring" | "neck", slot: AutoEquipSlot) => {
    const nextPreset = {
      ...readBattlePreset(),
      autoEquip: { ...preset.autoEquip, [prefix]: slot },
    };
    setPreset((prev) => ({ ...prev, autoEquip: { ...prev.autoEquip, [prefix]: slot } }));
    saveHuntBattle({ battlePreset: nextPreset }, { autoApplyPresets });
  };

  const handleHuntChange = (value: string) => {
    if (controlledByTasks) return;
    setSelectedHuntId(value);
    const id = value ? Number(value) : null;
    if (id) {
      const nextBattle = getHuntBattleSettings({ huntBattleByHuntId: huntBattleMap }, id);
      const resolved = resolvePartyPosition(
        id,
        nextBattle.partyPositionX != null && nextBattle.partyPositionY != null
          ? { x: nextBattle.partyPositionX, y: nextBattle.partyPositionY }
          : null
      );
      const lure = resolveLureId(id, nextBattle.selectedLureId);
      if (resolved) setPartyPosition(resolved);
      setSelectedLureId(String(lure));
      if (nextBattle.battlePreset) {
        setPreset(nextBattle.battlePreset);
        setSpellMins(deriveSpellMins(nextBattle.battlePreset));
      } else {
        setPreset(defaultPreset);
        setSpellMins(["2", "-1", "2", "-1"]);
      }
      void savePreset({
        selectedHuntId: id,
        huntBattleByHuntId: patchHuntBattleByHuntId(huntBattleMap, id, {
          ...(resolved ? { partyPositionX: resolved.x, partyPositionY: resolved.y } : {}),
          selectedLureId: lure,
        }),
      });
      return;
    }
    void savePreset({ selectedHuntId: null });
  };

  const lureLockedByTasks = controlledByTasks;

  const positionBadge: SubFeatureBadge = autoPlacePosition ? "on" : "off";
  const lureBadge: SubFeatureBadge = lureLockedByTasks
    ? "locked"
    : autoLockLure
      ? "on"
      : "off";
  const presetsBadge: SubFeatureBadge = autoApplyPresets
    ? "on"
    : masterOn
      ? "armed"
      : "off";

  const huntSelector = (
    <FeatureInputs>
      <StonegySelect
        label="Hunt"
        value={selectedHuntId}
        disabled={controlledByTasks}
        onChange={(e) => handleHuntChange(e.target.value)}
        options={huntOptions}
      />
    </FeatureInputs>
  );

  const positionSection = (
    <PartyPositionGrid
      huntIdForPosition={huntIdForPosition}
      partyPosition={partyPosition}
      disabled={subsDisabled}
      onSelectPosition={({ x, y }) => {
        setPartyPosition({ x, y });
        saveHuntBattle({ partyPositionX: x, partyPositionY: y });
      }}
    />
  );

  const lureSection = (
    <SubFeatureSection
      hideTitle
      compact
      disabled={lureLockedByTasks}
      lockAutomation={subsDisabled || lureLockedByTasks}
    >
      <StonegySelect
        label="Lure amount"
        value={selectedLureId}
        disabled={lureLockedByTasks}
        onChange={(e) => {
          const value = e.target.value;
          setSelectedLureId(value);
          saveHuntBattle({ selectedLureId: value ? Number(value) : null });
        }}
        options={lureOptions}
      />
    </SubFeatureSection>
  );

  const presetsSection = (
    <BattlePresetEditor
      healOptions={healOptions}
      manaPotionOptions={manaPotionOptions}
      ammoOptions={ammoOptions}
      attackSpellOptions={attackSpellOptions}
      supportSpellOptions={supportSpellOptions}
      ringOptions={ringOptions}
      neckOptions={neckOptions}
      preset={preset}
      spellMins={spellMins}
      showAmmo={showAmmo}
      disabled={subsDisabled}
      updatePreset={updatePreset}
      updateSkill={updateSkill}
      updateSpellMin={updateSpellMin}
      updateAutoEquip={updateAutoEquip}
    />
  );

  return (
    <FeaturePanelLayout
      featureId="battle"
      masterOn={masterOn}
      onMasterChange={handleMasterChange}
      showFeedback={showFeedback}
      subsDisabled={subsDisabled}
      setup={huntSelector}
      subFeatures={[
        {
          id: "position",
          label: "Party Position",
          order: 1,
          badge: positionBadge,
          toggle: {
            checked: autoPlacePosition,
            disabled: subsDisabled,
            onChange: (checked) => {
              setAutoPlacePosition(checked);
              void savePreset({ autoPlacePartyPosition: checked });
            },
          },
          action: {
            label: "Position now",
            disabled: !partyPosition,
            onClick: () => {
              if (!partyPosition) {
                showFeedback("Select a position first", "error");
                return;
              }
              void runAction(async () => {
                await sendBot("bot:set-settings", readPresetSettings());
                return sendBot("bot:place-party-position");
              });
            },
          },
          content: (
            <SplitSubFeatureDetail controls={huntSelector} status={positionSection} />
          ),
        },
        {
          id: "lure",
          label: "Lure",
          order: 2,
          badge: lureBadge,
          locked: lureLockedByTasks,
          lockedMessage: lureLockedByTasks ? "Controlled by Tasks." : undefined,
          toggle: {
            checked: autoLockLure,
            disabled: subsDisabled || lureLockedByTasks,
            onChange: (checked) => {
              setAutoLockLure(checked);
              void savePreset({ autoLockLure: checked });
            },
          },
          action: {
            label: "Lure now",
            disabled: lureLockedByTasks || !state?.connection.connected || huntIdNum == null,
            onClick: () => {
              if (lureLockedByTasks) {
                showFeedback("Controlled by Tasks.", "error");
                return;
              }
              if (huntIdNum == null) {
                showFeedback("Select a hunt first", "error");
                return;
              }
              void runAction(async () => {
                await sendBot("bot:set-settings", readPresetSettings());
                return sendBot("bot:lock-lure");
              });
            },
          },
          content: (
            <SplitSubFeatureDetail controls={huntSelector} status={lureSection} />
          ),
        },
        {
          id: "presets",
          label: "Presets",
          order: 3,
          badge: presetsBadge,
          toggle: {
            checked: autoApplyPresets,
            disabled: subsDisabled,
            onChange: (checked) => {
              setAutoApplyPresets(checked);
              void savePreset({ autoApplyPresets: checked });
            },
          },
          action: {
            label: "Apply now",
            onClick: () =>
              void runAction(async () => {
                await sendBot("bot:set-settings", readPresetSettings());
                return sendBot("bot:apply-presets");
              }),
          },
          content: (
            <SplitSubFeatureDetail controls={huntSelector} status={presetsSection} />
          ),
        },
      ]}
    />
  );
}
