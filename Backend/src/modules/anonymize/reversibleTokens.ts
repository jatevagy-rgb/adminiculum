/** Deterministic per-value identity, including distinct parties sharing a role. */
export function assignReversibleTokens<T extends { value: string; token: string }>(candidates: T[]): T[] {
  const byValue = new Map<string, T>();
  for (const candidate of candidates) {
    const value = candidate.value.trim();
    if (value.length > 2 && !byValue.has(value)) byValue.set(value, { ...candidate, value });
  }
  const ordinals = new Map<string, number>();
  // Sorting by original gives stable tokens regardless of picker/input order.
  const assigned = [...byValue.values()].sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0).map((candidate) => {
    const prefix = candidate.token.replace(/^\[/, '').replace(/\]$/, '').replace(/_\d+$/, '');
    const ordinal = (ordinals.get(prefix) || 0) + 1;
    ordinals.set(prefix, ordinal);
    return { ...candidate, token: `[${prefix}_${ordinal}]` };
  });
  return assigned.sort((a, b) => b.value.length - a.value.length);
}
