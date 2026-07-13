import type { ReactNode } from "react";

interface StonegyPanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}

export function StonegyPanel({ children, className = "", title, action }: StonegyPanelProps) {
  return (
    <section className={`stonegy-panel p-3 ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="section-title">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
