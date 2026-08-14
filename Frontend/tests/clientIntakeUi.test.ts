import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  attachmentStateLabel,
  buildCreateIntakePayload,
  buildUpdateIntakePayload,
  FORBIDDEN_INTAKE_KEYS,
  intakeErrorMessage,
  intakeStatusTone,
  payloadIsCustomerSafe,
} from '../src/lib/clientIntakeShared';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('CP1 intake shared helpers', () => {
  it('create payload allowlist never carries server-authoritative fields', () => {
    const payload = buildCreateIntakePayload({ subject: ' Munkaügy ', description: ' Kérdés ', organizationGroupId: 'g1', urgency: 'HIGH', requestedDeadline: '2026-09-01' });
    assert.deepEqual(Object.keys(payload).sort(), ['description', 'organizationGroupId', 'requestedDeadline', 'subject', 'urgency']);
    assert.equal(payload.subject, 'Munkaügy');
    assert.ok(payloadIsCustomerSafe(payload));
    for (const key of FORBIDDEN_INTAKE_KEYS) assert.ok(!(key in payload));
  });

  it('create payload omits empty optional fields', () => {
    const payload = buildCreateIntakePayload({ subject: 'a', description: 'b' });
    assert.deepEqual(Object.keys(payload).sort(), ['description', 'subject']);
  });

  it('update payload only includes changed keys + expectedRevision', () => {
    const payload = buildUpdateIntakePayload({ subject: 'x' }, 3);
    assert.deepEqual(Object.keys(payload).sort(), ['expectedRevision', 'subject']);
    assert.equal(payload.expectedRevision, 3);
    assert.ok(payloadIsCustomerSafe(payload));
  });

  it('payloadIsCustomerSafe rejects injected server fields', () => {
    assert.equal(payloadIsCustomerSafe({ subject: 'x', status: 'CONVERTED_TO_CASE' }), false);
    assert.equal(payloadIsCustomerSafe({ subject: 'x', permissions: ['MATTER_READ'] }), false);
  });

  it('attachment labels never claim a clean/verified state', () => {
    assert.equal(attachmentStateLabel('ready-for-review'), 'Feldolgozható');
    assert.equal(attachmentStateLabel('processing-unavailable'), 'Biztonsági ellenőrzésre vár');
    assert.equal(attachmentStateLabel('not-accepted'), 'A fájl nem használható');
    // must not assert safety
    assert.ok(!attachmentStateLabel('processing-unavailable').includes('Biztonságos'));
  });

  it('status tone maps every backend status code', () => {
    for (const code of ['draft', 'submitted', 'triage-in-progress', 'more-information-required', 'linked', 'converted', 'declined', 'closed', 'withdrawn']) {
      assert.equal(typeof intakeStatusTone(code), 'string');
    }
  });

  it('error mapping surfaces actionable messages, not raw codes', () => {
    assert.ok(intakeErrorMessage('REVISION_CONFLICT').includes('módosult'));
    assert.ok(intakeErrorMessage('INTAKE_NOT_WITHDRAWABLE').includes('nem vonható'));
    assert.ok(!intakeErrorMessage('P2034').includes('P2034'));
  });
});

describe('CP1 customer intake UI contract (structural)', () => {
  const src = read('src/components/client-portal/CustomerIntake.tsx');
  it('gates the resulting Case link on the backend-confirmed reference', () => {
    assert.ok(src.includes('linkedMatterPublicationId'));
    assert.ok(src.includes('/portal/matters/${encodeURIComponent(intake.linkedMatterPublicationId)}'));
    assert.ok(src.includes('még nincs közzétéve'));
    assert.ok(!src.includes('linkedCaseReference'));
  });
  it('submit and withdraw are behind explicit confirmation', () => {
    assert.ok(src.includes('confirmSubmit'));
    assert.ok(src.includes('confirmWithdraw'));
  });
  it('uses the payload allowlist builders, not broad object spreads to the API', () => {
    assert.ok(src.includes('buildCreateIntakePayload'));
    assert.ok(src.includes('buildUpdateIntakePayload'));
  });
});

describe('CP1 internal triage UI contract (structural)', () => {
  const src = read('src/components/client-portal/IntakeTriage.tsx');
  it('renders actions strictly from server availableTransitions', () => {
    assert.ok(src.includes('availableTransitions.includes'));
  });
  it('states that simple linking creates no customer access', () => {
    assert.ok(src.includes('nem ad az ügyfélnek hozzáférést'));
  });
  it('keeps information-request drafts hidden until published', () => {
    assert.ok(src.includes('piszkozat nem látható'));
  });
  it('shows the exact requester permission list before granting', () => {
    assert.ok(src.includes('PermissionPicker'));
  });
  it('publishes initial snapshot with the backend publication field names', () => {
    assert.ok(src.includes('publicTitle:'));
    assert.ok(src.includes('publicStatus:'));
    assert.ok(src.includes('nextStep:'));
    assert.ok(!src.includes('clientSafeTitle:'));
    assert.ok(!src.includes('clientSafeStatus:'));
    assert.ok(!src.includes('clientSafeNextStep:'));
  });
});
