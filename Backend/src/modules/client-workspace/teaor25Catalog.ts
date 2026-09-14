/**
 * TEÁOR'25 CATALOGUE
 *
 * Structured primary / additional business activities for Company Profile 2.0.
 * TEÁOR is a strong applicability SIGNAL, never proof: it is used together with
 * company size, geography, actual operations, customer type, data processing,
 * technology, regulated activity, product/market role, financial role and
 * environmental activity.
 *
 * IMPORTANT — DATA PROVENANCE
 * No authoritative TEÁOR'25 nomenclature ships in this repository. This module
 * therefore ships the MECHANISM (structure, validation, accent-insensitive
 * autocomplete, multi-select) with an EMPTY catalogue. Codes must be loaded
 * from the official KSH nomenclature; nothing here invents codes or labels.
 *
 * Installing the real dataset is a data drop, not a code change:
 *   - `installTeaor25Catalog(entries)` for programmatic/seed use, or
 *   - a JSON file `[{ "code": "...", "labelHu": "...", "section": "..." }, ...]`
 *     pointed to by `ADMINICULUM_TEAOR25_CATALOG_PATH`.
 */

export interface Teaor25Entry {
  /** Official TEÁOR'25 code, e.g. the numeric code used by KSH. */
  readonly code: string;
  /** Official Hungarian label. */
  readonly labelHu: string;
  /** Optional NACE/ágazat section grouping for coarse filtering. */
  readonly section?: string;
}

export class Teaor25CatalogNotInstalledError extends Error {
  readonly code = 'TEAOR25_CATALOG_NOT_INSTALLED';
  constructor() {
    super('The TEÁOR\'25 catalogue is not installed. Load the official KSH nomenclature before using structured activity search.');
    this.name = 'Teaor25CatalogNotInstalledError';
  }
}

let catalog: readonly Teaor25Entry[] = [];
let catalogSource: string | null = null;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ő]/g, 'o')
    .replace(/[ű]/g, 'u');
}

/**
 * Installs a validated TEÁOR'25 catalogue. Rejects duplicate or malformed
 * codes so a bad data drop fails loudly instead of silently mis-scoping.
 */
export function installTeaor25Catalog(entries: readonly Teaor25Entry[], source = 'provided'): void {
  const seen = new Set<string>();
  const validated: Teaor25Entry[] = [];
  for (const entry of entries) {
    const code = String(entry?.code ?? '').trim();
    const labelHu = String(entry?.labelHu ?? '').trim();
    if (!code || !labelHu) throw new Error('TEÁOR\'25 catalogue entries require a non-empty code and labelHu.');
    if (seen.has(code)) throw new Error(`Duplicate TEÁOR'25 code in catalogue: ${code}`);
    seen.add(code);
    validated.push({ code, labelHu, section: entry.section ? String(entry.section) : undefined });
  }
  catalog = validated;
  catalogSource = source;
}

/** Clears the catalogue. Intended for tests and controlled reloads. */
export function resetTeaor25Catalog(): void {
  catalog = [];
  catalogSource = null;
}

export function isTeaor25CatalogInstalled(): boolean {
  return catalog.length > 0;
}

export function teaor25CatalogSource(): string | null {
  return catalogSource;
}

export function getTeaor25Entry(code: string | null | undefined): Teaor25Entry | undefined {
  if (!code) return undefined;
  const trimmed = String(code).trim();
  return catalog.find((entry) => entry.code === trimmed);
}

export function isValidTeaor25Code(code: string | null | undefined): boolean {
  return getTeaor25Entry(code) !== undefined;
}

/** Accent-insensitive autocomplete over code prefix and label substring. */
export function searchTeaor25(query: string, limit = 20): readonly Teaor25Entry[] {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) return catalog.slice(0, Math.max(0, limit));
  const needle = normalize(trimmed);
  const starts: Teaor25Entry[] = [];
  const contains: Teaor25Entry[] = [];
  for (const entry of catalog) {
    const code = normalize(entry.code);
    const label = normalize(entry.labelHu);
    if (code.startsWith(needle)) starts.push(entry);
    else if (label.includes(needle)) contains.push(entry);
  }
  return [...starts, ...contains].slice(0, Math.max(0, limit));
}

export interface Teaor25ValidationResult {
  readonly valid: boolean;
  readonly catalogInstalled: boolean;
}

/** Validates a single TEÁOR'25 code against the installed catalogue. */
export function validateTeaor25Code(code: string | null | undefined): Teaor25ValidationResult {
  return { valid: isValidTeaor25Code(code), catalogInstalled: isTeaor25CatalogInstalled() };
}

/**
 * Validates primary + additional TEÁOR'25 codes.
 * `primary` is required; additional codes must be distinct from the primary.
 */
export function validateTeaor25ActivitySelection(input: {
  primaryCode?: string | null;
  additionalCodes?: readonly string[] | null;
}): { valid: boolean; catalogInstalled: boolean; errors: string[] } {
  const errors: string[] = [];
  const installed = isTeaor25CatalogInstalled();
  const primary = input.primaryCode ?? null;
  if (!primary) errors.push('PRIMARY_TEAOR25_REQUIRED');
  else if (installed && !isValidTeaor25Code(primary)) errors.push('PRIMARY_TEAOR25_UNKNOWN');
  const additional = input.additionalCodes ?? [];
  const seen = new Set<string>();
  for (const code of additional) {
    if (!code) continue;
    if (primary && code === primary) { errors.push('ADDITIONAL_TEAOR25_DUPLICATES_PRIMARY'); continue; }
    if (seen.has(code)) { errors.push('ADDITIONAL_TEAOR25_DUPLICATE'); continue; }
    seen.add(code);
    if (installed && !isValidTeaor25Code(code)) errors.push('ADDITIONAL_TEAOR25_UNKNOWN');
  }
  return { valid: errors.length === 0, catalogInstalled: installed, errors };
}

/** Loads a catalogue from a JSON file. Throws on malformed content. */
export function loadTeaor25CatalogFromJson(json: string, source = 'json'): void {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('TEÁOR\'25 catalogue JSON must be an array of { code, labelHu }.');
  installTeaor25Catalog(parsed as Teaor25Entry[], source);
}
