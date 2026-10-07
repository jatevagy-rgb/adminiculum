/** Owner release is independent; the historical tiles flag never enables it. */
export function isCaseClientOwnerEnabled(): boolean {
  return process.env.ENABLE_CASE_CLIENT_OWNER === 'true';
}
