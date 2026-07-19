import { useEffect, useMemo, useState } from "react";
import stonegyLogo from "../../assets/stonegy-logo.svg";
import { REQUIRED_BLESSING_COUNT } from "@stonegy/helper/domain/bless";
import { resolveDisplayedStaminaMs } from "@stonegy/helper/stamina";
import type { BotState } from "@stonegy/helper/types";
import { formatGold, formatPlayerState, formatStamina, titleCase } from "../../utils/format";
import { StonegyBadge } from "../ui/StonegyBadge";
import { RefreshIconButton } from "../ui/RefreshIconButton";

const MAX_PARTY_SIZE = 20;

interface HeaderProps {
  state: BotState | null;
  onRefresh: () => void;
  reloading?: boolean;
  compact?: boolean;
  anyFeatureMasterOn?: boolean;
}

function formatPartyLabel(state: BotState | null): string {
  const count = state?.party.partyMemberCount ?? 1;
  if (count <= 1) {
    return "Solo";
  }
  return `${Math.min(count, MAX_PARTY_SIZE)}/${MAX_PARTY_SIZE}`;
}

function formatBlessLabel(state: BotState | null): string {
  const total =
    state?.bless?.blessings.length && state.bless.blessings.length > 0
      ? state.bless.blessings.length
      : REQUIRED_BLESSING_COUNT;
  const owned =
    state?.bless?.ownedCount != null
      ? state.bless.ownedCount
      : state?.bless?.blessSnapshotSynced
        ? 0
        : null;
  return `${owned ?? "—"}/${total}`;
}

export function Header({
  state,
  onRefresh,
  reloading = false,
  compact = false,
  anyFeatureMasterOn = false,
}: HeaderProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const hasCharacter = !!state?.character.characterName?.trim();

  const characterName = compact
    ? "Stonegy Helper"
    : hasCharacter
      ? state!.character.characterName!.trim()
      : "No character";

  const identityLine = useMemo(() => {
    if (compact) {
      return "Connect to the game";
    }
    const parts: string[] = [];
    if (state?.character.characterVocation) {
      parts.push(titleCase(state.character.characterVocation));
    }
    if (state?.character.level != null) {
      parts.push(`Lv ${state.character.level}`);
    }
    return parts.length ? parts.join(" · ") : "—";
  }, [state?.character.characterVocation, state?.character.level, compact]);

  const partyLabel = formatPartyLabel(state);
  const blessLabel = formatBlessLabel(state);
  const playerState = formatPlayerState(state?.playerState);
  const gold = state?.character.goldCoins != null ? formatGold(state.character.goldCoins) : "—";
  const stamina = formatStamina(resolveDisplayedStaminaMs(state, now));

  return (
    <header className="shrink-0 border-b border-[var(--border-gold)] bg-[linear-gradient(180deg,rgba(1,4,7,0.92),rgba(1,4,7,0.55))] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <img src={stonegyLogo} alt="" className="h-6 w-6 shrink-0" aria-hidden />
          <div className="min-w-0">
            <h1
              className={`m-0 truncate font-[family-name:var(--font-heading)] text-sm font-extrabold leading-tight ${
                compact || hasCharacter ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
              }`}
            >
              {characterName}
            </h1>
            <p className="m-0 truncate text-[10px] text-[var(--text-muted)]">{identityLine}</p>
          </div>
        </div>

        {!compact ? (
          <div className="flex min-w-0 shrink items-center gap-1.5">
            <span
              className="truncate text-[10px] text-[var(--text-body)]"
              title={state?.playerStateDetail?.trim() || undefined}
            >
              {playerState}
            </span>
            <span className="text-[var(--text-muted)]" aria-hidden>
              ·
            </span>
            <span className="truncate text-[10px] font-semibold text-[var(--text-primary)] tabular-nums">
              {gold}
            </span>
            <span className="text-[var(--text-muted)]" aria-hidden>
              ·
            </span>
            <span className="truncate text-[10px] text-[var(--text-body)] tabular-nums">{stamina}</span>
            <span className="text-[var(--text-muted)]" aria-hidden>
              ·
            </span>
            <span
              className="truncate text-[10px] text-[var(--text-body)] tabular-nums"
              title="Blessings"
            >
              {blessLabel} bless
            </span>
            <span className="text-[var(--text-muted)]" aria-hidden>
              ·
            </span>
            <span className="truncate text-[10px] text-[var(--text-body)]">{partyLabel}</span>
            <RefreshIconButton
              label="Reload game page"
              disabled={reloading}
              onClick={onRefresh}
            />
            <StonegyBadge running={anyFeatureMasterOn} />
          </div>
        ) : null}
      </div>
    </header>
  );
}
