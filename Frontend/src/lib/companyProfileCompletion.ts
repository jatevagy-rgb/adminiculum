/**
 * Canonical company-profile completion.
 *
 * A fact counts as "adat megadva" ONLY when it is ANSWERED. UNKNOWN and
 * UNANSWERED do not count. This is the single source of truth shared by the
 * Company Profile wizard indicator and the Compliance Map profile card, so the
 * two can never drift.
 */
export type CompanyProfileCompletion = {
  total: number;
  answered: number;
  percent: number;
};

export function companyProfileCompletion(
  questions: readonly { status: string }[],
): CompanyProfileCompletion {
  const total = questions.length;
  const answered = questions.filter((question) => question.status === "ANSWERED").length;
  return { total, answered, percent: total ? Math.round((answered / total) * 100) : 0 };
}
