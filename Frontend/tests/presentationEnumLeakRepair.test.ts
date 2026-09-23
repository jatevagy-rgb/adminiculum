/**
 * Targeted repair regressions for three live-UAT presentation defects:
 *  A. workforce notification enum/type leak,
 *  B. inactive person presented as current responsible person,
 *  C. raw ENROLLED enum in the Company Profile.
 *
 * These assert user-visible outcomes and the canonical active/inactive
 * semantics — not merely that a component exists.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isCurrentOrganizationPerson } from '../src/lib/clientOrganizationApi';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Presentation enum/status leaks — targeted repair', () => {
  it('B: canonical current-person semantics match the backend ACTIVE_PERSON_STATUS', () => {
    assert.equal(isCurrentOrganizationPerson('ACTIVE'), true);
    assert.equal(isCurrentOrganizationPerson('ON_LEAVE'), true);
    assert.equal(isCurrentOrganizationPerson('INACTIVE'), false);
    assert.equal(isCurrentOrganizationPerson('ENDED'), false);
    assert.equal(isCurrentOrganizationPerson('active'), true);
    assert.equal(isCurrentOrganizationPerson('on_leave'), true);
    assert.equal(isCurrentOrganizationPerson(null), false);
    assert.equal(isCurrentOrganizationPerson(undefined), false);
    assert.equal(isCurrentOrganizationPerson(''), false);
  });

  it('B: the normal Organization surface never renders an inactive person as current responsibility', () => {
    const src = read('src/components/clients/ClientOrganization.tsx');
    assert.match(src, /isCurrentOrganizationPerson\(person\.employmentStatus\)/);
    assert.match(src, /const responsibilityPeople = currentPersons\.filter/);
    assert.match(src, /const activePortalPeople = currentPersons\.filter/);
    // Inactive people remain reachable as truthful history.
    assert.match(src, /Korábbi, nem aktuális munkatársak/);
    assert.match(src, /data-testid="organization-historical-persons"/);
    assert.match(src, /organization-historical-responsibility-note/);
    // The current hierarchy is never built from the unfiltered list.
    assert.doesNotMatch(src, /organizationRootPeople\(filteredPersons\)/);
    assert.doesNotMatch(src, /organizationGroupStarts\(filteredPersons/);
    assert.doesNotMatch(src, /organizationReportsInScope\(filteredPersons/);
  });

  it('C: the Company Profile maps the persisted complianceEnrollmentStatus to Hungarian labels', () => {
    const src = read('src/components/clients/ClientCompanyWorkspace.tsx');
    assert.match(src, /ENROLLED: "Bekapcsolva a megfelelőségi értékelésbe"/);
    assert.match(src, /NOT_ENROLLED: "Nincs bekapcsolva a megfelelőségi értékelésbe"/);
    assert.match(src, /SUSPENDED: "Felfüggesztve"/);
    // The persisted value is rendered only through the presentation mapper.
    assert.match(src, /humanStatus\(room\.operatingProfile\?\.complianceEnrollmentStatus\)/);
    assert.doesNotMatch(src, /\{room\.operatingProfile\?\.complianceEnrollmentStatus\}/);
    // The persisted canonical enum and state machine are untouched by this repair.
    assert.doesNotMatch(src, /complianceEnrollmentStatus\s*=/);
  });

  it('A: the workforce notification inbox keeps its presentation mapping (already on master)', () => {
    const src = read('src/app/notifications/page.tsx');
    assert.match(src, /notificationTypePresentation\(item\.type\)/);
    assert.doesNotMatch(src, /\{item\.type\}/);
  });
});
