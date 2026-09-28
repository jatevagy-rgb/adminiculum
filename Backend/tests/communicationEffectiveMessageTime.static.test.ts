/**
 * Focused guards for the canonical effective message time and the
 * effective-time ordered communications list.
 *
 * Repaired root causes:
 *  - the list DTO exposed no message time and the UI rendered createdAt
 *    (row/import time), so batch-imported messages showed identical timestamps;
 *  - the list ordered by createdAt (import order) instead of actual message time;
 *  - no server-derived direction-aware effective timestamp existed.
 *
 * The repair keeps persisted Graph fields (receivedAt/sentAt) unchanged, adds a
 * server-derived DTO timestamp, and orders BEFORE take/skip with a deterministic
 * id tie-break. No schema or migration change.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = (rel: string): string => readFileSync(path.join(__dirname, '..', rel), 'utf8');

const route = () => src('src/modules/communications/routes.ts');

const listHandler = () => {
  const source = route();
  const start = source.indexOf("router.get('/', authenticate");
  const end = source.indexOf("router.get('/client/:clientId/summary'");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('communications effective message time and ordering', () => {
  it('derives the effective time direction-aware: inbound receivedAt, outbound sentAt', () => {
    const helper = route().match(/function resolveEffectiveMessageAt[\s\S]*?\n}/)![0];
    expect(helper).toContain("row.direction === 'OUTBOUND' ? [sentAt, receivedAt, createdAt] : [receivedAt, sentAt, createdAt]");
  });

  it('falls back safely for legacy/manual rows without provider timestamps', () => {
    const helper = route().match(/function resolveEffectiveMessageAt[\s\S]*?\n}/)![0];
    expect(helper).toMatch(/Number\.isNaN\(candidate\.getTime\(\)\)/);
    expect(helper).toContain('?? createdAt');
  });

  it('exposes sentAt and effectiveMessageAt on the list DTO', () => {
    const mapper = route().match(/function mapCommunicationListItem[\s\S]*?\n}/)![0];
    expect(mapper).toMatch(/sentAt: \(row as any\)\.sentAt \? new Date\(\(row as any\)\.sentAt\)\.toISOString\(\) : null/);
    expect(mapper).toContain('effectiveMessageAt: resolveEffectiveMessageAt(row).toISOString()');
    expect(mapper).toMatch(/receivedAt: \(row as any\)\.receivedAt/);
  });

  it('keeps the DTO free of new internal Graph metadata', () => {
    const mapper = route().match(/function mapCommunicationListItem[\s\S]*?\n}/)![0];
    expect(mapper).not.toMatch(/internetMessageId|bodyHtmlSanitized|mailboxProviderMessageId|syncCursor|access_token/i);
  });

  it('orders by effective message time BEFORE pagination with a deterministic tie-break', () => {
    const handler = listHandler();
    const orderIndex = handler.indexOf(`ORDER BY COALESCE(CASE WHEN direction = 'OUTBOUND' THEN "sentAt" ELSE "receivedAt" END, "receivedAt", "sentAt", "createdAt") DESC, id DESC`);
    const limitIndex = handler.indexOf('LIMIT ${take}::int OFFSET ${skip}::int');
    expect(orderIndex).toBeGreaterThan(-1);
    expect(limitIndex).toBeGreaterThan(orderIndex);
    expect(handler).toContain('$queryRaw<CommunicationListRow[]>');
    expect(handler).not.toContain("orderBy: { createdAt: 'desc' }");
  });

  it('keeps take/skip semantics unchanged and applied in the ordered query', () => {
    const handler = listHandler();
    expect(handler).toContain('const take = parseListLimit(req.query.limit);');
    expect(handler).toContain('const skip = parseNonNegativeInteger(req.query.offset, 0);');
  });

  it('preserves the permission scope, explicit filters and canonical total', () => {
    const handler = listHandler();
    expect(handler).toContain('"caseId" IS NULL AND "createdById" = ');
    expect(handler).toContain('"caseId" IN (');
    expect(handler).toContain('type::text = ');
    // The canonical total keeps the identical permission scope; #434 extends
    // it with the mailbox privacy boundary (list and count share scopedWhere).
    expect(handler).toMatch(/prisma\.communication\.count\(\{ where: scopedWhere \}\)/);
  });

  it('does not persist an effective-time column (no schema or migration change)', () => {
    const handler = listHandler();
    expect(handler).not.toContain('"effectiveMessageAt"');
    expect(handler).not.toContain('effectiveMessageAt"');
    const schema = src('prisma/schema.prisma');
    expect(schema).not.toContain('effectiveMessageAt');
  });
});
