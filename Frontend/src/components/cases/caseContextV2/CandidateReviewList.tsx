"use client";

/**
 * Case Context V2 — candidate review list.
 *
 * Every detected candidate is shown explicitly and starts UNAPPROVED. The user
 * approves or unapproves each candidate individually; only explicitly approved
 * ids are sent to the anonymize endpoint. Nothing is auto-approved.
 *
 * A short source excerpt around each span is rendered locally so the reviewer
 * understands the candidate without any separate reversible mapping.
 */

import React from "react";
import { AdminBadge } from "@/components/adminiculum/ui";
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

function confidenceTone(confidence: ReviewCandidate["confidence"]): "green" | "gold" | "neutral" {
  if (confidence === "HIGH") return "green";
  if (confidence === "MEDIUM") return "gold";
  return "neutral";
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
      <p data-testid="ccv2-no-candidates" className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">
        A detektálás nem talált érzékenynek tűnő elemet ebben a szövegben.
      </p>
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
                data-testid={`ccv2-candidate-checkbox-${candidate.id}`}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#0F3D32]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-[var(--adm-text)]">{categoryLabel(candidate.type)}</span>
                  <AdminBadge tone={confidenceTone(candidate.confidence)}>{CONFIDENCE_LABELS[candidate.confidence]}</AdminBadge>
                  <span className="text-[10.5px] text-[var(--adm-text-soft)]">{candidate.detector}</span>
                </span>
                <span className="mt-1.5 block rounded-[5px] border border-[rgba(22,32,26,0.10)] bg-[var(--adm-surface)] px-2.5 py-1.5 text-[11.5px] leading-5 text-[var(--adm-text)]">
                  {excerpt.before ? <span className="text-[var(--adm-text-muted)]">…{excerpt.before}</span> : null}
                  <span className="rounded-[2px] bg-[rgba(181,138,42,0.22)] px-0.5 font-semibold">{excerpt.match}</span>
                  {excerpt.after ? <span className="text-[var(--adm-text-muted)]">{excerpt.after}…</span> : null}
                </span>
                <span className="mt-1 block text-[11.5px] text-[var(--adm-text)]">
                  <span className="font-semibold">Javasolt csere:</span>{" "}
                  <code className="rounded-[3px] bg-[var(--adm-surface)] px-1 py-0.5">{candidate.proposedReplacement}</code>
                </span>
                {candidate.note ? <span className="mt-1 block text-[11px] text-[var(--adm-text-muted)]">{candidate.note}</span> : null}
                <span className={`mt-1.5 block text-[11px] font-semibold ${approved ? "text-[var(--adm-green-800)]" : "text-[var(--adm-text-muted)]"}`}>
                  {approved ? "Jóváhagyva — alkalmazásra kerül" : "Nincs jóváhagyva — nem kerül alkalmazásra"}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
