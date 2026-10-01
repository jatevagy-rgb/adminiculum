import { collectClientFieldCandidates } from '../src/modules/anonymize/clientCandidates';

describe('collectClientFieldCandidates — canonical client fact mapping', () => {
  it('maps the canonical Client.taxNumber as an AZONOSÍTÓ identifier candidate', () => {
    const specs = collectClientFieldCandidates(
      { name: 'Teszt Kft.', taxNumber: '12345678-2-41' },
      null,
    );
    const identifier = specs.find((s) => s.category === 'IDENTIFIER');
    expect(identifier).toBeDefined();
    expect(identifier?.value).toBe('12345678-2-41');
    expect(identifier?.source).toBe('client.taxNumber');
    expect(identifier?.tokenPrefix).toBe('AZONOSÍTÓ');
  });

  it('maps companyRegistrationNumber and vatNumber as distinct identifier candidates', () => {
    const specs = collectClientFieldCandidates(
      { companyRegistrationNumber: '01-09-000001', vatNumber: 'HU12345678' },
      null,
    );
    const identifiers = specs.filter((s) => s.category === 'IDENTIFIER');
    expect(identifiers.map((s) => s.value)).toEqual(['01-09-000001', 'HU12345678']);
    expect(identifiers.map((s) => s.source)).toEqual([
      'client.companyRegistrationNumber',
      'client.vatNumber',
    ]);
  });

  it('never reads legacy non-canonical fields (taxId/personalId/bankAccount) from the client record', () => {
    const specs = collectClientFieldCandidates(
      { taxId: '99999999', personalId: '77777777', bankAccount: '00000000' } as never,
      null,
    );
    expect(specs).toHaveLength(0);
  });

  it('maps email, phone and address with their typed token prefixes', () => {
    const specs = collectClientFieldCandidates(
      {
        email: 'ugyfel@example.test',
        phone: '+36 30 123 4567',
        address: 'Budapest, Fő utca 1.',
      },
      null,
    );
    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'EMAIL', value: 'ugyfel@example.test', tokenPrefix: 'EMAIL' }),
        expect.objectContaining({ category: 'PHONE', value: '+36 30 123 4567', tokenPrefix: 'TELEFON' }),
        expect.objectContaining({ category: 'ADDRESS', value: 'Budapest, Fő utca 1.', tokenPrefix: 'CÍM' }),
      ]),
    );
  });

  it('maps authorizedRepresentative and contactPerson as distinct KÉPVISELŐ candidates', () => {
    const specs = collectClientFieldCandidates(
      {
        authorizedRepresentative: 'Kovács János',
        contactPerson: 'Nagy Anna',
      },
      null,
    );
    const representatives = specs.filter((s) => s.category === 'REPRESENTATIVE');
    expect(representatives.map((s) => s.value)).toEqual(['Kovács János', 'Nagy Anna']);
    expect(representatives.map((s) => s.source)).toEqual([
      'client.authorizedRepresentative',
      'client.contactPerson',
    ]);
  });

  it('carries the caller role token on CLIENT-category names', () => {
    const specs = collectClientFieldCandidates({ name: 'Teszt Kft.' }, null, '[MEGBÍZÓ]');
    const client = specs.find((s) => s.category === 'CLIENT');
    expect(client?.roleToken).toBe('[MEGBÍZÓ]');
  });

  it('maps redactor profile fullName, aliases, addresses and taxId', () => {
    const specs = collectClientFieldCandidates(
      null,
      {
        fullName: 'Profil Név',
        aliases: ['Alias Egy', 'Alias Kettő'],
        addresses: ['Szeged, Tér 2.'],
        taxId: '12345678-2-41',
      },
    );
    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'CLIENT', value: 'Profil Név', source: 'redactorProfile.fullName' }),
        expect.objectContaining({ category: 'CLIENT', value: 'Alias Egy', source: 'redactorProfile.aliases' }),
        expect.objectContaining({ category: 'CLIENT', value: 'Alias Kettő', source: 'redactorProfile.aliases' }),
        expect.objectContaining({ category: 'ADDRESS', value: 'Szeged, Tér 2.', source: 'redactorProfile.addresses' }),
        expect.objectContaining({ category: 'IDENTIFIER', value: '12345678-2-41', source: 'redactorProfile.taxId' }),
      ]),
    );
  });

  it('skips empty and whitespace-only values', () => {
    const specs = collectClientFieldCandidates(
      { name: '   ', taxNumber: '' },
      null,
    );
    expect(specs).toHaveLength(0);
  });

  it('returns no candidates when the client record is missing', () => {
    expect(collectClientFieldCandidates(null, null)).toEqual([]);
    expect(collectClientFieldCandidates(undefined, undefined)).toEqual([]);
  });
});
