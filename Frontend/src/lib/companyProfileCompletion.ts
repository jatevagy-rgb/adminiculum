/**
 * Canonical company-profile completion.
 *
 * A fact counts as "adat megadva" ONLY when it is ANSWERED. UNKNOWN and
 * UNANSWERED do not count.
 *
 * The denominator is the set of facts the user can ACTUALLY reach through the
 * current adaptive Company Profile screens. The raw `discovery.questions` list
 * additionally contains facts that are currently hidden by adaptive gating or
 * pulled in only as compliance-engine missing dependencies; those must never
 * inflate the denominator the user sees.
 *
 * Single source of truth shared by the Company Profile wizard indicator and the
 * Compliance Map profile card, so the two can never drift.
 */
export type CompanyProfileCompletion = {
  total: number;
  answered: number;
  percent: number;
};

type CompletionQuestion = { status: string; questionKey?: string | null };
type CompletionScreen = { factBindings: readonly string[] };

export function companyProfileCompletion(
  questions: readonly CompletionQuestion[],
  screens?: readonly CompletionScreen[],
): CompanyProfileCompletion {
  // Reachable facts = the union of the currently-visible screens' fact bindings.
  // Screens are the interaction authority: a raw question that is not bound to a
  // visible screen is not answerable through the Company Profile UI. Passing an
  // explicit (possibly empty) screen list means "use the adaptive authority";
  // omitting it keeps the legacy behaviour of counting every given question.
  const reachable = screens ? new Set(screens.flatMap((screen) => screen.factBindings)) : null;

  const counted = reachable
    ? questions.filter((question) => typeof question.questionKey === "string" && reachable.has(question.questionKey))
    : questions;

  const total = counted.length;
  const answered = counted.filter((question) => question.status === "ANSWERED").length;
  return { total, answered, percent: total ? Math.round((answered / total) * 100) : 0 };
}
