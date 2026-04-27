"use client";

import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { PropsWithChildren, useMemo, useState, useEffect } from "react";
import { msalConfig } from "@/lib/authConfig";

export function AppProviders({ children }: PropsWithChildren) {
  const msalInstance = useMemo(() => new PublicClientApplication(msalConfig), []);
  
  const [msalReady, setMsalReady] = useState(false);
  const [msalInitError, setMsalInitError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initMsal = async () => {
      try {
        console.log('[msal] initialize:start');

        await msalInstance.initialize();
        console.log('[msal] initialize:done');

        console.log('[msal] redirect:start');
        const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

        let authResult: Awaited<ReturnType<typeof msalInstance.handleRedirectPromise>> | null = null;
        try {
          if (isLocalhost) {
            authResult = await Promise.race([
              msalInstance.handleRedirectPromise(),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
            ]);
          } else {
            authResult = await msalInstance.handleRedirectPromise();
          }
        } catch (redirectError) {
          console.error('[msal] redirect:error', redirectError);
          throw redirectError;
        }

        console.log('[msal] redirect:result', { hasAuthResult: !!authResult });

        if (!mounted) return;

        if (authResult?.account) {
          msalInstance.setActiveAccount(authResult.account);
          console.log('[msal] activeAccount:set from redirect');
        } else {
          const accounts = msalInstance.getAllAccounts();
          console.log('[msal] accounts:count', accounts.length);
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
            console.log('[msal] activeAccount:set from cache');
          }
        }

        const msalKeys = Object.keys(window.sessionStorage).filter(k => k.toLowerCase().includes('msal'));
        console.log('[msal] storage:keys_after_redirect', msalKeys);

        setMsalReady(true);
        console.log('[msal] ready:true');
      } catch (error) {
        console.error('[AppProviders] MSAL initialization failed:', error);
        if (mounted) {
          setMsalInitError(error instanceof Error ? error.message : 'MSAL initialization failed');
        }
      }
    };

    initMsal();

    return () => {
      mounted = false;
    };
  }, [msalInstance]);

  if (msalInitError) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#FAF8F5'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '24px' }}>
          <div style={{ 
            backgroundColor: '#A63D40', 
            color: 'white', 
            padding: '16px', 
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <p style={{ fontWeight: 'bold' }}>Hiba</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>{msalInitError}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              backgroundColor: '#C9A227',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Újratöltés
          </button>
        </div>
      </div>
    );
  }

  if (!msalReady) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#FAF8F5'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            border: '4px solid #E8E4DE', 
            borderTopColor: '#C9A227',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#6B655B' }}>Betöltés...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
