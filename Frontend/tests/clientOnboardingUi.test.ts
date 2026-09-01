import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildOnboardingPayload,
  FORBIDDEN_ONBOARDING_KEYS,
  onboardingPayloadIsSafe,
} from '../src/lib/clientOnboardingShared';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('onboarding payload allowlist', () => {
  it('INDIVIDUAL requests never carry organization data', () => {
    const payload = buildOnboardingPayload({ requestedMode: 'INDIVIDUAL', displayName: ' Péterfi ', claimedOrganizationName: 'Ignored Kft.', claimedJobTitle: 'CFO' });
    assert.deepEqual(Object.keys(payload).sort(), ['displayName', 'requestedMode']);
    assert.equal(payload.displayName, 'Péterfi');
    assert.equal(payload.requestedMode, 'INDIVIDUAL');
  });

  it('ORGANIZATION requests include claimed org fields and trim them', () => {
    const payload = buildOnboardingPayload({ requestedMode: 'ORGANIZATION', displayName: 'Péterfi', claimedOrganizationName: ' Példa Zrt. ', claimedUnitName: 'HR', claimedJobTitle: 'HR munkatárs' });
    assert.equal(payload.claimedOrganizationName, 'Példa Zrt.');
    assert.equal(payload.claimedUnitName, 'HR');
    assert.ok(onboardingPayloadIsSafe(payload));
    for (const key of FORBIDDEN_ONBOARDING_KEYS) assert.ok(!(key in payload));
  });

  it('drops empty optional fields', () => {
    const payload = buildOnboardingPayload({ requestedMode: 'ORGANIZATION', displayName: 'Név', claimedOrganizationName: 'Cég', phone: '   ', note: '' });
    assert.deepEqual(Object.keys(payload).sort(), ['claimedOrganizationName', 'displayName', 'requestedMode']);
  });

  it('flags a payload carrying any server-authoritative key', () => {
    assert.equal(onboardingPayloadIsSafe({ requestedMode: 'ORGANIZATION', workspaceId: 'w1' }), false);
    assert.equal(onboardingPayloadIsSafe({ requestedMode: 'ORGANIZATION', clientId: 'c1' }), false);
    assert.equal(onboardingPayloadIsSafe({ requestedMode: 'ORGANIZATION', status: 'APPROVED' }), false);
    assert.equal(onboardingPayloadIsSafe({ requestedMode: 'INDIVIDUAL', displayName: 'ok' }), true);
  });
});

describe('portal onboarding UI contract (structural)', () => {
  const shell = read('src/components/client-portal/ClientPortalShell.tsx');
  const onboarding = read('src/components/client-portal/PortalOnboarding.tsx');

  it('routes onboarding states out of the dead-end into the onboarding surface', () => {
    assert.ok(shell.includes('PortalOnboarding'));
    assert.ok(shell.includes('ONBOARDING_REQUIRED'));
    assert.ok(shell.includes('REQUEST_PENDING'));
    assert.ok(shell.includes('INVITATION_PENDING'));
  });

  it('shows the access-request form with a read-only verified e-mail', () => {
    assert.ok(onboarding.includes('Hozzáférés igénylése'));
    assert.ok(onboarding.includes('onboarding-verified-email'));
    assert.ok(onboarding.includes('readOnly'));
  });

  it('disables submit until consent + required fields (no duplicate submit)', () => {
    assert.ok(onboarding.includes('canSubmit'));
    assert.ok(onboarding.includes('disabled={!canSubmit}'));
    assert.ok(onboarding.includes('setBusy(true)'));
  });

  it('shows the pending state instead of re-rendering an empty form', () => {
    assert.ok(onboarding.includes('Hozzáférési kérelme elbírálásra vár'));
    assert.ok(onboarding.includes('pending-submitted-at'));
  });

  it('keeps invited onboarding human-facing and supports selection plus profile completion', () => {
    assert.ok(onboarding.includes('Meghívást kaptál'));
    assert.ok(onboarding.includes('Meghívásaid'));
    assert.ok(onboarding.includes('invitation-display-name'));
    assert.ok(onboarding.includes('updateClientProfile'));
    assert.ok(onboarding.includes('Csatlakozás'));
    assert.doesNotMatch(onboarding, /grant|scope|workspaceId|membershipId|tenantId/i);
  });
});
