interface TabBadgeProps {
  active: boolean;
  children: string;
}

export function TabBadge({ active, children }: TabBadgeProps) {
  return (
    <span
      className={`feature-tab-badge ${active ? "feature-tab-badge-on" : "feature-tab-badge-off"}`}
      title={active ? "Active" : "Idle"}
    >
      <span className="feature-tab-badge-inner">{children}</span>
    </span>
  );
}
