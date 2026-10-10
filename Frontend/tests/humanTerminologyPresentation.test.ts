/**
 * FINAL-CLOSURE-HUMAN-TERMINOLOGY-PACK regression cover.
 *
 * Live acceptance reproduced raw canonical tokens in ordinary user-facing
 * presentation (case type, compliance status/instruction, Grow status and
 * unknown-fact wording, document role, review action, publication copy,
 * customer Grow copy). These assertions lock the human labels, the truthful
 * neutral fallbacks and the wiring of each mapped surface.
 *
 * Canonical backend identifiers are intentionally untouched; this is a
 * display-only boundary.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { getCaseMatterTypeLabel, getCaseStatusLabel } from '../src/lib/caseLabels';
import { documentRoleLabel } from '../src/lib/documents/workContext';
import {
  documentReviewStatusLabel,
  UNKNOWN_DOCUMENT_REVIEW_STATUS_LABEL,
} from '../src/lib/taskWorkflowPresentation';
import {
  reviewActionLabel,
  UNKNOWN_REVIEW_TITLE_LABEL,
} from '../src/lib/notificationPresentation';
import {
  complianceFindingStatusLabel,
  complianceRecommendationLabel,
  UNKNOWN_WORKBENCH_STATUS,
  UNKNOWN_COMPLIANCE_RECOMMENDATION_LABEL,
} from '../src/lib/complianceWorkbenchPresentation';
import {
  businessProcessStatusLabelHu,
  complianceEnrollmentStatusLabelHu,
  diagnosisStatusLabelHu,
  discoveryRunStatusLabelHu,
  evidenceReviewStatusLabelHu,
  externalSourceStatusLabelHu,
  growthUnresolvedItemLabel,
  operatingProfileStatusLabelHu,
  UNKNOWN_GROW_STATUS_LABEL,
  UNKNOWN_GROW_UNRESOLVED_ITEM_LABEL,
} from '../src/lib/diagnosticWorkbenchApi';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Case type presentation', () => {
  it('maps the canonical matter types to Hungarian labels', () => {
    assert.equal(getCaseMatterTypeLabel('REAL_ESTATE_SALE'), 'Ingatlan-adásvétel');
    assert.equal(getCaseMatterTypeLabel('OTHER'), 'Egyéb');
    assert.equal(getCaseMatterTypeLabel('OTHER'.toLowerCase()), 'Egyéb');
  });

  it('does not surface a raw Unknown token', () => {
    assert.equal(getCaseMatterTypeLabel('UNKNOWN'), 'Ismeretlen ügytípus');
    assert.equal(getCaseMatterTypeLabel(''), 'Nincs megadva');
    assert.notEqual(getCaseMatterTypeLabel('UNKNOWN'), 'Unknown');
  });

  it('keeps the canonical status map and neutral fallback', () => {
    assert.equal(getCaseStatusLabel('OPEN'), 'Nyitott');
    assert.equal(getCaseStatusLabel('CLOSED'), 'Lezárt');
    assert.equal(getCaseStatusLabel('UNKNOWN'), 'Ismeretlen állapot');
  });
});

describe('Document role presentation', () => {
  it('humanizes the canonical SOURCE role seen on the work card', () => {
    assert.equal(documentRoleLabel('SOURCE'), 'Forrásdokumentum');
    assert.equal(documentRoleLabel('WORKING_COPY'), 'Munkapéldány');
  });

  it('uses neutral labels for unrecognized roles instead of echoing source values', () => {
    assert.equal(documentRoleLabel('SOME_NEW_TOKEN'), 'Egyéb dokumentumszerep');
    assert.equal(documentRoleLabel('Egyedi szerep'), 'Nem meghatározott');
    assert.equal(documentRoleLabel(null), null);
  });
});

describe('Review action presentation', () => {
  it('humanizes the persisted POINT_ADDED action token', () => {
    assert.equal(reviewActionLabel('POINT_ADDED'), 'Review pont hozzáadva');
    assert.equal(reviewActionLabel('APPROVED'), 'Review jóváhagyva');
  });

  it('degrades unknown actions to a neutral token-free label', () => {
    assert.equal(reviewActionLabel('SOMETHING_NEW'), UNKNOWN_REVIEW_TITLE_LABEL);
    assert.doesNotMatch(reviewActionLabel('SOMETHING_NEW'), /_/);
  });

  it('humanizes the document review status and never leaks the raw token', () => {
    assert.equal(documentReviewStatusLabel('APPROVED'), 'Jóváhagyva');
    assert.equal(documentReviewStatusLabel('CHANGES_REQUESTED'), 'Módosítás kérve');
    assert.equal(documentReviewStatusLabel('SOMETHING_NEW'), UNKNOWN_DOCUMENT_REVIEW_STATUS_LABEL);
  });
});

describe('Compliance status and review instruction', () => {
  it('humanizes the finding operational status (OPEN)', () => {
    assert.equal(complianceFindingStatusLabel('OPEN'), 'Nyitott');
    assert.equal(complianceFindingStatusLabel('RESOLVED'), 'Megoldva');
    assert.equal(complianceFindingStatusLabel('SOMETHING_NEW'), UNKNOWN_WORKBENCH_STATUS);
  });

  it('replaces the persisted English next-review instruction with Hungarian', () => {
    assert.equal(
      complianceRecommendationLabel('Review and address this applicable requirement.'),
      'Tekintse át és kezelje ezt a releváns követelményt.',
    );
    assert.doesNotMatch(
      complianceRecommendationLabel('Review and address this applicable requirement.') || '',
      /Review|requirement/i,
    );
  });

  it('degrades an unknown instruction to a neutral Hungarian line', () => {
    assert.equal(complianceRecommendationLabel('Some brand new English text.'), UNKNOWN_COMPLIANCE_RECOMMENDATION_LABEL);
    assert.equal(complianceRecommendationLabel(null), null);
  });
});

describe('Grow status presentation', () => {
  it('humanizes ACTIVE across Grow status surfaces', () => {
    assert.equal(operatingProfileStatusLabelHu('ACTIVE'), 'Aktív');
    assert.equal(businessProcessStatusLabelHu('ACTIVE'), 'Aktív');
    assert.equal(externalSourceStatusLabelHu('ACTIVE'), 'Aktív');
    assert.equal(diagnosisStatusLabelHu('OPEN'), 'Nyitott');
    assert.equal(discoveryRunStatusLabelHu('RUNNING'), 'Fut');
    assert.equal(evidenceReviewStatusLabelHu('PROVIDED'), 'Rögzítve');
    assert.equal(complianceEnrollmentStatusLabelHu('ENROLLED'), 'Bekapcsolva');
  });

  it('degrades unknown Grow statuses to a neutral label', () => {
    assert.equal(operatingProfileStatusLabelHu('TOTALLY_NEW'), UNKNOWN_GROW_STATUS_LABEL);
    assert.equal(evidenceReviewStatusLabelHu('TOTALLY_NEW'), UNKNOWN_GROW_STATUS_LABEL);
  });
});

describe('Grow unknown-fact wording', () => {
  it('never exposes the raw code or the English canonical-fact sentence', () => {
    const rendered = growthUnresolvedItemLabel({ code: 'UNKNOWN_CANONICAL_FACT' });
    assert.doesNotMatch(rendered, /UNKNOWN_CANONICAL_FACT/);
    assert.doesNotMatch(rendered, /canonical fact/i);
    assert.match(rendered, /ismeretlen/i);
  });

  it('humanizes the other bounded Grow items and degrades unknown codes neutrally', () => {
    assert.match(growthUnresolvedItemLabel({ code: 'CONFLICTING_EVIDENCE' }), /ellentmondásos/i);
    assert.match(growthUnresolvedItemLabel({ code: 'INSUFFICIENT_RECOMMENDATION_DATA' }), /további adat/i);
    assert.equal(growthUnresolvedItemLabel({ code: 'SOMETHING_NEW' }), UNKNOWN_GROW_UNRESOLVED_ITEM_LABEL);
  });
});

describe('Mapped surface wiring', () => {
  it('renders the case matter type through the shared map', () => {
    for (const file of [
      'src/app/clients/[clientId]/page.tsx',
      'src/app/reviews/page.tsx',
      'src/app/tasks/page.tsx',
      'src/components/cases/CaseWorkspaceOverview.tsx',
      'src/components/CaseDetail.tsx',
      'src/app/cases/[caseId]/communications/CommunicationsPageContent.tsx',
      'src/components/client-portal/IntakeTriage.tsx',
    ]) {
      assert.match(read(file), /getCaseMatterTypeLabel/, file);
    }
  });

  it('wires the work card document role and review action/status labels', () => {
    const card = read('src/components/documents/DocumentWorkCard.tsx');
    assert.match(card, /documentRoleLabel\(card\.documentRole\)/);
    assert.doesNotMatch(card, /` · \$\{card\.documentRole\}`/);

    assert.match(read('src/components/tasks/TaskReviewWorkspace.tsx'), /<TaskReviewCockpitContent/);
    const review = read('src/components/tasks/TaskReviewCockpitContent.tsx');
    assert.match(review, /documentReviewStatusLabel\(entry\.status\)/);
    assert.match(review, /reviewActionLabel\(entry\.lastDecision\.action\)/);
    assert.doesNotMatch(review, /\{entry\.status\}/);
    assert.doesNotMatch(review, /\{entry\.lastDecision\.action\}/);
  });

  it('wires the compliance operational status and recommendation labels', () => {
    const overview = read('src/components/clients/compliance/ComplianceOverview.tsx');
    assert.match(overview, /complianceFindingStatusLabel\(finding\.operationalStatus\)/);
    assert.match(overview, /complianceRecommendationLabel\(finding\.recommendation\)/);
    assert.doesNotMatch(overview, /Belső állapot: \{finding\.operationalStatus\}/);
    assert.doesNotMatch(overview, /Következő áttekintés: \{finding\.recommendation\}/);
  });

  it('wires the Grow status and unknown-fact wording labels', () => {
    const workbench = read('src/components/clients/GrowWorkbench.tsx');
    assert.match(workbench, /operatingProfileStatusLabelHu\(profileState\.status\)/);
    assert.match(workbench, /growthUnresolvedItemLabel\(m\)/);
    assert.match(workbench, /externalSourceStatusLabelHu\(s\.status\)/);

    const sufficiency = read('src/components/clients/diagnostic-workbench/EvidenceSufficiencyPanel.tsx');
    assert.match(sufficiency, /growthUnresolvedItemLabel\(item\)/);
    assert.doesNotMatch(sufficiency, /item\.message/);
    assert.doesNotMatch(sufficiency, /\(UNKNOWN\)/);
  });

  it('removes identity-grant language from the publication surface', () => {
    const grant = read('src/components/documents/publication/CasePortalIdentityGrant.tsx');
    assert.doesNotMatch(grant, /identity grant/i);
    assert.match(grant, /Ügyfél-hozzáférés ehhez az ügyhöz/);
  });

  it('removes MEASURED from customer-facing Grow copy', () => {
    const portal = read('src/components/client-portal-v3/grow/PortalGrowV3.tsx');
    const orgView = read('src/components/client-portal/OrgGrowView.tsx');
    assert.doesNotMatch(portal, /csak MEASURED alapú/);
    assert.doesNotMatch(orgView, /csak MEASURED alapú/);
    assert.match(portal, /csak mért alapú/);
    assert.match(orgView, /csak mért alapú/);
  });
});
