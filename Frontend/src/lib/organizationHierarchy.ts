import type { OrgPersonDTO } from "@/lib/clientOrganizationApi";

export function organizationRootPeople(persons: OrgPersonDTO[]) {
  return persons.filter((person) => !person.organizationGroupId && !person.managerPersonId);
}

export function organizationGroupStarts(persons: OrgPersonDTO[], groupId: string) {
  const members = persons.filter((person) => person.organizationGroupId === groupId);
  return members.filter((person) => !person.managerPersonId || !members.some((candidate) => candidate.id === person.managerPersonId));
}

export function organizationUngroupedStarts(persons: OrgPersonDTO[]) {
  const members = persons.filter((person) => !person.organizationGroupId);
  return members.filter((person) => Boolean(person.managerPersonId) && !members.some((candidate) => candidate.id === person.managerPersonId));
}

export function organizationReportsInScope(persons: OrgPersonDTO[], managerId: string, groupId: string | null) {
  return persons.filter((person) => person.managerPersonId === managerId && person.organizationGroupId === groupId);
}

/** Testable view contract: root cards plus group-local reporting trees render every person once. */
export function visibleOrganizationPersonIds(persons: OrgPersonDTO[], groupIds: string[]) {
  const result: string[] = [];
  const visit = (person: OrgPersonDTO, groupId: string | null) => {
    result.push(person.id);
    organizationReportsInScope(persons, person.id, groupId).forEach((report) => visit(report, groupId));
  };
  organizationRootPeople(persons).forEach((person) => visit(person, null));
  groupIds.forEach((groupId) => organizationGroupStarts(persons, groupId).forEach((person) => visit(person, groupId)));
  organizationUngroupedStarts(persons).forEach((person) => visit(person, null));
  return result;
}
