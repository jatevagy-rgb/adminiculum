const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);

export type ResponsibilityActor = {
  userId: string;
  role?: string | null;
};

export type ResponsibilityCaseAccess = {
  assignedLawyerId?: string | null;
  createdById?: string | null;
  isCollaborator?: boolean;
  hasMatter?: boolean;
};

export type ResponsibilityCapabilities = {
  canChangeResponsibleLawyer: boolean;
  canAddCollaborator: boolean;
  canRemoveCollaborator: boolean;
  canChangeCollaboratorRole: boolean;
  canAssignWork: boolean;
  canRecordTime: boolean;
  canViewCaseTime: boolean;
  canViewTeamWorkload: boolean;
};

export function isPrivilegedRole(role?: string | null): boolean {
  return Boolean(role && PRIVILEGED_ROLES.has(role));
}

export function isCaseManager(actor: ResponsibilityActor, caseAccess: ResponsibilityCaseAccess): boolean {
  return (
    isPrivilegedRole(actor.role) ||
    caseAccess.assignedLawyerId === actor.userId ||
    caseAccess.createdById === actor.userId
  );
}

export function deriveResponsibilityCapabilities(
  actor: ResponsibilityActor,
  caseAccess: ResponsibilityCaseAccess
): ResponsibilityCapabilities {
  const manager = isCaseManager(actor, caseAccess);
  const readable = manager || Boolean(caseAccess.isCollaborator);
  const hasMatter = Boolean(caseAccess.hasMatter);

  return {
    canChangeResponsibleLawyer: manager,
    canAddCollaborator: manager,
    canRemoveCollaborator: manager,
    canChangeCollaboratorRole: false,
    canAssignWork: manager || Boolean(caseAccess.isCollaborator),
    canRecordTime: readable && hasMatter,
    canViewCaseTime: readable && hasMatter,
    canViewTeamWorkload: isPrivilegedRole(actor.role),
  };
}
