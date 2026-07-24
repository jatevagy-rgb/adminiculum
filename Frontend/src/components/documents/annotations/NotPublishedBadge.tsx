"use client";

/**
 * Persistent "Nem publikált" (Not published) state marker.
 *
 * CLIENT_EXPLANATION_DRAFT annotations are drafts of text that MIGHT one day be
 * shown to a client. Nothing in this slice publishes anything, and CLIENT_CANDIDATE
 * visibility does NOT mean published. The reviewer must be able to see that state
 * at all times — a placeholder inside an empty textarea is not sufficient, because
 * it disappears as soon as any text is typed.
 *
 * Rendered wherever a client-explanation draft is shown: the list card, the detail
 * panel and the draft editor.
 */

export const NOT_PUBLISHED_LABEL = "Nem publikált";

export function NotPublishedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="annotation-not-published"
      title="Ez ügyfélmagyarázat-tervezet. Nem jelenik meg az ügyfélnek, és ebben a verzióban nincs publikálási művelet."
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-[#E7DECB] bg-[var(--adm-sand-100)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#6D5418] ${className}`}
    >
      <span aria-hidden="true">●</span>
      {NOT_PUBLISHED_LABEL}
    </span>
  );
}

/** True when the annotation type is a client-explanation draft. */
export function isClientExplanationDraft(annotationType: string | null | undefined): boolean {
  return annotationType === "CLIENT_EXPLANATION_DRAFT";
}
