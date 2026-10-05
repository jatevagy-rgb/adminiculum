/**
 * Targeted repair regression for live finding NEW-01:
 * the notification inbox rendered persisted review action tokens
 * (`Review: POINT_ADDED`, `Review: APPROVED`, …) directly as the row title.
 *
 * These assertions cover the user-visible outcome — a human review label and no
 * raw enum token — plus the preservation of unrelated notifications, the type
 * badge, read state and canonical link handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  UNKNOWN_REVIEW_TITLE_LABEL,
  notificationTitlePresentation,
} from '../src/lib/notificationPresentation';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const KNOWN_REVIEW_ACTIONS: Record<string, string> = {
  ASSIGNED: 'Review kijelölve',
  CREATED: 'Review létrehozva',
  STARTED: 'Review elkezdve',
  POINT_ADDED: 'Review pont hozzáadva',
  POINT_UPDATED: 'Review pont módosítva',
  CHANGES_REQUESTED: 'Review módosítás kérve',
  RESUBMITTED: 'Review újra beküldve',
  APPROVED: 'Review jóváhagyva',
  CANCELLED: 'Review visszavonva',
  CLOSED: 'Review lezárva',
};

describe('Notification inbox — review title presentation repair (NEW-01)', () => {
  it('humanizes every known persisted review action token', () => {
    for (const [action, label] of Object.entries(KNOWN_REVIEW_ACTIONS)) {
      assert.equal(notificationTitlePresentation(`Review: ${action}`), label, action);
    }
  });

  it('never exposes the raw review action token as the title', () => {
    for (const action of Object.keys(KNOWN_REVIEW_ACTIONS)) {
      const rendered = notificationTitlePresentation(`Review: ${action}`);
      assert.ok(!rendered.includes(action), `title must not contain ${action}`);
      assert.doesNotMatch(rendered, /_/);
    }
  });

  it('degrades unknown review actions to a neutral token-free label', () => {
    const rendered = notificationTitlePresentation('Review: TOTALLY_NEW_ACTION');
    assert.equal(rendered, UNKNOWN_REVIEW_TITLE_LABEL);
    assert.doesNotMatch(rendered, /TOTALLY_NEW_ACTION|_/);
    assert.equal(notificationTitlePresentation('Review: '), UNKNOWN_REVIEW_TITLE_LABEL);
    assert.equal(notificationTitlePresentation('Review: 77'), UNKNOWN_REVIEW_TITLE_LABEL);
  });

  it('is case/tolerance safe and does not require exact spacing', () => {
    assert.equal(notificationTitlePresentation('review:  approved '), 'Review jóváhagyva');
    assert.equal(notificationTitlePresentation('REVIEW: CHANGES_REQUESTED'), 'Review módosítás kérve');
  });

  it('leaves non-review titles and malformed values unchanged', () => {
    for (const title of ['Feladat kiosztva', 'Új hozzászólás', 'Review kijelölve', 'Rendszerértesítés']) {
      assert.equal(notificationTitlePresentation(title), title);
    }
    assert.equal(notificationTitlePresentation(''), '');
    assert.equal(notificationTitlePresentation(null), '');
    assert.equal(notificationTitlePresentation(undefined), '');
    assert.equal(notificationTitlePresentation(42), '');
  });

  it('wires the mapper into the inbox title while preserving type, message, read state and links', () => {
    const page = read('src/app/notifications/page.tsx');
    assert.match(page, /notificationTitlePresentation\(item\.title\)/);
    assert.doesNotMatch(page, /\{item\.title\}/);

    // Non-review fields stay canonical and untouched by the repair.
    assert.match(page, /notificationTypePresentation\(item\.type\)/);
    assert.match(page, /\{item\.message\}/);
    assert.match(page, /resolveNotificationHref\(item\.link\)/);
    assert.match(page, /data-read-state=\{item\.isRead \? "read" : "unread"\}/);
    assert.match(page, /markNotificationRead/);
    assert.match(page, /markAllNotificationsRead/);
  });
});
