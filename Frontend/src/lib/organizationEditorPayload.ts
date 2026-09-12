/** PATCH only fields the user edited; absent fields retain server-side values. */
export function editedOrganizationFields<T extends Record<string, unknown>>(payload: T, edited: ReadonlySet<string>): Partial<T> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => edited.has(key))) as Partial<T>;
}
