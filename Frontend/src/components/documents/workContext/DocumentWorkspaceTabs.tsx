"use client";

export type WorkspaceMode = "document" | "changes" | "review" | "versions";

type DocumentWorkspaceTabsProps = {
  active: WorkspaceMode;
  onNavigate: (mode: WorkspaceMode) => void;
  changeCount?: number | null;
  reviewAttentionCount?: number | null;
  versionCount?: number | null;
};

const tabs = [
  ["document", "DOKUMENTUM"],
  ["changes", "VÁLTOZÁSOK"],
  ["review", "VÉLEMÉNYEZÉS"],
  ["versions", "VERZIÓK"],
] as const;

export function DocumentWorkspaceTabs({ active, onNavigate, changeCount, reviewAttentionCount, versionCount }: DocumentWorkspaceTabsProps) {
  return (
    <nav aria-label="Dokumentum munkatér" className="flex min-w-0 flex-wrap gap-1 border-b border-[var(--adm-border)] pb-1">
      {tabs.map(([key, label]) => {
        const count =
          key === "changes" ? changeCount :
          key === "versions" ? versionCount : null;
        const attention = key === "review" ? reviewAttentionCount : null;
        return (
          <button
            key={key}
            type="button"
            data-testid={`document-mode-${key}`}
            onClick={() => onNavigate(key)}
            aria-pressed={active === key}
            className={`rounded-t px-3 py-2 text-xs font-semibold ${
              active === key
                ? "border-b-2 border-[var(--adm-brand-green)] text-[var(--adm-brand-green)]"
                : "text-[var(--adm-text-secondary)] hover:bg-[var(--adm-canvas-subtle)] hover:text-[var(--adm-text-primary)]"
            }`}
          >
            {label}
            {count != null && count > 0 ? (
              <span className="ml-1.5 rounded-full bg-[var(--adm-canvas-subtle)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--adm-text-secondary)]">
                {count}
              </span>
            ) : null}
            {attention != null && attention > 0 ? (
              <span className="ml-1.5 rounded-full bg-[var(--adm-brand-terracotta)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {attention}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
