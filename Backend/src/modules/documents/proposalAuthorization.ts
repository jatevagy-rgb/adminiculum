/**
 * Modification proposal decision authority.
 *
 * Accept/Reject is a lawyer-level terminal decision. The object-scoped case
 * authorization (userCanReadCase + HR_CONFIDENTIAL boundary) is applied by the
 * route before this check; this module expresses the ADDITIONAL role/relationship
 * requirement so role alone can never decide:
 *
 *   ADMIN / PARTNER            -> allowed once object authorization succeeds.
 *   LAWYER / COLLAB_LAWYER     -> allowed only when the actor is the document
 *                                 reviewer OR the case assigned lawyer OR the
 *                                 case creator.
 *   TRAINEE / LEGAL_ASSISTANT  -> never decide.
 *   CLIENT / EXTERNAL_REVIEWER -> never decide.
 *
 * Fails closed on unknown roles.
 */

const PRIVILEGED_DECISION_ROLES = new Set(['ADMIN', 'PARTNER']);
const RELATIONSHIP_BOUND_DECISION_ROLES = new Set(['LAWYER', 'COLLAB_LAWYER']);

export interface ProposalDecisionAuthorityParams {
  actorId: string;
  actorRole: string | null | undefined;
  documentReviewerId: string | null | undefined;
  caseAssignedLawyerId: string | null | undefined;
  caseCreatedById: string | null | undefined;
}

export interface ProposalDecisionAuthorityResult {
  allowed: boolean;
  reason: string;
}

export function resolveProposalDecisionAuthority(
  params: ProposalDecisionAuthorityParams
): ProposalDecisionAuthorityResult {
  const role = String(params.actorRole || '');

  if (PRIVILEGED_DECISION_ROLES.has(role)) {
    return { allowed: true, reason: 'privileged_role' };
  }

  if (!RELATIONSHIP_BOUND_DECISION_ROLES.has(role)) {
    return { allowed: false, reason: 'role_not_permitted_to_decide' };
  }

  if (params.documentReviewerId && params.documentReviewerId === params.actorId) {
    return { allowed: true, reason: 'document_reviewer' };
  }
  if (params.caseAssignedLawyerId && params.caseAssignedLawyerId === params.actorId) {
    return { allowed: true, reason: 'case_assigned_lawyer' };
  }
  if (params.caseCreatedById && params.caseCreatedById === params.actorId) {
    return { allowed: true, reason: 'case_creator' };
  }

  return { allowed: false, reason: 'no_relationship_to_document_or_case' };
}
