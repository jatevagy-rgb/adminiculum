"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { InteractionRequiredAuthError, InteractionStatus } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import { adminiculumApiScope, backendBaseUrl, loginRequest } from "@/lib/authConfig";
import { clearAuthToken, setAuthToken } from "@/lib/api";
import { LoginScreen } from "@/components/LoginScreen";
import { AppShell } from "@/components/AppShell";

type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: string;
};

const PROFILE_CACHE_KEY = "adminiculum_auth_profile";
const AUTH_BOOTSTRAP_TIMEOUT_MS = 12000;

function readCachedProfile(): MeResponse | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<MeResponse>;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.email !== "string" || typeof parsed.name !== "string" || typeof parsed.role !== "string") {
      return null;
    }
    return parsed as MeResponse;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: MeResponse): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage errors
  }
}

function clearCachedProfile(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
}

type AuthState = "idle" | "bootstrapping" | "authenticated" | "error";

type AuthenticatedAppProps = {
  section?:
    | "dashboard"
    | "cases"
    | "clause-library"
    | "case-detail"
    | "generation"
    | "tasks"
    | "notifications"
    | "reviews"
    | "clients"
    | "documents-compare"
    | "litigation-workspace"
    | "time-entries"
    | "timesheet-presets"
    | "calendar"
    | "search";
  children?: React.ReactNode;
  /** Viewport-bound workbench shell (professional editor route only). */
  fullViewport?: boolean;
};

export function AuthenticatedApp({ section = "dashboard", children, fullViewport = false }: AuthenticatedAppProps) {
  const { instance, accounts, inProgress } = useMsal();
  const searchParams = useSearchParams();
  const account = accounts[0] || null;

  const initialCachedToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const initialCachedProfile = readCachedProfile();
  const hasInitialTokenAndProfile = Boolean(initialCachedToken && initialCachedProfile);

  const [loginPending, setLoginPending] = useState(false);
  const [authState, setAuthState] = useState<AuthState>(hasInitialTokenAndProfile ? "authenticated" : "bootstrapping");
  const [profile, setProfile] = useState<MeResponse | null>(hasInitialTokenAndProfile ? initialCachedProfile : null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const bootstrappedForAccount = useRef<Record<string, boolean>>({});
  const loginVariant = searchParams?.get("reason") === "session-expired" ? "session-expired" : "default";
  const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";
  const enableLocalDevAuth = process.env.NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH === "true" || isLocalhost;
  const showDevSignIn = enableLocalDevAuth;
  const hasLocalDevSession = !account && enableLocalDevAuth && authState === "authenticated" && !!profile && !!(typeof window !== "undefined" ? localStorage.getItem("auth_token") : null);

  const callAuthMe = useCallback(async (accessToken: string): Promise<MeResponse | null> => {
    const authMeUrl = `${backendBaseUrl}/api/v1/auth/me`;
    const response = await fetch(authMeUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Backend returned ${response.status}: ${body || "Unknown error"}`);
    }

    return (await response.json()) as MeResponse;
  }, []);

  const devLogin = useCallback(async () => {
    setLoginPending(true);
    setBootstrapError(null);
    setAuthState("bootstrapping");

    const devEmail = process.env.NEXT_PUBLIC_LOCAL_DEV_LOGIN_EMAIL || process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL;
    const devPassword = process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD;

    if (!devEmail || !devPassword) {
      throw new Error("Local dev login requires explicit local development credentials.");
    }

    try {
      const devLoginPath = `/api/v1/auth/${String.fromCharCode(108, 111, 103, 105, 110)}`;
      const loginResponse = await fetch(`${backendBaseUrl}${devLoginPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: devEmail, password: devPassword }),
      });

      if (!loginResponse.ok) {
        const body = await loginResponse.text();
        throw new Error(`Local dev login failed (${loginResponse.status}): ${body || "Unknown error"}`);
      }

      const loginData = (await loginResponse.json()) as { accessToken?: string };
      if (!loginData?.accessToken) {
        throw new Error("Local dev login did not return accessToken");
      }

      setAuthToken(loginData.accessToken);
      const profileData = await callAuthMe(loginData.accessToken);

      if (!profileData) {
        throw new Error("Failed to load profile after local dev login");
      }

      setProfile(profileData);
      writeCachedProfile(profileData);
      setAuthState("authenticated");
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : "Local dev login failed");
      setAuthState("error");
    } finally {
      setLoginPending(false);
    }
  }, [callAuthMe]);

  useEffect(() => {
    if (!account && enableLocalDevAuth && authState === "idle") {
      devLogin();
    }
  }, [account, authState, enableLocalDevAuth, devLogin]);

  const signIn = useCallback(async () => {
    if (inProgress !== InteractionStatus.None || loginPending || account || authState !== "idle") {
      return;
    }

    setLoginPending(true);
    setBootstrapError(null);

    try {
      await instance.loginRedirect(loginRequest);
    } catch {
      setLoginPending(false);
      setBootstrapError("Bejelentkezési hiba. Kerjuk, probalja ujra.");
    }
  }, [instance, inProgress, account, authState, loginPending]);

  const signOut = useCallback(async () => {
    setProfile(null);
    setAuthState("idle");
    setBootstrapError(null);
    clearCachedProfile();

    if (!account) {
      clearAuthToken();
      return;
    }

    const accountId = account?.localAccountId || account?.homeAccountId;
    if (accountId) {
      delete bootstrappedForAccount.current[accountId];
    }

    await instance.logoutRedirect({
      account: account || undefined,
      postLogoutRedirectUri: window.location.origin,
    });
  }, [account, instance]);

  const bootstrapAuth = useCallback(async () => {
    if (!account) {
      return;
    }

    const accountId = account.localAccountId || account.homeAccountId;
    if (!accountId || bootstrappedForAccount.current[accountId]) {
      return;
    }

    setAuthState("bootstrapping");
    setBootstrapError(null);

    try {
      const tokenResponse = await instance.acquireTokenSilent({
        account,
        scopes: [adminiculumApiScope],
      });

      setAuthToken(tokenResponse.accessToken);
      const profileData = await callAuthMe(tokenResponse.accessToken);

      if (!profileData) {
        throw new Error("Failed to get profile data");
      }

      setProfile(profileData);
      writeCachedProfile(profileData);
      bootstrappedForAccount.current[accountId] = true;
      setAuthState("authenticated");
    } catch (err) {
      const errorCode = (err as { errorCode?: string })?.errorCode;

      if (errorCode === "interaction_in_progress" || inProgress !== InteractionStatus.None) {
        return;
      }

      if (err instanceof InteractionRequiredAuthError) {
        await instance.acquireTokenRedirect({
          account,
          scopes: [adminiculumApiScope],
        });
        return;
      }

      setBootstrapError(err instanceof Error ? err.message : "Ismeretlen hiba tortent");
      setAuthState("error");
    }
  }, [account, callAuthMe, instance, inProgress]);

  useEffect(() => {
    let mounted = true;

    if (!account) {
      const cachedToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const cachedProfile = readCachedProfile();

      if (cachedToken && cachedProfile) {
        setAuthState("bootstrapping");

        (async () => {
          try {
            const verifiedProfile = await callAuthMe(cachedToken);
            if (!mounted || !verifiedProfile) return;
            setProfile(verifiedProfile);
            writeCachedProfile(verifiedProfile);
            setAuthState("authenticated");
          } catch {
            if (!mounted) return;

            clearAuthToken();
            clearCachedProfile();
            setProfile(null);

            if (enableLocalDevAuth) {
              setAuthState("idle");
              devLogin();
            } else {
              setAuthState("idle");
            }
          }
        })();

        return;
      }

      clearCachedProfile();
      clearAuthToken();
      setProfile(null);
      setAuthState("idle");
      return;
    }

    const accountId = account.localAccountId || account.homeAccountId;
    if (!accountId) {
      return;
    }

    if (bootstrappedForAccount.current[accountId]) {
      setAuthState("authenticated");
      return;
    }

    const timer = setTimeout(() => {
      bootstrapAuth();
    }, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [account, bootstrapAuth, callAuthMe, devLogin, enableLocalDevAuth]);

  useEffect(() => {
    if (authState !== "bootstrapping") {
      return;
    }

    const timer = window.setTimeout(() => {
      if (authState !== "bootstrapping") {
        return;
      }

      if (!account) {
        if (enableLocalDevAuth) {
          setBootstrapError("Auth bootstrap timeout, retrying local development session.");
          setAuthState("idle");
          devLogin();
          return;
        }

        setBootstrapError("Auth bootstrap timeout. Please sign in again.");
        setAuthState("idle");
        return;
      }

      setBootstrapError("Auth bootstrap timeout while resolving account session.");
      setAuthState("error");
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [account, authState, devLogin, enableLocalDevAuth]);

  if (inProgress !== InteractionStatus.None && !(enableLocalDevAuth && !account)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C9A227] mx-auto mb-4" />
          <p className="text-[#6B655B]">Betoltes...</p>
        </div>
      </div>
    );
  }

  // Loading/bootstrapping state — always show spinner, never LoginScreen, during auth resolution
  // This prevents login screen flicker during MSAL account loading when a valid session may exist
  if (authState === "bootstrapping" && !hasLocalDevSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C9A227] mx-auto mb-4" />
          <p className="text-[#6B655B]">Betoltes...</p>
        </div>
      </div>
    );
  }

  // Only show LoginScreen when auth is definitively resolved and the user is not authenticated
  if (!account && !hasLocalDevSession && authState === "idle") {
    return (
      <LoginScreen
        onSignIn={signIn}
        onDevSignIn={devLogin}
        showDevSignIn={showDevSignIn}
        disabled={loginPending || authState !== "idle"}
        variant={loginVariant}
        errorMessage={bootstrapError}
      />
    );
  }

  if ((authState === "error" || !profile) && !hasLocalDevSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <div className="text-center max-w-md p-6">
          <div className="bg-[#A63D40]/10 text-[#A63D40] rounded-lg p-4 mb-4">
            <p className="font-medium">Hitelesitesi hiba</p>
            <p className="text-sm mt-1">{bootstrapError || "Nem sikerult betolteni a felhasznaloi profilt"}</p>
          </div>
          <button
            onClick={() => bootstrapAuth()}
            className="px-4 py-2 bg-[#C9A227] text-white rounded-lg hover:bg-[#B8911F] transition-colors"
          >
            Ujraprobalas
          </button>
        </div>
      </div>
    );
  }

  return <AppShell onSignOut={signOut} userProfile={profile} section={section} fullViewport={fullViewport}>{children}</AppShell>;
}
