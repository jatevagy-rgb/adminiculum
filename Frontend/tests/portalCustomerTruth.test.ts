import assert from 'node:assert/strict';
import test from 'node:test';
import { customerRequestTruth } from '../src/lib/portalCustomerTruth';

test('customer and office work have distinct explicit states', () => {
  for (const status of ['PUBLISHED', 'PARTIALLY_SUBMITTED', 'CORRECTION_REQUESTED']) {
    assert.equal(customerRequestTruth(status).label, 'Önre vár');
  }
  assert.equal(customerRequestTruth('SUBMITTED').label, 'Az irodára vár');
  assert.equal(customerRequestTruth('UNDER_INTERNAL_REVIEW').label, 'Ügyvédi ellenőrzés alatt');
});
test('completion never implies publication', () => {
  const state = customerRequestTruth('COMPLETED');
  assert.equal(state.label, 'Elkészült');
  assert.match(state.explanation, /nem jelent dokumentum-közzétételt/);
  assert.notEqual(customerRequestTruth('PUBLISHED').label, 'Közzétéve'); // Request publication asks for work; it is not an output publication.
});
test('unknown, internal draft and future enum values do not invent customer action', () => {
  for (const state of ['', 'DRAFT', 'READY_TO_PUBLISH', 'NEW_FUTURE_STATUS']) {
    assert.equal(customerRequestTruth(state).label, 'Az állapot nem áll rendelkezésre');
    assert.equal(customerRequestTruth(state, 'CORRECTION_REQUESTED').label, 'Az állapot nem áll rendelkezésre');
  }
});
test('terminal states do not look like work waiting on the customer', () => {
  assert.equal(customerRequestTruth('CANCELLED').label, 'Visszavonva');
  assert.equal(customerRequestTruth('EXPIRED').label, 'Lezárt bekérés');
});
test('correction on a submitted request is customer work; terminal parent remains terminal', () => {
  assert.equal(customerRequestTruth('SUBMITTED', 'CORRECTION_REQUESTED').label, 'Önre vár');
  assert.equal(customerRequestTruth('UNDER_INTERNAL_REVIEW', 'CORRECTION_REQUESTED').label, 'Önre vár');
  assert.equal(customerRequestTruth('COMPLETED', 'CORRECTION_REQUESTED').label, 'Elkészült');
  assert.equal(customerRequestTruth('CANCELLED', 'CORRECTION_REQUESTED').label, 'Visszavonva');
});
