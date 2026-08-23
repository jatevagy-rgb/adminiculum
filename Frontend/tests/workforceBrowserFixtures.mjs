export const WORKFORCE_FIXTURE = Object.freeze({
  user: {
    id: "qa-user",
    email: "qa-user@adminiculum.test",
    name: "QA Workforce",
    role: "ADMIN",
  },
  client: {
    id: "qa-client",
    name: "QA Client",
    email: "qa-client@adminiculum.test",
  },
  case: {
    id: "qa-case",
    caseNumber: "QA-CASE-001",
    title: "QA Case",
    clientId: "qa-client",
    clientName: "QA Client",
    matterType: "CONTRACT",
    status: "ACTIVE",
    priority: "NORMAL",
  },
  task: {
    id: "qa-task",
    title: "QA task",
    status: "TODO",
    caseId: "qa-case",
  },
  assessment: {
    id: "qa-assessment",
    title: "QA internal assessment",
    status: "COMPLETED",
  },
  findings: [
    { id: "qa-finding-company", title: "QA company finding", scopeType: "COMPANY", requirementKey: "qa-requirement" },
    { id: "qa-finding-employee", title: "QA employee finding", scopeType: "EMPLOYEE", requirementKey: "qa-requirement", subjectLabel: "QA Employee" },
    { id: "qa-finding-contract", title: "QA contract finding", scopeType: "CONTRACT", requirementKey: "qa-requirement", subjectLabel: "QA Contract" },
    { id: "qa-finding-workplace", title: "QA workplace finding", scopeType: "WORKPLACE_SITE", requirementKey: "qa-requirement", subjectLabel: "QA Workplace" },
  ],
});

export const AUTH_ME = WORKFORCE_FIXTURE.user;

export function assertFixtureContract() {
  const ids = [
    WORKFORCE_FIXTURE.user.id,
    WORKFORCE_FIXTURE.client.id,
    WORKFORCE_FIXTURE.case.id,
    WORKFORCE_FIXTURE.task.id,
    WORKFORCE_FIXTURE.assessment.id,
    ...WORKFORCE_FIXTURE.findings.map((finding) => finding.id),
  ];
  if (new Set(ids).size !== ids.length) throw new Error("QA fixture IDs must be unique");
  if (WORKFORCE_FIXTURE.case.clientId !== WORKFORCE_FIXTURE.client.id) throw new Error("QA case must belong to QA client");
  if (WORKFORCE_FIXTURE.task.caseId !== WORKFORCE_FIXTURE.case.id) throw new Error("QA task must belong to QA case");
  const scopes = new Set(WORKFORCE_FIXTURE.findings.map((finding) => finding.scopeType));
  for (const scope of ["COMPANY", "EMPLOYEE", "CONTRACT", "WORKPLACE_SITE"]) {
    if (!scopes.has(scope)) throw new Error(`Missing QA scope: ${scope}`);
  }
}
