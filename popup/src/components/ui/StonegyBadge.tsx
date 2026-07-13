interface StonegyBadgeProps {
  running: boolean;
  size?: "default" | "compact";
}

export function StonegyBadge({ running, size = "default" }: StonegyBadgeProps) {
  const compact = size === "compact";

  return (
    <span
      className={`shrink-0 rounded-full font-bold uppercase border ${
        compact ? "px-1 py-px text-[8px] tracking-wide" : "px-2.5 py-1 text-[10px] tracking-widest"
      } ${
        running
          ? "text-[#0a1a12] bg-[var(--success)] border-transparent"
          : "text-[var(--text-muted)] bg-[var(--bg-inset)] border-[var(--border-gold-soft)]"
      }${running && !compact ? " animate-[pulse-glow_2s_ease-in-out_infinite]" : ""}`}
      title={running ? "Active" : "Idle"}
    >
      {running ? (compact ? "On" : "RUNNING") : compact ? "Off" : "OFF"}
    </span>
  );
}
