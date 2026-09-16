/**
 * C3A — exact CELEX-only canonical binding (no database required).
 *
 * Proves the pure decision rules: only one bindable version of the exact canonical
 * source may bind, everything else is unresolved, and normalization never repairs
 * or invents an identifier. Also proves statically that this flow performs no
 * canonical/requirement writes.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  decideCelexBinding,
  normalizeCelex,
  sourceKeyForCelex,
  type CelexBindingSource,
  type CelexBindingVersion,
} from '../src/modules/compliance-doc-intelligence/legalSourceBinding';

const GDPR_SOURCE: CelexBindingSource = {
  id: 'source-gdpr',
  sourceKey: 'EU-32016R0679',
  canonicalCitation: 'Regulation (EU) 2016/679',
  title: 'GDPR',
};

const gdprVersion = (overrides: Partial<CelexBindingVersion> = {}): CelexBindingVersion => ({
  id: 'version-gdpr-v1',
  legalSourceId: 'source-gdpr',
  status: 'ACTIVE',
  reviewStatus: 'APPROVED',
  ...overrides,
});

describe('C3A CELEX normalization', () => {
  it('normalizes exactly the proven CELEX token shape', () => {
    expect(normalizeCelex('32016R0679')).toBe('32016R0679');
    expect(normalizeCelex('  32016r0679  ')).toBe('32016R0679');
    expect(normalizeCelex('32022L2555')).toBe('32022L2555');
  });

  it('never repairs, derives or partially accepts a value', () => {
    // Punctuation is not stripped, prefixes are not added, and no other
    // identifier family is accepted as CELEX.
    expect(normalizeCelex('EU-32016R0679')).toBeNull();
    expect(normalizeCelex('32016R0679 (01)')).toBeNull();
    expect(normalizeCelex('32016R067')).toBeNull();
    expect(normalizeCelex('32016R06790')).toBeNull();
    expect(normalizeCelex('62018CJ0683')).toBeNull();
    expect(normalizeCelex('CELEX 32016R0679')).toBeNull();
    expect(normalizeCelex('')).toBeNull();
    expect(normalizeCelex(null)).toBeNull();
    expect(normalizeCelex(undefined)).toBeNull();
  });

  it('builds the canonical source key from the proven convention', () => {
    expect(sourceKeyForCelex('32016R0679')).toBe('EU-32016R0679');
    expect(sourceKeyForCelex('32022L2555')).toBe('EU-32022L2555');
  });
});

describe('C3A exact binding decision', () => {
  it('resolves an exact CELEX match with exactly one ACTIVE + APPROVED version', () => {
    const decision = decideCelexBinding({
      rawCelex: '32016R0679',
      source: GDPR_SOURCE,
      versions: [gdprVersion()],
    });
    expect(decision.status).toBe('RESOLVED');
    if (decision.status !== 'RESOLVED') return;
    expect(decision.legalSourceVersionId).toBe('version-gdpr-v1');
    expect(decision.canonicalSourceKey).toBe('EU-32016R0679');
    expect(decision.normalizedCelex).toBe('32016R0679');
    expect(decision.canonicalCitation).toBe('Regulation (EU) 2016/679');
    expect(decision.canonicalTitle).toBe('GDPR');
  });

  it('keeps null canonical labels null instead of inventing one', () => {
    const decision = decideCelexBinding({
      rawCelex: '32016R0679',
      source: { ...GDPR_SOURCE, canonicalCitation: null, title: null },
      versions: [gdprVersion()],
    });
    expect(decision.status).toBe('RESOLVED');
    if (decision.status !== 'RESOLVED') return;
    expect(decision.canonicalCitation).toBeNull();
    expect(decision.canonicalTitle).toBeNull();
  });

  it('leaves an unknown CELEX unresolved', () => {
    const decision = decideCelexBinding({
      rawCelex: '32020R0001',
      source: null,
      versions: [gdprVersion()],
    });
    expect(decision).toMatchObject({ status: 'UNRESOLVED', reason: 'SOURCE_NOT_FOUND' });
  });

  it('leaves a malformed CELEX unresolved', () => {
    for (const malformed of ['not-a-celex', '32016R0679 (01)', 'EU-32016R0679', '62018CJ0683']) {
      expect(
        decideCelexBinding({ rawCelex: malformed, source: GDPR_SOURCE, versions: [gdprVersion()] }),
      ).toMatchObject({ status: 'UNRESOLVED', reason: 'INVALID_CELEX' });
    }
  });

  it('leaves an ELI-only row unresolved (ELI is never used to derive a source)', () => {
    const decision = decideCelexBinding({
      rawCelex: null,
      source: GDPR_SOURCE,
      versions: [gdprVersion()],
    });
    expect(decision).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_CELEX' });
    // The ELI value is not an input to this resolver at all.
    expect(Object.keys({ rawCelex: null, source: GDPR_SOURCE, versions: [] })).not.toContain('eli');
  });

  it('leaves CASE and AUTHORITY rows unresolved', () => {
    for (const anchor of ['CASE', 'AUTHORITY']) {
      const decision = decideCelexBinding({
        rawCelex: null,
        source: GDPR_SOURCE,
        versions: [gdprVersion()],
      });
      expect(anchor).toBeTruthy();
      expect(decision).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_CELEX' });
    }
  });

  it('leaves an ACTIVE but unapproved version unresolved', () => {
    for (const reviewStatus of ['UNREVIEWED', 'IN_REVIEW', 'VERSION_AMBIGUOUS']) {
      expect(
        decideCelexBinding({
          rawCelex: '32016R0679',
          source: GDPR_SOURCE,
          versions: [gdprVersion({ reviewStatus })],
        }),
      ).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_BINDABLE_VERSION' });
    }
  });

  it('leaves an APPROVED but non-ACTIVE version unresolved', () => {
    for (const status of ['CANDIDATE', 'SUPERSEDED', 'RETIRED']) {
      expect(
        decideCelexBinding({
          rawCelex: '32016R0679',
          source: GDPR_SOURCE,
          versions: [gdprVersion({ status })],
        }),
      ).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_BINDABLE_VERSION' });
    }
  });

  it('never picks between multiple bindable versions', () => {
    const decision = decideCelexBinding({
      rawCelex: '32016R0679',
      source: GDPR_SOURCE,
      versions: [gdprVersion({ id: 'v1' }), gdprVersion({ id: 'v2' })],
    });
    expect(decision).toMatchObject({ status: 'UNRESOLVED', reason: 'AMBIGUOUS_BINDABLE_VERSION' });
  });

  it('has no notion of dates or recency it could pick by', () => {
    // The decision input carries only identity + lifecycle state, so a "latest by
    // date" guess is not merely discouraged, it is structurally impossible.
    const keys = Object.keys(gdprVersion()).sort();
    expect(keys).toEqual(['id', 'legalSourceId', 'reviewStatus', 'status']);
    expect(keys.some((key) => /date|time|created|effective|version/i.test(key))).toBe(false);
  });

  it('never binds a version that belongs to another canonical source', () => {
    const decision = decideCelexBinding({
      rawCelex: '32016R0679',
      source: GDPR_SOURCE,
      versions: [gdprVersion({ id: 'foreign', legalSourceId: 'source-other' })],
    });
    expect(decision).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_BINDABLE_VERSION' });
  });
});

describe('C3A write boundary (static)', () => {
  const moduleDir = join(__dirname, '..', 'src', 'modules', 'compliance-doc-intelligence');
  const sources = readdirSync(moduleDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({ file, source: readFileSync(join(moduleDir, file), 'utf8') }));

  it('contains no canonical-registry or requirement write in this flow', () => {
    const forbidden = [
      'legalSource.create',
      'legalSource.update',
      'legalSource.upsert',
      'legalSourceVersion.create',
      'legalSourceVersion.update',
      'legalSourceVersion.upsert',
      'legalSourceCapture.create',
      'requirementCitation',
      'requirement.create',
      'requirement.update',
      'requirementVersion.create',
      'requirementVersion.update',
      'requirementControlMap.create',
      'applicabilityRuleVersion.create',
      'clientControl.create',
    ];
    const offenders: string[] = [];
    for (const { file, source } of sources) {
      for (const token of forbidden) {
        if (source.includes(token)) offenders.push(`${file} :: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reads the canonical registry only through the dedicated resolver', () => {
    const resolver = sources.find(({ file }) => file === 'legalSourceBinding.ts');
    expect(resolver).toBeDefined();
    expect(resolver!.source).toContain('legalSource.findMany');
    expect(resolver!.source).toContain('legalSourceVersion.findMany');
    // No other module in this flow queries the canonical registry directly.
    const others = sources
      .filter(({ file }) => file !== 'legalSourceBinding.ts')
      .filter(({ source }) => source.includes('legalSource.findMany') || source.includes('legalSourceVersion.findMany'))
      .map(({ file }) => file);
    expect(others).toEqual(['service.ts']);
  });
});
