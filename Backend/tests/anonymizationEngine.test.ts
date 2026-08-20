/**
 * Deterministic anonymization foundation tests (ANONYMIZATION-FOUNDATION-1).
 *
 * These tests lock the DETECT → REVIEW → APPLY contract: detection produces
 * reviewable candidates, only explicitly approved redactions are applied, and
 * application is deterministic and offset-safe on Unicode/Hungarian text.
 *
 * All fixtures are synthetic. No real customer documents or real personal data
 * are used.
 */
import {
  applyApprovedRedactions,
  buildSanitizedPackage,
  createApprovedRedactions,
  detectCandidates,
  detectExactTermCandidates,
  findOccurrences,
  foldForMatch,
  placeholderFor,
  PseudonymAssigner,
  runAnonymization,
  AnonymizationInputTooLargeError,
  MAX_INPUT_CHARS,
  type AnonymizationCandidate,
  type AnonymizationOptions,
} from '../src/modules/anonymization';

const noTerms = (): AnonymizationOptions => ({ manualTerms: [] });

const detect = (text: string, options: AnonymizationOptions) => detectCandidates(text, options).candidates;

const ids = (candidates: AnonymizationCandidate[]) => candidates.map((c) => c.id);

describe('detectors: email', () => {
  it('detects a simple email', () => {
    const c = detect('Kapcsolat: kovacs.peter@example.hu', noTerms());
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe('EMAIL');
    expect(c[0].originalText).toBe('kovacs.peter@example.hu');
    expect(c[0].detector).toBe('email');
    expect(c[0].confidence).toBe('HIGH');
  });

  it('detects multiple emails', () => {
    const c = detect('a@b.hu és c.d@x.org találkozó', noTerms());
    expect(c.map((x) => x.originalText).sort()).toEqual(['a@b.hu', 'c.d@x.org']);
  });

  it('does not fire on a bare @ without a domain', () => {
    const c = detect('valami@itt', noTerms());
    expect(c).toHaveLength(0);
  });
});

describe('detectors: phone', () => {
  it('detects a Hungarian mobile +36 number', () => {
    const c = detect('Telefon: +36 30 123 4567', noTerms());
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe('PHONE');
    expect(c[0].originalText).toBe('+36 30 123 4567');
  });

  it('detects a 06-prefixed number with dashes', () => {
    const c = detect('Mobil: 06-30-123-4567', noTerms());
    expect(c).toHaveLength(1);
    expect(c[0].originalText).toBe('06-30-123-4567');
  });

  it('detects a landline with area code', () => {
    const c = detect('Vezetékes: +36 1 234 5678', noTerms());
    expect(c).toHaveLength(1);
    expect(c[0].originalText).toBe('+36 1 234 5678');
  });

  it('detects a generic international number', () => {
    const c = detect('Külföldi: +49 170 1234567', noTerms());
    expect(c.some((x) => x.type === 'PHONE' && x.originalText.includes('+49'))).toBe(true);
  });
});

describe('detectors: IBAN', () => {
  it('detects a grouped Hungarian IBAN', () => {
    const c = detect('Számla: HU12 3456 7890 1234 5678 9012 34', noTerms());
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe('IBAN');
    expect(c[0].originalText).toBe('HU12 3456 7890 1234 5678 9012 34');
  });

  it('detects an unspaced Hungarian IBAN', () => {
    const c = detect('Számla: HU123456789012345678901234', noTerms());
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe('IBAN');
  });

  it('rejects a too-short shape (not an IBAN)', () => {
    const c = detect('AB12 3456', noTerms());
    expect(c.some((x) => x.type === 'IBAN')).toBe(false);
  });

  it('rejects dashed shapes (not valid IBAN separators)', () => {
    const c = detect('HU12-3456-7890-1234-5678-9012-34', noTerms());
    expect(c.some((x) => x.type === 'IBAN')).toBe(false);
  });
});

describe('detectors: tax and identifiers', () => {
  it('detects a Hungarian tax number (adószám)', () => {
    const c = detect('Adószám: 12345678-1-41', noTerms());
    expect(c.some((x) => x.type === 'TAX_ID' && x.originalText === '12345678-1-41')).toBe(true);
  });

  it('detects an EU VAT number', () => {
    const c = detect('EU-s adó: HU12345678', noTerms());
    expect(c.some((x) => x.type === 'TAX_ID' && x.detector === 'eu-vat')).toBe(true);
  });

  it('detects a Hungarian company registry number', () => {
    const c = detect('Cégjegyzék: 01-09-123456', noTerms());
    expect(c.some((x) => x.type === 'IDENTIFIER' && x.originalText === '01-09-123456')).toBe(true);
  });

  it('does NOT auto-detect arbitrary long numeric sequences', () => {
    const c = detect('Sorozatszám: 123456789012345678901234567890', noTerms());
    expect(c.filter((x) => x.type === 'TAX_ID' || x.type === 'IDENTIFIER' || x.type === 'IBAN')).toHaveLength(0);
  });
});

describe('detectors: manual exact terms', () => {
  it('finds exact terms regardless of case and accents', () => {
    const text = 'KOVÁCS PÉTER nyilatkozik. kovacs peter aláírta.';
    const { candidates } = detectExactTermCandidates(
      text,
      [{ term: 'Kovács Péter', category: 'PERSON' }],
      { caseInsensitive: true, diacriticInsensitive: true, minTermLength: 2 },
    );
    expect(candidates).toHaveLength(2);
    expect(candidates[0].originalText).toBe('KOVÁCS PÉTER');
    expect(candidates[1].originalText).toBe('kovacs peter');
    expect(candidates.every((c) => c.type === 'PERSON')).toBe(true);
  });

  it('offsets point at the true original substring', () => {
    const text = 'Őr: Ötvös Tibor, ügyfél: Nagy Anna.';
    const { candidates } = detectExactTermCandidates(
      text,
      [{ term: 'Nagy Anna', category: 'PERSON' }],
      { caseInsensitive: true, diacriticInsensitive: true, minTermLength: 2 },
    );
    expect(candidates).toHaveLength(1);
    expect(text.slice(candidates[0].start, candidates[0].end)).toBe('Nagy Anna');
  });

  it('warns for terms not present in the source', () => {
    const { warnings } = detectExactTermCandidates(
      'Teljesen más szöveg.',
      [{ term: 'Projekt Főnix', category: 'PROJECT' }],
      { caseInsensitive: true, diacriticInsensitive: true, minTermLength: 2 },
    );
    expect(warnings.some((w) => w.includes('not found'))).toBe(true);
  });

  it('ignores single-character terms by default', () => {
    const { candidates, warnings } = detectExactTermCandidates(
      'A B C',
      [{ term: 'B', category: 'OTHER_SENSITIVE' }],
      { caseInsensitive: true, diacriticInsensitive: true, minTermLength: 2 },
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.some((w) => w.includes('too short'))).toBe(true);
  });
});

describe('overlap resolution', () => {
  it('keeps the manual term and drops the email inside it', () => {
    const text = 'Kapcsolat: kovacs.peter@example.hu (Kovács Péter)';
    const { candidates, warnings } = detectCandidates(text, {
      manualTerms: [{ term: 'kovacs.peter@example.hu (Kovács Péter)', category: 'BUSINESS_SECRET' }],
    });
    const business = candidates.filter((c) => c.type === 'BUSINESS_SECRET');
    const emails = candidates.filter((c) => c.type === 'EMAIL');
    expect(business).toHaveLength(1);
    expect(emails).toHaveLength(0);
    expect(warnings.some((w) => w.includes('overlaps'))).toBe(true);
  });

  it('keeps the longer IBAN and drops the overlapping EU-VAT fragment', () => {
    const text = 'HU123456789012345678901234';
    const { candidates } = detectCandidates(text, noTerms());
    const ibans = candidates.filter((c) => c.type === 'IBAN');
    const vats = candidates.filter((c) => c.type === 'TAX_ID' && c.detector === 'eu-vat');
    expect(ibans).toHaveLength(1);
    expect(vats).toHaveLength(0);
  });

  it('produces stable candidate ids', () => {
    const a = ids(detect('a@b.hu, c@d.hu', noTerms()));
    const b = ids(detect('a@b.hu, c@d.hu', noTerms()));
    expect(a).toEqual(b);
  });
});

describe('pseudonymization consistency', () => {
  it('repeated value gets the same placeholder', () => {
    const text = 'Szerződő: Kovács Péter. Képviselő: Kovács Péter.';
    const opts: AnonymizationOptions = { manualTerms: [{ term: 'Kovács Péter', category: 'PERSON' }] };
    const { result } = runAnonymization(text, opts, ids(detect(text, opts)));
    expect(result.appliedCount).toBe(2);
    expect(result.anonymizedText).toContain('[SZEMÉLY_1]');
    expect(result.anonymizedText).not.toContain('[SZEMÉLY_2]');
  });

  it('different values get different pseudonyms', () => {
    const text = 'Kovács Péter és Nagy Anna';
    const opts: AnonymizationOptions = {
      manualTerms: [
        { term: 'Kovács Péter', category: 'PERSON' },
        { term: 'Nagy Anna', category: 'PERSON' },
      ],
    };
    const { result } = runAnonymization(text, opts, ids(detect(text, opts)));
    expect(result.anonymizedText).toContain('[SZEMÉLY_1]');
    expect(result.anonymizedText).toContain('[SZEMÉLY_2]');
  });

  it('per-category numbering is independent', () => {
    const text = 'Kovács Péter kovacs.peter@example.hu';
    const opts: AnonymizationOptions = {
      manualTerms: [{ term: 'Kovács Péter', category: 'PERSON' }],
    };
    const { result } = runAnonymization(text, opts, ids(detect(text, opts)));
    expect(result.anonymizedText).toContain('[SZEMÉLY_1]');
    expect(result.anonymizedText).toContain('[EMAIL_1]');
  });

  it('placeholderFor produces the documented forms', () => {
    expect(placeholderFor('PERSON', 1)).toBe('[SZEMÉLY_1]');
    expect(placeholderFor('EMAIL', 1)).toBe('[EMAIL_1]');
    expect(placeholderFor('PHONE', 1)).toBe('[TELEFON_1]');
    expect(placeholderFor('IBAN', 1)).toBe('[IBAN_1]');
    expect(placeholderFor('BUSINESS_SECRET', 3)).toBe('[ÜZLETI_TITOK_3]');
  });

  it('assigner groups accented and unaccented spellings together', () => {
    const a = new PseudonymAssigner();
    const x = a.assign('PERSON', 'Kovács Péter');
    const y = a.assign('PERSON', 'KOVACS PETER');
    expect(x).toBe(y);
  });
});

describe('approval gating', () => {
  it('applies only approved candidates', () => {
    const text = 'Kovács Péter és Nagy Anna.';
    const opts: AnonymizationOptions = {
      manualTerms: [
        { term: 'Kovács Péter', category: 'PERSON' },
        { term: 'Nagy Anna', category: 'PERSON' },
      ],
    };
    const candidates = detect(text, opts);
    const kovacs = candidates.find((c) => c.originalText.includes('Kovács'));
    const { result } = runAnonymization(text, opts, [kovacs!.id]);
    expect(result.appliedCount).toBe(1);
    expect(result.anonymizedText).toContain('[SZEMÉLY_1]');
    expect(result.anonymizedText).toContain('Nagy Anna'); // unapproved → unchanged
  });

  it('unapproved candidate leaves text unchanged', () => {
    const text = 'Cím: kovacs.peter@example.hu';
    const { result } = runAnonymization(text, noTerms(), []);
    expect(result.appliedCount).toBe(0);
    expect(result.anonymizedText).toBe(text);
  });

  it('warns on unknown approved ids without aborting', () => {
    const text = 'a@b.hu';
    const { result } = runAnonymization(text, noTerms(), ['cand-999']);
    expect(result.appliedCount).toBe(0);
    expect(result.warnings.some((w) => w.includes('cand-999'))).toBe(true);
  });

  it('empty approval list never applies anything', () => {
    const text = 'Telefon: +36 30 123 4567';
    const { result } = runAnonymization(text, noTerms(), []);
    expect(result.appliedCount).toBe(0);
    expect(result.anonymizedText).toBe(text);
  });
});

describe('offset-safe application', () => {
  it('handles replacements of differing lengths without corruption', () => {
    const text = 'Kovács Péter (Kovács Péter) Kovács Péter';
    const opts: AnonymizationOptions = { manualTerms: [{ term: 'Kovács Péter', category: 'PERSON' }] };
    const { result } = runAnonymization(text, opts, ids(detect(text, opts)));
    expect(result.appliedCount).toBe(3);
    expect(result.anonymizedText).toBe('[SZEMÉLY_1] ([SZEMÉLY_1]) [SZEMÉLY_1]');
  });

  it('works across multiple paragraphs with Hungarian characters', () => {
    const text = [
      'Első bekezdés: Ötvös Tibor.',
      '',
      'Második bekezdés: Ötvös Tibor újra említve, címe: 1062 Budapest.',
    ].join('\n\n');
    const opts: AnonymizationOptions = {
      manualTerms: [{ term: 'Ötvös Tibor', category: 'PERSON' }],
    };
    const { result } = runAnonymization(text, opts, ids(detect(text, opts)));
    expect(result.appliedCount).toBe(2);
    expect(result.anonymizedText).not.toContain('Ötvös Tibor');
    expect(result.anonymizedText).toContain('Első bekezdés');
    expect(result.anonymizedText).toContain('Második bekezdés');
    expect(result.anonymizedText).toContain('1062 Budapest'); // untouched content preserved
  });

  it('combines regex and manual approvals in one pass', () => {
    const text = 'Péter ügyfél emailje: p.kiss@example.hu, telefon: +36 30 123 4567';
    const opts: AnonymizationOptions = {
      manualTerms: [{ term: 'Péter', category: 'PERSON' }],
    };
    const { result } = runAnonymization(text, opts, ids(detect(text, opts)));
    expect(result.anonymizedText).toContain('[SZEMÉLY_1]');
    expect(result.anonymizedText).toContain('[EMAIL_1]');
    expect(result.anonymizedText).toContain('[TELEFON_1]');
    expect(result.anonymizedText).not.toContain('p.kiss@example.hu');
    expect(result.anonymizedText).not.toContain('+36 30 123 4567');
    expect(result.anonymizedText).not.toContain('Péter'); // whole-word name replaced
  });
});

describe('safe result and export boundary', () => {
  it('exposes the mapping only via the internal result, never the package', () => {
    const text = 'Kovács Péter kovacs.peter@example.hu';
    const opts: AnonymizationOptions = { manualTerms: [{ term: 'Kovács Péter', category: 'PERSON' }] };
    const { result, mapping } = runAnonymization(text, opts, ids(detect(text, opts)));
    expect(result.mappingLocation).toBe('in-memory-only');
    expect(result.isPseudonymized).toBe(true);

    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toContain('Kovács');
    expect(serializedResult).not.toContain('kovacs.peter@example.hu');

    expect(mapping.mapping.some((m) => m.original === 'Kovács Péter')).toBe(true);

    const pkg = buildSanitizedPackage(result);
    const serializedPkg = JSON.stringify(pkg);
    expect(serializedPkg).not.toContain('Kovács');
    expect(serializedPkg).not.toContain('kovacs.peter@example.hu');
    expect(serializedPkg).toContain('anonymized-work-package');
    expect(pkg.sanitizedText).toBe(result.anonymizedText);
  });

  it('result hashes are deterministic for identical input and config', () => {
    const text = 'Kovács Péter kovacs.peter@example.hu';
    const opts: AnonymizationOptions = { manualTerms: [{ term: 'Kovács Péter', category: 'PERSON' }] };
    const approvals = ids(detect(text, opts));
    const r1 = runAnonymization(text, opts, approvals).result;
    const r2 = runAnonymization(text, opts, approvals).result;
    expect(r1.anonymizedText).toBe(r2.anonymizedText);
    expect(r1.resultHash).toBe(r2.resultHash);
    expect(r1.sourceHash).toBe(r2.sourceHash);
    expect(r1.sourceHash).not.toBe(r1.resultHash);
  });

  it('reports category counts per applied redaction', () => {
    const text = 'a@b.hu +36 30 123 4567 a@b.hu';
    const { result } = runAnonymization(text, noTerms(), ids(detect(text, noTerms())));
    expect(result.categoryCounts.EMAIL).toBe(2);
    expect(result.categoryCounts.PHONE).toBe(1);
    expect(result.appliedCount).toBe(3);
  });
});

describe('edge inputs', () => {
  it('handles empty input', () => {
    const { result, candidates } = runAnonymization('', noTerms(), []);
    expect(candidates).toHaveLength(0);
    expect(result.appliedCount).toBe(0);
    expect(result.anonymizedText).toBe('');
    expect(result.categoryCounts).toEqual({});
  });

  it('handles input with no candidates', () => {
    const text = 'Ez egy teljesen átlagos mondat.';
    const { result, candidates } = runAnonymization(text, noTerms(), []);
    expect(candidates).toHaveLength(0);
    expect(result.appliedCount).toBe(0);
    expect(result.anonymizedText).toBe(text);
  });

  it('applyApprovedRedactions is safe on an empty plan', () => {
    const { anonymizedText, appliedCount } = applyApprovedRedactions('szöveg', []);
    expect(anonymizedText).toBe('szöveg');
    expect(appliedCount).toBe(0);
  });

  it('createApprovedRedactions rejects unknown ids', () => {
    const text = 'a@b.hu';
    const candidates = detect(text, noTerms());
    const { redactions, warnings } = createApprovedRedactions(candidates, ['nope', 'cand-1']);
    expect(warnings.some((w) => w.includes('nope'))).toBe(true);
    expect(redactions).toHaveLength(1);
  });
});

describe('text normalization helpers', () => {
  it('finds occurrences across accented and plain spellings', () => {
    const occurrences = findOccurrences('Árvíztűrő tükörfúrógép és ÁRVIZTŰRŐ újra', 'Árvíztűrő', {
      caseInsensitive: true,
      diacriticInsensitive: true,
    });
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].originalText).toBe('Árvíztűrő');
    expect(occurrences[1].originalText).toBe('ÁRVIZTŰRŐ');
  });

  it('preserves the true substring when accents are folded away', () => {
    const source = 'Adat: őrült ŐZE név';
    const [occ] = findOccurrences(source, 'oze', {
      caseInsensitive: true,
      diacriticInsensitive: true,
    });
    expect(source.slice(occ.start, occ.end)).toBe('ŐZE');
  });

  it('accepts a precomputed folded source and yields identical results', () => {
    const source = 'Kovács Péter és KOVACS PETER meg Nagy Anna.';
    const opts = { caseInsensitive: true, diacriticInsensitive: true } as const;
    const folded = foldForMatch(source);
    const withFold = findOccurrences(source, 'Kovács Péter', opts, folded);
    const withoutFold = findOccurrences(source, 'Kovács Péter', opts);
    expect(withFold).toEqual(withoutFold);
    expect(withFold).toHaveLength(2);
    expect(withFold.map((o) => source.slice(o.start, o.end))).toEqual(['Kovács Péter', 'KOVACS PETER']);
  });
});

describe('privacy: warnings and safe export never echo original values', () => {
  it('manual-term warnings identify by ordinal, not by value', () => {
    const source = 'Egy teljesen ártalmatlan mondat, semmi érzékeny.';
    const opts: AnonymizationOptions = {
      manualTerms: [
        { term: 'Kovács Péter', category: 'PERSON' }, // not found
        { term: 'Titkos Ügyfél Kft.', category: 'BUSINESS_SECRET' }, // not found
        { term: 'X', category: 'PERSON' }, // too short
        { term: '   ', category: 'OTHER_SENSITIVE' }, // empty after trim
      ],
    };
    const { warnings } = detectCandidates(source, opts);
    const joined = warnings.join('\n');
    // Reason substrings preserved for callers…
    expect(warnings.some((w) => w.includes('not found'))).toBe(true);
    expect(warnings.some((w) => w.includes('too short'))).toBe(true);
    expect(warnings.some((w) => w.includes('empty term'))).toBe(true);
    // …but the sensitive term text itself is never present.
    expect(joined).not.toContain('Kovács');
    expect(joined).not.toContain('Titkos Ügyfél Kft.');
  });

  it('safe export package never contains an unmatched/too-short manual term', () => {
    const source = 'Ártalmatlan tartalom, egyetlen érzékeny adat sincs benne.';
    const opts: AnonymizationOptions = {
      manualTerms: [
        { term: 'Kovács Péter', category: 'PERSON' },
        { term: 'Titkos Ügyfél Kft.', category: 'BUSINESS_SECRET' },
        { term: 'Q', category: 'PERSON' },
      ],
    };
    const { result } = runAnonymization(source, opts, []);
    const serializedPkg = JSON.stringify(buildSanitizedPackage(result));
    expect(serializedPkg).not.toContain('Kovács Péter');
    expect(serializedPkg).not.toContain('Titkos Ügyfél Kft.');
    // The full result (which carries warnings) is also clean of the raw terms.
    expect(JSON.stringify(result.warnings)).not.toContain('Kovács');
  });
});

describe('input bound is fail-closed', () => {
  it('throws AnonymizationInputTooLargeError above MAX_INPUT_CHARS', () => {
    const huge = 'a'.repeat(MAX_INPUT_CHARS + 1);
    expect(() => detectCandidates(huge, noTerms())).toThrow(AnonymizationInputTooLargeError);
    expect(() => runAnonymization(huge, noTerms(), [])).toThrow(AnonymizationInputTooLargeError);
  });

  it('the error message carries only the bound, never source content', () => {
    const huge = 'sensitive-token-'.repeat(1) + 'a'.repeat(MAX_INPUT_CHARS);
    try {
      detectCandidates(huge, noTerms());
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AnonymizationInputTooLargeError);
      expect((e as Error).message).not.toContain('sensitive-token');
      expect((e as AnonymizationInputTooLargeError).maxInputChars).toBe(MAX_INPUT_CHARS);
    }
  });

  it('accepts input exactly at the bound', () => {
    const atLimit = 'a'.repeat(MAX_INPUT_CHARS);
    expect(() => detectCandidates(atLimit, noTerms())).not.toThrow();
  });
});

describe('adjacent and boundary redactions', () => {
  it('replaces two directly adjacent distinct entities without corruption', () => {
    const text = 'AnnaBéla'; // two adjacent manual terms, no separator
    const opts: AnonymizationOptions = {
      manualTerms: [
        { term: 'Anna', category: 'PERSON' },
        { term: 'Béla', category: 'PERSON' },
      ],
      exactTermsWholeWords: false, // allow embedded adjacency
    };
    const { result } = runAnonymization(text, opts, ids(detect(text, opts)));
    expect(result.appliedCount).toBe(2);
    expect(result.anonymizedText).toBe('[SZEMÉLY_1][SZEMÉLY_2]');
    expect(result.anonymizedText).not.toContain('Anna');
    expect(result.anonymizedText).not.toContain('Béla');
  });

  it('adjacent regex entities are both replaced', () => {
    const text = 'a@b.hu+36301234567'; // email immediately followed by a phone
    const { result } = runAnonymization(text, noTerms(), ids(detect(text, noTerms())));
    expect(result.anonymizedText).not.toContain('a@b.hu');
    expect(result.anonymizedText).not.toContain('+36301234567');
  });
});

describe('performance: source is folded once regardless of dictionary size', () => {
  it('a large manual dictionary over a large document completes quickly', () => {
    const source = ('Semleges bekezdés Kovács Péter tartalommal. ').repeat(4000); // ~170k chars
    const manualTerms = Array.from({ length: 500 }, (_, i) => ({
      term: `NemLétező Kifejezés ${i}`,
      category: 'OTHER_SENSITIVE' as const,
    }));
    manualTerms.push({ term: 'Kovács Péter', category: 'OTHER_SENSITIVE' as const });
    const started = Date.now();
    const { result } = runAnonymization(source, { manualTerms }, []);
    expect(Date.now() - started).toBeLessThan(5000);
    // No approvals → text unchanged, and no term text leaked into warnings.
    expect(result.anonymizedText).toBe(source);
    expect(JSON.stringify(result.warnings)).not.toContain('NemLétező Kifejezés 1');
  });
});