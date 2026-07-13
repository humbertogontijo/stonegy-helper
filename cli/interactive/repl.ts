import { select, input, confirm } from "@inquirer/prompts";
import { FEATURES, FEATURE_TAB_ORDER } from "../../lib/core/features/instances";
import type { FeatureId, SubFeatureId } from "../../lib/core/services/types";
import type { CliSession } from "../session";
import {
  collectPersistedSettings,
  formatFullStatus,
  formatMasterSummary,
  isSubFeatureEnabled,
  isSubFeatureLocked,
  setFeatureMaster,
  setSubFeatureEnabled,
  type FeatureControlContext,
  type FeatureMasterMap,
} from "../feature-control";
import { saveCharacterConfig, type CliCharacterConfig } from "../config";

async function persistConfig(
  characterId: string,
  masters: FeatureMasterMap,
  ctx: FeatureControlContext
): Promise<void> {
  const config: CliCharacterConfig = {
    featureMasters: { ...masters },
    settings: collectPersistedSettings(ctx),
  };
  await saveCharacterConfig(characterId, config);
}

function makeContext(session: CliSession, masters: FeatureMasterMap): FeatureControlContext {
  return {
    session: session.session,
    featureMasters: masters,
    getState: () => session.getState(),
  };
}

function printStatusHeader(ctx: FeatureControlContext): void {
  const state = ctx.getState();
  console.log("");
  console.log("─".repeat(50));
  console.log(
    `Status: ${state.character.characterName ?? "—"} · ${state.party.partyStatus ?? "unknown"} · masters: ${formatMasterSummary(ctx.featureMasters)}`
  );
  console.log("─".repeat(50));
}

async function toggleSubFeatures(
  ctx: FeatureControlContext,
  featureId: FeatureId,
  characterId: string,
  masters: FeatureMasterMap
): Promise<void> {
  const feature = FEATURES[featureId];
  const subFeatures = feature.subFeatures;

  while (true) {
    printStatusHeader(ctx);

    const choice = await select<string>({
      message: `${feature.label} sub-features`,
      choices: [
        ...subFeatures.map((sub) => {
          const locked = isSubFeatureLocked(ctx, sub.id);
          const enabled = isSubFeatureEnabled(ctx, sub.id);
          const prefix = locked ? "[locked]" : enabled ? "[on]" : "[off]";
          return {
            name: `${prefix} ${sub.label}`,
            value: sub.id,
            disabled: locked ? "Locked" : false,
          };
        }),
        { name: "← Back", value: "__back__" },
      ],
    });

    if (choice === "__back__") {
      return;
    }

    const subFeatureId = choice as SubFeatureId;
    const currentlyEnabled = isSubFeatureEnabled(ctx, subFeatureId);

    if (subFeatureId === "hunt.autoHunt" && !currentlyEnabled) {
      const huntIdRaw = await input({
        message: "Hunt id",
        default: String(ctx.session.settings.selectedHuntId ?? ""),
        validate: (value) => {
          const id = Number(value);
          if (!Number.isFinite(id) || id <= 0) {
            return "Enter a valid hunt id.";
          }
          return true;
        },
      });
      const result = await setSubFeatureEnabled(ctx, subFeatureId, true, {
        huntId: Number(huntIdRaw),
      });
      console.log(result.ok ? result.message ?? "Done." : `Error: ${result.error}`);
    } else if (subFeatureId === "tasks.autoTasker" && !currentlyEnabled) {
      const questIdRaw = await input({
        message: "Quest line id",
        default: String(ctx.session.settings.selectedTaskQuestId ?? 6),
        validate: (value) => {
          const id = Number(value);
          if (!Number.isFinite(id) || id <= 0) {
            return "Enter a valid quest id.";
          }
          return true;
        },
      });
      const result = await setSubFeatureEnabled(ctx, subFeatureId, true, {
        questId: Number(questIdRaw),
      });
      console.log(result.ok ? result.message ?? "Done." : `Error: ${result.error}`);
    } else {
      const turnOn = !currentlyEnabled;
      const label = subFeatures.find((s) => s.id === subFeatureId)?.label ?? subFeatureId;
      const proceed = await confirm({
        message: `${turnOn ? "Enable" : "Disable"} ${label}?`,
        default: turnOn,
      });
      if (proceed) {
        const result = await setSubFeatureEnabled(ctx, subFeatureId, turnOn);
        console.log(result.ok ? result.message ?? "Done." : `Error: ${result.error}`);
      }
    }

    await persistConfig(characterId, masters, ctx);
  }
}

async function manageFeature(
  ctx: FeatureControlContext,
  characterId: string,
  masters: FeatureMasterMap
): Promise<void> {
  while (true) {
    printStatusHeader(ctx);

    const featureId = await select<FeatureId | "__back__">({
      message: "Select a feature",
      choices: [
        ...FEATURE_TAB_ORDER.map((id) => ({
          name: `${FEATURES[id].label} [${masters[id] ? "ON" : "OFF"}]`,
          value: id,
        })),
        { name: "← Back", value: "__back__" },
      ],
    });

    if (featureId === "__back__") {
      return;
    }

    while (true) {
      printStatusHeader(ctx);

      const action = await select<string>({
        message: `${FEATURES[featureId].label} [${masters[featureId] ? "ON" : "OFF"}]`,
        choices: [
          {
            name: masters[featureId] ? "Disarm feature (master off)" : "Arm feature (master on)",
            value: "master",
          },
          {
            name: "Toggle sub-features…",
            value: "subs",
            disabled: !masters[featureId] ? "Arm the feature first" : false,
          },
          { name: "← Back", value: "__back__" },
        ],
      });

      if (action === "__back__") {
        break;
      }

      if (action === "master") {
        const turnOn = !masters[featureId];
        const proceed = await confirm({
          message: `${turnOn ? "Arm" : "Disarm"} ${FEATURES[featureId].label}?`,
          default: turnOn,
        });
        if (proceed) {
          const result = await setFeatureMaster(ctx, featureId, turnOn);
          console.log(result.ok ? result.message ?? "Done." : `Error: ${result.error}`);
          await persistConfig(characterId, masters, ctx);
        }
        continue;
      }

      if (action === "subs") {
        await toggleSubFeatures(ctx, featureId, characterId, masters);
      }
    }
  }
}

export async function runRepl(session: CliSession, masters: FeatureMasterMap, characterId: string): Promise<void> {
  const ctx = makeContext(session, masters);

  console.log("[bot] Interactive session started. Press Ctrl+C to quit.");

  while (true) {
    printStatusHeader(ctx);

    const action = await select<string>({
      message: "What do you want to do?",
      choices: [
        { name: "Manage features", value: "features" },
        { name: "Show full status", value: "status" },
        { name: "Quit", value: "quit" },
      ],
    });

    if (action === "quit") {
      console.log("[bot] Goodbye.");
      session.stop();
      return;
    }

    if (action === "status") {
      console.log("");
      console.log(formatFullStatus(ctx));
      continue;
    }

    if (action === "features") {
      await manageFeature(ctx, characterId, masters);
      await persistConfig(characterId, masters, ctx);
    }
  }
}
