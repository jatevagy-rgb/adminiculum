"use client";

/**
 * Case Context V2 — candidate review list.
 *
 * Every detected candidate is shown explicitly and starts UNAPPROVED. The user
 * approves or unapproves each candidate individually; only explicitly approved
 * ids are sent to the anonymize endpoint. Nothing is auto-approved.
 *
 * The row leads with the human decision object (originalText), then the
 * category, the proposed replacement and a bounded local source excerpt.
 * Confidence is a quiet secondary detail; detector internals stay out of view.
 */

import React from "react";
import { CONFIDENCE_LABELS, categoryLabel, type ReviewCandidate } from "@/lib/caseContextSources";

const EXCERPT_RADIUS = 48;

function excerptAround(rawText: string, start: number, end: number): { before: string; match: string; after: string } {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rawText.length, end);
  const beforeStart = Math.max(0, safeStart - EXCERPT_RADIUS);
  const afterEnd = Math.min(rawText.length, safeEnd + EXCERPT_RADIUS);
  return {
    before: rawText.slice(beforeStart, safeStart),
    match: rawText.slice(safeStart, safeEnd),
    after: rawText.slice(safeEnd, afterEnd),
  };
}

export function CandidateReviewList({
  candidates,
  rawText,
  approvedIds,
  onToggle,
  disabled = false,
}: {
  candidates: ReviewCandidate[];
  rawText: string;
  approvedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  if (candidates.length === 0) {
    return (
      <div data-testid="ccv2-no-candidates" className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">
        <p>Nem jelöltünk meg automatikusan ellenőrizendő elemet.</p>
        <p>Szükség esetén adj meg kifejezést kézzel.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--adm-border)]" data-testid="ccv2-candidate-list">
      {candidates.map((candidate) => {
        const approved = approvedIds.has(candidate.id);
        const excerpt = excerptAround(rawText, candidate.start, candidate.end);
        return (
          <li key={candidate.id} className="px-4 py-3" data-testid={`ccv2-candidate-${candidate.id}`}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={approved}
                disabled={disabled}
                onChange={() => onToggle(candidate.id)}
                aria-label={`${candidate.originalText} jóváhagyása`}
                data-testid={`ccv2-candidate-checkbox-${candidate.id}`}
                className="mt-1 h-4 w-4 shrink-0 accent-[#0F3D32]"
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-[13px] font-semibold leading-5 text-[var(--adm-text)]">
                  {candidate.originalText}
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--adm-text-muted)]">{categoryLabel(candidate.type)}</span>
                <span className="mt-1 block break-words text-[11.5px] leading-5 text-[var(--adm-text)]">
                  <span className="font-semibold">Csere:</span>{" "}
                  <code className="break-all rounded-[3px] bg-[var(--adm-surface)] px-1 py-0.5">{candidate.proposedReplacement}</code>
                </span>
                <span className="mt-1 block break-words rounded-[5px] border border-[rgba(22,32,26,0.10)] bg-[var(--adm-surface)] px-2.5 py-1.5 text-[11.5px] leading-5 text-[var(--adm-text-muted)]">
                  {excerpt.before ? <>…{excerpt.before}</> : null}
                  <span className="rounded-[2px] bg-[rgba(181,138,42,0.22)] px-0.5 font-semibold text-[var(--adm-text)]">{excerpt.match}</span>
                  {excerpt.after ? <>{excerpt.after}…</> : null}
                </span>
                <span className="mt-1 block text-[10.5px] text-[var(--adm-text-soft)]">
                  Bizonyosság: {CONFIDENCE_LABELS[candidate.confidence]}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
