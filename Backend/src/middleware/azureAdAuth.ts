/**
 * Compatibility wrapper.
 * Canonical auth middleware is `authenticate` from ./auth.
 * Keep this module to avoid breaking legacy imports.
 */

import { authenticate } from './auth';

export const hybridAuth = authenticate;
export default hybridAuth;
