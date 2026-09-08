import { Prisma } from '@prisma/client';
import { billingDate, parseRateDate, parseRateInput, requireRateManager, resolveHourlyRate } from '../src/modules/hourly-rates/service';

describe('hourly rate input and resolution contract', () => {
  const explicit = { effectiveFrom: '2026-09-08', mode: 'EXPLICIT_RATE', currency: 'HUF', hourlyRate: '45000.1234' };
  it('retains four decimal places without a floating-point amount', () => {
    const rate = parseRateInput(explicit, false, '2026-09-08').hourlyRate;
    expect(rate).toBeInstanceOf(Prisma.Decimal);
    expect(rate?.toFixed(4)).toBe('45000.1234');
    expect(parseRateInput({ ...explicit, hourlyRate: '999999999999999.9999' }, false, '2026-09-08').hourlyRate?.toFixed(4)).toBe('999999999999999.9999');
  });
  it.each([45000, null, '0', '-1', '1e4', '1.12345', '1000000000000000', 'NaN', 'Infinity'])('rejects invalid or numeric amount %s', hourlyRate => {
    expect(() => parseRateInput({ ...explicit, hourlyRate }, false, '2026-09-08')).toThrow();
  });
  it('rejects invalid calendar dates, timestamps and backdating', () => {
    for (const date of ['2026-02-30', '2026-13-01', '', '2026-01-01T12:00:00Z']) expect(() => parseRateDate(date)).toThrow();
    expect(() => parseRateInput(explicit, false, '2026-09-09')).toThrow(/mai naptól/);
  });
  it('supports current/future append only and no foreign currency or hidden input fields', () => {
    expect(parseRateInput(explicit, false, '2026-09-08').effectiveFrom.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(parseRateInput(explicit, false, '2026-01-01').currency).toBe('HUF');
    expect(() => parseRateInput({ ...explicit, currency: 'EUR' }, false, '2026-01-01')).toThrow();
    expect(() => parseRateInput({ ...explicit, createdById: 'other' }, false, '2026-01-01')).toThrow();
  });
  it('requires inheritance to be case-scoped and amount-free', () => {
    const input = { ...explicit, mode: 'INHERIT_CLIENT', hourlyRate: null };
    expect(parseRateInput(input, true, '2026-01-01').hourlyRate).toBeNull();
    expect(() => parseRateInput(input, false, '2026-01-01')).toThrow();
    expect(() => parseRateInput({ ...input, hourlyRate: '45000' }, true, '2026-01-01')).toThrow();
  });
  it('converts timestamp workDate to a Budapest day including DST', () => {
    expect(billingDate(new Date('2026-08-31T22:30:00Z'))).toBe('2026-09-01');
    expect(billingDate(new Date('2026-01-31T22:30:00Z'))).toBe('2026-01-31');
  });
  it('returns explicit unresolved provenance', async () => {
    const db = { client: { findUnique: jest.fn().mockResolvedValue({ id: 'c' }) }, hourlyRateVersion: { findFirst: jest.fn().mockResolvedValue(null) } };
    expect(await resolveHourlyRate({ clientId: 'c', workDate: '2026-09-01' }, db as any)).toMatchObject({ status: 'UNRESOLVED', scope: 'UNRESOLVED', hourlyRate: null, rateVersionId: null, effectiveFrom: null });
  });
  it.each(['ADMIN', 'PARTNER'])('allows active persisted %s', async role => {
    await expect(requireRateManager({ userId: 'u' }, { user: { findUnique: async () => ({ role, status: 'ACTIVE', isActive: true }) } } as any)).resolves.toBeUndefined();
  });
  it.each(['LAWYER', 'CLIENT', 'EXTERNAL_REVIEWER', 'TRAINEE'])('denies %s even if caller claims ADMIN', async role => {
    await expect(requireRateManager({ userId: 'u', role: 'ADMIN' }, { user: { findUnique: async () => ({ role, status: 'ACTIVE', isActive: true }) } } as any)).rejects.toMatchObject({ status: 403 });
  });
  it('denies inactive and missing users', async () => {
    for (const user of [null, { role: 'ADMIN', status: 'ACTIVE', isActive: false }, { role: 'PARTNER', status: 'DISABLED', isActive: true }]) {
      await expect(requireRateManager({ userId: 'u' }, { user: { findUnique: async () => user } } as any)).rejects.toMatchObject({ status: 403 });
    }
  });
});
