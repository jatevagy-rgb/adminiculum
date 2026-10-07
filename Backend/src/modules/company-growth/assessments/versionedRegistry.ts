/** Immutable definitions: publishing a version never changes an earlier one. */
export function createVersionedRegistry<T extends { packKey: string; version: number }>(definitions: readonly T[]) {
  function freeze<V>(value: V): V {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const versions = new Map<string, Map<number, T>>();
  for (const definition of definitions) {
    if (!definition.packKey || !Number.isInteger(definition.version) || definition.version < 1) throw new Error('Invalid assessment version');
    const family = versions.get(definition.packKey) ?? new Map<number, T>();
    if (family.has(definition.version)) throw new Error('Duplicate assessment version');
    family.set(definition.version, freeze(definition));
    versions.set(definition.packKey, family);
  }
  const current = Object.freeze([...versions.values()].map(family => family.get(Math.max(...family.keys()))!));
  return Object.freeze({
    getCurrentAssessmentPack: (key: string): T | undefined => current.find(pack => pack.packKey === key),
    getAssessmentPackVersion: (key: string, version: number): T | undefined => versions.get(key)?.get(version),
    listCurrentAssessmentPacks: (): readonly T[] => current,
  });
}
