// Pure, framework-free policy for whether a workforce sign-in redirect may be
// started. Extracted so the guard can be unit-tested without a DOM/MSAL runtime.
//
// The historical bug: signIn additionally required authState === "idle", but the
// initial workforce authState is "bootstrapping" and only settles to "idle" on a
// no-account load. Depending on "idle" made the trigger fragile. The correct
// guards are the ones that actually prevent a *duplicate* redirect or a redirect
// when a session already exists — never the transient bootstrap label.

export interface WorkforceSignInGuardState {
  /** MSAL reports an interaction in progress (inProgress !== InteractionStatus.None). */
  msalInteractionInProgress: boolean;
  /** A loginRedirect has already been initiated in this component. */
  loginPending: boolean;
  /** A workforce account is already present in the MSAL cache. */
  hasAccount: boolean;
  /** The app has already completed workforce authentication. */
  isAuthenticated: boolean;
}

/**
 * True when it is safe to start a workforce loginRedirect. Blocks a second
 * redirect while MSAL is mid-interaction or a login is pending, and never
 * re-triggers when an account already exists or the user is authenticated.
 * Deliberately does NOT depend on the transient "bootstrapping"/"idle" label.
 */
export function canStartWorkforceSignIn(state: WorkforceSignInGuardState): boolean {
  if (state.msalInteractionInProgress) return false; // prevents redirect loop / double redirect
  if (state.loginPending) return false; // prevents double redirect from double click
  if (state.hasAccount) return false; // already have a session account
  if (state.isAuthenticated) return false; // already authenticated
  return true;
}
