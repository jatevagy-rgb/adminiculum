import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ACTIVE_CUSTOMER_REQUEST_STATUSES,
  actionItemId,
  actionRequestActionKind,
  assertActionCenterDtoSafe,
  complianceMissingFactHref,
  computeUrgency,
  customerRequestActionKind,
  type PortalActionItem,
} from '../src/modules/client-workspace/orgActionCenterService';

const serviceSource = () => readFileSync(path.join(__dirname, '../src/modules/client-workspace/orgActionCenterService.ts'), 'utf8');
const schemaSource = () => readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');

const DAY = 24 * 60 * 60 * 1000;

describe('Action Center urgency contract', () => {
  it('9. computes OVERDUE when dueAt is strictly in the past', () => {
    const now = new Date('2026-09-29T12:00:00.000Z');
    expect(computeUrgency(new Date(now.getTime() - 1000).toISOString(), now)).toBe('OVERDUE');
  });

  it('10. computes DUE_SOON exactly through the 3-day window', () => {
    const now = new Date('2026-09-29T12:00:00.000Z');
    expect(computeUrgency(new Date(now.getTime() + 3 * DAY).toISOString(), now)).toBe('DUE_SOON');
    expect(computeUrgency(new Date(now.getTime() + DAY).toISOString(), now)).toBe('DUE_SOON');
    expect(computeUrgency(new Date(now.getTime() + 3 * DAY + 1000).toISOString(), now)).toBe('NORMAL');
  });

  it('11. treats null dueAt as NORMAL', () => {
    expect(computeUrgency(null, new Date())).toBe('NORMAL');
    expect(computeUrgency('not-a-date', new Date())).toBe('NORMAL');
  });
});

describe('Action Center active-request contract', () => {
  it('2/3/5. includes only customer-actionable request statuses', () => {
    for (const active of ['PUBLISHED', 'PARTIALLY_SUBMITTED']) {
      expect(ACTIVE_CUSTOMER_REQUEST_STATUSES.has(active)).toBe(true);
    }
    for (const inactive of ['SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DRAFT', 'READY_TO_PUBLISH']) {
      expect(ACTIVE_CUSTOMER_REQUEST_STATUSES.has(inactive)).toBe(false);
    }
  });

  it('maps canonical request types to V3 action kinds', () => {
    expect(customerRequestActionKind('DOCUMENT_UPLOAD')).toBe('UPLOAD');
    expect(customerRequestActionKind('MISSING_DOCUMENT_REQUEST')).toBe('UPLOAD');
    expect(customerRequestActionKind('DATA_FORM')).toBe('FORM');
    expect(customerRequestActionKind('INFORMATION_REQUEST')).toBe('FORM');
    expect(customerRequestActionKind('QUESTION_RESPONSE')).toBe('ANSWER');
    expect(customerRequestActionKind('CORRECTION_REQUEST')).toBe('CORRECTION');
  });

  it('maps published action request type labels to V3 action kinds', () => {
    expect(actionRequestActionKind('Dokumentum bekérése')).toBe('UPLOAD');
    expect(actionRequestActionKind('Megerősítés szükséges')).toBe('CONFIRM');
  });

  it('builds stable prefixed projection ids', () => {
    expect(actionItemId('request', 'abc')).toBe('request-abc');
    expect(actionItemId('compliance', 'topic', 'q1')).toBe('compliance-topic-q1');
  });
});

describe('Action Center read-model boundaries', () => {
  it('13. refuses internal fields in the serialized DTO', () => {
    const clean: PortalActionItem = {
      id: 'request-1',
      sourceType: 'CLIENT_REQUEST',
      sourceId: 'r1',
      domain: 'LEGAL',
      kind: 'UPLOAD',
      title: 'Dokumentum feltöltése',
      contextLabel: 'Ügy',
      dueAt: null,
      urgency: 'NORMAL',
      state: 'OPEN',
      actionLabel: 'Feltöltés megnyitása',
      href: '/portal/matters/m1/requests/r1',
      canCompleteInPortal: true,
      matterPublicationId: 'm1',
    };
    expect(() => assertActionCenterDtoSafe({ items: [clean], counts: { open: 1, overdue: 0, dueSoon: 0 } })).not.toThrow();
    for (const forbidden of ['workInstruction', 'taskNotes', 'reviewer', 'internalOwner', 'sharePoint', 'spItemId', 'aiPrompt', 'aiResponse', 'auditEvent', 'requirementVersionId', 'clientControlId', 'findingId']) {
      const leaking = { items: [{ ...clean, title: forbidden }], counts: { open: 1, overdue: 0, dueSoon: 0 } };
      expect(() => assertActionCenterDtoSafe(leaking)).toThrow();
    }
  });

  it('is a read model with no new persistence', () => {
    const src = serviceSource();
    expect(src).not.toMatch(/createMany|updateMany|deleteMany|create\(\s*\{/);
    const schema = schemaSource();
    expect(schema).not.toMatch(/model PortalTask|model CustomerTask|model UnifiedAction/);
  });

  it('GROW_REQUEST is not currently representable and is not invented', () => {
    const src = serviceSource();
    expect(src).toContain('NOT CURRENTLY REPRESENTABLE');
    // The DTO may declare the GROW_REQUEST source type, but the service must
    // never read or mutate any Grow table and never synthesize Grow items.
    expect(src).not.toMatch(/prisma\.developmentInitiative/);
    expect(src).not.toMatch(/prisma\.businessProcess/);
    expect(src).not.toMatch(/prisma\.businessSystem/);
    expect(src).not.toMatch(/growAssessment/);
    expect(src).not.toMatch(/domain:\s*'GROW'/);
  });

  it('compliance provenance dedupe resolves through canonical relations, not title text', () => {
    const src = serviceSource();
    expect(src).toContain('buildRequestProvenance');
    expect(src).toContain('requirementVersion');
    expect(src).toContain('portalVisibleKeys');
    expect(src).not.toMatch(/title\s*===\s*.*title/);
  });
});

describe('Action Center compliance missing-fact navigation contract', () => {
  const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  it('points each missing fact at the exact customer-safe topic and question', () => {
    const href = complianceMissingFactHref('portal/nis2-scope', 'company_employee_count');
    expect(href.startsWith('/portal/megfeleles?')).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(params.get('topic')).toBe('portal/nis2-scope');
    expect(params.get('question')).toBe('company_employee_count');
  });

  it('produces distinct stable hrefs for two missing questions of the same topic', () => {
    const first = complianceMissingFactHref('portal/nis2-scope', 'company_employee_count');
    const second = complianceMissingFactHref('portal/nis2-scope', 'company_sites');
    expect(first).not.toBe(second);
    expect(second.startsWith('/portal/megfeleles?')).toBe(true);
    expect(complianceMissingFactHref('portal/nis2-scope', 'company_employee_count')).toBe(first);
  });

  it('never carries internal fact, rule or finding identifiers', () => {
    const href = complianceMissingFactHref('portal/nis2-scope', 'company_employee_count');
    for (const forbidden of ['requirementVersionId', 'clientControlId', 'findingId', 'factDefinitionId', 'ruleId', 'applicabilityId']) {
      expect(href.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(href).not.toMatch(UUID_PATTERN);
  });

  it('keeps the missing-fact href inside the customer-safe DTO boundary', () => {
    const item: PortalActionItem = {
      id: 'compliance-portal/nis2-scope-company_employee_count',
      sourceType: 'COMPLIANCE_MISSING_FACT',
      sourceId: 'portal/nis2-scope',
      domain: 'COMPLIANCE',
      kind: 'PROFILE_FACT',
      title: 'Munkavállalók száma',
      contextLabel: 'Kiberbiztonsági (NIS2) hatály',
      dueAt: null,
      urgency: 'NORMAL',
      state: 'OPEN',
      actionLabel: 'Adat megadása',
      href: complianceMissingFactHref('portal/nis2-scope', 'company_employee_count'),
      canCompleteInPortal: true,
      matterPublicationId: null,
    };
    expect(() => assertActionCenterDtoSafe({ items: [item], counts: { open: 1, overdue: 0, dueSoon: 0 } })).not.toThrow();
  });

  it('emits the canonical builder for portal-answerable missing facts, never the bare route', () => {
    const src = serviceSource();
    expect(src).toContain('complianceMissingFactHref(String(topic.topicId), String(missing.questionKey))');
    expect(src).not.toMatch(/href:\s*'\/portal\/megfeleles'/);
  });
});
