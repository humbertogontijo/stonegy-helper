import {
  formatPartyInviteAllowlist,
  parsePartyInviteAllowlist,
} from "@stonegy/helper/domain/party/invite-filter";
import type { PartyInviteAcceptMode } from "@stonegy/helper/core/settings";
import { usePersistedField } from "../../hooks/usePersistedField";
import { useFeatureMasterWithStop } from "../../hooks/useFeatureMasterWithStop";
import type { BotState } from "@stonegy/helper/types";
import { FeaturePanelLayout } from "../layout/FeaturePanelLayout";
import { FeatureInputs } from "../ui/FeatureInputs";
import { SplitSubFeatureDetail } from "../ui/FeatureHubNavigator";
import { SubFeatureSection } from "../ui/SubFeatureSection";
import { StonegySelect } from "../ui/StonegySelect";
import { StonegyToggle } from "../ui/StonegyToggle";
import { StonegyInput } from "../ui/StonegyInput";
import type { SubFeatureBadge } from "../ui/FeatureHubNavigator";
import type { SkillToTrain } from "@stonegy/helper/protocol-messages";

interface ToolsPanelProps {
  state: BotState | null;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  showFeedback: (msg: string, type?: "success" | "error") => void;
}

const SKILL_OPTIONS: Array<{ value: SkillToTrain; label: string }> = [
  { value: "DISTANCE", label: "Distance" },
  { value: "SWORD", label: "Sword" },
  { value: "AXE", label: "Axe" },
  { value: "CLUB", label: "Club" },
  { value: "SHIELDING", label: "Shielding" },
  { value: "MAGIC", label: "Magic" },
];

export function ToolsPanel({ state, saveSettings, showFeedback }: ToolsPanelProps) {
  const [autoConfirmPartyHunt, setAutoConfirmPartyHunt] = usePersistedField(
    state?.settings.autoConfirmPartyHunt,
    false
  );
  const [autoBuyBless, setAutoBuyBless] = usePersistedField(
    state?.settings.autoBuyBless,
    false
  );
  const [autoDisbandSoloParty, setAutoDisbandSoloParty] = usePersistedField(
    state?.settings.autoDisbandSoloParty,
    false
  );
  const [autoAcceptPartyInvite, setAutoAcceptPartyInvite] = usePersistedField(
    state?.settings.autoAcceptPartyInvite,
    false
  );
  const [partyInviteAcceptMode, setPartyInviteAcceptMode] = usePersistedField(
    state?.settings.partyInviteAcceptMode,
    "anyone" as PartyInviteAcceptMode
  );
  const [partyInviteAllowlistText, setPartyInviteAllowlistText] = usePersistedField(
    state?.settings.partyInviteAllowlistNames
      ? formatPartyInviteAllowlist(state.settings.partyInviteAllowlistNames)
      : undefined,
    ""
  );
  const [autoTrainingEnabled, setAutoTrainingEnabled] = usePersistedField(
    state?.settings.autoTrainingEnabled,
    false
  );
  const [autoTrainingSkillToTrain, setAutoTrainingSkillToTrain] = usePersistedField<
    SkillToTrain | undefined
  >(state?.settings.autoTrainingSkillToTrain, "DISTANCE");
  const [autoTrainingIdleDelaySec, setAutoTrainingIdleDelaySec] = usePersistedField(
    state?.settings.autoTrainingIdleDelaySec != null
      ? String(state.settings.autoTrainingIdleDelaySec)
      : undefined,
    "5"
  );
  const [keepAliveEnabled, setKeepAliveEnabled] = usePersistedField(
    state?.settings.keepAliveEnabled,
    true
  );
  const [autoReconnectEnabled, setAutoReconnectEnabled] = usePersistedField(
    state?.settings.autoReconnectEnabled,
    false
  );

  const saveTools = (overrides?: Record<string, unknown>) =>
    saveSettings({
      autoConfirmPartyHunt,
      autoBuyBless,
      autoDisbandSoloParty,
      autoAcceptPartyInvite,
      partyInviteAcceptMode,
      partyInviteAllowlistNames: parsePartyInviteAllowlist(partyInviteAllowlistText),
      autoTrainingEnabled,
      autoTrainingSkillToTrain: autoTrainingSkillToTrain ?? "DISTANCE",
      autoTrainingIdleDelaySec: Math.max(1, Number(autoTrainingIdleDelaySec) || 5),
      keepAliveEnabled,
      autoReconnectEnabled,
      ...overrides,
    });

  const { masterOn, subsDisabled, handleMasterChange } = useFeatureMasterWithStop("tools", {
    state,
    saveSettings: saveTools,
    onLocalStateReset: (updates) => {
      if (updates.autoConfirmPartyHunt === false) {
        setAutoConfirmPartyHunt(false);
      }
      if (updates.autoBuyBless === false) {
        setAutoBuyBless(false);
      }
      if (updates.autoDisbandSoloParty === false) {
        setAutoDisbandSoloParty(false);
      }
      if (updates.autoAcceptPartyInvite === false) {
        setAutoAcceptPartyInvite(false);
      }
      if (updates.partyInviteAcceptMode != null) {
        setPartyInviteAcceptMode(updates.partyInviteAcceptMode as PartyInviteAcceptMode);
      }
      if (updates.partyInviteAllowlistNames != null) {
        setPartyInviteAllowlistText(
          formatPartyInviteAllowlist(updates.partyInviteAllowlistNames as string[])
        );
      }
      if (updates.autoTrainingEnabled === false) {
        setAutoTrainingEnabled(false);
      }
    },
    showFeedback,
  });

  const trainingBadge: SubFeatureBadge = autoTrainingEnabled
    ? state?.party.partyStatus === "training" || state?.training.activeTrainingId
      ? "live"
      : "on"
    : masterOn
      ? "armed"
      : "off";

  const acceptInviteBadge: SubFeatureBadge = autoAcceptPartyInvite
    ? "on"
    : masterOn
      ? "armed"
      : "off";

  const handleAllowlistBlur = () => {
    const names = parsePartyInviteAllowlist(partyInviteAllowlistText);
    setPartyInviteAllowlistText(formatPartyInviteAllowlist(names));
    void saveTools({ partyInviteAllowlistNames: names });
  };

  return (
    <FeaturePanelLayout
      featureId="tools"
      masterOn={masterOn}
      onMasterChange={handleMasterChange}
      showFeedback={showFeedback}
      subsDisabled={subsDisabled}
      setup={
        <FeatureInputs>
          <StonegyToggle
            id="keep-alive-enabled"
            label="Anti-disconnect"
            checked={keepAliveEnabled !== false}
            onChange={(event) => {
              const enabled = event.target.checked;
              setKeepAliveEnabled(enabled);
              void saveTools({ keepAliveEnabled: enabled });
            }}
          />
          <StonegyToggle
            id="auto-reconnect-enabled"
            label="Auto reconnect"
            checked={autoReconnectEnabled === true}
            onChange={(event) => {
              const enabled = event.target.checked;
              setAutoReconnectEnabled(enabled);
              void saveTools({ autoReconnectEnabled: enabled });
            }}
          />
          <StonegyToggle
            id="auto-confirm-party-hunt"
            label="Auto confirm party hunt"
            checked={autoConfirmPartyHunt}
            disabled={!masterOn}
            onChange={(event) => {
              const checked = event.target.checked;
              setAutoConfirmPartyHunt(checked);
              void saveTools({ autoConfirmPartyHunt: checked });
            }}
          />
          <StonegyToggle
            id="auto-buy-bless"
            label="Auto buy bless"
            checked={autoBuyBless}
            disabled={!masterOn}
            onChange={(event) => {
              const checked = event.target.checked;
              setAutoBuyBless(checked);
              void saveTools({ autoBuyBless: checked });
            }}
          />
          <StonegyToggle
            id="auto-disband-solo-party"
            label="Auto disband solo party"
            checked={autoDisbandSoloParty}
            disabled={!masterOn}
            onChange={(event) => {
              const checked = event.target.checked;
              setAutoDisbandSoloParty(checked);
              void saveTools({ autoDisbandSoloParty: checked });
            }}
          />
        </FeatureInputs>
      }
      subFeatures={[
        {
          id: "accept-party-invite",
          label: "Accept party invite",
          order: 1,
          badge: acceptInviteBadge,
          toggle: {
            checked: autoAcceptPartyInvite,
            disabled: subsDisabled,
            onChange: (checked) => {
              setAutoAcceptPartyInvite(checked);
              void saveTools({ autoAcceptPartyInvite: checked });
            },
          },
          content: (
            <SplitSubFeatureDetail
              controls={
                <SubFeatureSection hideTitle lockAutomation={subsDisabled}>
                  <StonegySelect
                    label="Accept from"
                    value={partyInviteAcceptMode}
                    disabled={!masterOn || subsDisabled}
                    options={[
                      { value: "anyone", label: "Anyone" },
                      { value: "allowlist", label: "Character name list" },
                    ]}
                    onChange={(event) => {
                      const mode = event.target.value as PartyInviteAcceptMode;
                      setPartyInviteAcceptMode(mode);
                      void saveTools({ partyInviteAcceptMode: mode });
                    }}
                  />
                </SubFeatureSection>
              }
              status={
                partyInviteAcceptMode === "allowlist" ? (
                  <label className="flex h-full flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Character names
                    </span>
                    <textarea
                      className="stonegy-input min-h-[120px] flex-1 resize-y text-xs"
                      placeholder={"One name per line\nAlice\nBob"}
                      value={partyInviteAllowlistText}
                      disabled={!masterOn || subsDisabled}
                      onChange={(event) => setPartyInviteAllowlistText(event.target.value)}
                      onBlur={handleAllowlistBlur}
                    />
                  </label>
                ) : null
              }
            />
          ),
        },
        {
          id: "auto-training",
          label: "Auto training",
          order: 2,
          badge: trainingBadge,
          toggle: {
            checked: autoTrainingEnabled,
            disabled: subsDisabled,
            onChange: (checked) => {
              setAutoTrainingEnabled(checked);
              void saveTools({ autoTrainingEnabled: checked });
            },
          },
          content: (
            <SplitSubFeatureDetail
              controls={
                <SubFeatureSection hideTitle lockAutomation={subsDisabled}>
                  <StonegySelect
                    label="Skill to train"
                    value={autoTrainingSkillToTrain ?? "DISTANCE"}
                    disabled={!masterOn || subsDisabled}
                    options={SKILL_OPTIONS}
                    onChange={(event) => {
                      const skill = event.target.value as SkillToTrain;
                      setAutoTrainingSkillToTrain(skill);
                      void saveTools({ autoTrainingSkillToTrain: skill });
                    }}
                  />
                  <StonegyInput
                    label="Idle delay (seconds)"
                    type="number"
                    min={1}
                    className="!w-28"
                    value={autoTrainingIdleDelaySec}
                    disabled={!masterOn || subsDisabled}
                    onChange={(event) => setAutoTrainingIdleDelaySec(event.target.value)}
                    onBlur={() => void saveTools()}
                  />
                </SubFeatureSection>
              }
              status={null}
            />
          ),
        },
      ]}
    />
  );
}
