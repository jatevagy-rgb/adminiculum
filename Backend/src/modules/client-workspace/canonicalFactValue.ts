import { Prisma } from '@prisma/client';

export type CanonicalTypedFactValue =
  | boolean
  | number
  | string
  | readonly string[]
  | { amount: string; currency: string | null };

export type CanonicalFactValueShape = {
  numberValue: Prisma.Decimal | null;
  stringValue: string | null;
  booleanValue: boolean | null;
  dateValue: Date | null;
  datetimeValue: Date | null;
  moneyAmount?: Prisma.Decimal | null;
  moneyCurrency?: string | null;
  enumValue: string | null;
  jsonValue?: Prisma.JsonValue | null;
};

export const CANONICAL_FACT_VALUE_SELECT = {
  numberValue: true,
  stringValue: true,
  booleanValue: true,
  dateValue: true,
  datetimeValue: true,
  moneyAmount: true,
  moneyCurrency: true,
  enumValue: true,
  jsonValue: true,
} as const;

export function resolveCanonicalTypedFactValue(fact: CanonicalFactValueShape): CanonicalTypedFactValue | null {
  if (fact.numberValue !== null) return Number(fact.numberValue);
  if (fact.stringValue !== null) return fact.stringValue;
  if (fact.booleanValue !== null) return fact.booleanValue;
  if (fact.dateValue !== null) return fact.dateValue.toISOString().slice(0, 10);
  if (fact.datetimeValue !== null) return fact.datetimeValue.toISOString();
  if (Array.isArray(fact.jsonValue) && fact.jsonValue.every((item) => typeof item === 'string')) {
    return fact.jsonValue as readonly string[];
  }
  if (fact.moneyAmount !== null && fact.moneyAmount !== undefined) {
    return { amount: fact.moneyAmount.toString(), currency: fact.moneyCurrency ?? null };
  }
  if (fact.enumValue !== null) return fact.enumValue;
  return null;
}
