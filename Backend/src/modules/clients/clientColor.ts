export const CLIENT_COLOR_KEYS = [
  'RED',
  'ORANGE',
  'AMBER',
  'GREEN',
  'TEAL',
  'BLUE',
  'INDIGO',
  'PURPLE',
  'ROSE',
  'SLATE',
] as const;

export type ClientColorKeyValue = (typeof CLIENT_COLOR_KEYS)[number];

const CLIENT_COLOR_KEY_SET = new Set<string>(CLIENT_COLOR_KEYS);

export class ClientColorInputError extends Error {
  readonly code = 'CLIENT_COLOR_INVALID';

  constructor() {
    super('Client color must be null or an allowed palette key.');
    this.name = 'ClientColorInputError';
  }
}

export function parseClientColorKey(value: unknown): ClientColorKeyValue | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' && CLIENT_COLOR_KEY_SET.has(value)) {
    return value as ClientColorKeyValue;
  }
  throw new ClientColorInputError();
}
