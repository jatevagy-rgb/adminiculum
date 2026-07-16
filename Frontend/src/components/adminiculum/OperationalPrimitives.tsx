"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AdminButton } from "@/components/adminiculum/ui";

type OperationalPageHeaderProps = {
  title: string;
  count?: number | string | null;
  subtitle?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
};

export function OperationalPageHeader({
  title,
  count,
  subtitle,
  primaryAction,
  secondaryActions,
}: OperationalPageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-[var(--adm-border)] pb-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="font-serif text-[30px] font-medium leading-tight text-[var(--adm-text)]">{title}</h1>
          {count !== null && count !== undefined ? (
            <span className="text-[12px] font-semibold text-[var(--adm-text-muted)]">{count}</span>
          ) : null}
        </div>
        {subtitle ? <p className="mt-1 max-w-3xl text-[12px] text-[var(--adm-text-muted)]">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {secondaryActions}
        {primaryAction}
      </div>
    </header>
  );
}

type CompactStateProps = {
  title: string;
  detail?: string;
  action?: ReactNode;
  tone?: "neutral" | "error";
  className?: string;
};

export function CompactState({ title, detail, action, tone = "neutral", className = "" }: CompactStateProps) {
  const toneClass =
    tone === "error"
      ? "border-[#e3c5c0] bg-[#fff8f6] text-[var(--adm-terracotta-700)]"
      : "border-[var(--adm-border)] bg-white text-[var(--adm-text)]";

  return (
    <div className={`rounded-[var(--adm-radius-md)] border px-4 py-3 ${toneClass} ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] font-semibold">{title}</p>
          {detail ? <p className="mt-1 text-[11px] leading-5 text-[var(--adm-text-muted)]">{detail}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function SafePanelError({
  onRetry,
  detail = "Ez az adat jelenleg nem érhető el.",
}: {
  onRetry?: () => void;
  detail?: string;
}) {
  return (
    <CompactState
      tone="error"
      title="Az adatok betöltése sikertelen."
      detail={detail}
      action={
        onRetry ? (
          <AdminButton size="sm" variant="neutral" onClick={onRetry}>
            Újratöltés
          </AdminButton>
        ) : null
      }
    />
  );
}

export function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]"
    >
      {children}
    </Link>
  );
}
