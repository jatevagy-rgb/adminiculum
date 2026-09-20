"use client";

type DocumentWorkspaceTabsProps = {
  active: "overview" | "changes" | "comments" | "approval";
  onChange: (mode: "overview" | "changes" | "comments" | "approval") => void;
};

const tabs = [
  ["overview", "Áttekintés"],
  ["changes", "Változások"],
  ["comments", "Megjegyzések"],
  ["approval", "Jóváhagyás"],
] as const;

export function DocumentWorkspaceTabs({ active, onChange }: DocumentWorkspaceTabsProps) {
  return (
    <nav aria-label="Dokumentum munkatér" className="flex min-w-0 flex-wrap gap-1 border-b border-[var(--adm-border)] pb-1">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={active === key}
          className={`rounded-t px-3 py-2 text-xs font-semibold ${
            active === key
              ? "border-b-2 border-[var(--adm-ochre-500)] text-[var(--adm-text)]"
              : "text-[var(--adm-text-muted)] hover:bg-[var(--adm-surface)] hover:text-[var(--adm-text)]"
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
