import {
  PARTY_GRID_BOUNDS,
  isPartyPositionSelectable,
  partyPositionKey,
} from "../../../../lib/hunts";
import { SubFeatureSection } from "../ui/SubFeatureSection";

interface PartyPosition {
  x: number;
  y: number;
}

interface PartyPositionGridProps {
  huntIdForPosition: number | null;
  partyPosition: PartyPosition | null;
  onSelectPosition: (pos: PartyPosition) => void;
  disabled?: boolean;
}

export function PartyPositionGrid({
  huntIdForPosition,
  partyPosition,
  onSelectPosition,
  disabled = false,
}: PartyPositionGridProps) {
  const selectedPositionKey = partyPosition ? partyPositionKey(partyPosition) : null;

  return (
    <SubFeatureSection hideTitle compact lockAutomation={disabled}>
      <div
        className="mx-auto grid w-full max-w-[200px] grid-cols-9 gap-0.5 p-1 stonegy-inset"
        aria-label="Party position grid"
      >
        {Array.from({ length: PARTY_GRID_BOUNDS.yMax - PARTY_GRID_BOUNDS.yMin + 1 }, (_, rowIdx) => {
          const y = PARTY_GRID_BOUNDS.yMin + rowIdx;
          return Array.from(
            { length: PARTY_GRID_BOUNDS.xMax - PARTY_GRID_BOUNDS.xMin + 1 },
            (_, colIdx) => {
              const x = PARTY_GRID_BOUNDS.xMin + colIdx;
              const available = isPartyPositionSelectable(huntIdForPosition, x, y);
              const key = partyPositionKey({ x, y });
              const selected = available && key === selectedPositionKey;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!available}
                  title={available ? "Walkable tile" : "Blocked"}
                  aria-pressed={selected}
                  onClick={() => onSelectPosition({ x, y })}
                  className={`size-5 min-w-0 rounded-sm border p-0 ${
                    available
                      ? selected
                        ? "border-[var(--gold)] bg-[rgba(200,155,60,0.28)] shadow-[inset_0_0_0_1px_rgba(200,155,60,0.45)] cursor-pointer"
                        : "border-[var(--border-gold-soft)] bg-[rgba(28,36,39,0.8)] hover:border-[var(--gold)] cursor-pointer"
                      : "border-[var(--border-gold-soft)] bg-[rgba(16,20,28,0.6)] opacity-35 cursor-not-allowed"
                  }`}
                />
              );
            }
          );
        }).flat()}
      </div>
    </SubFeatureSection>
  );
}
