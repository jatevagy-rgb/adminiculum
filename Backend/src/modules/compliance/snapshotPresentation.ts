/** The stored evaluator trace is the only authority for missing facts. */
export function snapshotMissingFactKeys(snapshot: unknown): string[] | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const keys = (snapshot as { missingFactKeys?: unknown }).missingFactKeys;
  return Array.isArray(keys) ? [...new Set(keys.filter((key): key is string => typeof key === 'string'))] : null;
}
export function snapshotFreshness(snapshot: unknown, evaluatedAt: Date | string | null | undefined, factsChangedAt: Date | null): 'RECORDED' | 'STALE' | 'UNAVAILABLE' {
  if (snapshotMissingFactKeys(snapshot) === null || !evaluatedAt || !Number.isFinite(new Date(evaluatedAt).getTime())) return 'UNAVAILABLE';
  return factsChangedAt && factsChangedAt.getTime() > new Date(evaluatedAt).getTime() ? 'STALE' : 'RECORDED';
}
/** A derived legal classification has no portal answer control. Request underlying activity facts for human review. */
export function complianceFactLabel(key: string, registeredLabel?: string | null): string | null {
  if (registeredLabel) return registeredLabel;
  return key === 'whistle_special_sector' ? 'Visszaélés-bejelentési szabályok ágazati érintettsége' : null;
}
export function approvedSourceUrl(version: { status?: string; reviewStatus?: string; legalSource?: { status?: string }; captures?: Array<{ sourceUri: string | null }> } | null | undefined): string | null {
  if (version?.status !== 'ACTIVE' || version.reviewStatus !== 'APPROVED' || version.legalSource?.status !== 'APPROVED') return null;
  const uri = version.captures?.[0]?.sourceUri;
  if (!uri) return null;
  try { const url = new URL(uri); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export function latestRelevantFactChange(facts: Array<{ updatedAt: Date; scopeType: string | null; factSubjectId: string | null; factDefinition: { key: string } | null }>, keys: string[], scopeType: string | null, subjectId: string | null): Date | null {
  const times = facts.filter(f => f.scopeType === scopeType && f.factSubjectId === subjectId && f.factDefinition && keys.includes(f.factDefinition.key)).map(f => f.updatedAt.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}
