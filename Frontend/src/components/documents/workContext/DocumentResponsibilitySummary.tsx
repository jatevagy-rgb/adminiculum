"use client";

/**
 * Responsibility & timing — who owns the document, who reviews it, when it is
 * due, and (where set) its priority. Only populated fields render; there is no
 * row of "Nincs adat" placeholders.
 */
import type { WorkContextView } from "@/lib/documents/workContext";

function Cell({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="min-w-0" data-testid={testid}>
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">{label}</dt>
      <dd className="mt-0.5 truncate text-[12px] text-[var(--adm-text)]">{value}</dd>
    </div>
  );
}

export function DocumentResponsibilitySummary({ view }: { view: WorkContextView }) {
  const cells: Array<{ label: string; value: string; testid: string }> = [];
  if (view.owner) cells.push({ label: "Felelős", value: view.owner.name, testid: "dwh-owner" });
  if (view.reviewer) cells.push({ label: "Reviewer", value: view.reviewer.name, testid: "dwh-reviewer" });
  if (view.dueDate) cells.push({ label: "Határidő", value: view.dueDateLabel, testid: "dwh-due" });
  if (view.priorityLabel) cells.push({ label: "Prioritás", value: view.priorityLabel, testid: "dwh-priority" });

  if (cells.length === 0) return null;

  return (
    <dl data-testid="dwh-responsibility" className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
      {cells.map((c) => <Cell key={c.testid} {...c} />)}
    </dl>
  );
}
