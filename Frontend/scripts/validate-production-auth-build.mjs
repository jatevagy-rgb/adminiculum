#!/usr/bin/env node
// Fail-closed PREBUILD validation of the public frontend auth build contract.
//
// Runs BEFORE `next build` in production. If any required NEXT_PUBLIC_* auth
// value is missing/empty, it exits non-zero WITHOUT building, so an invalid
// artifact (empty MSAL clientId/authority) can never be generated. It never
// prints any value — only the offending variable NAMES.

import { REQUIRED_PUBLIC_BUILD_VARS, missingRequired } from './production-auth-build-contract.mjs';

const missing = missingRequired(process.env);

if (missing.length > 0) {
  for (const name of missing) {
    console.error(`Missing required production frontend build configuration: ${name}`);
  }
  console.error(
    `\n${missing.length} of ${REQUIRED_PUBLIC_BUILD_VARS.length} required public build variables are empty. ` +
      `Set them as GitHub Environment (production) variables — see production-auth-build-contract.mjs. ` +
      `No fallback to empty strings is permitted for a production build.`,
  );
  process.exit(1);
}

console.log(
  `[prod-auth-config] OK: all ${REQUIRED_PUBLIC_BUILD_VARS.length} required public auth build variables are present and non-empty.`,
);
