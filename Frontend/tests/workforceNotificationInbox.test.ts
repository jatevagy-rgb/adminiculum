import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATIONS_CHANGED_EVENT,
  UNKNOWN_NOTIFICATION_LABEL,
  notificationHrefLabel,
  notificationTypePresentation,
  resolveNotificationHref,
} from '../src/lib/notificationPresentation';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const notificationsPage = () => read('src/app/notifications/page.tsx');
const topBar = () => read('src/components/TopBar.tsx');
const appShell = () => read('src/components/AppShell.tsx');
const authenticatedApp = () => read('src/components/AuthenticatedApp.tsx');
const api = () => read('src/lib/api.ts');
const navigation = () => read('src/lib/navigation.ts');
const sidebar = () => read('src/components/Sidebar.tsx');

/** Source of a named arrow-function/const body up to the next top-level const. */
const bodyOf = (source: string, marker: string, nextMarker: string) =>
  source.slice(source.indexOf(marker), source.indexOf(nextMarker));

describe('Workforce notification inbox — safe internal link gate', () => {
  it('accepts canonical internal application routes emitted by the backend', () => {
    assert.equal(resolveNotificationHref('/tasks?taskId=abc123'), '/tasks?taskId=abc123');
    assert.equal(resolveNotificationHref('/tasks?taskId=a%20b'), '/tasks?taskId=a%20b');
    assert.equal(
      resolveNotificationHref('/cases/c1/documents?documentId=d1&mode=review'),
      '/cases/c1/documents?documentId=d1&mode=review',
    );
    assert.equal(resolveNotificationHref('/cases/c1/documents?mode=publication'), '/cases/c1/documents?mode=publication');
    assert.equal(resolveNotificationHref('  /reviews  '), '/reviews');
  });

  it('never returns an external origin', () => {
    for (const link of [
      'https://evil.example/x',
      'http://evil.example/x',
      '//evil.example/x',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'mailto:someone@example.com',
      'ftp://evil.example/x',
      '/\\evil.example/x',
      '\\\\\\\\evil.example\\x',
    ]) {
      const resolved = resolveNotificationHref(link);
      assert.equal(resolved, null, `expected rejection for ${link}`);
    }
  });

  it('rejects malformed, relative and non-string values without throwing', () => {
    for (const link of ['', '   ', 'tasks?taskId=abc', './tasks', '../tasks', null, undefined, 42, {}, [], true]) {
      assert.equal(resolveNotificationHref(link), null);
    }
    assert.equal(resolveNotificationHref('/tasks?taskId=a\nb'), null);
  });

  it('bounds the destination preview without inventing a route', () => {
    const short = '/tasks?taskId=abc';
    assert.equal(notificationHrefLabel(short), short);
    const long = `/cases/${'x'.repeat(120)}/documents`;
    const label = notificationHrefLabel(long);
    assert.equal(label.length, 62);
    assert.match(label, /…$/);
  });
});

describe('Workforce notification inbox — notification type presentation', () => {
  it('labels every canonical NotificationType with human wording', () => {
    const apiSource = api();
    const unionMatch = apiSource.match(/export type NotificationType =[\r\n]+([\s\S]*?);[\r\n]/);
    assert.ok(unionMatch, 'NotificationType union must exist in the API contract');

    const canonicalTypes = [...unionMatch[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    assert.ok(canonicalTypes.length >= 12, 'expected the full canonical notification type set');

    for (const type of canonicalTypes) {
      const presentation = notificationTypePresentation(type);
      assert.notEqual(presentation.label, UNKNOWN_NOTIFICATION_LABEL, `${type} must not fall back to the generic label`);
      assert.ok(presentation.label.length > 0);
      assert.ok(presentation.tone.length > 0);
    }
  });

  it('degrades unknown or future types to a generic label instead of crashing', () => {
    for (const unknown of ['FUTURE_THING', 'future_thing', '  system  ', 'SYSTEM_V2', '', '   ']) {
      const presentation = notificationTypePresentation(unknown);
      assert.equal(typeof presentation.label, 'string');
      assert.ok(presentation.label.length > 0);
    }
    assert.equal(notificationTypePresentation('FUTURE_THING').label, UNKNOWN_NOTIFICATION_LABEL);
    assert.equal(notificationTypePresentation('').label, UNKNOWN_NOTIFICATION_LABEL);
    assert.equal(notificationTypePresentation(null).label, UNKNOWN_NOTIFICATION_LABEL);
    assert.equal(notificationTypePresentation(undefined).label, UNKNOWN_NOTIFICATION_LABEL);
    assert.equal(notificationTypePresentation(7).label, UNKNOWN_NOTIFICATION_LABEL);
    assert.equal(notificationTypePresentation({ type: 'SYSTEM' }).label, UNKNOWN_NOTIFICATION_LABEL);
    assert.equal(notificationTypePresentation('system').label, notificationTypePresentation('SYSTEM').label);
  });
});

describe('Workforce notification inbox — page contract', () => {
  it('removes the legacy redirect and renders inside the canonical shell', () => {
    const page = notificationsPage();
    assert.doesNotMatch(page, /redirect\(/);
    assert.doesNotMatch(page, /from "next\/navigation"[\s\S]{0,40}\bredirect\b/);
    assert.match(page, /<AuthenticatedApp section="notifications">/);
    assert.match(appShell(), /notifications: "Értesítések"/);
    assert.match(authenticatedApp(), /\| "notifications"/);
  });

  it('reuses the existing canonical notification API and creates no second model', () => {
    const page = notificationsPage();
    for (const token of [
      'getNotifications',
      'getUnreadNotificationsCount',
      'markNotificationRead',
      'markAllNotificationsRead',
    ]) {
      assert.match(page, new RegExp(token), `page must use ${token}`);
    }
    assert.doesNotMatch(page, /fetch\s*\(/);
    assert.doesNotMatch(page, /\/api\/v1/);
    assert.doesNotMatch(page, /prisma|notification\.create/i);
  });

  it('has distinct loading, error and empty states', () => {
    const page = notificationsPage();
    assert.match(page, /data-testid="notification-loading-state"/);
    assert.match(page, /data-testid="notification-error-state"/);
    assert.match(page, /data-testid="notification-empty-state"/);
    assert.match(page, /Nincs új értesítés\./);
    // The empty state is gated on absence of both loading and error, so an API
    // failure can never be rendered as an empty inbox.
    assert.match(page, /const showEmptyState = !isLoading && !loadError && items\.length === 0;/);
    assert.match(page, /SafePanelError/);
    assert.match(page, /role="alert"/);
  });

  it('shows unread and read visual state and never surfaces raw enum names', () => {
    const page = notificationsPage();
    assert.match(page, /data-read-state=\{item\.isRead \? "read" : "unread"\}/);
    assert.match(page, /data-testid="notification-read-state"/);
    assert.match(page, /Olvasatlan/);
    assert.match(page, /Olvasott/);
    assert.match(page, /notificationTypePresentation\(item\.type\)/);
    assert.doesNotMatch(page, /\{item\.type\}/);
  });

  it('exposes mark-one-read and mark-all-read wired to canonical mutations', () => {
    const page = notificationsPage();
    assert.match(page, /data-testid="notification-mark-read"/);
    assert.match(page, /data-testid="notification-mark-all-read"/);

    const markRead = bodyOf(page, 'const handleMarkRead', 'const handleMarkAllRead');
    assert.match(markRead, /await markNotificationRead\(notificationId\)/);
    assert.match(markRead, /await refreshUnreadCount\(true\)/);
    assert.match(markRead, /isRead: true/);

    const markAll = bodyOf(page, 'const handleMarkAllRead', 'const openNotification');
    assert.match(markAll, /await markAllNotificationsRead\(\)/);
    assert.match(markAll, /await refreshUnreadCount\(true\)/);
    assert.match(markAll, /isRead: true/);
  });

  it('refreshes the canonical unread count after every mutation and announces it', () => {
    const page = notificationsPage();
    assert.match(page, /const refreshUnreadCount = useCallback\(async \(announce: boolean\)/);
    assert.match(page, /const result = await getUnreadNotificationsCount\(\);/);
    assert.match(page, /setUnreadCount\(result\.unreadCount\)/);
    assert.match(page, /window\.dispatchEvent\(new Event\(NOTIFICATIONS_CHANGED_EVENT\)\)/);
    assert.match(page, /NOTIFICATIONS_CHANGED_EVENT/);
    assert.match(topBar(), /getUnreadNotificationsCount/);
    assert.match(topBar(), /NOTIFICATIONS_CHANGED_EVENT/);
    assert.match(topBar(), /addEventListener\(NOTIFICATIONS_CHANGED_EVENT/);
  });

  it('uses bounded pagination over the existing limit/offset API', () => {
    const page = notificationsPage();
    assert.match(page, /getNotifications\(NOTIFICATION_PAGE_SIZE, targetOffset\)/);
    assert.match(page, /data-testid="notification-load-more"/);
    assert.match(page, /const hasMore = items\.length < total;/);
    assert.match(page, /setTotal\(response\.pagination\.total\)/);
    assert.match(page, /setOffset\(response\.pagination\.offset\)/);
    assert.doesNotMatch(page, /setInterval|while\s*\(true\)/);
    assert.ok(NOTIFICATION_PAGE_SIZE > 0 && NOTIFICATION_PAGE_SIZE <= 100, 'page size must respect the backend cap');
  });

  it('renders the canonical destination only through the safe-link gate', () => {
    const page = notificationsPage();
    assert.match(page, /const href = resolveNotificationHref\(item\.link\);/);
    assert.match(page, /data-testid="notification-open"/);
    assert.match(page, /\{href \? \(/);
    assert.doesNotMatch(page, /href=\{item\.link\}/);
    assert.match(page, /notificationHrefLabel\(href\)/);
  });

  it('marks read before navigating to a canonical internal destination', () => {
    const page = notificationsPage();
    const open = bodyOf(page, 'const openNotification', 'const hasMore');
    assert.match(open, /if \(!item\.isRead\) \{\s*void handleMarkRead\(item\.id\);/);
    assert.match(open, /router\.push\(href\)/);
  });

  it('keeps notification privacy: no user id, tokens or backend payload rendering', () => {
    const page = notificationsPage();
    assert.doesNotMatch(page, /item\.userId/);
    assert.doesNotMatch(page, /userId/);
    assert.doesNotMatch(page, /Bearer|access_token|localStorage/);
    assert.doesNotMatch(page, /error\.message/);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  });

  it('does not invent priority, analytics or polling', () => {
    const page = notificationsPage();
    assert.doesNotMatch(page, /priorit|fontos|kiemelt prioritás/i);
    assert.doesNotMatch(page, /setInterval|setTimeout\(.*refresh/i);
  });
});

describe('Workforce notification inbox — bell and communications separation', () => {
  it('points the existing bell at the notification inbox', () => {
    const src = topBar();
    assert.match(src, /href="\/notifications"/);
    assert.doesNotMatch(src, /href="\/communications"/);
    assert.match(src, /title="Értesítések"/);
    // The badge still comes from the canonical unread-count endpoint.
    assert.match(src, /getUnreadNotificationsCount/);
    assert.match(src, /unreadNotifications/);
  });

  it('leaves the communications destination and navigation untouched', () => {
    assert.match(navigation(), /id: "communications", label: "Kommunikáció"/);
    assert.doesNotMatch(navigation(), /id: "notifications"/);
    assert.doesNotMatch(sidebar(), /notifications:\s*"\/notifications"/);
    assert.match(read('src/app/communications/page.tsx'), /AuthenticatedApp section="communications"/);
    assert.equal(NOTIFICATIONS_CHANGED_EVENT, 'adminiculum:notifications-changed');
  });
});
