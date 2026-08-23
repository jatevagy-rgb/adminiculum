import { InteractionError } from '../client-interaction/base';

export interface FactDefinitionForValidation {
  key?: string;
  valueType: string;
  allowedEnumValues?: unknown;
  allowedScopeTypes: string[];
  determinationMethod?: string;
}

export interface TypedFactValueInput {
  booleanValue?: boolean;
  numberValue?: number | string;
  stringValue?: string;
  dateValue?: Date | string;
  datetimeValue?: Date | string;
  moneyAmount?: number | string;
  moneyCurrency?: string;
  enumValue?: string;
  jsonValue?: unknown;
}

const VALUE_FIELDS = [
  'booleanValue',
  'numberValue',
  'stringValue',
  'dateValue',
  'datetimeValue',
  'moneyAmount',
  'moneyCurrency',
  'enumValue',
  'jsonValue',
] as const;

function invalid(message: string): never {
  throw new InteractionError(400, 'COMPLIANCE_FACT_VALUE_INVALID', message);
}

function present(input: TypedFactValueInput, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field) && (input as any)[field] !== undefined && (input as any)[field] !== null;
}

function finiteNumber(value: unknown, field: string): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return value;
  invalid(`${field} must be a finite number.`);
}

function validDate(value: unknown, field: string): Date | string {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) invalid(`${field} must be a valid date.`);
  return value as Date | string;
}

function enumValues(definition: FactDefinitionForValidation): string[] {
  if (!Array.isArray(definition.allowedEnumValues)) return [];
  if (!definition.allowedEnumValues.every((value) => typeof value === 'string')) invalid('allowedEnumValues must contain strings.');
  return definition.allowedEnumValues as string[];
}

function validateJsonValue(value: unknown, valueType: string, allowed: string[]): void {
  if (valueType === 'MULTI_ENUM') {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) invalid('MULTI_ENUM jsonValue must be a string array.');
    if (allowed.length && (value as string[]).some((item) => !allowed.includes(item))) invalid('MULTI_ENUM jsonValue contains an unapproved value.');
    return;
  }
  if (valueType === 'PERIOD') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as object).sort().join(',') !== 'end,start') invalid('PERIOD jsonValue must contain only start and end.');
    validDate((value as any).start, 'period.start');
    validDate((value as any).end, 'period.end');
    if (new Date(String((value as any).start)) > new Date(String((value as any).end))) invalid('PERIOD start must not be after end.');
    return;
  }
  invalid(`jsonValue is not valid for ${valueType}.`);
}

/** Converts one typed fact payload into nullable Prisma columns without exposing its value. */
export function validateTypedFactValue(
  definition: FactDefinitionForValidation,
  input: TypedFactValueInput,
): Record<string, unknown> {
  const fields = VALUE_FIELDS.filter((field) => present(input, field));
  const valueType = String(definition.valueType);
  const expected = valueType === 'MONEY' ? ['moneyAmount', 'moneyCurrency'] : valueType === 'MULTI_ENUM' || valueType === 'PERIOD' ? ['jsonValue'] : {
    BOOLEAN: ['booleanValue'], NUMBER: ['numberValue'], STRING: ['stringValue'], DATE: ['dateValue'],
    DATETIME: ['datetimeValue'], ENUM: ['enumValue'], JURISDICTION: ['enumValue'], ENTITY_REFERENCE: [],
  }[valueType] || [];

  if (valueType === 'ENTITY_REFERENCE') invalid('ENTITY_REFERENCE values must use FactSubject.');
  if (fields.length !== expected.length || fields.some((field, index) => field !== expected[index])) {
    invalid(`Exactly one typed value matching ${valueType} is required.`);
  }

  const output: Record<string, unknown> = {};
  const field = expected[0];
  if (field === 'numberValue' || field === 'moneyAmount') output[field] = finiteNumber((input as any)[field], field);
  else if (field === 'dateValue' || field === 'datetimeValue') output[field] = validDate((input as any)[field], field);
  else if (field === 'stringValue') {
    if (typeof input.stringValue !== 'string') invalid('stringValue must be a string.');
    output.stringValue = input.stringValue;
  } else if (field === 'booleanValue') {
    if (typeof input.booleanValue !== 'boolean') invalid('booleanValue must be boolean.');
    output.booleanValue = input.booleanValue;
  } else if (field === 'enumValue') {
    if (typeof input.enumValue !== 'string') invalid('enumValue must be a string.');
    const allowed = enumValues(definition);
    if (allowed.length && !allowed.includes(input.enumValue)) invalid('enumValue is not approved for this definition.');
    output.enumValue = input.enumValue;
  } else {
    validateJsonValue(input.jsonValue, valueType, enumValues(definition));
    output.jsonValue = input.jsonValue;
  }

  if (valueType === 'MONEY') {
    if (!/^[A-Z]{3}$/.test(input.moneyCurrency || '')) invalid('moneyCurrency must be an ISO 4217 code.');
    output.moneyCurrency = input.moneyCurrency;
  }
  return output;
}

function canonicalDecimal(value: unknown, field: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) invalid(`${field} must be a finite number.`);
  return numeric.toString();
}

function canonicalDateString(value: unknown, field: string): string {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) invalid(`${field} must be a valid date.`);
  return parsed.toISOString().slice(0, 10);
}

function canonicalDateTimeString(value: unknown, field: string): string {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) invalid(`${field} must be a valid datetime.`);
  return parsed.toISOString();
}

/**
 * One compatibility bridge for typed facts. Typed columns remain authoritative;
 * this value is only retained for legacy readers and audit-friendly exports.
 */
export function serializeFactValue(
  definition: Pick<FactDefinitionForValidation, 'valueType'>,
  typed: Record<string, unknown>,
): string {
  switch (String(definition.valueType)) {
    case 'BOOLEAN': return typed.booleanValue === true ? 'true' : 'false';
    case 'NUMBER': return canonicalDecimal(typed.numberValue, 'numberValue');
    case 'STRING': return String(typed.stringValue);
    case 'DATE': return canonicalDateString(typed.dateValue, 'dateValue');
    case 'DATETIME': return canonicalDateTimeString(typed.datetimeValue, 'datetimeValue');
    case 'ENUM':
    case 'JURISDICTION': return String(typed.enumValue);
    case 'MONEY': return `${canonicalDecimal(typed.moneyAmount, 'moneyAmount')} ${String(typed.moneyCurrency)}`;
    case 'MULTI_ENUM': return JSON.stringify([...new Set((typed.jsonValue as string[]).map(String))].sort());
    case 'PERIOD': {
      const period = typed.jsonValue as { start: unknown; end: unknown };
      return `${canonicalDateTimeString(period.start, 'period.start')}/${canonicalDateTimeString(period.end, 'period.end')}`;
    }
    default: invalid(`Cannot serialize ${String(definition.valueType)} as a generic typed fact.`);
  }
}

export function assertFactSubjectScope(
  definition: Pick<FactDefinitionForValidation, 'allowedScopeTypes'>,
  subject: { clientId: string; scopeType: string } | null,
  clientId: string,
  scopeType: string,
): void {
  if (!definition.allowedScopeTypes.includes(scopeType)) invalid('Fact scope is not allowed by the definition.');
  if (scopeType === 'COMPANY') {
    if (subject) invalid('COMPANY facts must not have a FactSubject.');
    return;
  }
  if (!subject || subject.clientId !== clientId || subject.scopeType !== scopeType) invalid('FactSubject is invalid or belongs to another client.');
}

export interface FactSubjectLinkedEntityScopeInput {
  clientId: string;
  scopeType: string;
  contractRecordId?: string | null;
  organizationPersonId?: string | null;
}

export interface FactSubjectLinkedEntityScopeDatabase {
  contractRecord: {
    findUnique(args: { where: { id: string }; select: { clientId: true }}): Promise<{ clientId: string } | null>;
  };
  organizationPerson: {
    findUnique(args: { where: { id: string }; select: { clientId: true }}): Promise<{ clientId: string } | null>;
  };
}

/** Enforces same-client ownership for FactSubject's optional real-entity links. */
export async function assertFactSubjectLinkedEntityScope(
  db: FactSubjectLinkedEntityScopeDatabase,
  input: FactSubjectLinkedEntityScopeInput,
): Promise<void> {
  const hasContract = Boolean(input.contractRecordId);
  const hasPerson = Boolean(input.organizationPersonId);
  if (hasContract === hasPerson && (hasContract || hasPerson)) invalid('FactSubject linked entity is invalid.');
  if (hasContract && input.scopeType !== 'CONTRACT') invalid('FactSubject linked entity is invalid.');
  if (hasPerson && input.scopeType !== 'EMPLOYEE') invalid('FactSubject linked entity is invalid.');

  if (input.contractRecordId) {
    const contract = await db.contractRecord.findUnique({ where: { id: input.contractRecordId }, select: { clientId: true } });
    if (!contract || contract.clientId !== input.clientId) invalid('FactSubject linked entity is invalid.');
  }
  if (input.organizationPersonId) {
    const person = await db.organizationPerson.findUnique({ where: { id: input.organizationPersonId }, select: { clientId: true } });
    if (!person || person.clientId !== input.clientId) invalid('FactSubject linked entity is invalid.');
  }
}
