import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Notification / Communication badge separation.
 *
 * #330 made notifications a first-class domain with the canonical entry point on
 * the TopBar bell (`/notifications`). The pre-existing Sidebar badge next to the
 * "Kommunikáció" navigation item was derived from the NOTIFICATION unread count,
 * which falsely presented notification volume as communication volume.
 *
 * The correction removes that derived badge while preserving the canonical
 * notification badge on the bell. No communication unread model is invented.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const sidebar = () => read('src/components/Sidebar.tsx');
const topBar = () => read('src/components/TopBar.tsx');
const navigation = () => read('src/lib/navigation.ts');

describe('notification vs communication badge separation', () => {
  it('does not derive a Communication badge from the notification unread count', () => {
    const src = sidebar();

    assert.doesNotMatch(
      src,
      /getUnreadNotificationsCount/,
      'the Sidebar must not read the notification unread count',
    );
    assert.doesNotMatch(
      src,
      /unreadNotifications/,
      'the Sidebar must not render a notification-derived count',
    );
    assert.doesNotMatch(
      src,
      /nav\.id === ["']communications["']/,
      'the communications nav entry must not carry a notification badge',
    );
  });

  it('keeps the canonical notification badge on the TopBar bell', () => {
    const src = topBar();

    assert.match(src, /href="\/notifications"/, 'the bell must still open the notification inbox');
    assert.match(src, /getUnreadNotificationsCount/, 'the bell badge must stay backed by the canonical endpoint');
    assert.match(src, /unreadNotifications/, 'the bell must still render the unread count');
    assert.match(src, /NOTIFICATIONS_CHANGED_EVENT/, 'the bell must still refresh after read-state mutations');
  });

  it('keeps Communications pointed at its own destination', () => {
    assert.match(navigation(), /id: "communications", label: "Kommunikáció"/);
    assert.match(read('src/app/communications/page.tsx'), /AuthenticatedApp section="communications"/);
  });
});
